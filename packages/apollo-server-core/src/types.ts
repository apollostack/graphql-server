import { GraphQLSchema, DocumentNode, execute, subscribe } from 'graphql';
import {
  SchemaDirectiveVisitor,
  IResolvers,
  IMocks,
  GraphQLParseOptions,
} from 'graphql-tools';
import {
  ApolloConfig,
  ValueOrPromise,
  GraphQLExecutor,
  GraphQLExecutionResult,
  GraphQLRequestContextExecutionDidStart,
  ApolloConfigInput,
} from 'apollo-server-types';
import { ConnectionContext } from 'subscriptions-transport-ws';
import type WebSocket from 'ws';
import { GraphQLExtension } from 'graphql-extensions';
export { GraphQLExtension } from 'graphql-extensions';

import { PlaygroundConfig } from './playground';
export { PlaygroundConfig, PlaygroundRenderPageOptions } from './playground';

import {
  GraphQLServerOptions as GraphQLOptions,
  PersistedQueryOptions,
} from './graphqlOptions';
import { CacheControlExtensionOptions } from 'apollo-cache-control';
import { ApolloServerPlugin } from 'apollo-server-plugin-base';

import { GraphQLSchemaModule } from '@apollographql/apollo-tools';
import type { EngineReportingOptions } from './plugin';
export { GraphQLSchemaModule };

export { KeyValueCache } from 'apollo-server-caching';

export type Context<T = object> = T;
export type ContextFunction<FunctionParams = any, ProducedContext = object> = (
  context: FunctionParams,
) => ValueOrPromise<Context<ProducedContext>>;

// A plugin can return an interface that matches `ApolloServerPlugin`, or a
// factory function that returns `ApolloServerPlugin`.
export type PluginDefinition = ApolloServerPlugin | (() => ApolloServerPlugin);

export interface SubscriptionServerOptions {
  path: string;
  keepAlive?: number;
  onConnect?: (
    connectionParams: Object,
    websocket: WebSocket,
    context: ConnectionContext,
  ) => any;
  onDisconnect?: (websocket: WebSocket, context: ConnectionContext) => any;
}

type BaseConfig = Pick<
  GraphQLOptions<Context>,
  | 'formatError'
  | 'debug'
  | 'rootValue'
  | 'validationRules'
  | 'executor'
  | 'formatResponse'
  | 'fieldResolver'
  | 'tracing'
  | 'dataSources'
  | 'cache'
  | 'logger'
>;

export type Unsubscriber = () => void;
export type SchemaChangeCallback = (schema: GraphQLSchema) => void;

export type GraphQLServiceConfig = {
  schema: GraphQLSchema;
  executor: GraphQLExecutor;
};

/**
 * This is an older format for the data that now lives in ApolloConfig.
 */
export type GraphQLServiceEngineConfig = {
  apiKeyHash: string;
  graphId: string;
  graphVariant?: string;
};

export interface GraphQLService {
  load(options: {
    apollo?: ApolloConfig,
    engine?: GraphQLServiceEngineConfig;  // deprecated; use `apollo` instead
  }): Promise<GraphQLServiceConfig>;
  onSchemaChange(callback: SchemaChangeCallback): Unsubscriber;
  // Note: The `TContext` typing here is not conclusively behaving as we expect:
  // https://github.com/apollographql/apollo-server/pull/3811#discussion_r387381605
  executor<TContext>(
    requestContext: GraphQLRequestContextExecutionDidStart<TContext>,
  ): ValueOrPromise<GraphQLExecutionResult>;
  stop?(): Promise<void>;
}

// This configuration is shared between all integrations and should include
// fields that are not specific to a single integration
export interface Config extends BaseConfig {
  modules?: GraphQLSchemaModule[];
  typeDefs?: DocumentNode | Array<DocumentNode> | string | Array<string>;
  parseOptions?: GraphQLParseOptions;
  resolvers?: IResolvers | Array<IResolvers>;
  schema?: GraphQLSchema;
  schemaDirectives?: Record<string, typeof SchemaDirectiveVisitor>;
  context?: Context | ContextFunction;
  /**
   * Custom `execute` function. Replaces `execute` of GraphQL-JS.
   */
  executeFn?: typeof execute,
  /**
   * Custom `subscribe` function. Replaces `subscribe` of GraphQL-JS.
   */
  subscribeFn?: typeof subscribe,
  introspection?: boolean;
  mocks?: boolean | IMocks;
  mockEntireSchema?: boolean;
  extensions?: Array<() => GraphQLExtension>;
  cacheControl?: CacheControlExtensionOptions | boolean;
  plugins?: PluginDefinition[];
  persistedQueries?: PersistedQueryOptions | false;
  subscriptions?: Partial<SubscriptionServerOptions> | string | false;
  //https://github.com/jaydenseric/graphql-upload#type-uploadoptions
  uploads?: boolean | FileUploadOptions;
  playground?: PlaygroundConfig;
  gateway?: GraphQLService;
  experimental_approximateDocumentStoreMiB?: number;
  stopOnTerminationSignals?: boolean;
  apollo?: ApolloConfigInput;
  // deprecated; see https://go.apollo.dev/s/migration-engine-plugins
  engine?: boolean | EngineReportingOptions<Context>;
}

// Configuration for the built-in graphql-upload integration.
export interface FileUploadOptions {
  //Max allowed non-file multipart form field size in bytes; enough for your queries (default: 1 MB).
  maxFieldSize?: number;
  //Max allowed file size in bytes (default: Infinity).
  maxFileSize?: number;
  //Max allowed number of files (default: Infinity).
  maxFiles?: number;
}
