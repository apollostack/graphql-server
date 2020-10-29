import lambda from 'aws-lambda';
import {
  GraphQLOptions,
  HttpQueryError,
  runHttpQuery,
} from 'apollo-server-core';
import { Headers } from 'apollo-server-env';
import { ValueOrPromise } from 'apollo-server-types';

export interface LambdaGraphQLOptionsFunction {
  (event: lambda.APIGatewayProxyEventV2, context: lambda.Context): ValueOrPromise<
    GraphQLOptions
  >;
}

export function graphqlLambda(
  options: GraphQLOptions | LambdaGraphQLOptionsFunction,
): lambda.APIGatewayProxyHandlerV2 {
  if (!options) {
    throw new Error('Apollo Server requires options.');
  }

  if (arguments.length > 1) {
    throw new Error(
      `Apollo Server expects exactly one argument, got ${arguments.length}`,
    );
  }

  const graphqlHandler: lambda.APIGatewayProxyHandlerV2 = (
    event,
    context,
    callback,
  ): void => {
    context.callbackWaitsForEmptyEventLoop = false;
    let { body, isBase64Encoded } = event;

    if (body && isBase64Encoded) {
      body = Buffer.from(body, 'base64').toString();
    }

    if (event.requestContext.http.method === 'POST' && !body) {
      return callback(null, {
        body: 'POST body missing.',
        statusCode: 500,
      });
    }

    const contentType = event.headers["content-type"] || event.headers["Content-Type"];
    let query: Record<string, any> | Record<string, any>[];

    if (body && event.requestContext.http.method === 'POST' &&
      contentType && contentType.startsWith("multipart/form-data")
    ) {
      query = body as any;
    } else if (body && event.requestContext.http.method === 'POST') {
      query = JSON.parse(body);
    } else {
      query = event.queryStringParameters || {};
    }

    runHttpQuery([event, context], {
      method: event.requestContext.http.method,
      options: options,
      query,
      request: {
        url: event.requestContext.http.path,
        method: event.requestContext.http.method,
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
