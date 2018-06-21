import { makeExecutableSchema, addMockFunctionsToSchema } from 'graphql-tools';
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
} from 'graphql';
import { GraphQLExtension } from 'graphql-extensions';
import { EngineReportingAgent } from 'apollo-engine-reporting';
import { InMemoryLRUCache } from 'apollo-server-caching';

import { GraphQLUpload } from 'apollo-upload-server';

import {
  SubscriptionServer,
  ExecutionParams,
} from 'subscriptions-transport-ws';

// use as default persisted query store
import Keyv = require('keyv');
import QuickLru = require('quick-lru');

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
} from './types';

import { gql } from './index';

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

export class ApolloServerBase {
  public subscriptionsPath: string;
  public graphqlPath: string = '/graphql';
  public requestOptions: Partial<GraphQLOptions<any>>;

  private schema: GraphQLSchema;
  private context?: Context | ContextFunction;
  private engineReportingAgent?: EngineReportingAgent;
  private extensions: Array<() => GraphQLExtension>;
  protected subscriptionServerOptions?: SubscriptionServerOptions;
  protected uploadsConfig?: FileUploadOptions;

  // set by installSubscriptionHandlers.
  private subscriptionServer?: SubscriptionServer;

  //The constructor should be universal across all environments. All environment specific behavior should be set in an exported registerServer or in by overriding listen
  constructor(config: Config) {
    if (!config) throw new Error('ApolloServer requires options.');
    const {
      context,
      resolvers,
      schema,
      schemaDirectives,
      typeDefs,
      introspection,
      mocks,
      extensions,
      engine,
      subscriptions,
      uploads,
      ...requestOptions
    } = config;

    //While reading process.env is slow, a server should only be constructed
    //once per run, so we place the env check inside the constructor. If env
    //should be used outside of the constructor context, place it as a private
    //or protected field of the class instead of a global. Keeping the read in
    //the contructor enables testing of different environments
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

    if (requestOptions.persistedQueries !== false) {
      if (!requestOptions.persistedQueries) {
        //maxSize is the number of elements that can be stored inside of the cache
        //https://github.com/withspectrum/spectrum has about 200 instances of gql`
        //300 queries seems reasonable
        const lru = new QuickLru({ maxSize: 300 });
        requestOptions.persistedQueries = {
          cache: new Keyv({ store: lru }),
        };
      }
    } else {
      //the user does not want to use persisted queries, so we remove the field
      delete requestOptions.persistedQueries;
    }

    if (!requestOptions.cache) {
      requestOptions.cache = new InMemoryLRUCache();
    }

    this.requestOptions = requestOptions as GraphQLOptions;
    this.context = context;

    if (uploads !== false) {
      if (this.supportsUploads()) {
        if (uploads === true || typeof uploads === 'undefined') {
          this.uploadsConfig = {};
        } else {
          this.uploadsConfig = uploads;
        }
        //This is here to check if uploads is requested without support. By
        //default we enable them if supported by the integration
      } else if (uploads) {
        throw new Error(
          'This implementation of ApolloServer does not support file uploads because the environmnet cannot accept multi-part forms',
        );
      }
    }

    //Add upload resolver
    if (this.uploadsConfig) {
      if (resolvers && !resolvers.Upload) {
        resolvers.Upload = GraphQLUpload;
      }
    }

    this.schema = schema
      ? schema
      : makeExecutableSchema({
          //we add in the upload scalar, so that schemas that don't include it
          //won't error when we makeExecutableSchema
          typeDefs: this.uploadsConfig
            ? [
                gql`
                  scalar Upload
                `,
              ].concat(typeDefs)
            : typeDefs,
          schemaDirectives,
          resolvers,
        });

    if (mocks) {
      addMockFunctionsToSchema({
        schema: this.schema,
        preserveResolvers: true,
        mocks: typeof mocks === 'boolean' ? {} : mocks,
      });
    }

    // Note: doRunQuery will add its own extensions if you set tracing,
    // or cacheControl.
    this.extensions = [];

    if (engine || (engine !== false && process.env.ENGINE_API_KEY)) {
      this.engineReportingAgent = new EngineReportingAgent(
        engine === true ? {} : engine,
      );
      // Let's keep this extension first so it wraps everything.
      this.extensions.push(() => this.engineReportingAgent.newExtension());
    }

    if (extensions) {
      this.extensions = [...this.extensions, ...extensions];
    }

    if (subscriptions !== false) {
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
  }

  //used by integrations to synchronize the path with subscriptions, some
  //integrations do not have paths, such as lambda
  public setGraphQLPath(path: string) {
    this.graphqlPath = path;
  }

  public async stop() {
    if (this.subscriptionServer) await this.subscriptionServer.close();
    if (this.engineReportingAgent) {
      this.engineReportingAgent.stop();
      await this.engineReportingAgent.sendReport();
    }
  }

  public installSubscriptionHandlers(server: HttpServer) {
    if (!this.subscriptionServerOptions) {
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

    const {
      onDisconnect,
      onConnect,
      keepAlive,
      path,
    } = this.subscriptionServerOptions;

    this.subscriptionServer = SubscriptionServer.create(
      {
        schema: this.schema,
        execute,
        subscribe,
        onConnect: onConnect
          ? onConnect
          : (connectionParams: Object) => ({ ...connectionParams }),
        onDisconnect: onDisconnect,
        onOperation: async (_: string, connection: ExecutionParams) => {
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
                ? await this.context({ connection })
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

  //This function is used by the integrations to generate the graphQLOptions
  //from an object containing the request and other integration specific
  //options
  protected async graphQLServerOptions(
    integrationContextArgument?: Record<string, any>,
  ) {
    let context: Context = this.context ? this.context : {};

    try {
      context =
        typeof this.context === 'function'
          ? await this.context(integrationContextArgument || {})
          : context;
    } catch (error) {
      //Defer context error resolution to inside of runQuery
      context = () => {
        throw error;
      };
    }

    return {
      schema: this.schema,
      extensions: this.extensions,
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
      ...this.requestOptions,
    } as GraphQLOptions;
  }
}
