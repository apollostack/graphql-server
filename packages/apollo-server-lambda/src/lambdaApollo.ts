import lambda from 'aws-lambda';
import {
  GraphQLOptions,
  HttpQueryError,
  runHttpQuery,
} from 'apollo-server-core';
import { Headers } from 'apollo-server-env';
import { ValueOrPromise } from 'apollo-server-types';

export interface LambdaGraphQLOptionsFunction {
  (event: lambda.APIGatewayProxyEvent, context: lambda.Context): ValueOrPromise<
    GraphQLOptions
  >;
}

export function graphqlLambda(
  options: GraphQLOptions | LambdaGraphQLOptionsFunction,
): lambda.APIGatewayProxyHandler {
  if (!options) {
    throw new Error('Apollo Server requires options.');
  }

  if (arguments.length > 1) {
    throw new Error(
      `Apollo Server expects exactly one argument, got ${arguments.length}`,
    );
  }

  const graphqlHandler: lambda.APIGatewayProxyHandler = (
    event,
    context,
    callback,
  ): void => {
    context.callbackWaitsForEmptyEventLoop = false;
    let { body, headers, isBase64Encoded } = event;
    let query: Record<string, any> | Record<string, any>[];
    const contentType = (
      headers['content-type'] || headers['Content-Type'] || ''
    ).toLowerCase();
    const isMultipart = contentType.startsWith('multipart/form-data');

    if (body && isBase64Encoded && !isMultipart) {
      body = Buffer.from(body, 'base64').toString();
    }

    if (event.httpMethod === 'POST' && !body) {
      return callback(null, {
        body: 'POST body missing.',
        statusCode: 400,
      });
    }

    if (body && event.httpMethod === 'POST' && isMultipart) {
      query = body as any;
    } else if (body && event.httpMethod === 'POST') {
      query = JSON.parse(body);
    } else {
      query = event.queryStringParameters || {};
    }

    runHttpQuery([event, context], {
      method: event.httpMethod,
      options: options,
      query,
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
