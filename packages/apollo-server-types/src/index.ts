import { Request, Response } from 'apollo-server-env';
import {
  GraphQLSchema,
  ValidationContext,
  ASTVisitor,
  GraphQLFormattedError,
  OperationDefinitionNode,
  DocumentNode,
  GraphQLError,
  GraphQLResolveInfo,
} from 'graphql';

// This seems like it could live in this package too.
import { KeyValueCache } from 'apollo-server-caching';
import { Trace } from 'apollo-reporting-protobuf';

export type BaseContext = Record<string, any>;

export type ValueOrPromise<T> = T | Promise<T>;
export type WithRequired<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * It is not recommended to use this `AnyFunction` type further.
 *
 * This is a legacy type which aims to do what its name suggests (be the type
 * for _any_ function) but it should be replaced with something from the
 * TypeScript standard lib.  It doesn't truly cover "any" function right now,
 * and in particular doesn't consider `this`.  For now, it has been brought
 * here from the Apollo Server `Dispatcher`, where it was first utilized.
 */
export type AnyFunction = (...args: any[]) => any;

/**
 * A map of `AnyFunction`s which are the interface for our plugin API's
 * request listeners. (e.g. `GraphQLRequestListener`s).
 */
export type AnyFunctionMap = { [key: string]: AnyFunction | undefined };

type Mutable<T> = { -readonly [P in keyof T]: T[P] };

 // By default, TypeScript uses structural typing (as opposed to nominal typing)
 // Put another way, if it looks like the type and walks like that type, then
 // TypeScript lets it be a type.
 //
 // That's often okay, but it leaves a lot to be desired since a `string` of one
 // type can just be passed in as `string` for that type and TypeScript won't
 // complain.  Flow offers opaque types which solve this, but TypeScript doesn't
 // offer this (yet?).  This Faux-paque type can be used to gain nominal-esque
 // typing, which is incredibly beneficial during re-factors!
 type Fauxpaque<K, T> = K & { __fauxpaque: T };

 export type SchemaHash = Fauxpaque<string, 'SchemaHash'>;

// Configuration for how Apollo Server talks to the Apollo registry, as
// passed to the ApolloServer constructor.
export interface ApolloConfigInput {
  key?: string;
  graphId?: string;
  graphVariant?: string;
}

// Configuration for how Apollo Server talks to the Apollo registry, with
// some defaults filled in from the ApolloConfigInput passed to the constructor.
export interface ApolloConfig {
  key?: string;
  keyHash?: string;
  graphId?: string;
  graphVariant: string;
}

 export interface GraphQLServiceContext {
  logger: Logger;
  schema: GraphQLSchema;
  schemaHash: SchemaHash;
  apollo: ApolloConfig;
  persistedQueries?: {
    cache: KeyValueCache;
  };
  serverlessFramework: boolean;
  // For backwards compatibility only; prefer to use `apollo`.
  engine: {
    serviceID?: string;
    apiKeyHash?: string;
  };
}

export interface GraphQLRequest {
  query?: string;
  operationName?: string;
  variables?: VariableValues;
  extensions?: Record<string, any>;
  http?: Pick<Request, 'url' | 'method' | 'headers'>;
}

export type VariableValues = { [name: string]: any };

export interface GraphQLResponse {
  data?: Record<string, any> | null;
  errors?: Array<GraphQLFormattedError>;
  extensions?: Record<string, any>;
  http?: Pick<Response, 'headers'> & Partial<Pick<Mutable<Response>, 'status'>>;
}

export interface GraphQLRequestMetrics {
  captureTraces?: boolean;
  persistedQueryHit?: boolean;
  persistedQueryRegister?: boolean;
  responseCacheHit?: boolean;
  forbiddenOperation?: boolean;
  registeredOperation?: boolean;
  startHrTime?: [number, number];
  queryPlanTrace?: Trace.QueryPlanNode;
}

export interface GraphQLRequestContext<TContext = Record<string, any>> {
  readonly request: GraphQLRequest;
  response?: GraphQLResponse;

  logger: Logger;

