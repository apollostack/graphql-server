import {
  makeExecutableSchema,
  addMockFunctionsToSchema,
  GraphQLParseOptions,
} from 'graphql-tools';
import { Server as HttpServer } from 'http';
import * as url from 'url';
import loglevel from 'loglevel';
import {
  execute,
  GraphQLSchema,
  subscribe,
  ExecutionResult,
  GraphQLError,
  GraphQLFieldResolver,
  ValidationContext,
  FieldDefinitionNode,
  DocumentNode,
  isObjectType,
  isScalarType,
  isSchema,
} from 'graphql';
import { GraphQLExtension } from 'graphql-extensions';
import {
  InMemoryLRUCache,
  PrefixingKeyValueCache,
} from 'apollo-server-caching';
import {
  ApolloServerPlugin,
  GraphQLServiceContext,
} from 'apollo-server-plugin-base';
import runtimeSupportsUploads from './utils/runtimeSupportsUploads';

import {
  SubscriptionServer,
  ExecutionParams,
} from 'subscriptions-transport-ws';

import WebSocket from 'ws';

import { formatApolloErrors } from 'apollo-server-errors';
import {
  GraphQLServerOptions,
  PersistedQueryOptions,
} from './graphqlOptions';

import {
  Config,
  Context,
  ContextFunction,
  SubscriptionServerOptions,
  FileUploadOptions,
  PluginDefinition,
} from './types';

import { gql } from './index';

import {
  createPlaygroundOptions,
  PlaygroundRenderPageOptions,
} from './playground';

import { generateSchemaHash } from './utils/schemaHash';
import { isDirectiveDefined } from './utils/isDirectiveDefined';
import createSHA from './utils/createSHA';
import {
  processGraphQLRequest,
  GraphQLRequestContext,
  GraphQLRequest,
  APQ_CACHE_PREFIX,
} from './requestPipeline';

import { Headers } from 'apollo-server-env';
import { buildServiceDefinition } from '@apollographql/apollo-tools';
import { plugin as pluginTracing } from "apollo-tracing";
import { Logger, SchemaHash } from "apollo-server-types";
import {
  plugin as pluginCacheControl,
  CacheControlExtensionOptions,
} from 'apollo-cache-control';
import { getEngineApiKey, getEngineGraphVariant } from "apollo-engine-reporting/dist/agent";
import { cloneObject } from "./runHttpQuery";

const NoIntrospection = (context: ValidationContext) => ({
  Field(node: FieldDefinitionNode) {
    if (node.name.value === '__schema' || node.name.value === '__type') {
      context.reportError(
        new GraphQLError(
          'GraphQL introspection is not allowed by Apollo Server, but the query contained __schema or __type. To enable introspection, pass introspection: true to ApolloServer in production',
          [node],
        ),
      );
    }
  },
});

function getEngineServiceId(engine: Config['engine'], logger: Logger): string | undefined {
  const engineApiKey = getEngineApiKey({engine, skipWarn: true, logger} );
  if (engineApiKey) {
    return engineApiKey.split(':', 2)[1];
  }

  return;
}

const forbidUploadsForTesting =
  process && process.env.NODE_ENV === 'test' && !runtimeSupportsUploads;

function approximateObjectSize<T>(obj: T): number {
  return Buffer.byteLength(JSON.stringify(obj), 'utf8');
}

type SchemaDerivedData = {
  // A store that, when enabled (default), will store the parsed and validated
  // versions of operations in-memory, allowing subsequent parses/validates
  // on the same operation to be executed immediately.
  documentStore?: InMemoryLRUCache<DocumentNode>;
  schema: GraphQLSchema;
  schemaHash: SchemaHash;
  extensions: Array<() => GraphQLExtension>;
};

export class ApolloServerBase {
  private logger: Logger;
  public subscriptionsPath?: string;
  public graphqlPath: string = '/graphql';
  public requestOptions: Partial<GraphQLServerOptions<any>> = Object.create(null);

