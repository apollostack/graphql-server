import { ApolloServerPlugin, PluginDefinition } from './plugins';
import { GraphQLSchema } from 'graphql/type/schema';
import { DocumentNode } from 'graphql/language/ast';
import { InMemoryLRUCache } from './caching';
import { approximateObjectSize } from './utilities';
import {
  GraphQLRequest,
  GraphQLResponse,
  processGraphQLRequest,
  GraphQLRequestContext,
  GraphQLRequestPipelineConfig,
} from './execution';

// These should not be imported from here.
import { Config as BaseConfig } from 'apollo-server-core';
import { buildServiceDefinition, GraphQLSchemaModule } from '@apollographql/apollo-tools';

export { default as gql } from 'graphql-tag';
import {
  Context,
  ContextFunction,
} from './execution';
import { Core, obj, Plan } from './liftoff';

// A subset of the base configuration.
type Config = Pick<BaseConfig,
  // | 'modules'
  | 'dataSources'
  | 'parseOptions'
  | 'context'
  | 'introspection'
  // TODO(AS3):
  | 'schemaDirectives'
  // TODO(AS3):
  | 'cacheControl'
  | 'plugins'
// TODO(AS3) AGM?
// | 'engine'
> & Partial<Pick<BaseConfig, 'modules'>>

export const ServerConfig = obj <Config> `Apollo Server Config` ({})
export const Schema = obj <GraphQLSchemaModule> `Schema module` ()

export async function Apollo(plan: Plan) {
  const core = new Core(plan)
  const config = await core.only(ServerConfig)
  config.modules = await core.once(Schema)
  const server = new ApolloServer(config)
  return server
}

type SchemaDerivedData = {
  // A store that, when enabled (default), will store the parsed and validated
  // versions of operations in-memory, allowing subsequent parses/validates
  // on the same operation to be executed immediately.
  documentStore?: InMemoryLRUCache<DocumentNode>;
  schema: GraphQLSchema;
};

export class ApolloServer {
  // public requestOptions: Partial<GraphQLOptions<any>> = Object.create(null);

  private userContext?: Context | ContextFunction;
  // TODO(AS3) Reconsider these for Apollo Graph Manager
  // private engineReportingAgent?: import('apollo-engine-reporting').EngineReportingAgent;
  // private engineServiceId?: string;
  // private engineApiKeyHash?: string;
  private plugins: ApolloServerPlugin[] = [];

  private schemaDerivedData: Promise<SchemaDerivedData>;
  private toDispose = new Set<() => void>();

  // TODO(AS3) needed?
  // private isProduction = process.env.NODE_ENV === 'production'; // NODE

  constructor(private readonly config: Config) {
    if (!config) throw new Error('ApolloServer requires options.');

    // TODO(AS3) Rename content variables to be more clear, like `userContext`.
    this.userContext = this.config.context;

    // Plugins will be instantiated if they aren't already, and this.plugins
    // is populated accordingly.
    this.ensurePluginInstantiation(this.config.plugins);

    // TODO(AS3) Make it possible to disable introspection.
    // TODO(AS3) Cache Control
    // TODO(AS3) Global cache implementation config.
    // TODO(AS3) Persisted Queries
    // TODO(AS3) Apollo Graph Manager

    if (! this.config.modules) {
      throw new Error("TODO: No modules were specified.");
    }

    const { schema, errors } = buildServiceDefinition(this.config.modules);
    if (errors && errors.length > 0) {
      throw new Error(errors.map(error => error.message).join('\n\n'));
    }

    if (!schema) {
      throw new Error("TODO: No schema.");
    }

    this.schemaDerivedData = this.generateSchemaDerivedData(schema);
  }

  // private initSchema(): GraphQLSchema | Promise<GraphQLSchema> {
  //   const {
  //     modules,
  //     resolvers,
  //     parseOptions,
  //   } = this.config;
  //   if (schema) {
  //     constructedSchema = schema;
  //   } else if (modules) {
  //     const { schema, errors } = buildServiceDefinition(modules);
  //     if (errors && errors.length > 0) {
  //       throw new Error(errors.map(error => error.message).join('\n\n'));
  //     }
  //     constructedSchema = schema!;
  //   } else {
  //     if (!typeDefs) {
  //       throw Error(
  //         'Apollo Server requires either an existing schema, modules or typeDefs',
  //       );
  //     }

  //     const augmentedTypeDefs = Array.isArray(typeDefs) ? typeDefs : [typeDefs];

  //     // We augment the typeDefs with the @cacheControl directive and associated
  //     // scope enum, so makeExecutableSchema won't fail SDL validation

