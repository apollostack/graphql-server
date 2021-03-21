import {
  GraphQLOptions,
  runHttpQuery,
  convertNodeHttpToRequest,
} from 'apollo-server-core';
import { send, json, RequestHandler } from 'micro';
import url from 'url';
import { IncomingMessage, ServerResponse } from 'http';

import { MicroRequest } from './types';
import { ValueOrPromise } from 'apollo-server-types';
import { ServerRegistration } from './ApolloServer';

// Allowed Micro Apollo Server options.
export interface MicroGraphQLOptionsFunction {
  (req?: IncomingMessage): ValueOrPromise<GraphQLOptions>;
}

// Utility function used to set multiple headers on a response object.
function setHeaders(res: ServerResponse, headers: Object): void {
  Object.keys(headers).forEach((header: string) => {
    res.setHeader(header, headers[header]);
  });
}

export interface MicroOptions
  extends Pick<
    ServerRegistration,
    'requestBodyLimit' | 'requestBodyEncoding'
  > {}

// Build and return an async function that passes incoming GraphQL requests
// over to Apollo Server for processing, then fires the results/response back
// using Micro's `send` functionality.
export function graphqlMicro(
  options: GraphQLOptions | MicroGraphQLOptionsFunction,
  microOptions: MicroOptions = {},
): RequestHandler {
  if (!options) {
    throw new Error('Apollo Server requires options.');
  }

  if (arguments.length > 2) {
    throw new Error(
      `Apollo Server expects one or two arguments, got ${arguments.length}`,
    );
  }

  const graphqlHandler = async (req: MicroRequest, res: ServerResponse) => {
    let query;
    try {
      query =
        req.method === 'POST'
          ? req.filePayload ||
            (await json(req, {
              limit: microOptions.requestBodyLimit,
              encoding: microOptions.requestBodyEncoding,
            }))
          : url.parse(req.url, true).query;
    } catch (error) {
      // Do nothing; `query` stays `undefined`
    }

    try {
      const { graphqlResponse, responseInit } = await runHttpQuery([req, res], {
        method: req.method,
        options,
        query,
        request: convertNodeHttpToRequest(req),
      });
      setHeaders(res, responseInit.headers);
      return graphqlResponse;
    } catch (error) {
      if ('HttpQueryError' === error.name && error.headers) {
        setHeaders(res, error.headers);
      }

      if (!error.statusCode) {
        error.statusCode = 500;
      }

      send(res, error.statusCode, error.message);
      return undefined;
    }
  };

  return graphqlHandler;
}