  private context?: Context | ContextFunction;
  private engineReportingAgent?: import('apollo-engine-reporting').EngineReportingAgent;
  private engineServiceId?: string;
  private engineApiKeyHash?: string;
  protected plugins: ApolloServerPlugin[] = [];

  protected subscriptionServerOptions?: SubscriptionServerOptions;
  protected uploadsConfig?: FileUploadOptions;

  // set by installSubscriptionHandlers.
  private subscriptionServer?: SubscriptionServer;

  // the default version is specified in playground.ts
  protected playgroundOptions?: PlaygroundRenderPageOptions;

  private parseOptions: GraphQLParseOptions;
  private schemaDerivedData: Promise<SchemaDerivedData>;
  private config: Config;
  /** @deprecated: This is undefined for servers operating as gateways, and will be removed in a future release **/
  protected schema?: GraphQLSchema;
  private toDispose = new Set<() => void>();
  private experimental_approximateDocumentStoreMiB:
    Config['experimental_approximateDocumentStoreMiB'];

  // The constructor should be universal across all environments. All environment specific behavior should be set by adding or overriding methods
  constructor(config: Config) {
    if (!config) throw new Error('ApolloServer requires options.');
    this.config = config;
    const {
      context,
      resolvers,
      schema,
      schemaDirectives,
      modules,
      typeDefs,
      parseOptions = {},
      introspection,
      mocks,
      mockEntireSchema,
      extensions,
      engine,
      subscriptions,
      uploads,
      playground,
      plugins,
      gateway,
      cacheControl,
      experimental_approximateDocumentStoreMiB,
      ...requestOptions
    } = config;

    // Setup logging facilities
    if (config.logger) {
      this.logger = config.logger;
    } else {
      // If the user didn't provide their own logger, we'll initialize one.
      const loglevelLogger = loglevel.getLogger("apollo-server");

      // We don't do much logging in Apollo Server right now.  There's a notion
      // of a `debug` flag, but it doesn't do much besides change stack traces
      // in some error messages, but it would be odd for it to not introduce
      // debug or higher level errors (which includes `info`, if we happen to
      // start introducing those.  We'll default to `warn` as a sensible default
      // of things you'd probably want to be alerted to.
      if (this.config.debug === true) {
        loglevelLogger.setLevel(loglevel.levels.DEBUG);
      } else {
        loglevelLogger.setLevel(loglevel.levels.WARN);
      }

      this.logger = loglevelLogger;
    }

    if (gateway && (modules || schema || typeDefs || resolvers)) {
      throw new Error(
        'Cannot define both `gateway` and any of: `modules`, `schema`, `typeDefs`, or `resolvers`',
      );
    }

    this.parseOptions = parseOptions;
    this.context = context;

    // While reading process.env is slow, a server should only be constructed
    // once per run, so we place the env check inside the constructor. If env
    // should be used outside of the constructor context, place it as a private
    // or protected field of the class instead of a global. Keeping the read in
    // the constructor enables testing of different environments
    const isDev = process.env.NODE_ENV !== 'production';

    // if this is local dev, introspection should turned on
    // in production, we can manually turn introspection on by passing {
    // introspection: true } to the constructor of ApolloServer
    if (
      (typeof introspection === 'boolean' && !introspection) ||
      (introspection === undefined && !isDev)
    ) {
      const noIntro = [NoIntrospection];
      requestOptions.validationRules = requestOptions.validationRules
        ? requestOptions.validationRules.concat(noIntro)
        : noIntro;
    }

    if (!requestOptions.cache) {
      requestOptions.cache = new InMemoryLRUCache();
    }

    if (requestOptions.persistedQueries !== false) {
      const {
        cache: apqCache = requestOptions.cache!,
        ...apqOtherOptions
      } = requestOptions.persistedQueries || Object.create(null);

      requestOptions.persistedQueries = {
        cache: new PrefixingKeyValueCache(apqCache, APQ_CACHE_PREFIX),
        ...apqOtherOptions,
      };
    } else {
      // the user does not want to use persisted queries, so we remove the field
      delete requestOptions.persistedQueries;
    }

    this.requestOptions = requestOptions as GraphQLServerOptions;

    if (uploads !== false && !forbidUploadsForTesting) {
      if (this.supportsUploads()) {
        if (!runtimeSupportsUploads) {
          printNodeFileUploadsMessage(this.logger);
          throw new Error(
            '`graphql-upload` is no longer supported on Node.js < v8.5.0.  ' +
              'See https://bit.ly/gql-upload-node-6.',
          );
        }

        if (uploads === true || typeof uploads === 'undefined') {
          this.uploadsConfig = {};
        } else {
          this.uploadsConfig = uploads;
        }
        //This is here to check if uploads is requested without support. By
        //default we enable them if supported by the integration
      } else if (uploads) {
        throw new Error(
          'This implementation of ApolloServer does not support file uploads because the environment cannot accept multi-part forms',
        );
      }
    }

    if (engine && typeof engine === 'object') {
      // Use the `ApolloServer` logger unless a more granular logger is set.
      if (!engine.logger) {
        engine.logger = this.logger;
      }

      // Normalize the legacy option maskErrorDetails.
      if (engine.maskErrorDetails && engine.rewriteError) {
        throw new Error("Can't set both maskErrorDetails and rewriteError!");
      } else if (
        engine.rewriteError &&
        typeof engine.rewriteError !== 'function'
      ) {
        throw new Error('rewriteError must be a function');
      } else if (engine.maskErrorDetails) {
        engine.rewriteError = () => new GraphQLError('<masked>');
        delete engine.maskErrorDetails;
      }
    }

    // In an effort to avoid over-exposing the API key itself, extract the
    // service ID from the API key for plugins which only needs service ID.
    // The truthiness of this value can also be used in other forks of logic
    // related to Engine, as is the case with EngineReportingAgent just below.
    this.engineServiceId = getEngineServiceId(engine, this.logger);
    const apiKey = getEngineApiKey({engine, skipWarn: true, logger: this.logger});
    if (apiKey) {
      this.engineApiKeyHash = createSHA('sha512')
        .update(apiKey)
        .digest('hex');
    }

    if (this.engineServiceId) {
      const { EngineReportingAgent } = require('apollo-engine-reporting');
      this.engineReportingAgent = new EngineReportingAgent(
        typeof engine === 'object' ? engine : Object.create({
          logger: this.logger,
        }),
      );
      // Don't add the extension here (we want to add it later in generateSchemaDerivedData).
    }

    if (gateway && this.engineReportingAgent?.schemaReport) {
      throw new Error(
        [
          "Schema reporting is not yet compatible with the gateway. If you're",
          "interested in using schema reporting with the gateway, please",
          "contact Apollo support.",
        ].join(' '),
      );
    }

    if (gateway && subscriptions !== false) {
      // TODO: this could be handled by adjusting the typings to keep gateway configs and non-gateway configs separate.
      throw new Error(
        [
          'Subscriptions are not yet compatible with the gateway.',
          "Set `subscriptions: false` in Apollo Server's constructor to",
          'explicitly disable subscriptions (which are on by default)',
          'and allow for gateway functionality.',
        ].join(' '),
      );
    } else if (subscriptions !== false) {
      if (this.supportsSubscriptions()) {
        if (subscriptions === true || typeof subscriptions === 'undefined') {
          this.subscriptionServerOptions = {
            path: this.graphqlPath,
          };
        } else if (typeof subscriptions === 'string') {
          this.subscriptionServerOptions = { path: subscriptions };
        } else {
          this.subscriptionServerOptions = {
            path: this.graphqlPath,
            ...subscriptions,
          };
        }
        // This is part of the public API.
        this.subscriptionsPath = this.subscriptionServerOptions.path;

        //This is here to check if subscriptions are requested without support. By
        //default we enable them if supported by the integration
      } else if (subscriptions) {
        throw new Error(
          'This implementation of ApolloServer does not support GraphQL subscriptions.',
        );
      }
    }

    this.playgroundOptions = createPlaygroundOptions(playground);

    // TODO: This is a bit nasty because the subscription server needs this.schema synchronously, for reasons of backwards compatibility.
    const _schema = this.initSchema();

    if (isSchema(_schema)) {
      const derivedData = this.generateSchemaDerivedData(_schema);
      this.schema = derivedData.schema;
      this.schemaDerivedData = Promise.resolve(derivedData);
    } else if (typeof _schema.then === 'function') {
      this.schemaDerivedData = _schema.then(schema =>
        this.generateSchemaDerivedData(schema),
      );
    } else {
      throw new Error("Unexpected error: Unable to resolve a valid GraphQLSchema.  Please file an issue with a reproduction of this error, if possible.");
    }

    // Plugins will be instantiated if they aren't already, and this.plugins
    // is populated accordingly.
    this.ensurePluginInstantiation(plugins);

  }

