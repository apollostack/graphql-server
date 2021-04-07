import {
  makeExecutableSchema,
  addMockFunctionsToSchema,
  GraphQLParseOptions,
} from 'graphql-tools';
import { Server as NetServer } from 'net';
import { Server as TlsServer } from 'tls';
import { Server as HttpServer } from 'http';
import { Http2Server, Http2SecureServer } from 'http2';
import { Server as HttpsServer } from 'https';
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
} from 'graphql';
import resolvable, { Resolvable } from '@josephg/resolvable';
import { GraphQLExtension } from 'graphql-extensions';
import {
  InMemoryLRUCache,
  PrefixingKeyValueCache,
} from 'apollo-server-caching';
import {
  ApolloServerPlugin,
  GraphQLServiceContext,
  GraphQLServerListener,
} from 'apollo-server-plugin-base';
import runtimeSupportsUploads from './utils/runtimeSupportsUploads';

import {
  SubscriptionServer,
  ExecutionParams,
} from 'subscriptions-transport-ws';

import WebSocket from 'ws';

import { formatApolloErrors } from 'apollo-server-errors';
import { GraphQLServerOptions, PersistedQueryOptions } from './graphqlOptions';

import {
  Config,
  Context,
  ContextFunction,
  SubscriptionServerOptions,
  FileUploadOptions,
  PluginDefinition,
  GraphQLService,
} from './types';

import { gql } from './index';

import {
  createPlaygroundOptions,
  PlaygroundRenderPageOptions,
} from './playground';

import { generateSchemaHash } from './utils/schemaHash';
import { isDirectiveDefined } from './utils/isDirectiveDefined';
import {
  processGraphQLRequest,
  GraphQLRequestContext,
  GraphQLRequest,
  APQ_CACHE_PREFIX,
} from './requestPipeline';

import { Headers } from 'apollo-server-env';
import { buildServiceDefinition } from '@apollographql/apollo-tools';
import { plugin as pluginTracing } from 'apollo-tracing';
import { Logger, SchemaHash, ApolloConfig } from 'apollo-server-types';
import {
  plugin as pluginCacheControl,
  CacheControlExtensionOptions,
} from 'apollo-cache-control';
import { cloneObject } from './runHttpQuery';
import isNodeLike from './utils/isNodeLike';
import { determineApolloConfig } from './determineApolloConfig';
import {
  ApolloServerPluginSchemaReporting,
  ApolloServerPluginUsageReportingFromLegacyOptions,
  ApolloServerPluginSchemaReportingOptions,
  ApolloServerPluginInlineTrace,
  ApolloServerPluginInlineTraceOptions,
  ApolloServerPluginUsageReporting,
} from './plugin';
import { InternalPluginId, pluginIsInternal } from './plugin/internalPlugin';

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

const forbidUploadsForTesting =
  process && process.env.NODE_ENV === 'test' && !runtimeSupportsUploads;

function approximateObjectSize<T>(obj: T): number {
  return Buffer.byteLength(JSON.stringify(obj), 'utf8');
}

type SchemaDerivedData = {
  schema: GraphQLSchema;
  schemaHash: SchemaHash;
  extensions: Array<() => GraphQLExtension>;
  // A store that, when enabled (default), will store the parsed and validated
  // versions of operations in-memory, allowing subsequent parses/validates
  // on the same operation to be executed immediately.
  documentStore?: InMemoryLRUCache<DocumentNode>;
};

type ServerState =
  | { phase: 'initialized with schema'; schemaDerivedData: SchemaDerivedData }
  | { phase: 'initialized with gateway'; gateway: GraphQLService }
  | { phase: 'starting'; barrier: Resolvable<void> }
  | {
      phase: 'invoking serverWillStart';
      barrier: Resolvable<void>;
      schemaDerivedData: SchemaDerivedData;
    }
  | { phase: 'failed to start'; error: Error; loadedSchema: boolean }
  | {
      phase: 'started';
      schemaDerivedData: SchemaDerivedData;
    }
  | { phase: 'stopping'; barrier: Resolvable<void> }
  | { phase: 'stopped'; stopError: Error | null };

