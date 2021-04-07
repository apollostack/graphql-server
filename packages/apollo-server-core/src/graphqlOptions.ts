import {
  GraphQLSchema,
  ValidationContext,
  GraphQLFieldResolver,
  DocumentNode,
  GraphQLError,
  GraphQLFormattedError,
} from 'graphql';
import { GraphQLExtension } from 'graphql-extensions';
import { CacheControlExtensionOptions } from 'apollo-cache-control';
import { KeyValueCache, InMemoryLRUCache } from 'apollo-server-caching';
import { DataSource } from 'apollo-datasource';
import { ApolloServerPlugin } from 'apollo-server-plugin-base';
import { GraphQLParseOptions } from 'graphql-tools';
import {
  GraphQLExecutor,
  ValueOrPromise,
  GraphQLResponse,
  GraphQLRequestContext,
  Logger,
  SchemaHash,
} from 'apollo-server-types';

/*
 * GraphQLServerOptions
 *
 * - schema: an executable GraphQL schema used to fulfill requests.
 * - (optional) logger: a `Logger`-compatible implementation to be used for server-level messages.
 * - (optional) formatError: Formatting function applied to all errors before response is sent
 * - (optional) rootValue: rootValue passed to GraphQL execution, or a function to resolving the rootValue from the DocumentNode
 * - (optional) context: the context passed to GraphQL execution
 * - (optional) validationRules: extra validation rules applied to requests
 * - (optional) formatResponse: a function applied to each graphQL execution result
 * - (optional) fieldResolver: a custom default field resolver
 * - (optional) debug: a boolean that will print additional debug logging if execution errors occur
 * - (optional) extensions: an array of functions which create GraphQLExtensions (each GraphQLExtension object is used for one request)
 * - (optional) parseOptions: options to pass when parsing schemas and queries
 *
 */
export interface GraphQLServerOptions<
  TContext = Record<string, any>,
  TRootValue = any
> {
  schema: GraphQLSchema;
  schemaHash: SchemaHash;
  logger?: Logger;
  formatError?: (error: GraphQLError) => GraphQLFormattedError;
  rootValue?: ((parsedQuery: DocumentNode) => TRootValue) | TRootValue;
  context?: TContext | (() => never);
  validationRules?: Array<(context: ValidationContext) => any>;
  executor?: GraphQLExecutor;
  formatResponse?: (
    response: GraphQLResponse,
    requestContext: GraphQLRequestContext<TContext>,
  ) => GraphQLResponse | null;
  fieldResolver?: GraphQLFieldResolver<any, TContext>;
  debug?: boolean;
  tracing?: boolean;
  cacheControl?: CacheControlExtensionOptions;
  extensions?: Array<() => GraphQLExtension>;
  dataSources?: () => DataSources<TContext>;
  cache?: KeyValueCache;
  persistedQueries?: PersistedQueryOptions;
  plugins?: ApolloServerPlugin[];
  documentStore?: InMemoryLRUCache<DocumentNode>;
  parseOptions?: GraphQLParseOptions;
}

export type DataSources<TContext> = {
  [name: string]: DataSource<TContext>;
};

export interface PersistedQueryOptions {
  cache?: KeyValueCache;
  /**
   * Specified in **seconds**, this time-to-live (TTL) value limits the lifespan
   * of how long the persisted query should be cached.  To specify a desired
   * lifespan of "infinite", set this to `null`, in which case the eviction will
   * be determined by the cache's eviction policy, but the record will never
   * simply expire.
   */
  ttl?: number | null;
}

export default GraphQLServerOptions;

export async function resolveGraphqlOptions(
  options:
    | GraphQLServerOptions
    | ((...args: Array<any>) => ValueOrPromise<GraphQLServerOptions>),
  ...args: Array<any>
): Promise<GraphQLServerOptions> {
  if (typeof options === 'function') {
    return await options(...args);
  } else {
    return options;
  }
}