  //     if (!isDirectiveDefined(augmentedTypeDefs, 'cacheControl')) {
  //       augmentedTypeDefs.push(
  //         gql`
  //           enum CacheControlScope {
  //             PUBLIC
  //             PRIVATE
  //           }

  //           directive @cacheControl(
  //             maxAge: Int
  //             scope: CacheControlScope
  //           ) on FIELD_DEFINITION | OBJECT | INTERFACE
  //         `,
  //       );
  //     }

  //     constructedSchema = makeExecutableSchema({
  //       typeDefs: augmentedTypeDefs,
  //       schemaDirectives,
  //       resolvers,
  //       parseOptions,
  //     });
  //   }

  //   return constructedSchema;
  // }

  private async generateSchemaDerivedData(schema: GraphQLSchema): Promise<SchemaDerivedData> {
    // TODO(AS3) mocks
    // const { mocks, mockEntireSchema, extensions: _extensions } = this.config;

    // if (mocks || (typeof mockEntireSchema !== 'undefined' && mocks !== false)) {
    //   addMockFunctionsToSchema({
    //     schema,
    //     mocks:
    //       typeof mocks === 'boolean' || typeof mocks === 'undefined'
    //         ? {}
    //         : mocks,
    //     preserveResolvers:
    //       typeof mockEntireSchema === 'undefined' ? false : !mockEntireSchema,
    //   });
    // }

/*     const { engine } = this.config;
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
    } */

    // Note: doRunQuery will add its own extensions if you set tracing,
    // or cacheControl.
    // extensions.push(...(_extensions || []));

    // Initialize the document store.  This cannot currently be disabled.
    const documentStore = this.initializeDocumentStore();

    return {
      schema,
      // schemaHash,
      // extensions,
      documentStore,
    };
  }

  protected async willStart() {
    const { schema } = await this.schemaDerivedData;
    await Promise.all(
      this.plugins.map(
        plugin =>
          plugin.serverWillStart &&
          plugin.serverWillStart({
            schema: schema,
            schemaHash: 'TODO',
            engine: {
            // TODO(AS3)
            //   serviceID: this.engineServiceId,
            //   apiKeyHash: this.engineApiKeyHash,
            },
            // TODO(AS3)
            // persistedQueries: this.requestOptions.persistedQueries,
          }),
      ),
    );
  }

  public async stop() {
    this.toDispose.forEach(dispose => dispose());
    // TODO(AS3)
    // if (this.engineReportingAgent) {
    //   this.engineReportingAgent.stop();
    //   await this.engineReportingAgent.sendAllReports();
    // }
  }

  // TODO(AS3): My first temptation was to say that this should not be a
  // class member, but after further analysis, I think that many utility
  // functions should be class members — private — so that they can
  // use a common logger facility.  Of course, they can still exist as a
  // separate logger, but we would have to make sure that each of those
  // accepts a logger parameter.
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

  public async executeOperation<
    R extends GraphQLRequest,
    S extends GraphQLResponse = GraphQLResponse
  >(
    request: R,
    responseInit: S = Object.create(null),
  ) {

    const { schema, documentStore } = await this.schemaDerivedData;

    // TODO(AS3) The transport will provide context.
    const integrationContextArgument = Object.create(null);

    let context: Context;

    try {
      context =
        typeof this.userContext === 'function'
          ? await this.userContext(integrationContextArgument || Object.create(null))
          : this.userContext || Object.create(null);
    } catch (error) {
      // Defer context error resolution to inside of runQuery
      context = () => {
        throw error;
      };
    }

    // TODO(AS3) This context argument is maybe quite wrong, check it.
    const options: GraphQLRequestPipelineConfig<typeof context> = {
      schema,
      plugins: this.plugins,
      documentStore,
      // Allow overrides from options. Be explicit about a couple of them to
      // avoid a bad side effect of the otherwise useful noUnusedLocals option
      // (https://github.com/Microsoft/TypeScript/issues/21673).
      // TODO(AS3)
      // persistedQueries: this.requestOptions
      //   .persistedQueries as PersistedQueryOptions,
      // TODO(AS3)
      // fieldResolver: this.requestOptions.fieldResolver as GraphQLFieldResolver<
      //   any,
      //   any
      // >,
      // TODO(AS3)
      // parseOptions: this.parseOptions,
      // TODO(AS3): AGM
      // reporting: !!this.engineReportingAgent,
      // ...this.requestOptions,
    };

    // TODO(AS3) This is not where the global cache should be created.
    // Especially since this is per request.
    const cache = new InMemoryLRUCache();

    const requestCtx: GraphQLRequestContext = {
      request,
      context,
      cache,
      response: responseInit,
    };

    return processGraphQLRequest(options, requestCtx);
  }
}
