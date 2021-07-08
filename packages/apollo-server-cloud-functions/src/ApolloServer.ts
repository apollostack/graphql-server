import { ApolloServerBase, GraphQLOptions } from 'apollo-server-core';
import {
  renderPlaygroundPage,
  RenderPageOptions as PlaygroundRenderPageOptions,
} from '@apollographql/graphql-playground-html';
import { Request, Response } from 'express';

import { graphqlCloudFunction } from './googleCloudApollo';

export interface CreateHandlerOptions {
  cors?: {
    origin?: boolean | string | (string | RegExp)[];
    methods?: string | string[];
    allowedHeaders?: string | string[];
    exposedHeaders?: string | string[];
    credentials?: boolean;
    maxAge?: number;
  };
}

export class ApolloServer extends ApolloServerBase {
  protected serverlessFramework(): boolean {
    return true;
  }

  // This translates the arguments from the middleware into graphQL options It
  // provides typings for the integration specific behavior, ideally this would
  // be propagated with a generic to the super class
  createGraphQLServerOptions(
    req: Request,
    res: Response,
  ): Promise<GraphQLOptions> {
    return super.graphQLServerOptions({ req, res });
  }

  public createHandler({ cors }: CreateHandlerOptions = { cors: undefined }) {
    const corsHeaders = {} as Record<string, any>;

    if (cors) {
      if (cors.methods) {
        if (typeof cors.methods === 'string') {
          corsHeaders['Access-Control-Allow-Methods'] = cors.methods;
        } else if (Array.isArray(cors.methods)) {
          corsHeaders['Access-Control-Allow-Methods'] = cors.methods.join(',');
        }
      }

      if (cors.allowedHeaders) {
        if (typeof cors.allowedHeaders === 'string') {
          corsHeaders['Access-Control-Allow-Headers'] = cors.allowedHeaders;
        } else if (Array.isArray(cors.allowedHeaders)) {
          corsHeaders[
            'Access-Control-Allow-Headers'
          ] = cors.allowedHeaders.join(',');
        }
      }

      if (cors.exposedHeaders) {
        if (typeof cors.exposedHeaders === 'string') {
          corsHeaders['Access-Control-Expose-Headers'] = cors.exposedHeaders;
        } else if (Array.isArray(cors.exposedHeaders)) {
          corsHeaders[
            'Access-Control-Expose-Headers'
          ] = cors.exposedHeaders.join(',');
        }
      }

      if (cors.credentials) {
        corsHeaders['Access-Control-Allow-Credentials'] = 'true';
      }
      if (cors.maxAge) {
        corsHeaders['Access-Control-Max-Age'] = cors.maxAge;
      }
    }

    return (req: Request, res: Response) => {
      // Handle both the root of the GCF endpoint and /graphql
      // With bare endpoints, GCF sets request params' path to null.
      // The check for '' is included in case that behaviour changes
      if (req.path && !['', '/', '/graphql'].includes(req.path)) {
        res.status(404).end();
        return;
      }

      if (cors && cors.origin) {
          const requestOrigin = req.get('origin') || '';
        if (typeof cors.origin === 'string') {
          res.set('Access-Control-Allow-Origin', cors.origin);
        } else if (
          typeof cors.origin === 'boolean' ||
          (Array.isArray(cors.origin) &&
            // Check settings array for strings matching origin
            (cors.origin.includes(requestOrigin) ||
              // Check settings array for Regex matching origin
              cors.origin.some((setting) =>
                setting instanceof RegExp && setting.test(requestOrigin)
              )
            )
          ) ||
          // Check origin for matching Regex
          (cors.origin instanceof RegExp &&
            cors.origin.test(requestOrigin))
        ) {
          res.set('Access-Control-Allow-Origin', req.get('origin'));
        }

        if (!cors.allowedHeaders) {
          res.set(
            'Access-Control-Allow-Headers',
            req.get('Access-Control-Request-Headers'),
          );
        }
      }

      res.set(corsHeaders);

      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }

      if (this.playgroundOptions && req.method === 'GET') {
        const acceptHeader = req.headers['accept'] as string;
        if (acceptHeader && acceptHeader.includes('text/html')) {
          const playgroundRenderPageOptions: PlaygroundRenderPageOptions = {
            endpoint: req.get('referer'),
            ...this.playgroundOptions,
          };

          res
            .status(200)
            .send(renderPlaygroundPage(playgroundRenderPageOptions));
          return;
        }
      }

      graphqlCloudFunction(async () => {
        return this.createGraphQLServerOptions(req, res);
      })(req, res);
    };
  }
}