  readonly schema: GraphQLSchema;
  readonly schemaHash: SchemaHash;

  readonly context: TContext;
  readonly cache: KeyValueCache;

  readonly queryHash?: string;

  readonly document?: DocumentNode;
  readonly source?: string;

  // `operationName` is set based on the operation AST, so it is defined even if
  // no `request.operationName` was passed in.  It will be set to `null` for an
  // anonymous operation, or if `requestName.operationName` was passed in but
  // doesn't resolve to an operation in the document.
  readonly operationName?: string | null;
  readonly operation?: OperationDefinitionNode;

  /**
   * Unformatted errors which have occurred during the request. Note that these
   * are present earlier in the request pipeline and differ from **formatted**
   * errors which are the result of running the user-configurable `formatError`
   * transformation function over specific errors.
   */
  errors?: Array<GraphQLError>;

  readonly metrics: GraphQLRequestMetrics;

  debug?: boolean;
}

export type ValidationRule = (context: ValidationContext) => ASTVisitor;

export class InvalidGraphQLRequestError extends GraphQLError {}

export type GraphQLExecutor<TContext = Record<string, any>> = (
  requestContext: GraphQLRequestContextExecutionDidStart<TContext>,
) => ValueOrPromise<GraphQLExecutionResult>;

export type GraphQLExecutionResult = {
  data?: Record<string, any> | null;
  errors?: Array<GraphQLError>;
  extensions?: Record<string, any>;
};

export type Logger = {
  // Ordered from least-severe to most-severe.
  debug(message?: any): void;
  info(message?: any): void;
  warn(message?: any): void;
  error(message?: any): void;
}

/**
 * This is an object form of the parameters received by typical
 * `graphql-js` resolvers.  The function type is `GraphQLFieldResolver`
 * and normally uses positional parameters.  In order to facilitate better
 * ergonomics in the Apollo Server plugin API, these have been converted to
 * named properties on the object using their names from the upstream
 * `GraphQLFieldResolver` type signature.  Ergonomic wins, in this case,
 * include not needing to have three unused variables in scope just because
 * there was a need to access the `info` property in a wrapped plugin.
 */
export type GraphQLFieldResolverParams<
  TSource,
  TContext,
  TArgs = { [argName: string]: any }
> = {
  source: TSource;
  args: TArgs;
  context: TContext;
  info: GraphQLResolveInfo;
};

export type GraphQLRequestContextDidResolveSource<TContext> =
  WithRequired<GraphQLRequestContext<TContext>,
    | 'metrics'
    | 'source'
    | 'queryHash'
  >;
export type GraphQLRequestContextParsingDidStart<TContext> =
  GraphQLRequestContextDidResolveSource<TContext>;
export type GraphQLRequestContextValidationDidStart<TContext> =
  GraphQLRequestContextParsingDidStart<TContext> &
  WithRequired<GraphQLRequestContext<TContext>,
    | 'document'
  >;
export type GraphQLRequestContextDidResolveOperation<TContext> =
  GraphQLRequestContextValidationDidStart<TContext> &
  WithRequired<GraphQLRequestContext<TContext>,
    | 'operation'
    | 'operationName'
  >;
export type GraphQLRequestContextDidEncounterErrors<TContext> =
  WithRequired<GraphQLRequestContext<TContext>,
    | 'metrics'
    | 'errors'
  >;
export type GraphQLRequestContextResponseForOperation<TContext> =
  WithRequired<GraphQLRequestContext<TContext>,
    | 'metrics'
    | 'source'
    | 'document'
    | 'operation'
    | 'operationName'
  >;
export type GraphQLRequestContextExecutionDidStart<TContext> =
  GraphQLRequestContextParsingDidStart<TContext> &
  WithRequired<GraphQLRequestContext<TContext>,
    | 'document'
    | 'operation'
    | 'operationName'
  >;
export type GraphQLRequestContextWillSendResponse<TContext> =
  GraphQLRequestContextDidResolveSource<TContext> &
  WithRequired<GraphQLRequestContext<TContext>,
    | 'metrics'
    | 'response'
  >;
