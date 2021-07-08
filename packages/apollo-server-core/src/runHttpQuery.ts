import { Request, Headers, ValueOrPromise } from 'apollo-server-env';
import {
  default as GraphQLOptions,
  resolveGraphqlOptions,
} from './graphqlOptions';
import {
  ApolloError,
  formatApolloErrors,
  PersistedQueryNotSupportedError,
  PersistedQueryNotFoundError,
  hasPersistedQueryError,
} from 'apollo-server-errors';
import {
  processGraphQLRequest,
  GraphQLRequest,
  InvalidGraphQLRequestError,
  GraphQLRequestContext,
  GraphQLResponse,
} from './requestPipeline';
import { ApolloServerPlugin } from 'apollo-server-plugin-base';
import { WithRequired, GraphQLExecutionResult } from 'apollo-server-types';

export interface HttpQueryRequest {
  method: string;
  // query is either the POST body or the GET query string map.  In the GET
  // case, all values are strings and need to be parsed as JSON; in the POST
  // case they should already be parsed. query has keys like 'query' (whose
  // value should always be a string), 'variables', 'operationName',
  // 'extensions', etc.
  query: Record<string, any> | Array<Record<string, any>>;
  options:
    | GraphQLOptions
    | ((...args: Array<any>) => ValueOrPromise<GraphQLOptions>);
  request: Pick<Request, 'url' | 'method' | 'headers'>;
}

export interface ApolloServerHttpResponse {
  headers?: Record<string, string>;
  // ResponseInit contains the follow, which we do not use
  // status?: number;
  // statusText?: string;
}

export interface HttpQueryResponse {
  // TODO: This isn't actually an individual GraphQL response, but the body
  // of the HTTP response, which could contain multiple GraphQL responses
  // when using batching.
  graphqlResponse: string;
  responseInit: ApolloServerHttpResponse;
}

export class HttpQueryError extends Error {
  public statusCode: number;
  public isGraphQLError: boolean;
  public headers?: { [key: string]: string };

  constructor(
    statusCode: number,
    message: string,
    isGraphQLError: boolean = false,
    headers?: { [key: string]: string },
  ) {
    super(message);
    this.name = 'HttpQueryError';
    this.statusCode = statusCode;
    this.isGraphQLError = isGraphQLError;
    this.headers = headers;
  }
}

/**
 * If options is specified, then the errors array will be formatted
 */
export function throwHttpGraphQLError<E extends Error>(
  statusCode: number,
  errors: Array<E>,
  options?: Pick<GraphQLOptions, 'debug' | 'formatError'>,
  extensions?: GraphQLExecutionResult['extensions'],
): never {
  const defaultHeaders = { 'Content-Type': 'application/json' };
  // force no-cache on PersistedQuery errors
  const headers = hasPersistedQueryError(errors)
    ? {
        ...defaultHeaders,
        'Cache-Control': 'private, no-cache, must-revalidate',
      }
    : defaultHeaders;

  type Result =
   & Pick<GraphQLExecutionResult, 'extensions'>
   & { errors: E[] | ApolloError[] }

  const result: Result = {
    errors: options
      ? formatApolloErrors(errors, {
          debug: options.debug,
          formatter: options.formatError,
        })
      : errors,
  };

  if (extensions) {
    result.extensions = extensions;
  }

  throw new HttpQueryError(
    statusCode,
    prettyJSONStringify(result),
    true,
    headers,
  );
}

