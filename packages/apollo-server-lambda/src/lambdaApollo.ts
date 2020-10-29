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
    let { body, isBase64Encoded } = event;

    if (body && isBase64Encoded) {
      body = Buffer.from(body, 'base64').toString();
    }

    if (event.httpMethod === 'POST' && !body) {
      return callback(null, {
        body: 'POST body missing.',
        statusCode: 500,
      });
    }

    if (event.isBase64Encoded && event.body) {
      const bodyBuffer = new Buffer(event.body, 'base64');
      event.body = bodyBuffer.toString('utf8');
    }

    const contentType = event.headers["content-type"] || event.headers["Content-Type"];
    let query: Record<string, any> | Record<string, any>[];

    if (body && event.httpMethod === 'POST' &&
      contentType && contentType.startsWith("multipart/form-data")
    ) {
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
