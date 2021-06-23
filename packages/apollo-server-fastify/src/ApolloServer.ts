import { renderPlaygroundPage } from '@apollographql/graphql-playground-html';
import { Accepts } from 'accepts';
import {
  ApolloServerBase,
  FileUploadOptions,
  formatApolloErrors,
  PlaygroundRenderPageOptions,
  processFileUploads,
  GraphQLOptions,
} from 'apollo-server-core';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { IncomingMessage, OutgoingMessage, ServerResponse, Server } from 'http';
import { graphqlFastify } from './fastifyApollo';
import type { GraphQLOperation } from '@apollographql/graphql-upload-8-fork';

const kMultipart = Symbol('multipart');
const fastJson = require('fast-json-stringify');

export interface ServerRegistration {
  path?: string;
  cors?: object | boolean;
  onHealthCheck?: (req: FastifyRequest<IncomingMessage>) => Promise<any>;
  disableHealthCheck?: boolean;
}

const stringifyHealthCheck = fastJson({
  type: 'object',
  properties: {
    status: {
      type: 'string',
    },
  },
});

const fileUploadMiddleware = (
  uploadsConfig: FileUploadOptions,
  server: ApolloServerBase,
) => (
  req: FastifyRequest<IncomingMessage>,
  reply: FastifyReply<ServerResponse>,
  done: (err: Error | null, body?: any) => void,
) => {
  if (
    (req.req as any)[kMultipart] &&
    typeof processFileUploads === 'function'
  ) {
    processFileUploads(req.req, reply.res, uploadsConfig)
      .then((body: GraphQLOperation | GraphQLOperation[]) => {
        req.body = body;
        done(null);
      })
      .catch((error: any) => {
        if (error.status && error.expose) reply.status(error.status);

        throw formatApolloErrors([error], {
          formatter: server.requestOptions.formatError,
          debug: server.requestOptions.debug,
        });
      });
  } else {
    done(null);
  }
};

export class ApolloServer extends ApolloServerBase {
  protected supportsSubscriptions(): boolean {
    return true;
  }

  protected supportsUploads(): boolean {
    return true;
  }

  async createGraphQLServerOptions(
    request?: FastifyRequest<IncomingMessage>,
    reply?: FastifyReply<OutgoingMessage>,
  ): Promise<GraphQLOptions> {
     return this.graphQLServerOptions({ request, reply });
  }

  public createHandler({
    path,
    cors,
    disableHealthCheck,
    onHealthCheck,
  }: ServerRegistration = {}) {
    this.graphqlPath = path ? path : '/graphql';

    // In case the user didn't bother to call and await the `start` method, we
    // kick it off in the background (with any errors getting logged
    // and also rethrown from graphQLServerOptions during later requests).
    this.ensureStarting();

    return async (
      app: FastifyInstance<Server, IncomingMessage, ServerResponse>,
    ) => {
      if (!disableHealthCheck) {
        app.get('/.well-known/apollo/server-health', async (req, res) => {
          // Response follows https://tools.ietf.org/html/draft-inadarei-api-health-check-01
          res.type('application/health+json');

          if (onHealthCheck) {
            try {
              await onHealthCheck(req);
              res.send(stringifyHealthCheck({ status: 'pass' }));
            } catch (e) {
              res.status(503).send(stringifyHealthCheck({ status: 'fail' }));
            }
          } else {
            res.send(stringifyHealthCheck({ status: 'pass' }));
          }
        });
      }

      app.register(
        async instance => {
          instance.register(require('fastify-accepts'));

          if (cors === true) {
            instance.register(require('fastify-cors'));
          } else if (cors !== false) {
            instance.register(require('fastify-cors'), cors);
          }

          instance.setNotFoundHandler((_request, reply) => {
            reply.code(405);
            reply.header('allow', 'GET, POST');
            reply.send();
          });

          const beforeHandlers = [
            (
              req: FastifyRequest<IncomingMessage>,
              reply: FastifyReply<ServerResponse>,
              done: () => void,
            ) => {
              // Note: if you enable playground in production and expect to be able to see your
              // schema, you'll need to manually specify `introspection: true` in the
              // ApolloServer constructor; by default, the introspection query is only
              // enabled in dev.
              if (this.playgroundOptions && req.req.method === 'GET') {
                // perform more expensive content-type check only if necessary
                const accept = (req as any).accepts() as Accepts;
                const types = accept.types() as string[];
                const prefersHTML =
                  types.find(
                    (x: string) =>
                      x === 'text/html' || x === 'application/json',
                  ) === 'text/html';

                if (prefersHTML) {
                  const playgroundRenderPageOptions: PlaygroundRenderPageOptions = {
                    endpoint: this.graphqlPath,
                    subscriptionEndpoint: this.subscriptionsPath,
                    ...this.playgroundOptions,
                  };
                  reply.type('text/html');
                  const playground = renderPlaygroundPage(
                    playgroundRenderPageOptions,
                  );
                  reply.send(playground);
                  return;
                }
              }
              done();
            },
          ];

          if (typeof processFileUploads === 'function' && this.uploadsConfig) {
            instance.addContentTypeParser(
              'multipart',
              (
                request: IncomingMessage,
                done: (err: Error | null, body?: any) => void,
              ) => {
                (request as any)[kMultipart] = true;
                done(null);
              },
            );
            beforeHandlers.push(fileUploadMiddleware(this.uploadsConfig, this));
          }

          instance.route({
            method: ['GET', 'POST'],
            url: '/',
            beforeHandler: beforeHandlers,
            handler: await graphqlFastify(this.createGraphQLServerOptions.bind(this)),
          });
        },
        {
          prefix: this.graphqlPath,
        },
      );
    };
  }
}
