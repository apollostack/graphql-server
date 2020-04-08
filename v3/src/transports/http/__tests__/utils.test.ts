import { EventEmitter } from "events";
import {
  createRequest,
  createResponse,
  RequestOptions,
  ResponseOptions,
} from "node-mocks-http";
// This `URLSchemaParams` could very well be a polyfill, like the one we once
// offered in `apollo-server-env`, but we should reconsider exactly what we want
// that package to offer and how/where we want it to exist before consciously
// choosing to use it again.
import { URLSearchParams } from "url";
import { ProcessGraphqlRequest } from "../../../execution";
import { AsyncRequestListener } from "../handler";
import { SerializedGraphqlRequest } from "../transport";
import { parseGetRequest, parsePostRequest } from "../utils";

/**
 * This is a mock processor which is meant to mimic what must be a more complete
 * GraphQL processor.  It is, however, _not_ a complete implementation because
 * this test-suite aims to test only the handler properties and not details
 * which are tested more thoroughly elsewhere (e.g. transport, execution).
 */
export const mockProcessor: ProcessGraphqlRequest = async ({ request }) => {
  // We have very loose requirements in this mock processor.  In fact, nothing
  // actually exercises this error right now, but it remains here to prevent
  // inadvertant mis-use of this methid in a future test.
  if (!request.query && !request.extensions) {
    throw new Error("Unable to process with mockProcessor.");
  }

  // Note that this is always "successful", since we're not testing the
  // error properties at the handler level, but rather the transport.
  return {
    data: null,
  }
};

/**
 * Mock type of Node.js' `http.IncomingMessage`.
 */
type MockRequest = ReturnType<typeof createRequest>;

/**
 * Mock type of Node.js' `http.ServerResponse`.
 */
type MockResponse = ReturnType<typeof createResponse>;

/**
 * HTTP parameters to be passed as part of a request.  For POST requests, these
 * will be serialized into JSON and send in the body of the request.  For GET
 * requests, they will become part of the query-string.
 */
type Params = Record<string, string> | string | undefined;

export interface TestableRequestListener {
  /**
   * Access to the `req` (i.e. `http.IncomingMessage`)
   */
  req: MockRequest;

  /**
   * Access to the `res` (i.e. `http.ServerResponse`)
   */
  res: MockResponse;

  /**
   * Used by tests to send the appropriately shaped request to the mocked
   * request (i.e. `MockRequest`, a.k.a. `http.IncomingMessage`) depending on
   * whether the `method` in use is `GET` or `POST`.  Because of the placement
   * of those variables and the way that transmitting these parameters varies
   * depending on the method (`GET` in the query string and `POST` in the body)
   * this method is responsible for creating the actual test handler.  This is
   * because the parameters for a `GET` request should be present at the time
   * the request object is instantiated contrasted with `POST`-ed parameters
   * which are sent as a stream of data after the request is already going.
   *
   * This abstraction allows us to write single tests and have them exercised
   * for both `GET` and `POST` and to ensure that they behave identically.
   */
  initHandlerWithParams: (params: Params) => Promise<void>;

  /**
   * A `Promise` that will eventually resolve or reject to the handler.
   *
   * This will not yield an actual handler until data has been transmitted
   * to be used by the handler with `initHandlerWithParams` for the reasons
   * noted in that method's description.
   *
   * In practice, since the handler doesn't actually return anything, this will
   * either result in a resolution to `undefined`, or a `rejection` with an
   * error.
   */
  handlerPromise: ReturnType<AsyncRequestListener>;
}

/**
 * Generate a mock `RequestListener` using the [`node-mocks-http`] npm module
 * in order to simulate how an `http.IncomingRequest` and `http.ServerResponse`
 * would behave, including an `EventEmitter` for the response.
 *
 * [`node-mocks-http`]: https://npm.im/node-mocks-http
 */
function createMockRequestListener(
  requestOptions: RequestOptions,
  responseOptions: ResponseOptions = Object.create(null),
) {
  return {
    req: createRequest({
      ...requestOptions,
    }),
    res: createResponse({
      eventEmitter: EventEmitter,
      ...responseOptions,
    })
  }
}

/**
 * Create a testable `RequestListener` to test both POST and GET requests
 *
 * POST requests receive their parameters as a steram of data on the body
 * while GET requests are provided their parameters in the query string.  We
 * aim to support both of these methods though the behavior between them should
 * be mostly the same.  While POST requests might eventually be
 * used for more complicated purposes (e.g. uploads), the core functionality
 * (e.g. parsing of `variables`, `extensions`) should remain the same and be
 * tested in an identical fashion.  The actual parsing of the parameters is
 * still tested separately, within the `parseGetRequest` and `parsePostRequest`
 * methods laster in this test-suite.
 *
 * @param params Parameters defined by `TestableRequestListenerParams`
 */
