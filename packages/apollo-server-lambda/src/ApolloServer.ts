import {
  APIGatewayProxyCallback,
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context as LambdaContext,
} from 'aws-lambda';
import {
  formatApolloErrors,
  processFileUploads,
  FileUploadOptions,
  ApolloServerBase,
  GraphQLOptions,
  runHttpQuery,
  HttpQueryError,
} from 'apollo-server-core';
import {
  renderPlaygroundPage,
  RenderPageOptions as PlaygroundRenderPageOptions,
} from '@apollographql/graphql-playground-html';
import { ServerResponse, IncomingHttpHeaders, IncomingMessage } from 'http';

import { Headers } from 'apollo-server-env';
import { Readable, Writable } from 'stream';

export interface CreateHandlerOptions {
  cors?: {
    origin?: boolean | string | string[];
    methods?: string | string[];
    allowedHeaders?: string | string[];
    exposedHeaders?: string | string[];
    credentials?: boolean;
    maxAge?: number;
  };
  uploadsConfig?: FileUploadOptions;
  onHealthCheck?: (req: APIGatewayProxyEvent) => Promise<any>;
}

export class FileUploadRequest extends Readable {
  headers!: IncomingHttpHeaders;
}

// Lambda has two ways of defining a handler: as an async Promise-returning
// function, and as a callback-invoking function.
// https://docs.aws.amazon.com/lambda/latest/dg/nodejs-handler.html The async
// variety was introduced with Lambda's Node 8 runtime. Apparently the
// callback-invoking variety was removed with their Node 14 runtime (their docs
// don't mention this anywhere but our users have reported this:
// https://github.com/apollographql/apollo-server/issues/1989#issuecomment-778982945).
// While AWS doesn't directly support pre-Node-8 runtimes any more, it's
// possible some users are using a Custom Runtime that still requires the Node 6
// version, and Apollo Server still technically supports Node 6. So for now, we
// define an async handler and use this function to convert it to a function
// that can work either as an async or callback handler.
//
// (Apollo Server 3 will drop Node 6 support, at which point we should just make
// this package always return an async handler.)
function maybeCallbackify(
  asyncHandler: (
    event: APIGatewayProxyEvent,
    context: LambdaContext,
  ) => Promise<APIGatewayProxyResult>,
): (
  event: APIGatewayProxyEvent,
  context: LambdaContext,
  callback: APIGatewayProxyCallback | undefined,
) => void | Promise<APIGatewayProxyResult> {
  return (
    event: APIGatewayProxyEvent,
    context: LambdaContext,
    callback: APIGatewayProxyCallback | undefined,
  ) => {
    if (callback) {
      context.callbackWaitsForEmptyEventLoop = false;
      asyncHandler(event, context).then(
        (r: APIGatewayProxyResult) => callback(null, r),
        (e) => callback(e),
      );
      return;
    } else {
      return asyncHandler(event, context);
    }
  };
}

export class ApolloServer extends ApolloServerBase {
  protected serverlessFramework(): boolean {
    return true;
  }

  // Uploads are supported in this integration
  protected supportsUploads(): boolean {
    return true;
  }

  // This translates the arguments from the middleware into graphQL options It
  // provides typings for the integration specific behavior, ideally this would
  // be propagated with a generic to the super class
  createGraphQLServerOptions(
    event: APIGatewayProxyEvent,
    context: LambdaContext,
  ): Promise<GraphQLOptions> {
    return super.graphQLServerOptions({ event, context });
  }

