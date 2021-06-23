import hapi from 'hapi';
import { parseAll } from 'accept';
import {
  renderPlaygroundPage,
  RenderPageOptions as PlaygroundRenderPageOptions,
} from '@apollographql/graphql-playground-html';

import { graphqlHapi } from './hapiApollo';

export { GraphQLOptions, GraphQLExtension } from 'apollo-server-core';
import {
  ApolloServerBase,
  GraphQLOptions,
  FileUploadOptions,
  processFileUploads,
} from 'apollo-server-core';

function handleFileUploads(uploadsConfig: FileUploadOptions) {
  return async (request: hapi.Request, _h?: hapi.ResponseToolkit) => {
    if (
      typeof processFileUploads === 'function' &&
      request.mime === 'multipart/form-data'
    ) {
      Object.defineProperty(request, 'payload', {
        value: await processFileUploads(
          request.raw.req,
          request.raw.res,
          uploadsConfig,
        ),
        writable: false,
      });
    }
  };
}

export class ApolloServer extends ApolloServerBase {
  // This translates the arguments from the middleware into graphQL options It
  // provides typings for the integration specific behavior, ideally this would
  // be propagated with a generic to the super class
  async createGraphQLServerOptions(
    request: hapi.Request,
    h: hapi.ResponseToolkit,
  ): Promise<GraphQLOptions> {
    return super.graphQLServerOptions({ request, h });
  }

  protected supportsSubscriptions(): boolean {
    return true;
  }

  protected supportsUploads(): boolean {
    return true;
  }

  public async applyMiddleware({
    app,
    cors,
    path,
    route,
    disableHealthCheck,
    onHealthCheck,
  }: ServerRegistration) {
    // In case the user didn't bother to call and await the `start` method, we
    // kick it off in the background (with any errors getting logged
    // and also rethrown from graphQLServerOptions during later requests).
    this.ensureStarting();

    if (!path) path = '/graphql';

    await app.ext({
      type: 'onRequest',
      method: async function(request, h) {
        if (request.path !== path) {
          return h.continue;
        }

        if (this.uploadsConfig && typeof processFileUploads === 'function') {
          await handleFileUploads(this.uploadsConfig)(request);
        }

        if (this.playgroundOptions && request.method === 'get') {
          // perform more expensive content-type check only if necessary
          const accept = parseAll(request.headers);
          const types = accept.mediaTypes as string[];
          const prefersHTML =
            types.find(
              (x: string) => x === 'text/html' || x === 'application/json',
            ) === 'text/html';

          if (prefersHTML) {
            const playgroundRenderPageOptions: PlaygroundRenderPageOptions = {
              endpoint: path,
              subscriptionEndpoint: this.subscriptionsPath,
              version: this.playgroundVersion,
              ...this.playgroundOptions,
            };

            return h
              .response(renderPlaygroundPage(playgroundRenderPageOptions))
              .type('text/html')
              .takeover();
          }
        }
        return h.continue;
      }.bind(this),
    });

    if (!disableHealthCheck) {
      await app.route({
        method: '*',
        path: '/.well-known/apollo/server-health',
        options: {
          cors: cors !== undefined ? cors : true,
        },
        handler: async function(request, h) {
          if (onHealthCheck) {
            try {
              await onHealthCheck(request);
            } catch {
              const response = h.response({ status: 'fail' });
              response.code(503);
              response.type('application/health+json');
              return response;
            }
          }
          const response = h.response({ status: 'pass' });
          response.type('application/health+json');
          return response;
        },
      });
    }

    await app.register({
      plugin: graphqlHapi,
      options: {
        path,
        graphqlOptions: this.createGraphQLServerOptions.bind(this),
        route:
          route !== undefined
            ? route
            : {
                cors: cors !== undefined ? cors : true,
              },
      },
    });

    this.graphqlPath = path;
  }
}

export interface ServerRegistration {
  app?: hapi.Server;
  path?: string;
  cors?: boolean | hapi.RouteOptionsCors;
  route?: hapi.RouteOptions;
  onHealthCheck?: (request: hapi.Request) => Promise<any>;
  disableHealthCheck?: boolean;
  uploads?: boolean | Record<string, any>;
}
