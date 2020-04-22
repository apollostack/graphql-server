import { GraphQLSchema } from 'graphql';
import {
  GraphQLServiceContext,
  GraphQLRequestContext,
  GraphQLRequest,
  GraphQLResponse,
  ValueOrPromise,
  WithRequired,
} from 'apollo-server-types';
export {
  GraphQLServiceContext,
  GraphQLRequestContext,
  GraphQLRequest,
  GraphQLResponse,
  ValueOrPromise,
  WithRequired,
};

export interface ApolloServerPlugin {
  serverWillStart?(service: GraphQLServiceContext): ValueOrPromise<void>;
  schemaDidChange?(schema: GraphQLSchema, schemaHash: string): void;
  requestDidStart?<TContext>(
    requestContext: GraphQLRequestContext<TContext>,
  ): GraphQLRequestListener<TContext> | void;
}

export interface GraphQLRequestListener<TContext = Record<string, any>> {
  parsingDidStart?(
    requestContext: WithRequired<
      GraphQLRequestContext<TContext>,
      'metrics' | 'source'
    >,
  ): ((err?: Error) => void) | void;
  validationDidStart?(
    requestContext: WithRequired<
      GraphQLRequestContext<TContext>,
      'metrics' | 'source' | 'document'
    >,
  ): ((err?: ReadonlyArray<Error>) => void) | void;
  didResolveOperation?(
    requestContext: WithRequired<
      GraphQLRequestContext<TContext>,
      'metrics' | 'source' | 'document' | 'operationName' | 'operation'
    >,
  ): ValueOrPromise<void>;
  didEncounterErrors?(
    requestContext: WithRequired<
      GraphQLRequestContext<TContext>,
      'metrics' | 'source' | 'errors'
    >,
  ): ValueOrPromise<void>;
  // If this hook is defined, it is invoked immediately before GraphQL execution
  // would take place. If its return value resolves to a non-null
  // GraphQLResponse, that result is used instead of executing the query.
  // Hooks from different plugins are invoked in series and the first non-null
  // response is used.
  responseForOperation?(
    requestContext: WithRequired<
      GraphQLRequestContext<TContext>,
      'metrics' | 'source' | 'document' | 'operationName' | 'operation'
    >,
  ): ValueOrPromise<GraphQLResponse | null>;
  executionDidStart?(
    requestContext: WithRequired<
      GraphQLRequestContext<TContext>,
      'metrics' | 'source' | 'document' | 'operationName' | 'operation'
    >,
  ): ((err?: Error) => void) | void;
  willSendResponse?(
    requestContext: WithRequired<
      GraphQLRequestContext<TContext>,
      'metrics' | 'response'
    >,
  ): ValueOrPromise<void>;
}