  public createHandler(
    { cors, onHealthCheck }: CreateHandlerOptions = {
      cors: undefined,
      onHealthCheck: undefined,
    },
  ) {
    const corsHeaders = new Headers();

    if (cors) {
      if (cors.methods) {
        if (typeof cors.methods === 'string') {
          corsHeaders.set('access-control-allow-methods', cors.methods);
        } else if (Array.isArray(cors.methods)) {
          corsHeaders.set(
            'access-control-allow-methods',
            cors.methods.join(','),
          );
        }
      }

      if (cors.allowedHeaders) {
        if (typeof cors.allowedHeaders === 'string') {
          corsHeaders.set('access-control-allow-headers', cors.allowedHeaders);
        } else if (Array.isArray(cors.allowedHeaders)) {
          corsHeaders.set(
            'access-control-allow-headers',
            cors.allowedHeaders.join(','),
          );
        }
      }

      if (cors.exposedHeaders) {
        if (typeof cors.exposedHeaders === 'string') {
          corsHeaders.set('access-control-expose-headers', cors.exposedHeaders);
        } else if (Array.isArray(cors.exposedHeaders)) {
          corsHeaders.set(
            'access-control-expose-headers',
            cors.exposedHeaders.join(','),
          );
        }
      }

      if (cors.credentials) {
        corsHeaders.set('access-control-allow-credentials', 'true');
      }
      if (typeof cors.maxAge === 'number') {
        corsHeaders.set('access-control-max-age', cors.maxAge.toString());
      }
    }

    return maybeCallbackify(
      async (
        event: APIGatewayProxyEvent,
        context: LambdaContext,
      ): Promise<APIGatewayProxyResult> => {
        const eventHeaders = new Headers(event.headers);

        // Make a request-specific copy of the CORS headers, based on the server
        // global CORS headers we've set above.
        const requestCorsHeaders = new Headers(corsHeaders);

        if (cors && cors.origin) {
          const requestOrigin = eventHeaders.get('origin');
          if (typeof cors.origin === 'string') {
            requestCorsHeaders.set('access-control-allow-origin', cors.origin);
          } else if (
            requestOrigin &&
            (typeof cors.origin === 'boolean' ||
              (Array.isArray(cors.origin) &&
                requestOrigin &&
                cors.origin.includes(requestOrigin)))
          ) {
            requestCorsHeaders.set(
              'access-control-allow-origin',
              requestOrigin,
            );
          }

          const requestAccessControlRequestHeaders = eventHeaders.get(
            'access-control-request-headers',
          );
          if (!cors.allowedHeaders && requestAccessControlRequestHeaders) {
            requestCorsHeaders.set(
              'access-control-allow-headers',
              requestAccessControlRequestHeaders,
            );
          }
        }

        // Convert the `Headers` into an object which can be spread into the
        // various headers objects below.
        // Note: while Object.fromEntries simplifies this code, it's only currently
        //       supported in Node 12 (we support >=6)
        const requestCorsHeadersObject = Array.from(requestCorsHeaders).reduce<
          Record<string, string>
        >((headersObject, [key, value]) => {
          headersObject[key] = value;
          return headersObject;
        }, {});

        if (event.httpMethod === 'OPTIONS') {
          return {
            body: '',
            statusCode: 204,
            headers: {
              ...requestCorsHeadersObject,
            },
          };
        }

        if (event.path.endsWith('/.well-known/apollo/server-health')) {
          if (onHealthCheck) {
            try {
              await onHealthCheck(event);
            } catch (_) {
              return {
                body: JSON.stringify({ status: 'fail' }),
                statusCode: 503,
                headers: {
                  'Content-Type': 'application/json',
                  ...requestCorsHeadersObject,
                },
              };
            }
          }
          return {
            body: JSON.stringify({ status: 'pass' }),
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              ...requestCorsHeadersObject,
            },
          };
        }

        if (this.playgroundOptions && event.httpMethod === 'GET') {
          const acceptHeader =
            event.headers['Accept'] || event.headers['accept'];
          if (acceptHeader && acceptHeader.includes('text/html')) {
            const path =
              event.path ||
              (event.requestContext && event.requestContext.path) ||
              '/';

            const playgroundRenderPageOptions: PlaygroundRenderPageOptions = {
              endpoint: path,
              ...this.playgroundOptions,
            };

            return {
              body: renderPlaygroundPage(playgroundRenderPageOptions),
              statusCode: 200,
              headers: {
                'Content-Type': 'text/html',
                ...requestCorsHeadersObject,
              },
            };
          }
        }

        // graphql-upload uses this response purely as a way of knowing when to
        // clean up its temporary files, so we just make a fake response for
        // that purpose.
        const response = new Writable() as ServerResponse;
        const contentType = (
          event.headers['content-type'] ||
          event.headers['Content-Type'] ||
          ''
        ).toLowerCase();
        const isMultipart = contentType.startsWith('multipart/form-data');
        type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;
        let bodyFromFileUploads:
          | UnwrapPromise<
              ReturnType<Exclude<typeof processFileUploads, undefined>>
            >
          | undefined;
        if (isMultipart && typeof processFileUploads === 'function') {
          const request = new FileUploadRequest() as IncomingMessage;
          request.push(
            Buffer.from(
              <any>event.body,
              event.isBase64Encoded ? 'base64' : 'ascii',
            ),
          );
          request.push(null);
          request.headers = event.headers;
          try {
            bodyFromFileUploads = await processFileUploads(
              request,
              response,
              this.uploadsConfig || {},
            );
          } catch (error) {
            throw formatApolloErrors([error], {
              formatter: this.requestOptions.formatError,
              debug: this.requestOptions.debug,
            });
          }
        }

        try {
          let { body, isBase64Encoded } = event;
          let query: Record<string, any> | Record<string, any>[];

          if (body && isBase64Encoded && !isMultipart) {
            body = Buffer.from(body, 'base64').toString();
          }

          if (event.httpMethod === 'POST' && !body) {
            return {
              body: 'POST body missing.',
              statusCode: 500,
            };
          }

          if (bodyFromFileUploads) {
            query = bodyFromFileUploads;
          } else if (body && event.httpMethod === 'POST' && isMultipart) {
            // XXX Not clear if this was only intended to handle the uploads
            // case or if it had more general applicability
            query = body as any;
          } else if (body && event.httpMethod === 'POST') {
            query = JSON.parse(body);
          } else {
            query = event.queryStringParameters || {};
          }

          try {
            const { graphqlResponse, responseInit } = await runHttpQuery(
              [event, context],
              {
                method: event.httpMethod,
                options: async () => {
                  return this.createGraphQLServerOptions(event, context);
                },
                query,
                request: {
                  url: event.path,
                  method: event.httpMethod,
                  headers: eventHeaders,
                },
              },
            );
            return {
              body: graphqlResponse,
              statusCode: 200,
              headers: {
                ...responseInit.headers,
                ...requestCorsHeadersObject,
              },
            };
          } catch (error) {
            if (error.name !== 'HttpQueryError') throw error;
            const httpQueryError = error as HttpQueryError;
            return {
              body: httpQueryError.message,
              statusCode: httpQueryError.statusCode,
              headers: {
                ...httpQueryError.headers,
                ...requestCorsHeadersObject,
              },
            };
          }
        } finally {
          response.end();
        }
      },
    );
  }
}
