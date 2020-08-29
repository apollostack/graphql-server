import Boom from 'boom';
import {
  Server,
  Request,
  RouteOptions,
  ResponseToolkit,
  Plugin as IPlugin
} from 'hapi__hapi';
import {
  GraphQLOptions,
  runHttpQuery,
  convertNodeHttpToRequest,
} from 'apollo-server-core';
import { ValueOrPromise } from 'apollo-server-types';

export interface IRegister {
  (server: Server, options: any, next?: Function): void;
}

export interface HapiOptionsFunction {
  (request: Request, h: ResponseToolkit): ValueOrPromise<GraphQLOptions>;
}

export interface HapiPluginOptions {
  path: string;
  vhost?: string;
  route?: RouteOptions;
  graphqlOptions: GraphQLOptions | HapiOptionsFunction;
}

const plugin: IPlugin<HapiPluginOptions> = {
  name: 'graphql',
  register: (server, options, next?) => {
    if (!options || !options.graphqlOptions) {
      throw new Error('Apollo Server requires options.');
    }
    server.route({
      method: ['GET', 'POST'],
      path: options.path || '/graphql',
      vhost: options.vhost || undefined,
      options: options.route || {},
      handler: async (request, h) => {
        try {
          const { graphqlResponse, responseInit } = await runHttpQuery(
            [request, h],
            {
              method: request.method.toUpperCase(),
              options: options.graphqlOptions,
              query:
                request.method === 'post'
                  ? // TODO type payload as string or Record
                    (request.payload as any)
                  : request.query,
              request: convertNodeHttpToRequest(request.raw.req),
            },
          );

          const response = h.response(graphqlResponse);
          Object.keys(responseInit.headers).forEach(key =>
            response.header(key, responseInit.headers[key]),
          );
          return response;
        } catch (error) {
          if ('HttpQueryError' !== error.name) {
            throw Boom.boomify(error);
          }

          if (true === error.isGraphQLError) {
            const response = h.response(error.message);
            response.code(error.statusCode);
            response.type('application/json');
            return response;
          }

          const err = new Boom(error.message, { statusCode: error.statusCode });
          if (error.headers) {
            Object.keys(error.headers).forEach(header => {
              err.output.headers[header] = error.headers[header];
            });
          }
          // Boom hides the error when status code is 500
          err.output.payload.message = error.message;
          throw err;
        }
      },
    });

    if (next) {
      next();
    }
  },
};

export {
  plugin
};
