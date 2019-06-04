import lambda from 'aws-lambda';
import {
  GraphQLOptions,
  HttpQueryError,
  runHttpQuery,
} from 'apollo-server-core';
import { Headers, ValueOrPromise } from 'apollo-server-env';

export interface LambdaGraphQLOptionsFunction {
  (event: lambda.AppSyncProxyEvent, context: lambda.Context): ValueOrPromise<
    GraphQLOptions
  >;
}

export function graphqlLambda(
  options: GraphQLOptions | LambdaGraphQLOptionsFunction,
): lambda.AppSyncProxyHandler {
  if (!options) {
    throw new Error('Apollo Server requires options.');
  }

  if (arguments.length > 1) {
    throw new Error(
      `Apollo Server expects exactly one argument, got ${arguments.length}`,
    );
  }

  const graphqlHandler: lambda.AppSyncProxyHandler = (
    event,
    context,
    callback,
  ): void => {
    context.callbackWaitsForEmptyEventLoop = false;

    if (event.httpMethod === 'POST' && !event.body) {
      return callback(null, {
        body: 'POST body missing.',
        statusCode: 500,
      });
    }
    runHttpQuery([event, context], {
      method: event.httpMethod,
      options: options,
      query:
        event.httpMethod === 'POST' && event.body
          ? JSON.parse(event.body)
          : event.queryStringParameters,
      request: {
        url: event.path,
        method: event.httpMethod,
        headers: new Headers(event.headers),
      },
    }).then(
      ({ graphqlResponse, responseInit }) => {
        callback(null, {
          body: graphqlResponse,
          statusCode: 200,
          headers: responseInit.headers,
        });
      },
      (error: HttpQueryError) => {
        if ('HttpQueryError' !== error.name) return callback(error);
        callback(null, {
          body: error.message,
          statusCode: error.statusCode,
          headers: error.headers,
        });
      },
    );
  };

  return graphqlHandler;
}
