import { ProcessGraphqlRequest } from "../../execution";
import { IncomingHttpHeaders, OutgoingHttpHeaders } from "http";
import { GraphQLError } from "graphql/error";
import {
  GraphQLRequest,
  GraphQLResponse,
  isErrorBeforeExecution,
  isErrorDuringExecution,
} from "../../types";

/**
 * An intermediary interface of an incoming request, prior to becoming a
 * `GraphQLRequest`, before it is fully parsed. At this stage, all values are
 * strings, as extracted from the HTTP request's incoming bytes. This means that
 * some properties (e.g. `variables`, `extensions`), need additional parsing.
 */
export type SerializedGraphqlRequest = { [P in keyof GraphQLRequest]: string }

/**
 * This interface correlates to the `req.IncomingMessage` type, in a Node.js
 * agnostic way.
 */
export interface IHttpRequest {
  /**
   * The HTTP method of the request (e.g. POST, GET, HEAD, OPTIONS).
   *
   * While we could string-ly type this to the types that HTTP supports, the
   * Node.js `req.IncomingMessage` doesn't enumerate that finite list of
   * standardized methods, instead only typing it as `string`.  Therefore, we
   * currently do the same.
   */
  method: string;
  headers: IncomingHttpHeaders;

  /**
   * The requested URL.  It's unlikely that we should be doing anything with
   * this within the server, but suspect it would be available from many
   * transports.
   */
  url?: string;
  parsedRequest: GraphQLRequest;
}

export interface IHttpResponse {
  /**
   * The numeric representation of the HTTP status code.
   */
  statusCode: number;

  /**
   * An optional string specification of the HTTP status code.
   *
   * @remarks
   *
   * For known status codes, it's recommended to use the [IANA official status
   * messages], though handlers may define this as they wish.
   *
   * [IANA official status messages]: https://www.iana.org/assignments/http-status-codes/http-status-codes.xhtml
   */
  statusMessage?: string;

  /**
   * This returns an `AsyncIterable` which could include multiple responses.
   * It is up to the implementing HTTP handler to decide what it does with
   * this.
   */
  body: AsyncIterable<GraphQLResponse>;
  headers: OutgoingHttpHeaders;
}

/** Options for {@link processHttpRequest} */
interface IProcessHttpRequestArgs {
  processGraphqlRequestFn: ProcessGraphqlRequest;
  request: IHttpRequest;
}

// Intentionally not exported to ensure that this technique for setting HTTP
// status codes is only used internally for now.
class ApolloGraphQLErrorWithHttpStatusCode extends GraphQLError {};

/**
 * Process an HTTP request.
 *
 * This is meant to be invoked from an HTTP handler which has
 * coerced its input values to match the interface expectations
 * of this
 *
 */
export async function processHttpRequest(
  /**
   * This `IProcessHttpRequestArgs` interface is expected to be mapped from
   * the incoming request by the HTTP handler, which itself should invoke this
   * function.
   */
  args: IProcessHttpRequestArgs,
): Promise<IHttpResponse> {
  const { processGraphqlRequestFn, request } = args;

  if (request.method !== 'POST' && request.method !== 'GET') {
    return generatedResponse({
      response: {
        // TODO(AS3) This is currently being short-circuited by the handler.
        // This still may be a valuable guard for any non-default handlers
        // that are (eventually) written, but we should figure out the boundary
        // more clearly.
        errors: [
          new ApolloGraphQLErrorWithHttpStatusCode("Unsupported method",
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            {
              __apolloHttpStatusCode: 405,
            }
          )
        ],
      },
    });
  }

  try {
    return generatedResponse({
      response: await processGraphqlRequestFn({
        request: request.parsedRequest,
      }),
    });
  } catch (err) {
    return generatedResponse({
      response: {
        errors: [new GraphQLError("Internal server error")],
      },
    });
  }
}

/** Options for {@link generatedResponse} */
interface IGeneratedResponseArgs {
  /**
   * A complete `GraphQLResponse`. Note that the `body` of this `response` may
   * be an `AsyncIterable` which may continue to iterate after the initial
   * response.
   */
  response: GraphQLResponse;

  /**
   * HTTP headers which should be added to the response by the HTTP handler.
   * Currently, Apollo Server provides no ability to specify how these will be
   * set.
   */
  headers?: OutgoingHttpHeaders;
}

/**
 * Generate the response to return to the HTTP transport.
 *
 * TODO(AS3) Yet to be determined, is how the setting of additional headers
 * should be handled.
 *
 */
function generatedResponse(args: IGeneratedResponseArgs): IHttpResponse {
  const {
    response,
    headers = Object.create(null),
  } = args;

  /**
   * In the future, GraphQL execution should return an `AsyncIterable`. However,
   * today it returns a `Promise`, so we'll coerce it into an `AsyncIterable`
   * with a generator function implemented on a `Symbol.asyncIterator` property.
   */
  const body = {
    [Symbol.asyncIterator]: async function*() {
      yield response;
    },
  };

  const statusCode: number = statusCodeForResponse(response);

  return {
    body,
    statusCode,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  };
}

/**
 * Convert a singular `GraphQLError` to an HTTP status code.
 *
 * TODO(AS3) This could be more defensive since, at the moment, we don't check
 * this against a known error type — e.g. `ValidationError`, `ParseError` — as
 * we did in Apollo Server 2.x.  For now, we just structurally check the error
 * to see if it matches characteristics of particular error types.
 *
 * Moreso, the new execution pipeline doesn't actually throw these errors
 * right now, so this is the only technique we can currently employ.  While we
 * could re-use `apollo-server-errors` errors in Apollo Server 3, we may want to
 * consider another option, so I didn't want to reach for that package just yet.
 *
 * @param error A `GraphQLError` instance to reduce to a status code.
 */
export function statusCodeForError(error: GraphQLError): number {
  if (!(error instanceof GraphQLError)) {
    return 500;
  }

  // We intentially use a non-exported sub-class of GraphQLError to ensure that
  // this solution is just leveraged in the general sense for now.
  if (
    error instanceof ApolloGraphQLErrorWithHttpStatusCode &&
    error.extensions &&
    typeof error.extensions.__apolloHttpStatusCode === 'number'
  ) {
    return error.extensions.__apolloHttpStatusCode;
  }

  if (
    error.source &&
    Array.isArray(error.positions) &&
    error.positions.length &&
    Array.isArray(error.locations) &&
    error.locations.length
  ) {
    if (Array.isArray(error.nodes) && error.nodes.length) {
      return 400; // Validation error
    }
    // TODO(AS3) A parse error, but we maybe should shore this up by using
    // specific error classes within `processGraphqlRequest`.
    return 400;
  }

  return 400;
}

/**
 * Generate an HTTP status code for a `GraphQLResponse`.
 *
 * @param response A `GraphQLResponse` which will be reduced to an HTTP status
 * code based on its `errors` and `data` properties (or lack thereof!).
 */
export function statusCodeForResponse(response: GraphQLResponse): number {
  const mixedResponseStatusCode = 207;
  const defaultExecutionStatusCode = 200;
  const defaultPreExecutionErrorStatusCode = 400;

  if (isErrorBeforeExecution(response)) {
    return response.errors.reduce((previousStatusCode, err) => {
      const thisStatusCode = statusCodeForError(err);
      if (thisStatusCode && thisStatusCode >= previousStatusCode) {
        return thisStatusCode;
      }

      return previousStatusCode;
    }, defaultPreExecutionErrorStatusCode);
  } else if (isErrorDuringExecution(response)) {
    return mixedResponseStatusCode;
  } else {
    return defaultExecutionStatusCode;
  }
}
