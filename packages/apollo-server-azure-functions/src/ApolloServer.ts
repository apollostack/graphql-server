import { Context, HttpRequest } from '@azure/functions';
import { HttpResponse } from 'azure-functions-ts-essentials';
import { ApolloServerBase } from 'apollo-server-core';
import { GraphQLOptions } from 'apollo-server-core';
import {
  renderPlaygroundPage,
  RenderPageOptions as PlaygroundRenderPageOptions,
} from '@apollographql/graphql-playground-html';

import { graphqlAzureFunction } from './azureFunctionApollo';

export interface CreateHandlerOptions {
  cors?: {
    origin?: boolean | string | string[];
    methods?: string | string[];
    allowedHeaders?: string | string[];
    exposedHeaders?: string | string[];
    credentials?: boolean;
    maxAge?: number;
  };
  onHealthCheck?: (req: HttpRequest) => Promise<any>;
}

export class ApolloServer extends ApolloServerBase {
  protected serverlessFramework(): boolean {
    return true;
  }

  // This translates the arguments from the middleware into graphQL options It
  // provides typings for the integration specific behavior, ideally this would
  // be propagated with a generic to the super class
  createGraphQLServerOptions(
    request: HttpRequest,
    context: Context,
  ): Promise<GraphQLOptions> {
    return super.graphQLServerOptions({ request, context });
  }

  public createHandler({ cors, onHealthCheck }: CreateHandlerOptions = { cors: undefined, onHealthCheck: undefined }) {
    // We will kick off the `willStart` event once for the server, and then
    // await it before processing any requests by incorporating its `await` into
    // the GraphQLServerOptions function which is called before each request.
    const promiseWillStart = this.willStart();

    const corsHeaders: HttpResponse['headers'] = {};

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

    return (context: Context, req: HttpRequest) => {
      const originHeader = req.headers['Origin'] || req.headers['origin'];
      if (cors && cors.origin) {
        if (typeof cors.origin === 'string') {
          corsHeaders['Access-Control-Allow-Origin'] = cors.origin;
        } else if (
          typeof cors.origin === 'boolean' ||
          (Array.isArray(cors.origin) &&
            originHeader !== undefined &&
            cors.origin.includes(originHeader))
        ) {
          corsHeaders['Access-Control-Allow-Origin'] = originHeader;
        }

        if (!cors.allowedHeaders) {
          corsHeaders['Access-Control-Allow-Headers'] =
            req.headers['Access-Control-Request-Headers'];
        }
      }

      if (req.method === 'OPTIONS') {
        context.done(null, {
          body: '',
          status: 204,
          headers: corsHeaders,
        });
        return;
      }

      if (req.url.endsWith('/.well-known/apollo/server-health')) {
        const successfulResponse = {
          body: JSON.stringify({ status: 'pass' }),
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        };
        if (onHealthCheck) {
          onHealthCheck(req)
            .then(() => {
              return context.done(null, successfulResponse);
            })
            .catch(() => {
              return context.done(null, {
                body: JSON.stringify({ status: 'fail' }),
                statusCode: 503,
                headers: {
                  'Content-Type': 'application/json',
                  ...corsHeaders,
                },
              });
            });
          return;
        } else {
          return context.done(null, successfulResponse);
        }
      }

      if (this.playgroundOptions && req.method === 'GET') {
        const acceptHeader = req.headers['Accept'] || req.headers['accept'];
        if (acceptHeader && acceptHeader.includes('text/html')) {
          const path = req.url || '/';

          const playgroundRenderPageOptions: PlaygroundRenderPageOptions = {
            endpoint: path,
            ...this.playgroundOptions,
          };
          const body = renderPlaygroundPage(playgroundRenderPageOptions);
          context.done(null, {
            body: body,
            status: 200,
            headers: {
              'Content-Type': 'text/html',
              ...corsHeaders,
            },
          });
          return;
        }
      }

      const callbackFilter = (error?: any, output?: HttpResponse) => {
        context.done(
          error,
          output && {
            ...output,
            headers: {
              ...output.headers,
              ...corsHeaders,
            },
          },
        );
      };
      graphqlAzureFunction(async () => {
        await promiseWillStart;
        return this.createGraphQLServerOptions(req, context);
      })(context, req, callbackFilter);
    };
  }
}
