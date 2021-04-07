import Koa, { Middleware } from 'koa';
import corsMiddleware from '@koa/cors';
import bodyParser from 'koa-bodyparser';
import compose from 'koa-compose';
import {
  renderPlaygroundPage,
  RenderPageOptions as PlaygroundRenderPageOptions,
} from '@apollographql/graphql-playground-html';
import {
  ApolloServerBase,
  FileUploadOptions,
  GraphQLOptions,
  formatApolloErrors,
  processFileUploads,
} from 'apollo-server-core';
import accepts from 'accepts';
import typeis from 'type-is';

import { graphqlKoa } from './koaApollo';

export { GraphQLOptions, GraphQLExtension } from 'apollo-server-core';

export interface GetMiddlewareOptions {
  path?: string;
  cors?: corsMiddleware.Options | boolean;
  bodyParserConfig?: bodyParser.Options | boolean;
  onHealthCheck?: (ctx: Koa.Context) => Promise<any>;
  disableHealthCheck?: boolean;
}

export interface ServerRegistration extends GetMiddlewareOptions {
  app: Koa;
}

const fileUploadMiddleware = (
  uploadsConfig: FileUploadOptions,
  server: ApolloServerBase,
) => async (ctx: Koa.Context, next: Function) => {
  if (typeis(ctx.req, ['multipart/form-data'])) {
    try {
      ctx.request.body = await processFileUploads(
        ctx.req,
        ctx.res,
        uploadsConfig,
      );
      return next();
    } catch (error) {
      if (error.status && error.expose) ctx.status = error.status;

      throw formatApolloErrors([error], {
        formatter: server.requestOptions.formatError,
        debug: server.requestOptions.debug,
      });
    }
  } else {
    return next();
  }
};

const middlewareFromPath = (
  path: string,
  middleware: compose.Middleware<Koa.Context>,
) => (ctx: Koa.Context, next: () => Promise<any>) => {
  if (ctx.path === path) {
    return middleware(ctx, next);
  } else {
    return next();
  }
};

export class ApolloServer extends ApolloServerBase {
  // This translates the arguments from the middleware into graphQL options It
  // provides typings for the integration specific behavior, ideally this would
  // be propagated with a generic to the super class
  async createGraphQLServerOptions(ctx: Koa.Context): Promise<GraphQLOptions> {
    return super.graphQLServerOptions({ ctx });
  }

  protected supportsSubscriptions(): boolean {
    return true;
  }

  protected supportsUploads(): boolean {
    return true;
  }

  public applyMiddleware({ app, ...rest }: ServerRegistration) {
    app.use(this.getMiddleware(rest));
  }

  // TODO: While Koa is Promise-aware, this API hasn't been historically, even
  // though other integration's (e.g. Hapi) implementations of this method
  // are `async`.  Therefore, this should become `async` in a major release in
  // order to align the API with other integrations.
  public getMiddleware({
    path,
    cors,
    bodyParserConfig,
    disableHealthCheck,
    onHealthCheck,
  }: GetMiddlewareOptions = {}): Middleware {
    if (!path) path = '/graphql';

    // In case the user didn't bother to call and await the `start` method, we
    // kick it off in the background (with any errors getting logged
    // and also rethrown from graphQLServerOptions during later requests).
    this.ensureStarting();

    const middlewares = [];

    if (!disableHealthCheck) {
      middlewares.push(
        middlewareFromPath(
          '/.well-known/apollo/server-health',
          (ctx: Koa.Context) => {
            // Response follows https://tools.ietf.org/html/draft-inadarei-api-health-check-01
            ctx.set('Content-Type', 'application/health+json');

            if (onHealthCheck) {
              return onHealthCheck(ctx)
                .then(() => {
                  ctx.body = { status: 'pass' };
                })
                .catch(() => {
                  ctx.status = 503;
                  ctx.body = { status: 'fail' };
                });
            } else {
              ctx.body = { status: 'pass' };
            }
          },
        ),
      );
    }

    let uploadsMiddleware;
    if (this.uploadsConfig && typeof processFileUploads === 'function') {
      uploadsMiddleware = fileUploadMiddleware(this.uploadsConfig, this);
    }

    this.graphqlPath = path;

    if (cors === true) {
      middlewares.push(middlewareFromPath(path, corsMiddleware()));
    } else if (cors !== false) {
      middlewares.push(middlewareFromPath(path, corsMiddleware(cors)));
    }

    if (bodyParserConfig === true) {
      middlewares.push(middlewareFromPath(path, bodyParser()));
    } else if (bodyParserConfig !== false) {
      middlewares.push(middlewareFromPath(path, bodyParser(bodyParserConfig)));
    }

    if (uploadsMiddleware) {
      middlewares.push(middlewareFromPath(path, uploadsMiddleware));
    }

    middlewares.push(
      middlewareFromPath(path, (ctx: Koa.Context, next: Function) => {
        if (ctx.request.method === 'OPTIONS') {
          ctx.status = 204;
          ctx.body = '';
          return;
        }

        if (this.playgroundOptions && ctx.request.method === 'GET') {
          // perform more expensive content-type check only if necessary
          const accept = accepts(ctx.req);
          const types = accept.types() as string[];
          const prefersHTML =
            types.find(
              (x: string) => x === 'text/html' || x === 'application/json',
            ) === 'text/html';

          if (prefersHTML) {
            const playgroundRenderPageOptions: PlaygroundRenderPageOptions = {
              endpoint: path,
              subscriptionEndpoint: this.subscriptionsPath,
              ...this.playgroundOptions,
            };
            ctx.set('Content-Type', 'text/html');
            const playground = renderPlaygroundPage(
              playgroundRenderPageOptions,
            );
            ctx.body = playground;
            return;
          }
        }

        return graphqlKoa(() => {
          return this.createGraphQLServerOptions(ctx);
        })(ctx, next);
      }),
    );
    return compose(middlewares);
  }
}
