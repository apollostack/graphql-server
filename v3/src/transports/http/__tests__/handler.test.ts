import { createResponse, RequestOptions } from "node-mocks-http";
import { EventEmitter } from "events";
import {
  default as httpHandler,
  __testing__,
  AsyncRequestListener,
} from "../handler";
import {
  mockProcessor,
  TestableRequestListener,
  getTestableRequestListener,
} from "./utils.test";
const {
  badRequest,
  internalServerError,
} = __testing__;

// This is meant to be a "valid query" in the sense that it represents what
// might be a valid query, though it's worth noting that there is no validation,
// no schema, and no implementation to make it real.  It's used in test-cases
// below for representative purposes, and nothing else.
const validQuery = "query { books { author } }";

describe("httpHandler", () => {
  describe("construction", () => {
    it("throws when invoked without a processor", () => {
      expect(() => {
        // @ts-ignore Calling this method with missing arguments.
        httpHandler();
      }).toThrow(
        "Invalid handler received: Pass the `executeOperation` method from " +
          "an instance of an `ApolloServer` to this function, or a similar " +
          "function which accepts a `GraphQLRequest` and returns a " +
          "`GraphQLResponse`."
      );
    });

    it("returns a RequestListener", () => {
      expect(httpHandler(mockProcessor)).toBeInstanceOf(Function);
    });
  });

  describe("RequestListener", () => {
    let handler: AsyncRequestListener;
    beforeEach(() => {
      handler = httpHandler(mockProcessor);
    });

    describe("guards for programming errors", () => {
      it("throws when called with no request", async () => {
        await expect(
          // @ts-ignore Explicitly omitted all arguments (request & response).
          handler()
        ).rejects.toThrow(
          "Missing request on HTTP request handler invocation."
        );
      });

      it("throws when called with no response", async () => {
        await expect(
          // @ts-ignore Explicitly omitted second argument (response).
          handler({})
        ).rejects.toThrow(
          "Missing response sink on HTTP request handler invocation."
        );
      });
    });

    describe.each<RequestOptions["method"]>([
      "GET",
      "POST",
    ])(
      "request handling - %s",
      (method) => {
        let req: TestableRequestListener['req'],
            res: TestableRequestListener['res'],
            handlerPromise: TestableRequestListener['handlerPromise'],
            initHandlerWithParams: TestableRequestListener['initHandlerWithParams'];

        beforeEach(async () => {
          (
            // Destructure into the locally scoped variables to allow
            // abbreviated usage within all of the tests below.
            { req, res, initHandlerWithParams, handlerPromise } =
            getTestableRequestListener({
              requestOptions: { method },
              handler,
            })
          );
        });

        // This also tests the behavior of the `initHandlerWithParams` helper.
        it("reads streams of the request body appropriately", async () => {
          // Only one of the two scenarios should be triggered.
          expect.assertions(1);
          const reqOn = jest.spyOn(req, "on");
          await initHandlerWithParams({ query: validQuery });
          if (method === "POST") {
            // In theory, it would have been called multiple times, but this
            // test doesn't check for those details.
            expect(reqOn).toHaveBeenCalled();
          } else if (method === "GET") {
            expect(reqOn).not.toHaveBeenCalled();
          }
        });

        it("returns a 400 when 'variables' is malformed", async () => {
          expect.assertions(5);

          // Set expectations to be checked after the response is emitted.
          // Make sure to update the assertion count when adding to this block!
          res.on("end", () => {
            expect(res._getHeaders()).toEqual({});
            expect(res._getStatusCode()).toBe(400);
            expect(res._getStatusMessage()).toBe("Malformed request body");
            expect(res._getData()).toStrictEqual("");
          });

          await initHandlerWithParams({
            query: "{ __typename }",
            operationName: "",
            // Intentional variable corruption!
            variables: '{',
            extensions: JSON.stringify({})
          });
          await expect(handlerPromise).resolves.toBeUndefined();
        });

        it("returns a 400 when 'extensions' is malformed", async () => {
          expect.assertions(5);

          // Set expectations to be checked after the response is emitted.
          // Make sure to update the assertion count when adding to this block!
          res.on("end", () => {
            expect(res._getHeaders()).toEqual({});
            expect(res._getStatusCode()).toBe(400);
            expect(res._getStatusMessage()).toBe("Malformed request body");
            expect(res._getData()).toStrictEqual("");
          });

          await initHandlerWithParams({
            query: "{ __typename }",
            operationName: "",
            variables: JSON.stringify({}),
            // Intentional variable corruption!
            extensions: '{',
          });
          await expect(handlerPromise).resolves.toBeUndefined();
        });

        it("returns a 200 when the body is proper", async () => {
          expect.assertions(5);
          // Set expectations to be checked after the response is emitted.
          // Make sure to update the assertion count when adding to this block!
          res.on("end", () => {
            expect(res._getHeaders()).toMatchObject({
              'content-type': 'application/json',
            });
            expect(res._getStatusCode()).toBe(200);
            expect(res._getStatusMessage()).toBe("");
            expect(res._getJSONData()).toStrictEqual({
              data: null,
            });
          });

          await initHandlerWithParams({
            query: validQuery,
          });
          await expect(handlerPromise).resolves.toBeUndefined();
        });
      }
    );

    // Legacy
    it.todo("returns a 500 if the body of the request is missing");
    // It seems to me that the `query` very well could be missing in an APQ
    // scenario.  I don't fully understand why we would enable this test.
    it.todo(
      "returns a 400 if the 'query' is missing when the 'GET' method is used",
    );
  });
});

describe("badRequest", () => {
  it("can call the writeHead message with the correct code and message", () => {
    expect.assertions(5);
    const res = createResponse({ eventEmitter: EventEmitter });
    const resEnd = jest.spyOn(res, "end");

    // Set expectations to be checked after the response is emitted.
    // Make sure to update the assertion count when adding to this block!
    res.on("end", () => {
      expect(res._getHeaders()).toEqual({});
      expect(res._getStatusCode()).toBe(400);
      expect(res._getStatusMessage()).toBe("Malformed request.");
      expect(res._getData()).toStrictEqual("");
    });

    // Trigger test criteria
    badRequest(res, "Malformed request.");

    expect(resEnd).toHaveBeenCalledTimes(1);
  });
});

describe("internalServerError", () => {
  it("can call the writeHead message with the correct code and message", () => {
    expect.assertions(5);
    const res = createResponse({ eventEmitter: EventEmitter });
    const resEnd = jest.spyOn(res, "end");

    // Set expectations to be checked after the response is emitted.
    // Make sure to update the assertion count when adding to this block!
    res.on("end", () => {
      expect(res._getHeaders()).toEqual({});
      expect(res._getStatusCode()).toBe(500);
      expect(res._getStatusMessage()).toBe("Catastrophic.");
      expect(res._getData()).toStrictEqual("");
    });

    // Trigger test criteria
    internalServerError(res, "Catastrophic.");

    expect(resEnd).toHaveBeenCalledTimes(1);
  });
});