export function getTestableRequestListener(
  {
    requestOptions,
    responseOptions,
    handler,
  }: {
    requestOptions: RequestOptions;
    responseOptions?: ResponseOptions;
    handler: AsyncRequestListener;
  }): TestableRequestListener {

  if (!requestOptions.method) {
    throw new Error(
      "Internal error: Must pass `method` to " +
      "`getTestableRequestListener`'s `requestOptions`.");
  }

  // Create a `Promise` which will eventually resolve to the return result of
  // the aynchronous handler.  In order to send the data only after the handler
  // was created, the handler won't actually be created until after we have
  // data to be sent to it.
  let handlerPromiseResolve: (value?: Promise<void>) => void;
  const handlerPromise =
    new Promise<ReturnType<AsyncRequestListener>>((resolve) => {
      handlerPromiseResolve = resolve;
    })
    // We'll actually return the `Promise` of the handler itself here to
    // un-wrap what would otherwise be a `Promise` of a `Promise`.
    .then((resolved) => resolved);

  let initPromiseResolve: (value?: void) => void;
  const initPromise = new Promise<void>((resolve) => {
    initPromiseResolve = resolve;
  }).then(() =>  handlerPromiseResolve(handler(req, res)));

  const { req, res } = createMockRequestListener(requestOptions, responseOptions)

  const initHandlerWithParams: TestableRequestListener['initHandlerWithParams'] =
    async (params) => {
      // For a GET request, we'll apply the parameters as the query string.
      if (req.method === "GET") {
        req.url = "/" +
          // Extra implementation to avoid the query string when params omitted.
          (params ? "?" + (new URLSearchParams(params || {})).toString() : "");
      }

      // For a POST request, we'll stream the data in the body after we create
      // the handler.
      initPromise.then(() => {
        if (req.method === "POST") {
          req.send(params);
        }
      });

      initPromiseResolve();
    }

  return {
    req,
    res,
    initHandlerWithParams,
    handlerPromise,
  }
}

describe("parsePostRequest", () => {
  let req: MockRequest;
  let parsingPromise: Promise<SerializedGraphqlRequest>;
  beforeEach(() => {
    ({ req } = createMockRequestListener({ method: "POST" }));
    parsingPromise = parsePostRequest(req);
  });

  it("throws a SyntaxError on malformed JSON input", async () => {
    // Intentional corruption!
    req.send("{");
    await expect(parsingPromise).rejects.toThrow(SyntaxError);
    await expect(parsingPromise).rejects.toThrowError("Body is malformed JSON");
  });

  it("can parse a body with all GraphQLRequest properties included", () => {
    req.send({
      query: "{ __typename }",
      operationName: "",
      variables: JSON.stringify({}),
      extensions: JSON.stringify({})
    });
    return expect(parsingPromise).resolves.toEqual({
      query: "{ __typename }",
      operationName: "",
      variables: "{}",
      extensions: "{}",
    });
  });

  it("can parse a body containing properly escaped nested JSON", () => {
    req.send({
      query: "{ __typename }",
      operationName: "",
      variables: JSON.stringify({ variablesValue: true }),
      extensions: JSON.stringify({ extensionsValue: true }),
    });
    return expect(parsingPromise).resolves.toEqual({
      query: "{ __typename }",
      operationName: "",
      variables: "{\"variablesValue\":true}",
      extensions: "{\"extensionsValue\":true}",
    });
  });

  it("includes non-GraphQL specific properties", async () => {
    req.send({
      query: "{ __typename }",
      arbitrary: true
    });
    await expect(parsingPromise).resolves.toHaveProperty("arbitrary");
    await expect(parsingPromise).resolves.toHaveProperty("query");
  });

  it("returns GraphQLRequest properties as undefined when absent", async () => {
    req.send({ query: "{ __typename }" });
    await expect(parsingPromise).resolves.toEqual({
      query: "{ __typename }",
      variables: undefined,
      extensions: undefined,
      operationName: undefined
    });
  });
});

describe("parseGetRequest", () => {
  const buildRequestForGet = (
    params?: Record<string, string>,
    requestOptions?: RequestOptions,
  ) => createMockRequestListener({
    method: "GET",
    url: "/" +
      // Extra implementation to avoid the query string when params are omitted.
      (
        params ? "?" + (new URLSearchParams(params || {})).toString()
        : ""
      ),
    ...requestOptions,
  });

  describe("query string parses", () => {
    it("a simple `query`", () => {
      const query = '{field}';
      const { req } = buildRequestForGet({ query });
      return expect(parseGetRequest(req)).resolves.toMatchObject({ query });
    });

    it("a more complicated `query`", () => {
      const query = '{ field(argument: "value") { selection }';
      const { req } = buildRequestForGet({ query });
      return expect(parseGetRequest(req)).resolves.toMatchObject({ query });
    });

    it("the `operationName` when specified", () => {
      const query = 'query myQuery {field}';
      const operationName = 'myQuery'
      const { req } = buildRequestForGet({ query, operationName });
      return expect(parseGetRequest(req)).resolves.toMatchObject({
        query,
        operationName,
      });
    });

    it("`operationName` included when `query` unspecified", () => {
      const operationName = 'myQuery'
      const { req } = buildRequestForGet({ operationName });
      return expect(parseGetRequest(req)).resolves.toMatchObject({
        operationName,
      });
    });
  });
});