  // used by integrations to synchronize the path with subscriptions, some
  // integrations do not have paths, such as lambda
  public setGraphQLPath(path: string) {
    this.graphqlPath = path;
  }

  private initSchema(): GraphQLSchema | Promise<GraphQLSchema> {
    const {
      gateway,
      engine,
      schema,
      modules,
      typeDefs,
      resolvers,
      schemaDirectives,
      parseOptions,
    } = this.config;
    if (gateway) {
      this.toDispose.add(
        // Store the unsubscribe handles, which are returned from
        // `onSchemaChange`, for later disposal when the server stops
        gateway.onSchemaChange(
          schema =>
            (this.schemaDerivedData = Promise.resolve(
              this.generateSchemaDerivedData(schema),
            )),
        ),
      );

      const graphVariant = getEngineGraphVariant(engine, this.logger);
      const engineConfig =
        this.engineApiKeyHash && this.engineServiceId
          ? {
              apiKeyHash: this.engineApiKeyHash,
              graphId: this.engineServiceId,
              ...(graphVariant && { graphVariant }),
            }
          : undefined;

      // Set the executor whether the gateway 'load' call succeeds or not.
      // If the schema becomes available eventually (after a setInterval retry)
      // this executor will still be necessary in order to be able to support
      // a federated schema!
      this.requestOptions.executor = gateway.executor;

      return gateway.load({ engine: engineConfig })
        .then(config => config.schema)
        .catch(err => {
          // We intentionally do not re-throw the exact error from the gateway
          // configuration as it may contain implementation details and this
          // error will propagate to the client. We will, however, log the error
          // for observation in the logs.
          const message = "This data graph is missing a valid configuration.";
          this.logger.error(message + " " + (err && err.message || err));
          throw new Error(
            message + " More details may be available in the server logs.");
        });
    }

    let constructedSchema: GraphQLSchema;
    if (schema) {
      constructedSchema = schema;
    } else if (modules) {
      const { schema, errors } = buildServiceDefinition(modules);
      if (errors && errors.length > 0) {
        throw new Error(errors.map(error => error.message).join('\n\n'));
      }
      constructedSchema = schema!;
    } else {
      if (!typeDefs) {
        throw Error(
          'Apollo Server requires either an existing schema, modules or typeDefs',
        );
      }

      const augmentedTypeDefs = Array.isArray(typeDefs) ? typeDefs : [typeDefs];

      // We augment the typeDefs with the @cacheControl directive and associated
      // scope enum, so makeExecutableSchema won't fail SDL validation

      if (!isDirectiveDefined(augmentedTypeDefs, 'cacheControl')) {
        augmentedTypeDefs.push(
          gql`
            enum CacheControlScope {
              PUBLIC
              PRIVATE
            }

            directive @cacheControl(
              maxAge: Int
              scope: CacheControlScope
            ) on FIELD_DEFINITION | OBJECT | INTERFACE
          `,
        );
      }

      if (this.uploadsConfig) {
        const { GraphQLUpload } = require('graphql-upload');
        if (Array.isArray(resolvers)) {
          if (resolvers.every(resolver => !resolver.Upload)) {
            resolvers.push({ Upload: GraphQLUpload });
          }
        } else {
          if (resolvers && !resolvers.Upload) {
            resolvers.Upload = GraphQLUpload;
          }
        }

        // We augment the typeDefs with the Upload scalar, so typeDefs that
        // don't include it won't fail
        augmentedTypeDefs.push(
          gql`
            scalar Upload
          `,
        );
      }

      constructedSchema = makeExecutableSchema({
        typeDefs: augmentedTypeDefs,
        schemaDirectives,
        resolvers,
        parseOptions,
      });
    }

    return constructedSchema;
  }