export async function runHttpQuery(
  handlerArguments: Array<any>,
  request: HttpQueryRequest,
): Promise<HttpQueryResponse> {
  let options: GraphQLOptions;
  const debugDefault =
    process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test';

  try {
    options = await resolveGraphqlOptions(request.options, ...handlerArguments);
  } catch (e) {
    // The options can be generated asynchronously, so we don't have access to
    // the normal options provided by the user, such as: formatError,
    // debug. Therefore, we need to do some unnatural things, such
    // as use NODE_ENV to determine the debug settings
    return throwHttpGraphQLError(500, [e], { debug: debugDefault });
  }
  if (options.debug === undefined) {
    options.debug = debugDefault;
  }

  // TODO: Errors thrown while resolving the context in
  // ApolloServer#graphQLServerOptions are currently converted to
  // a throwing function, which we invoke here to rethrow an HTTP error.
  // When we refactor the integration between ApolloServer, the middleware and
  // runHttpQuery, we should pass the original context function through,
  // so we can resolve it on every GraphQL request (as opposed to once per HTTP
  // request, which could be a batch).
  if (typeof options.context === 'function') {
    try {
      (options.context as () => never)();
    } catch (e) {
      e.message = `Context creation failed: ${e.message}`;
      // For errors that are not internal, such as authentication, we
      // should provide a 400 response
      if (
        e.extensions &&
        e.extensions.code &&
        e.extensions.code !== 'INTERNAL_SERVER_ERROR'
      ) {
        return throwHttpGraphQLError(400, [e], options);
      } else {
        return throwHttpGraphQLError(500, [e], options);
      }
    }
  }

  const config = {
    schema: options.schema,
    schemaHash: options.schemaHash,
    logger: options.logger,
    rootValue: options.rootValue,
    context: options.context || {},
    validationRules: options.validationRules,
    executor: options.executor,
    fieldResolver: options.fieldResolver,
    executeFn: options.executeFn,

    // TODO: Use proper option types to ensure this
    // The cache is guaranteed to be initialized in ApolloServer, and
    // cacheControl defaults will also have been set if a boolean argument is
    // passed in.
    cache: options.cache!,
    dataSources: options.dataSources,
    documentStore: options.documentStore,

    extensions: options.extensions,
    persistedQueries: options.persistedQueries,
    tracing: options.tracing,

    formatError: options.formatError,
    formatResponse: options.formatResponse,

    debug: options.debug,

    plugins: options.plugins || [],
  };

  return processHTTPRequest(config, request);
}

export async function processHTTPRequest<TContext>(
  options: WithRequired<GraphQLOptions<TContext>, 'cache' | 'plugins'> & {
    context: TContext;
  },
  httpRequest: HttpQueryRequest,
): Promise<HttpQueryResponse> {
  let requestPayload;

  switch (httpRequest.method) {
    case 'POST':
      if (!httpRequest.query || Object.keys(httpRequest.query).length === 0) {
        throw new HttpQueryError(
          500,
          'POST body missing. Did you forget use body-parser middleware?',
        );
      }

      requestPayload = httpRequest.query;
      break;
    case 'GET':
      if (!httpRequest.query || Object.keys(httpRequest.query).length === 0) {
        throw new HttpQueryError(400, 'GET query missing.');
      }

      requestPayload = httpRequest.query;
      break;

    default:
      throw new HttpQueryError(
        405,
        'Apollo Server supports only GET/POST requests.',
        false,
        {
          Allow: 'GET, POST',
        },
      );
  }

  // Create a local copy of `options`, based on global options, but maintaining
  // that appropriate plugins are in place.
  options = {
    ...options,
    plugins: [checkOperationPlugin, ...options.plugins],
  };

  function buildRequestContext(
    request: GraphQLRequest,
  ): GraphQLRequestContext<TContext> {
    // TODO: We currently shallow clone the context for every request,
    // but that's unlikely to be what people want.
    // We allow passing in a function for `context` to ApolloServer,
    // but this only runs once for a batched request (because this is resolved
    // in ApolloServer#graphQLServerOptions, before runHttpQuery is invoked).
    // NOTE: THIS IS DUPLICATED IN ApolloServerBase.prototype.executeOperation.
    const context = cloneObject(options.context);
    return {
      // While `logger` is guaranteed by internal Apollo Server usage of
      // this `processHTTPRequest` method, this method has been publicly
      // exported since perhaps as far back as Apollo Server 1.x.  Therefore,
      // for compatibility reasons, we'll default to `console`.
      logger: options.logger || console,
      schema: options.schema,
      schemaHash: options.schemaHash,
      request,
      response: {
        http: {
          headers: new Headers(),
        },
      },
      context,
      cache: options.cache,
      debug: options.debug,
      metrics: {},
    };
  }

  const responseInit: ApolloServerHttpResponse = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  let body: string;

  try {
    if (Array.isArray(requestPayload)) {
      // We're processing a batch request
      const requests = requestPayload.map(requestParams =>
        parseGraphQLRequest(httpRequest.request, requestParams),
      );

      const responses = await Promise.all(
        requests.map(async request => {
          try {
            const requestContext = buildRequestContext(request);
            return await processGraphQLRequest(options, requestContext);
          } catch (error) {
            // A batch can contain another query that returns data,
            // so we don't error out the entire request with an HttpError
            return {
              errors: formatApolloErrors([error], options),
            };
          }
        }),
      );

      body = prettyJSONStringify(responses.map(serializeGraphQLResponse));
    } else {
      // We're processing a normal request
      const request = parseGraphQLRequest(httpRequest.request, requestPayload);

      try {
        const requestContext = buildRequestContext(request);

        const response = await processGraphQLRequest(options, requestContext);

        // This code is run on parse/validation errors and any other error that
        // doesn't reach GraphQL execution
        if (response.errors && typeof response.data === 'undefined') {
          // don't include options, since the errors have already been formatted
          return throwHttpGraphQLError(
            (response.http && response.http.status) || 400,
            response.errors as any,
            undefined,
            response.extensions,
          );
        }

        if (response.http) {
          for (const [name, value] of response.http.headers) {
            responseInit.headers![name] = value;
          }
        }

        body = prettyJSONStringify(serializeGraphQLResponse(response));
      } catch (error) {
        if (error instanceof InvalidGraphQLRequestError) {
          throw new HttpQueryError(400, error.message);
        } else if (
          error instanceof PersistedQueryNotSupportedError ||
          error instanceof PersistedQueryNotFoundError
        ) {
          return throwHttpGraphQLError(200, [error], options);
        } else {
          throw error;
        }
      }
    }
  } catch (error) {
    if (error instanceof HttpQueryError) {
      throw error;
    }
    return throwHttpGraphQLError(500, [error], options);
  }

  responseInit.headers!['Content-Length'] = Buffer.byteLength(
    body,
    'utf8',
  ).toString();

  return {
    graphqlResponse: body,
    responseInit,
  };
}

