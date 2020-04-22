import {
  makeExecutableSchema,
  addMockFunctionsToSchema,
  GraphQLParseOptions,
} from 'graphql-tools';
import { Server as HttpServer } from 'http';
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
} from 'graphql';
import { GraphQLExtension } from 'graphql-extensions';
import {
  InMemoryLRUCache,
  PrefixingKeyValueCache,
} from 'apollo-server-caching';
import { ApolloServerPlugin } from 'apollo-server-plugin-base';
import runtimeSupportsUploads from './utils/runtimeSupportsUploads';

import {
  SubscriptionServer,
  ExecutionParams,
} from 'subscriptions-transport-ws';

import { formatApolloErrors } from 'apollo-server-errors';
import {
  GraphQLServerOptions as GraphQLOptions,
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

function getEngineApiKey(engine: Config['engine']): string | undefined {
  const keyFromEnv = process.env.ENGINE_API_KEY || '';
  if (engine === false) {
    return;
  } else if (typeof engine === 'object' && engine.apiKey) {
    return engine.apiKey;
  } else if (keyFromEnv) {
    return keyFromEnv;
  }
  return;
}

function getEngineGraphVariant(engine: Config['engine']): string | undefined {
  if (engine === false) {
    return;
  } else if (typeof engine === 'object' && engine.schemaTag) {
    return engine.schemaTag;
  } else {
    return process.env.ENGINE_SCHEMA_TAG;
  }
}

function getEngineServiceId(engine: Config['engine']): string | undefined {
  const engineApiKey = getEngineApiKey(engine);
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
  schemaHash: string;
  extensions: Array<() => GraphQLExtension>;
};

export class ApolloServerBase {
  public subscriptionsPath?: string;
  public graphqlPath: string = '/graphql';
  public requestOptions: Partial<GraphQLOptions<any>> = Object.create(null);

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
      ...requestOptions
    } = config;

    if (gateway && (modules || schema || typeDefs || resolvers)) {
      // TODO: this could be handled by adjusting the typings to keep gateway configs and non-gateway configs seprate.
      throw new Error(
        'Cannot define both `gateway` and any of: `modules`, `schema`, `typeDefs`, or `resolvers`',
      );
    }

    this.parseOptions = parseOptions;
    this.context = context;

    // Plugins will be instantiated if they aren't already, and this.plugins
    // is populated accordingly.
    this.ensurePluginInstantiation(plugins);

    // While reading process.env is slow, a server should only be constructed
    // once per run, so we place the env check inside the constructor. If env
    // should be used outside of the constructor context, place it as a private
    // or protected field of the class instead of a global. Keeping the read in
    // the contructor enables testing of different environments
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

    if (requestOptions.cacheControl !== false) {
      if (
        typeof requestOptions.cacheControl === 'boolean' &&
        requestOptions.cacheControl === true
      ) {
        // cacheControl: true means that the user needs the cache-control
        // extensions. This means we are running the proxy, so we should not
        // strip out the cache control extension and not add cache-control headers
        requestOptions.cacheControl = {
          stripFormattedExtensions: false,
          calculateHttpHeaders: false,
          defaultMaxAge: 0,
        };
      } else {
        // Default behavior is to run default header calculation and return
        // no cacheControl extensions
        requestOptions.cacheControl = {
          stripFormattedExtensions: true,
          calculateHttpHeaders: true,
          defaultMaxAge: 0,
          ...requestOptions.cacheControl,
        };
      }
    }

    if (!requestOptions.cache) {
      requestOptions.cache = new InMemoryLRUCache();
    }

    if (requestOptions.persistedQueries !== false) {
      requestOptions.persistedQueries = {
        cache: new PrefixingKeyValueCache(
          (requestOptions.persistedQueries &&
            requestOptions.persistedQueries.cache) ||
            requestOptions.cache!,
          APQ_CACHE_PREFIX,
        ),
      };
    } else {
      // the user does not want to use persisted queries, so we remove the field
      delete requestOptions.persistedQueries;
    }

    this.requestOptions = requestOptions as GraphQLOptions;

    if (uploads !== false && !forbidUploadsForTesting) {
      if (this.supportsUploads()) {
        if (!runtimeSupportsUploads) {
          printNodeFileUploadsMessage();
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

    // Normalize the legacy option maskErrorDetails.
    if (engine && typeof engine === 'object') {
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
    // The truthyness of this value can also be used in other forks of logic
    // related to Engine, as is the case with EngineReportingAgent just below.
    this.engineServiceId = getEngineServiceId(engine);
    const apiKey = getEngineApiKey(engine);
    if (apiKey) {
      this.engineApiKeyHash = createSHA('sha512')
        .update(apiKey)
        .digest('hex');
    }

    if (this.engineServiceId) {
      const { EngineReportingAgent } = require('apollo-engine-reporting');
      this.engineReportingAgent = new EngineReportingAgent(
        typeof engine === 'object' ? engine : Object.create(null),
      );
      // Don't add the extension here (we want to add it later in generateSchemaDerivedData).
    }

    if (gateway && subscriptions !== false) {
      // TODO: this could be handled by adjusting the typings to keep gateway configs and non-gateway configs seprate.
      throw new Error(
        "Cannot define both `subscriptions` and `gateway`. Set `subscriptions: false` in Apollo Server's config to use gateway.",
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

    if (_schema instanceof GraphQLSchema) {
      const derivedData = this.generateSchemaDerivedData(_schema);
      this.schema = derivedData.schema;
      this.schemaDerivedData = Promise.resolve(derivedData);
    } else {
      this.schemaDerivedData = _schema.then(schema =>
        this.generateSchemaDerivedData(schema),
      );
    }
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
        gateway.onSchemaChange(schema => {
          const schemaDerivedData = this.generateSchemaDerivedData(schema);
          this.schemaDerivedData = Promise.resolve(schemaDerivedData);
          this.plugins.forEach(plugin => {
            if (plugin.schemaDidChange) {
              plugin.schemaDidChange(schema, schemaDerivedData.schemaHash);
            }
          });
        }),
      );

      const graphVariant = getEngineGraphVariant(engine);
      const engineConfig =
        this.engineApiKeyHash && this.engineServiceId
          ? {
              apiKeyHash: this.engineApiKeyHash,
              graphId: this.engineServiceId,
              ...(graphVariant && { graphVariant }),
            }
          : undefined;

      return gateway.load({ engine: engineConfig }).then(config => {
        this.requestOptions.executor = config.executor;
        return config.schema;
      });
    }

    let constructedSchema;
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

    const schemaIsFederated = this.schemaIsFederated(schema);
    const { engine } = this.config;
    // Keep this extension second so it wraps everything, except error formatting
    if (this.engineReportingAgent) {
      if (schemaIsFederated) {
        // XXX users can configure a federated Apollo Server to send metrics, but the
        // Gateway should be responsible for that. It's possible that users are running
        // their own gateway or running a federated service on its own. Nonetheless, in
        // the likely case it was accidental, we warn users that they should only report
        // metrics from the Gateway.
        console.warn(
          "It looks like you're running a federated schema and you've configured your service " +
            'to report metrics to Apollo Engine. You should only configure your Apollo gateway ' +
            'to report metrics to Apollo Engine.',
        );
      }
      extensions.push(() =>
        this.engineReportingAgent!.newExtension(schemaHash),
      );
    } else if (engine !== false && schemaIsFederated) {
      // We haven't configured this app to use Engine directly. But it looks like
      // we are a federated service backend, so we should be capable of including
      // our trace in a response extension if we are asked to by the gateway.
      const {
        EngineFederatedTracingExtension,
      } = require('apollo-engine-reporting');
      const rewriteError =
        engine && typeof engine === 'object' ? engine.rewriteError : undefined;
      extensions.push(
        () => new EngineFederatedTracingExtension({ rewriteError }),
      );
    }

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
    const { schema, schemaHash } = await this.schemaDerivedData;
    await Promise.all(
      this.plugins.map(
        plugin =>
          plugin.serverWillStart &&
          plugin.serverWillStart({
            schema: schema,
            schemaHash: schemaHash,
            engine: {
              serviceID: this.engineServiceId,
              apiKeyHash: this.engineApiKeyHash,
            },
            persistedQueries: this.requestOptions.persistedQueries,
          }),
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

  public installSubscriptionHandlers(server: HttpServer) {
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
      path,
    } = this.subscriptionServerOptions;

    // TODO: This shouldn't use this.schema, as it is deprecated in favor of the schemaDerivedData promise.
    const schema = this.schema;
    if (this.schema === undefined)
      throw new Error(
        'Schema undefined during creation of subscription server.',
      );

    this.subscriptionServer = SubscriptionServer.create(
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
      },
      {
        server,
        path,
      },
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
  // The only thing this is used for is determining whether traces should be
  // added to responses if requested with an HTTP header; if there's a false
  // positive, that feature can be disabled by specifying `engine: false`.
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

  private ensurePluginInstantiation(plugins?: PluginDefinition[]): void {
    if (!plugins || !plugins.length) {
      return;
    }

    this.plugins = plugins.map(plugin => {
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
      maxSize: Math.pow(2, 20) * 30,
      sizeCalculator: approximateObjectSize,
    });
  }

  // This function is used by the integrations to generate the graphQLOptions
  // from an object containing the request and other integration specific
  // options
  protected async graphQLServerOptions(
    integrationContextArgument?: Record<string, any>,
  ) {
    const { schema, documentStore, extensions } = await this.schemaDerivedData;

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
      reporting: !!this.engineReportingAgent,
      ...this.requestOptions,
    } as GraphQLOptions;
  }

  public async executeOperation(request: GraphQLRequest) {
    let options;

    try {
      options = await this.graphQLServerOptions();
    } catch (e) {
      e.message = `Invalid options provided to ApolloServer: ${e.message}`;
      throw new Error(e);
    }

    if (typeof options.context === 'function') {
      options.context = (options.context as () => never)();
    }

    const requestCtx: GraphQLRequestContext = {
      request,
      context: options.context || Object.create(null),
      cache: options.cache!,
      response: {
        http: {
          headers: new Headers(),
        },
      },
    };

    return processGraphQLRequest(options, requestCtx);
  }
}

function printNodeFileUploadsMessage() {
  console.error(
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