  private generateSchemaDerivedData(schema: GraphQLSchema): SchemaDerivedData {
    const schemaHash = generateSchemaHash(schema!);

    const { mocks, mockEntireSchema, extensions: _extensions } = this.config;

    if (mocks || (typeof mockEntireSchema !== 'undefined' && mocks !== false)) {
      addMockFunctionsToSchema({
        schema,
        mocks:
          typeof mocks === 'boolean' || typeof mocks === 'undefined'
            ? {}
            : mocks,
        preserveResolvers:
          typeof mockEntireSchema === 'undefined' ? false : !mockEntireSchema,
      });
    }

    const extensions = [];

    // Note: doRunQuery will add its own extensions if you set tracing,
    // or cacheControl.
    extensions.push(...(_extensions || []));

    // Initialize the document store.  This cannot currently be disabled.
    const documentStore = this.initializeDocumentStore();

    return {
      schema,
      schemaHash,
      extensions,
      documentStore,
    };
  }

  protected async willStart() {
    try {
      var { schema, schemaHash } = await this.schemaDerivedData;
    } catch (err) {
      // The `schemaDerivedData` can throw if the Promise it points to does not
      // resolve with a `GraphQLSchema`. As errors from `willStart` are start-up
      // errors, other Apollo middleware after us will not be called, including
      // our health check, CORS, etc.
      //
      // Returning here allows the integration's other Apollo middleware to
      // function properly in the event of a failure to obtain the data graph
      // configuration from the gateway's `load` method during initialization.
      return;
    }

    const service: GraphQLServiceContext = {
      logger: this.logger,
      schema: schema,
      schemaHash: schemaHash,
      engine: {
        serviceID: this.engineServiceId,
        apiKeyHash: this.engineApiKeyHash,
      },
    };

    // The `persistedQueries` attribute on the GraphQLServiceContext was
    // originally used by the operation registry, which shared the cache with
    // it.  This is no longer the case.  However, while we are continuing to
    // expand the support of the interface for `persistedQueries`, e.g. with
    // additions like https://github.com/apollographql/apollo-server/pull/3623,
    // we don't want to continually expand the API surface of what we expose
    // to the plugin API.   In this particular case, it certainly doesn't need
    // to get the `ttl` default value which are intended for APQ only.
    if (this.requestOptions.persistedQueries?.cache) {
      service.persistedQueries = {
        cache: this.requestOptions.persistedQueries.cache,
      }
    }

    await Promise.all(
      this.plugins.map(
        plugin =>
          plugin.serverWillStart &&
          plugin.serverWillStart(service),
      ),
    );
  }