function parseGraphQLRequest(
  httpRequest: Pick<Request, 'url' | 'method' | 'headers'>,
  requestParams: Record<string, any>,
): GraphQLRequest {
  let queryString: string | undefined = requestParams.query;
  let extensions = requestParams.extensions;

  if (typeof extensions === 'string' && extensions !== '') {
    // For GET requests, we have to JSON-parse extensions. (For POST
    // requests they get parsed as part of parsing the larger body they're
    // inside.)
    try {
      extensions = JSON.parse(extensions);
    } catch (error) {
      throw new HttpQueryError(400, 'Extensions are invalid JSON.');
    }
  }

  if (queryString && typeof queryString !== 'string') {
    // Check for a common error first.
    if ((queryString as any).kind === 'Document') {
      throw new HttpQueryError(
        400,
        "GraphQL queries must be strings. It looks like you're sending the " +
          'internal graphql-js representation of a parsed query in your ' +
          'request instead of a request in the GraphQL query language. You ' +
          'can convert an AST to a string using the `print` function from ' +
          '`graphql`, or use a client like `apollo-client` which converts ' +
          'the internal representation to a string for you.',
      );
    } else {
      throw new HttpQueryError(400, 'GraphQL queries must be strings.');
    }
  }

  const operationName = requestParams.operationName;

  let variables = requestParams.variables;
  if (typeof variables === 'string' && variables !== '') {
    try {
      // XXX Really we should only do this for GET requests, but for
      // compatibility reasons we'll keep doing this at least for now for
      // broken clients that ship variables in a string for no good reason.
      variables = JSON.parse(variables);
    } catch (error) {
      throw new HttpQueryError(400, 'Variables are invalid JSON.');
    }
  }

  return {
    query: queryString,
    operationName,
    variables,
    extensions,
    http: httpRequest,
  };
}

// GET operations should only be queries (not mutations). We want to throw
// a particular HTTP error in that case.
const checkOperationPlugin: ApolloServerPlugin = {
  requestDidStart() {
    return {
      didResolveOperation({ request, operation }) {
        if (!request.http) return;

        if (request.http.method === 'GET' && operation.operation !== 'query') {
          throw new HttpQueryError(
            405,
            `GET supports only query operation`,
            false,
            {
              Allow: 'POST',
            },
          );
        }
      },
    };
  },
};

function serializeGraphQLResponse(
  response: GraphQLResponse,
): Pick<GraphQLResponse, 'errors' | 'data' | 'extensions'> {
  // See https://github.com/facebook/graphql/pull/384 for why
  // errors comes first.
  return {
    errors: response.errors,
    data: response.data,
    extensions: response.extensions,
  };
}

// The result of a curl does not appear well in the terminal, so we add an extra new line
function prettyJSONStringify(value: any) {
  return JSON.stringify(value) + '\n';
}

export function cloneObject<T extends Object>(object: T): T {
  return Object.assign(Object.create(Object.getPrototypeOf(object)), object);
}