// Throw this in places that should be unreachable (because all other cases have
// been handled, reducing the type of the argument to `never`). TypeScript will
// complain if in fact there is a valid type for the argument.
class UnreachableCaseError extends Error {
  constructor(val: never) {
    super(`Unreachable case: ${val}`);
  }
}
export class ApolloServerBase {
  private logger: Logger;
  public subscriptionsPath?: string;
  public graphqlPath: string = '/graphql';
  public requestOptions: Partial<GraphQLServerOptions<any>> = Object.create(
    null,
  );

  private context?: Context | ContextFunction;
  private apolloConfig: ApolloConfig;
  protected plugins: ApolloServerPlugin[] = [];

  protected subscriptionServerOptions?: SubscriptionServerOptions;
  protected uploadsConfig?: FileUploadOptions;

  // set by installSubscriptionHandlers.
  private subscriptionServer?: SubscriptionServer;

  // the default version is specified in playground.ts
  protected playgroundOptions?: PlaygroundRenderPageOptions;

  private parseOptions: GraphQLParseOptions;
  private config: Config;
  private state: ServerState;
  /** @deprecated: This is undefined for servers operating as gateways, and will be removed in a future release **/
  protected schema?: GraphQLSchema;
  private toDispose = new Set<() => Promise<void>>();
  private toDisposeLast = new Set<() => Promise<void>>();
  private experimental_approximateDocumentStoreMiB: Config['experimental_approximateDocumentStoreMiB'];

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
      subscriptions,
      uploads,
      playground,
      plugins,
      gateway,
      cacheControl,
      experimental_approximateDocumentStoreMiB,
      stopOnTerminationSignals,
      apollo,
      engine,
      ...requestOptions
    } = config;

    if (engine !== undefined && apollo) {
      throw new Error(
        'You cannot provide both `engine` and `apollo` to `new ApolloServer()`. ' +
          'For details on how to migrate all of your options out of `engine`, see ' +
          'https://go.apollo.dev/s/migration-engine-plugins',
      );
    }

    // Setup logging facilities
    if (config.logger) {
      this.logger = config.logger;
    } else {
      // If the user didn't provide their own logger, we'll initialize one.
      const loglevelLogger = loglevel.getLogger('apollo-server');

      // We don't do much logging in Apollo Server right now.  There's a notion
      // of a `debug` flag, which changes stack traces in some error messages,
      // and adds a bit of debug logging to some plugins. `info` is primarily
      // used for startup logging in plugins. We'll default to `info` so you
      // get to see that startup logging.
      if (this.config.debug === true) {
        loglevelLogger.setLevel(loglevel.levels.DEBUG);
      } else {
        loglevelLogger.setLevel(loglevel.levels.INFO);
      }

      this.logger = loglevelLogger;
    }

    this.apolloConfig = determineApolloConfig(apollo, engine, this.logger);

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
      const { cache: apqCache = requestOptions.cache!, ...apqOtherOptions } =
        requestOptions.persistedQueries || Object.create(null);

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

    // Plugins will be instantiated if they aren't already, and this.plugins
    // is populated accordingly.
    this.ensurePluginInstantiation(plugins);

    // We handle signals if it was explicitly requested, or if we're in Node,
    // not in a test, and it wasn't explicitly turned off. (For backwards
    // compatibility, we check both 'stopOnTerminationSignals' and
    // 'engine.handleSignals'.)
    if (
      typeof stopOnTerminationSignals === 'boolean'
        ? stopOnTerminationSignals
        : typeof engine === 'object' &&
          typeof engine.handleSignals === 'boolean'
        ? engine.handleSignals
        : isNodeLike && process.env.NODE_ENV !== 'test'
    ) {
      const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
      let receivedSignal = false;
      signals.forEach((signal) => {
        // Note: Node only started sending signal names to signal events with
        // Node v10 so we can't use that feature here.
        const handler: NodeJS.SignalsListener = async () => {
          if (receivedSignal) {
            // If we receive another SIGINT or SIGTERM while we're waiting
            // for the server to stop, just ignore it.
            return;
          }
          receivedSignal = true;
          try {
            await this.stop();
          } catch (e) {
            this.logger.error(`stop() threw during ${signal} shutdown`);
            this.logger.error(e);
            // Can't rely on the signal handlers being removed.
            process.exit(1);
          }
          // Note: this.stop will call the toDisposeLast handlers below, so at
          // this point this handler will have been removed and we can re-kill
          // ourself to die with the appropriate signal exit status. this.stop
          // takes care to call toDisposeLast last, so the signal handler isn't
          // removed until after the rest of shutdown happens.
          process.kill(process.pid, signal);
        };
        process.on(signal, handler);
        this.toDisposeLast.add(async () => {
          process.removeListener(signal, handler);
        });
      });
    }

    if (gateway) {
      // ApolloServer has been initialized but we have not yet tried to load the
      // schema from the gateway. That will wait until the user calls
      // `server.start()`, or until `ensureStarting` or `ensureStarted` are
      // called. (In the case of a serverless framework integration,
      // `ensureStarting` is automatically called at the end of the
      // constructor.)
      this.state = { phase: 'initialized with gateway', gateway };

      // The main thing that the Gateway does is replace execution with
      // its own executor. It would be awkward if you always had to pass
      // `gateway: gateway, executor: gateway` to this constructor, so
      // we let specifying `gateway` be a shorthand for the above.
      // (We won't actually invoke the executor until after we're successfully
      // called `gateway.load`.)
      this.requestOptions.executor = gateway.executor;
    } else {
      // We construct the schema synchronously so that we can fail fast if
      // the schema can't be constructed, and so that installSubscriptionHandlers
      // and the deprecated `.schema` field (neither of which have ever worked
      // with the gateway) are available immediately after the constructor returns.
      this.state = {
        phase: 'initialized with schema',
        schemaDerivedData: this.generateSchemaDerivedData(
          this.constructSchema(),
        ),
      };
      // This field is deprecated; users who are interested in learning
      // their server's schema should instead make a plugin with serverWillStart,
      // or register onSchemaChange on their gateway. It is only ever
      // set for non-gateway servers.
      this.schema = this.state.schemaDerivedData.schema;
    }

    // The main entry point (createHandler) to serverless frameworks generally
    // needs to be called synchronously from the top level of your entry point,
    // unlike (eg) applyMiddleware, so we can't expect you to `await
    // server.start()` before calling it. So we kick off the start
    // asynchronously from the constructor, and failures are logged and cause
    // later requests to fail (in ensureStarted, called by
    // graphQLServerOptions). There's no way to make "the whole server fail"
    // separately from making individual requests fail, but that's not entirely
    // unreasonable for a "serverless" model.
    if (this.serverlessFramework()) {
      this.ensureStarting();
    }
  }

  // used by integrations to synchronize the path with subscriptions, some
  // integrations do not have paths, such as lambda
  public setGraphQLPath(path: string) {
    this.graphqlPath = path;
  }

  // Awaiting a call to `start` ensures that a schema has been loaded and that
  // all plugin `serverWillStart` hooks have been called. If either of these
  // processes throw, `start` will (async) throw as well.
  //
  // If you're using the batteries-included `apollo-server` package, you don't
  // need to call `start` yourself (in fact, it will throw if you do so); its
  // `listen` method takes care of that for you (this is why the actual logic is
  // in the `_start` helper).
  //
  // If instead you're using an integration package, you are highly encouraged
  // to await a call to `start` immediately after creating your `ApolloServer`,
  // before attaching it to your web framework and starting to accept requests.
  // `start` should only be called once; if it throws and you'd like to retry,
  // just create another `ApolloServer`. (Note that this paragraph does not
  // apply to "serverless framework" integrations like Lambda.)
  //
  // For backwards compatibility with the pre-2.22 API, you are not required to
  // call start() yourself (this may change in AS3). Most integration packages
  // call the protected `ensureStarting` when you first interact with them,
  // which kicks off a "background" call to `start` if you haven't called it
  // yourself. Then `graphQLServerOptions` (which is called before processing)
  // each incoming GraphQL request) calls `ensureStarted` which waits for
  // `start` to successfully complete (possibly by calling it itself), and
  // throws a redacted error if `start` was not successful.  If `start` is
  // invoked implicitly by either of these mechanisms, any error that it throws
  // will be logged when they occur and then again on every subsequent
  // `graphQLServerOptions` call (ie, every GraphQL request). Note that start
  // failures are not recoverable without creating a new ApolloServer. You are
  // highly encouraged to make these backwards-compatibility paths into no-ops
  // by awaiting a call to `start` yourself.
  //
  // Serverless integrations like Lambda (which override `serverlessFramework()`
  // to return true) do not support calling `start()`, because their lifecycle
  // doesn't allow you to wait before assigning a handler or allowing the
  // handler to be called. So they call `ensureStarting` at the end of the
  // constructor, and don't really differentiate between startup failures and
  // request failures. This is hopefully appropriate for a "serverless"
  // framework. As above, startup failures result in returning a redacted error
  // to the end user and logging the more detailed error.
  public async start(): Promise<void> {
    if (this.serverlessFramework()) {
      throw new Error(
        'When using an ApolloServer subclass from a serverless framework ' +
          "package, you don't need to call start(); just call createHandler().",
      );
    }

    return await this._start();
  }

  // This is protected so that it can be called from `apollo-server`. It is
  // otherwise an internal implementation detail.
  protected async _start(): Promise<void> {
    const initialState = this.state;
    if (
      initialState.phase !== 'initialized with gateway' &&
      initialState.phase !== 'initialized with schema'
    ) {
      throw new Error(
        `called start() with surprising state ${initialState.phase}`,
      );
    }
    const barrier = resolvable();
    this.state = { phase: 'starting', barrier };
    let loadedSchema = false;
    try {
      const schemaDerivedData =
        initialState.phase === 'initialized with schema'
          ? initialState.schemaDerivedData
          : this.generateSchemaDerivedData(
              await this.startGatewayAndLoadSchema(initialState.gateway),
            );
      loadedSchema = true;
      this.state = {
        phase: 'invoking serverWillStart',
        barrier,
        schemaDerivedData,
      };

      const service: GraphQLServiceContext = {
        logger: this.logger,
        schema: schemaDerivedData.schema,
        schemaHash: schemaDerivedData.schemaHash,
        apollo: this.apolloConfig,
        serverlessFramework: this.serverlessFramework(),
        engine: {
          serviceID: this.apolloConfig.graphId,
          apiKeyHash: this.apolloConfig.keyHash,
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
        };
      }

      const serverListeners = (
        await Promise.all(
          this.plugins.map(
            (plugin) =>
              plugin.serverWillStart && plugin.serverWillStart(service),
          ),
        )
      ).filter(
        (maybeServerListener): maybeServerListener is GraphQLServerListener =>
          typeof maybeServerListener === 'object' &&
          !!maybeServerListener.serverWillStop,
      );
      this.toDispose.add(async () => {
        await Promise.all(
          serverListeners.map(({ serverWillStop }) => serverWillStop?.()),
        );
      });

      this.state = { phase: 'started', schemaDerivedData };
    } catch (error) {
      this.state = { phase: 'failed to start', error, loadedSchema };
      throw error;
    } finally {
      barrier.resolve();
    }
  }

  /**
   * @deprecated This deprecated method is provided for backwards compatibility
   * with the pre-v2.22 API. It was sort of a combination of the v2.22 APIs
   * `ensureStarting` and `start`; it was generally called "in the background"
   * by integrations to kick off the start process (like `ensureStarting`) and
   * then the Promise it returns was awaited later before running operations
   * (sort of like `start`).  It had odd error handling semantics, in that it
   * would ignore any error that came from loading the schema, but would throw
   * errors that came from `serverWillStart`.
   *
   * We keep it around for backwards-compatibility with pre-v2.22 integrations,
   * though we just make it call `ensureStarting`. This does mean that the part
   * of the integration which awaits its result doesn't actually await anything
   * interesting (despite being async, the method itself doesn't await
   * anything), but since executing operations now calls `ensureStarted`, that's
   * OK. (In v2.22.0 and v2.22.1 we tried to mimic the old `willStart` behavior
   * more closely which led to a bug where `start` could be invoked multiple
   * times. This approach is simpler.)
   *
   * Anyone calling this method should call `start` or `ensureStarting` instead.
   */
  protected async willStart() {
    this.ensureStarting();
  }

  // Part of the backwards-compatibility behavior described above `start` to
  // make ApolloServer work if you don't explicitly call `start`, as well as for
  // serverless frameworks where there is no `start`. This is called at the
  // beginning of each GraphQL request by `graphQLServerOptions`. It calls
  // `start` for you if it hasn't been called yet, and only returns successfully
  // if some call to `start` succeeds.
  //
  // This function assumes it is being called in a context where any error it
  // throws may be shown to the end user, so it only throws specific errors
  // without details. If it's throwing due to a startup error, it will log that
  // error each time it is called before throwing a redacted error.
  private async ensureStarted(): Promise<SchemaDerivedData> {
    while (true) {
      switch (this.state.phase) {
        case 'initialized with gateway':
        case 'initialized with schema':
          try {
            await this._start();
          } catch {
            // Any thrown error should transition us to 'failed to start', and
            // we'll handle that on the next iteration of the while loop.
          }
          // continue the while loop
          break;
        case 'starting':
        case 'invoking serverWillStart':
          await this.state.barrier;
          // continue the while loop
          break;
        case 'failed to start':
          // First we log the error that prevented startup (which means it will
          // get logged once for every GraphQL operation).
          this.logStartupError(this.state.error);
          // Now make the operation itself fail.
          // We intentionally do not re-throw actual startup error as it may contain
          // implementation details and this error will propagate to the client.
          throw new Error(
            'This data graph is missing a valid configuration. More details may be available in the server logs.',
          );
        case 'started':
          return this.state.schemaDerivedData;
        case 'stopping':
          throw new Error(
            'Cannot execute GraphQL operations while the server is stopping.',
          );
        case 'stopped':
          throw new Error(
            'Cannot execute GraphQL operations after the server has stopped.',
          );
        default:
          throw new UnreachableCaseError(this.state);
      }
    }
  }

  // Part of the backwards-compatibility behavior described above `start` to
  // make ApolloServer work if you don't explicitly call `start`. This is called
  // by some of the integration frameworks when you interact with them (eg by
  // calling applyMiddleware). It is also called from the end of the constructor
  // for serverless framework integrations.
  //
  // It calls `start` for you if it hasn't been called yet, but doesn't wait for
  // `start` to finish. The goal is that if you don't call `start` yourself the
  // server should still do the rest of startup vaguely near when your server
  // starts, not just when the first GraphQL request comes in. Without this
  // call, startup wouldn't occur until `graphQLServerOptions` invokes
  // `ensureStarted`.
  protected ensureStarting() {
    if (
      this.state.phase === 'initialized with gateway' ||
      this.state.phase === 'initialized with schema'
    ) {
      // Ah well. It would have been nice if the user had bothered
      // to call and await `start()`; that way they'd be able to learn
      // about any errors from it. Instead we'll kick it off here.
      // Any thrown error will get logged, and also will cause
      // every call to ensureStarted (ie, every GraphQL operation)
      // to log it again and prevent the operation from running.
      this._start().catch((e) => this.logStartupError(e));
    }
  }

  // Given an error that occurred during Apollo Server startup, log it with a
  // helpful message. Note that this is only used if `ensureStarting` or
  // `ensureStarted` had to initiate the startup process; if you call
  // `start` yourself (or you're using `apollo-server` whose `listen()` does
  // it for you) then you can handle the error however you'd like rather than
  // this log occurring. (We don't suggest the use of `start()` for serverless
  // frameworks because they don't support it.)
  private logStartupError(err: Error) {
    const prelude = this.serverlessFramework()
      ? 'An error occurred during Apollo Server startup.'
      : 'Apollo Server was started implicitly and an error occurred during startup. ' +
        '(Consider calling `await server.start()` immediately after ' +
        '`server = new ApolloServer()` so you can handle these errors directly before ' +
        'starting your web server.)';
    this.logger.error(
      prelude +
        ' All GraphQL requests will now fail. The startup error ' +
        'was: ' +
        ((err && err.message) || err),
    );
  }

  private async startGatewayAndLoadSchema(
    gateway: GraphQLService,
  ): Promise<GraphQLSchema> {
    // Store the unsubscribe handles, which are returned from
    // `onSchemaChange`, for later disposal when the server stops
    const unsubscriber = gateway.onSchemaChange((schema) => {
      // If we're still happily running, update our schema-derived state.
      if (this.state.phase === 'started') {
        this.state.schemaDerivedData = this.generateSchemaDerivedData(schema);
      }
    });
    this.toDispose.add(async () => unsubscriber());

    // For backwards compatibility with old versions of @apollo/gateway.
    const engineConfig =
      this.apolloConfig.keyHash && this.apolloConfig.graphId
        ? {
            apiKeyHash: this.apolloConfig.keyHash,
            graphId: this.apolloConfig.graphId,
            graphVariant: this.apolloConfig.graphVariant,
          }
        : undefined;

    const config = await gateway.load({
      apollo: this.apolloConfig,
      engine: engineConfig,
    });
    this.toDispose.add(async () => await gateway.stop?.());
    return config.schema;
  }

  private constructSchema(): GraphQLSchema {
    const {
      schema,
      modules,
      typeDefs,
      resolvers,
      schemaDirectives,
      parseOptions,
    } = this.config;
    if (schema) {
      return schema;
    }

    if (modules) {
      const { schema, errors } = buildServiceDefinition(modules);
      if (errors && errors.length > 0) {
        throw new Error(errors.map((error) => error.message).join('\n\n'));
      }
      return schema!;
    }

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
      const { GraphQLUpload } = require('@apollographql/graphql-upload-8-fork');
      if (Array.isArray(resolvers)) {
        if (resolvers.every((resolver) => !resolver.Upload)) {
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

    return makeExecutableSchema({
      typeDefs: augmentedTypeDefs,
      schemaDirectives,
      resolvers,
      parseOptions,
    });
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

  public async stop() {
    // Calling stop more than once should have the same result as the first time.
    if (this.state.phase === 'stopped') {
      if (this.state.stopError) {
        throw this.state.stopError;
      }
      return;
    }

    // Two parallel calls to stop; just wait for the other one to finish and
    // do whatever it did.
    if (this.state.phase === 'stopping') {
      await this.state.barrier;
      // The cast here is because TS doesn't understand that this.state can
      // change during the await
      // (https://github.com/microsoft/TypeScript/issues/9998).
      const state = this.state as ServerState;
      if (state.phase !== 'stopped') {
        throw Error(`Surprising post-stopping state ${state.phase}`);
      }
      if (state.stopError) {
        throw state.stopError;
      }
      return;
    }

    // Commit to stopping, actually stop, and update the phase.
    this.state = { phase: 'stopping', barrier: resolvable() };
    try {
      // We run shutdown handlers in two phases because we don't want to turn
      // off our signal listeners until we've done the important parts of shutdown
      // like running serverWillStop handlers. (We can make this more generic later
      // if it's helpful.)
      await Promise.all([...this.toDispose].map((dispose) => dispose()));
      if (this.subscriptionServer) this.subscriptionServer.close();
      await Promise.all([...this.toDisposeLast].map((dispose) => dispose()));
    } catch (stopError) {
      this.state = { phase: 'stopped', stopError };
      return;
    }
    this.state = { phase: 'stopped', stopError: null };
  }

  public installSubscriptionHandlers(
    server:
      | HttpServer
      | HttpsServer
      | Http2Server
      | Http2SecureServer
      | WebSocket.Server,
  ) {
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

    let schema: GraphQLSchema;
    switch (this.state.phase) {
      case 'initialized with schema':
      case 'invoking serverWillStart':
      case 'started':
        schema = this.state.schemaDerivedData.schema;
        break;
      case 'initialized with gateway':
      // shouldn't happen: gateway doesn't support subs
      case 'starting':
      // shouldn't happen: there's no await between 'starting' and
      // 'invoking serverWillStart' without gateway
      case 'failed to start':
      // only happens if you call 'start' yourself, in which case you really
      // ought to see what happens before calling this function
      case 'stopping':
      case 'stopped':
        // stopping is unlikely to happen during startup
        throw new Error(
          `Can't install subscription handlers when state is ${this.state.phase}`,
        );
      default:
        throw new UnreachableCaseError(this.state);
    }

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
        validationRules: this.requestOptions.validationRules,
      },
      server instanceof NetServer || server instanceof TlsServer
        ? {
            server,
            path,
          }
        : server,
    );
  }

  protected supportsSubscriptions(): boolean {
    return false;
  }

  protected supportsUploads(): boolean {
    return false;
  }

  protected serverlessFramework(): boolean {
    return false;
  }

  private ensurePluginInstantiation(plugins: PluginDefinition[] = []): void {
    const pluginsToInit: PluginDefinition[] = [];

    // Internal plugins should be added to `pluginsToInit` here.
    // User's plugins, provided as an argument to this method, will be added
    // at the end of that list so they take precedence.

    // If the user has enabled it explicitly, add our tracing plugin.
    // (This is the plugin which adds a verbose JSON trace to every GraphQL response;
    // it was designed for use with the obsolete engineproxy, and also works
    // with a graphql-playground trace viewer, but isn't generally recommended
    // (eg, it really does send traces with every single request). The newer
    // inline tracing plugin may be what you want, or just usage reporting if
    // the goal is to get traces to Apollo's servers.)
    if (this.config.tracing) {
      pluginsToInit.push(pluginTracing());
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

    pluginsToInit.push(...plugins);

    this.plugins = pluginsToInit.map((plugin) => {
      if (typeof plugin === 'function') {
        return plugin();
      }
      return plugin;
    });

    const alreadyHavePluginWithInternalId = (id: InternalPluginId) =>
      this.plugins.some(
        (p) => pluginIsInternal(p) && p.__internal_plugin_id__() === id,
      );

    // Special case: usage reporting is on by default if you configure an API key.
    {
      const alreadyHavePlugin = alreadyHavePluginWithInternalId(
        'UsageReporting',
      );
      const { engine } = this.config;
      const disabledViaLegacyOption =
        engine === false ||
        (typeof engine === 'object' && engine.reportTiming === false);
      if (alreadyHavePlugin) {
        if (engine !== undefined) {
          throw Error(
            "You can't combine the legacy `new ApolloServer({engine})` option with directly " +
              'creating an ApolloServerPluginUsageReporting plugin. See ' +
              'https://go.apollo.dev/s/migration-engine-plugins',
          );
        }
      } else if (this.apolloConfig.key && !disabledViaLegacyOption) {
        // Keep this plugin first so it wraps everything. (Unfortunately despite
        // the fact that the person who wrote this line also was the original
        // author of the comment above in #1105, they don't quite understand why this was important.)
        this.plugins.unshift(
          typeof engine === 'object'
            ? ApolloServerPluginUsageReportingFromLegacyOptions(engine)
            : ApolloServerPluginUsageReporting(),
        );
      }
    }

    // Special case: schema reporting can be turned on via environment variable.
    {
      const alreadyHavePlugin = alreadyHavePluginWithInternalId(
        'SchemaReporting',
      );
      const enabledViaEnvVar = process.env.APOLLO_SCHEMA_REPORTING === 'true';
      const { engine } = this.config;
      const enabledViaLegacyOption =
        typeof engine === 'object' &&
        (engine.reportSchema || engine.experimental_schemaReporting);
      if (alreadyHavePlugin || enabledViaEnvVar || enabledViaLegacyOption) {
        if (this.config.gateway) {
          throw new Error(
            [
              "Schema reporting is not yet compatible with the gateway. If you're",
              'interested in using schema reporting with the gateway, please',
              'contact Apollo support. To set up managed federation, see',
              'https://go.apollo.dev/s/managed-federation',
            ].join(' '),
          );
        }
      }
      if (alreadyHavePlugin) {
        if (engine !== undefined) {
          throw Error(
            "You can't combine the legacy `new ApolloServer({engine})` option with directly " +
              'creating an ApolloServerPluginSchemaReporting plugin. See ' +
              'https://go.apollo.dev/s/migration-engine-plugins',
          );
        }
      } else if (!this.apolloConfig.key) {
        if (enabledViaEnvVar) {
          throw new Error(
            "You've enabled schema reporting by setting the APOLLO_SCHEMA_REPORTING " +
              'environment variable to true, but you also need to provide your ' +
              'Apollo API key, via the APOLLO_KEY environment ' +
              'variable or via `new ApolloServer({apollo: {key})',
          );
        }
        if (enabledViaLegacyOption) {
          throw new Error(
            "You've enabled schema reporting in the `engine` argument to `new ApolloServer()`, " +
              'but you also need to provide your Apollo API key, via the APOLLO_KEY environment ' +
              'variable or via `new ApolloServer({apollo: {key})',
          );
        }
      } else if (enabledViaEnvVar || enabledViaLegacyOption) {
        const options: ApolloServerPluginSchemaReportingOptions = {};
        if (typeof engine === 'object') {
          options.initialDelayMaxMs =
            engine.schemaReportingInitialDelayMaxMs ??
            engine.experimental_schemaReportingInitialDelayMaxMs;
          options.overrideReportedSchema =
            engine.overrideReportedSchema ??
            engine.experimental_overrideReportedSchema;
          options.endpointUrl = engine.schemaReportingUrl;
        }
        this.plugins.push(ApolloServerPluginSchemaReporting(options));
      }
    }

    // Special case: inline tracing is on by default for federated schemas.
    {
      const alreadyHavePlugin = alreadyHavePluginWithInternalId('InlineTrace');
      const { engine } = this.config;
      if (alreadyHavePlugin) {
        if (engine !== undefined) {
          throw Error(
            "You can't combine the legacy `new ApolloServer({engine})` option with directly " +
              'creating an ApolloServerPluginInlineTrace plugin. See ' +
              'https://go.apollo.dev/s/migration-engine-plugins',
          );
        }
      } else if (this.config.engine !== false) {
        // If we haven't explicitly disabled inline tracing via
        // ApolloServerPluginInlineTraceDisabled or engine:false,
        // we set up inline tracing in "only if federated" mode.
        // (This is slightly different than the pre-ApolloServerPluginInlineTrace where
        // we would also avoid doing this if an API key was configured and log a warning.)
        const options: ApolloServerPluginInlineTraceOptions = {
          __onlyIfSchemaIsFederated: true,
        };
        if (typeof engine === 'object') {
          options.rewriteError = engine.rewriteError;
        }
        this.plugins.push(ApolloServerPluginInlineTrace(options));
      }
    }
  }

  private initializeDocumentStore(): InMemoryLRUCache<DocumentNode> {
    return new InMemoryLRUCache<DocumentNode>({
      // Create ~about~ a 30MiB InMemoryLRUCache.  This is less than precise
      // since the technique to calculate the size of a DocumentNode is
      // only using JSON.stringify on the DocumentNode (and thus doesn't account
      // for unicode characters, etc.), but it should do a reasonable job at
      // providing a caching document store for most operations.
      maxSize:
        Math.pow(2, 20) * (this.experimental_approximateDocumentStoreMiB || 30),
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
    } = await this.ensureStarted();

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

  /**
   * This method is primarily meant for testing: it allows you to execute a
   * GraphQL operation via the request pipeline without going through without
   * going through the HTTP layer. Note that this means that any handling you do
   * in your server at the HTTP level will not affect this call!
   *
   * If you pass a second argument to this method and your ApolloServer's
   * `context` is a function, that argument will be passed directly to your
   * `context` function. It is your responsibility to make it as close as needed
   * by your `context` function to the integration-specific argument that your
   * integration passes to `context` (eg, for `apollo-server-express`, the
   * `{req: express.Request, res: express.Response }` object) and to keep it
   * updated as you upgrade Apollo Server.
   */
  public async executeOperation(request: GraphQLRequest, integrationContextArgument?: Record<string, any>) {
    const options = await this.graphQLServerOptions(integrationContextArgument);

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
      debug: options.debug,
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