  public async stop() {
    this.toDispose.forEach(dispose => dispose());
    if (this.subscriptionServer) await this.subscriptionServer.close();
    if (this.engineReportingAgent) {
      this.engineReportingAgent.stop();
      await this.engineReportingAgent.sendAllReports();
    }
  }

  public installSubscriptionHandlers(server: HttpServer | WebSocket.Server) {
    if (!this.subscriptionServerOptions) {
      if (this.config.gateway) {
        throw Error(
          'Subscriptions are not supported when operating as a gateway',
        );
      }
      if (this.supportsSubscriptions()) {
        throw Error(
          'Subscriptions are disabled, due to subscriptions set to false in the ApolloServer constructor',
        );
      } else {
        throw Error(
          'Subscriptions are not supported, choose an integration, such as apollo-server-express that allows persistent connections',
        );
      }
    }
    const { path } = this.subscriptionServerOptions;

    this.subscriptionServer = this.createSubscriptionServer(
      server instanceof WebSocket.Server
        ? server
        : {
            server,
            path,
          },
    );
  }

  public static installMultiSubscriptionHandler(apolloServers: ApolloServerBase[], server: HttpServer) {
    const subscriptionServers: [ApolloServerBase, SubscriptionServer][] = apolloServers.map(
      aps => {
        const ss = aps.createSubscriptionServer({ noServer: true });
        aps.subscriptionServer = ss;
        return [aps, ss];
      }
    );

    server.on('upgrade', (request, socket, head) => {
      const pathname = url.parse(request.url).pathname;

      const handled = subscriptionServers.reduce((h, [aps, ss]) => {
        if (h) {
          return true;
        }
        if (pathname === aps.subscriptionsPath) {
          ss.server.handleUpgrade(request, socket, head, (ws) => {
            ss.server.emit('connection', ws, request);
          });

          return true;
        }

        return false;
      }, false);

      if (!handled) {
        socket.destroy();
      }
    });
  }

