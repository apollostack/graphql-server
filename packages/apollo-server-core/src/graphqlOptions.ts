import {
  GraphQLSchema,
  ValidationContext,
  GraphQLFieldResolver,
} from 'graphql';
import { PersistedQueryCache } from './caching';
import { GraphQLExtension } from 'graphql-extensions';
import { RESTDataSource } from 'apollo-datasource-rest';
import { KeyValueCache } from 'apollo-server-caching';

/*
 * GraphQLServerOptions
 *
 * - schema: an executable GraphQL schema used to fulfill requests.
 * - (optional) formatError: Formatting function applied to all errors before response is sent
 * - (optional) rootValue: rootValue passed to GraphQL execution
 * - (optional) context: the context passed to GraphQL execution
 * - (optional) formatParams: a function applied to the parameters of every invocation of runQuery
 * - (optional) validationRules: extra validation rules applied to requests
 * - (optional) formatResponse: a function applied to each graphQL execution result
 * - (optional) fieldResolver: a custom default field resolver
 * - (optional) debug: a boolean that will print additional debug logging if execution errors occur
 * - (optional) extensions: an array of functions which create GraphQLExtensions (each GraphQLExtension object is used for one request)
 *
 */
export interface GraphQLServerOptions<
  TContext =
    | (() => Promise<Record<string, any>> | Record<string, any>)
    | Record<string, any>
> {
  schema: GraphQLSchema;
  formatError?: Function;
  rootValue?: any;
  context?: TContext;
  formatParams?: Function;
  validationRules?: Array<(context: ValidationContext) => any>;
  formatResponse?: Function;
  fieldResolver?: GraphQLFieldResolver<any, TContext>;
  debug?: boolean;
  tracing?: boolean;
  // cacheControl?: boolean | CacheControlExtensionOptions;
  cacheControl?: boolean | any;
  extensions?: Array<() => GraphQLExtension>;
  dataSources?: () => DataSources;
  cache?: KeyValueCache;
  persistedQueries?: PersistedQueryOptions;
}

export type DataSources = { [name: string]: RESTDataSource };

export interface PersistedQueryOptions {
  cache: PersistedQueryCache;
}

export default GraphQLServerOptions;

export async function resolveGraphqlOptions(
  options:
    | GraphQLServerOptions
    | ((
        ...args: Array<any>
      ) => Promise<GraphQLServerOptions> | GraphQLServerOptions),
  ...args: Array<any>
): Promise<GraphQLServerOptions> {
  if (typeof options === 'function') {
    return await options(...args);
  } else {
    return options;
  }
}
