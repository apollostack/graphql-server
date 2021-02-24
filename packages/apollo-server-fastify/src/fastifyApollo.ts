import {
  convertNodeHttpToRequest,
  GraphQLOptions,
  runHttpQuery,
} from 'apollo-server-core';
import { FastifyReply, FastifyRequest, RouteHandlerMethod } from 'fastify';
import { ValueOrPromise } from 'apollo-server-types';

export async function graphqlFastify(
  options: (
    req?: FastifyRequest,
    res?: FastifyReply,
  ) => ValueOrPromise<GraphQLOptions>,
): Promise<RouteHandlerMethod> {
  if (!options) {
    throw new Error('Apollo Server requires options.');
  }

  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { graphqlResponse, responseInit } = await runHttpQuery(
        [request, reply],
        {
          method: request.raw.method as string,
          options,
          query: (request.raw.method === 'POST'
            ? request.body
            : request.query) as Record<string, any>,
          request: convertNodeHttpToRequest(request.raw),
        },
      );

      if (responseInit.headers) {
        for (const [name, value] of Object.entries<string>(
          responseInit.headers,
        )) {
          reply.header(name, value);
        }
      }
      reply.serializer((payload: string) => payload);
      reply.send(graphqlResponse);
    } catch (error) {
      if ('HttpQueryError' !== error.name) {
        throw error;
      }

      if (error.headers) {
        Object.keys(error.headers).forEach((header) => {
          reply.header(header, error.headers[header]);
        });
      }

      reply.code(error.statusCode);
      reply.serializer((payload: string) => payload);
      reply.send(error.message);
    }
  };
}