  protected createSubscriptionServer(socketOptionsOrServer: WebSocket.ServerOptions | WebSocket.Server): SubscriptionServer {
    if (!this.subscriptionServerOptions) {
      if (this.config.gateway) {
        throw Error(
          'Subscriptions are not supported when operating as a gateway',
        );
      }
      if (this.supportsSubscriptions()) {
        throw Error(
          'Subscriptions are disabled, due to subscriptions set to false in the ApolloServer constructor',
        );
      } else {
        throw Error(
          'Subscriptions are not supported, choose an integration, such as apollo-server-express that allows persistent connections',
        );
      }
    }
    const { SubscriptionServer } = require('subscriptions-transport-ws');
    const {
      onDisconnect,
      onConnect,
      keepAlive,
    } = this.subscriptionServerOptions;

    // TODO: This shouldn't use this.schema, as it is deprecated in favor of the schemaDerivedData promise.
    const schema = this.schema;
    if (this.schema === undefined)
      throw new Error(
        'Schema undefined during creation of subscription server.',
      );

    return SubscriptionServer.create(
      {
        schema,
        execute,
        subscribe,
        onConnect: onConnect
          ? onConnect
          : (connectionParams: Object) => ({ ...connectionParams }),
        onDisconnect: onDisconnect,
        onOperation: async (
          message: { payload: any },
          connection: ExecutionParams,
        ) => {
          connection.formatResponse = (value: ExecutionResult) => ({
            ...value,
            errors:
              value.errors &&
              formatApolloErrors([...value.errors], {
                formatter: this.requestOptions.formatError,
                debug: this.requestOptions.debug,
              }),
          });

          connection.formatError = this.requestOptions.formatError;

          let context: Context = this.context ? this.context : { connection };

          try {
            context =
              typeof this.context === 'function'
                ? await this.context({ connection, payload: message.payload })
                : context;
          } catch (e) {
            throw formatApolloErrors([e], {
              formatter: this.requestOptions.formatError,
              debug: this.requestOptions.debug,
            })[0];
          }

          return { ...connection, context };
        },
        keepAlive,
        validationRules: this.requestOptions.validationRules
      },
      socketOptionsOrServer,
    );
  }

  protected supportsSubscriptions(): boolean {
    return false;
  }

  protected supportsUploads(): boolean {
    return false;
  }

  // Returns true if it appears that the schema was returned from
  // @apollo/federation's buildFederatedSchema. This strategy avoids depending
  // explicitly on @apollo/federation or relying on something that might not
  // survive transformations like monkey-patching a boolean field onto the
  // schema.
  //
  // This is used for two things:
  // 1) determining whether traces should be added to responses if requested
  //    with an HTTP header; if there's a false positive, that feature can be
  //    disabled by specifying `engine: false`.
  // 2) determining whether schema-reporting should be allowed; federated
  //    services shouldn't be reporting schemas, and we accordingly throw if
  //    it's attempted.
  private schemaIsFederated(schema: GraphQLSchema): boolean {
    const serviceType = schema.getType('_Service');
    if (!(serviceType && isObjectType(serviceType))) {
      return false;
    }
    const sdlField = serviceType.getFields().sdl;
    if (!sdlField) {
      return false;
    }
    const sdlFieldType = sdlField.type;
    if (!isScalarType(sdlFieldType)) {
      return false;
    }
    return sdlFieldType.name == 'String';
  }

  private ensurePluginInstantiation(plugins: PluginDefinition[] = []): void {
    const pluginsToInit: PluginDefinition[] = [];

    // Internal plugins should be added to `pluginsToInit` here.
    // User's plugins, provided as an argument to this method, will be added
    // at the end of that list so they take precedence.

    // If the user has enabled it explicitly, add our tracing lugin.
    if (this.config.tracing) {
      pluginsToInit.push(pluginTracing())
    }

    // Enable cache control unless it was explicitly disabled.
    if (this.config.cacheControl !== false) {
      let cacheControlOptions: CacheControlExtensionOptions = {};
      if (
        typeof this.config.cacheControl === 'boolean' &&
        this.config.cacheControl === true
      ) {
        // cacheControl: true means that the user needs the cache-control
        // extensions. This means we are running the proxy, so we should not
        // strip out the cache control extension and not add cache-control headers
        cacheControlOptions = {
          stripFormattedExtensions: false,
          calculateHttpHeaders: false,
          defaultMaxAge: 0,
        };
      } else {
        // Default behavior is to run default header calculation and return
        // no cacheControl extensions
        cacheControlOptions = {
          stripFormattedExtensions: true,
          calculateHttpHeaders: true,
          defaultMaxAge: 0,
          ...this.config.cacheControl,
        };
      }

      pluginsToInit.push(pluginCacheControl(cacheControlOptions));
    }

    const federatedSchema = this.schema && this.schemaIsFederated(this.schema);
    const { engine } = this.config;
    // Keep this extension second so it wraps everything, except error formatting
    if (this.engineReportingAgent) {
      if (federatedSchema) {
        // XXX users can configure a federated Apollo Server to send metrics, but the
        // Gateway should be responsible for that. It's possible that users are running
        // their own gateway or running a federated service on its own. Nonetheless, in
        // the likely case it was accidental, we warn users that they should only report
        // metrics from the Gateway.
        this.logger.warn(
          "It looks like you're running a federated schema and you've configured your service " +
            'to report metrics to Apollo Graph Manager. You should only configure your Apollo gateway ' +
            'to report metrics to Apollo Graph Manager.',
        );

        if (this.engineReportingAgent.schemaReport) {
          throw Error(
            [
              "Schema reporting is not yet compatible with federated services.",
              "If you're interested in using schema reporting with federated",
              "services, please contact Apollo support.",
            ].join(' '),
          );
        }
      }
      pluginsToInit.push(this.engineReportingAgent!.newPlugin());
    } else if (engine !== false && federatedSchema) {
      // We haven't configured this app to use Engine directly. But it looks like
      // we are a federated service backend, so we should be capable of including
      // our trace in a response extension if we are asked to by the gateway.
      const { federatedPlugin } = require('apollo-engine-reporting');
      const rewriteError =
        engine && typeof engine === 'object' ? engine.rewriteError : undefined;
      pluginsToInit.push(federatedPlugin({ rewriteError }));
    }

    pluginsToInit.push(...plugins);

    this.plugins = pluginsToInit.map(plugin => {
      if (typeof plugin === 'function') {
        return plugin();
      }
      return plugin;
    });
  }

  private initializeDocumentStore(): InMemoryLRUCache<DocumentNode> {
    return new InMemoryLRUCache<DocumentNode>({
      // Create ~about~ a 30MiB InMemoryLRUCache.  This is less than precise
      // since the technique to calculate the size of a DocumentNode is
      // only using JSON.stringify on the DocumentNode (and thus doesn't account
      // for unicode characters, etc.), but it should do a reasonable job at
      // providing a caching document store for most operations.
      maxSize:
        Math.pow(2, 20) *
        (this.experimental_approximateDocumentStoreMiB || 30),
      sizeCalculator: approximateObjectSize,
    });
  }

  // This function is used by the integrations to generate the graphQLOptions
  // from an object containing the request and other integration specific
  // options
  protected async graphQLServerOptions(
    integrationContextArgument?: Record<string, any>,
  ): Promise<GraphQLServerOptions> {
    const {
      schema,
      schemaHash,
      documentStore,
      extensions,
    } = await this.schemaDerivedData;

    let context: Context = this.context ? this.context : {};

    try {
      context =
        typeof this.context === 'function'
          ? await this.context(integrationContextArgument || {})
          : context;
    } catch (error) {
      // Defer context error resolution to inside of runQuery
      context = () => {
        throw error;
      };
    }

    return {
      schema,
      schemaHash,
      logger: this.logger,
      plugins: this.plugins,
      documentStore,
      extensions,
      context,
      // Allow overrides from options. Be explicit about a couple of them to
      // avoid a bad side effect of the otherwise useful noUnusedLocals option
      // (https://github.com/Microsoft/TypeScript/issues/21673).
      persistedQueries: this.requestOptions
        .persistedQueries as PersistedQueryOptions,
      fieldResolver: this.requestOptions.fieldResolver as GraphQLFieldResolver<
        any,
        any
      >,
      parseOptions: this.parseOptions,
      ...this.requestOptions,
    };
  }

  public async executeOperation(request: GraphQLRequest) {
    const options = await this.graphQLServerOptions();

    if (typeof options.context === 'function') {
      options.context = (options.context as () => never)();
    } else if (typeof options.context === 'object') {
      // FIXME: We currently shallow clone the context for every request,
      // but that's unlikely to be what people want.
      // We allow passing in a function for `context` to ApolloServer,
      // but this only runs once for a batched request (because this is resolved
      // in ApolloServer#graphQLServerOptions, before runHttpQuery is invoked).
      // NOTE: THIS IS DUPLICATED IN runHttpQuery.ts' buildRequestContext.
      options.context = cloneObject(options.context);
    }


    const requestCtx: GraphQLRequestContext = {
      logger: this.logger,
      schema: options.schema,
      schemaHash: options.schemaHash,
      request,
      context: options.context || Object.create(null),
      cache: options.cache!,
      metrics: {},
      response: {
        http: {
          headers: new Headers(),
        },
      },
    };

    return processGraphQLRequest(options, requestCtx);
  }
}

function printNodeFileUploadsMessage(logger: Logger) {
  logger.error(
    [
      '*****************************************************************',
      '*                                                               *',
      '* ERROR! Manual intervention is necessary for Node.js < v8.5.0! *',
      '*                                                               *',
      '*****************************************************************',
      '',
      'The third-party `graphql-upload` package, which is used to implement',
      'file uploads in Apollo Server 2.x, no longer supports Node.js LTS',
      'versions prior to Node.js v8.5.0.',
      '',
      'Deployments which NEED file upload capabilities should update to',
      'Node.js >= v8.5.0 to continue using uploads.',
      '',
      'If this server DOES NOT NEED file uploads and wishes to continue',
      'using this version of Node.js, uploads can be disabled by adding:',
      '',
      '  uploads: false,',
      '',
      '...to the options for Apollo Server and re-deploying the server.',
      '',
      'For more information, see https://bit.ly/gql-upload-node-6.',
      '',
    ].join('\n'),
  );
}
