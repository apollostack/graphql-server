import http from 'http';
import { sha256 } from 'js-sha256';
import { URL } from 'url';
import express = require('express');
import bodyParser = require('body-parser');

import { Report, Trace } from 'apollo-reporting-protobuf';

import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLError,
  ValidationContext,
  FieldDefinitionNode,
  getIntrospectionQuery,
} from 'graphql';

import { PubSub } from 'graphql-subscriptions';
import { SubscriptionClient } from 'subscriptions-transport-ws';
import WebSocket from 'ws';

import { execute } from 'apollo-link';
import { createHttpLink } from 'apollo-link-http';
import {
  createPersistedQueryLink as createPersistedQuery,
  VERSION,
} from 'apollo-link-persisted-queries';

import {
  createApolloFetch,
  ApolloFetch,
  GraphQLRequest,
  ParsedResponse,
} from 'apollo-fetch';
import {
  AuthenticationError,
  UserInputError,
  gql,
  Config,
  ApolloServerBase,
  PluginDefinition,
  GraphQLService,
  GraphQLExecutor,
  ApolloServerPluginInlineTrace,
  ApolloServerPluginUsageReporting,
  ApolloServerPluginUsageReportingOptions,
  GraphQLServiceConfig,
} from 'apollo-server-core';
import { GraphQLExtension, GraphQLResponse } from 'graphql-extensions';
import { TracingFormat } from 'apollo-tracing';
import ApolloServerPluginResponseCache from 'apollo-server-plugin-response-cache';
import { GraphQLRequestContext } from 'apollo-server-types';

import { mockDate, unmockDate, advanceTimeBy } from '../../../__mocks__/date';

export function createServerInfo<AS extends ApolloServerBase>(
  server: AS,
  httpServer: http.Server,
): ServerInfo<AS> {
  const serverInfo: any = {
    ...httpServer.address(),
    server,
    httpServer,
  };

  // Convert IPs which mean "any address" (IPv4 or IPv6) into localhost
  // corresponding loopback ip. Note that the url field we're setting is
  // primarily for consumption by our test suite. If this heuristic is wrong for
  // your use case, explicitly specify a frontend host (in the `host` option to
  // ApolloServer.listen).
  let hostForUrl = serverInfo.address;
  if (serverInfo.address === '' || serverInfo.address === '::')
    hostForUrl = 'localhost';

  serverInfo.url = require('url').format({
    protocol: 'http',
    hostname: hostForUrl,
    port: serverInfo.port,
    pathname: server.graphqlPath,
  });

  return serverInfo;
}

const INTROSPECTION_QUERY = `
  {
    __schema {
      directives {
        name
      }
    }
  }
`;

const TEST_STRING_QUERY = `
  {
    testString
  }
`;

const queryType = new GraphQLObjectType({
  name: 'QueryType',
  fields: {
    testString: {
      type: GraphQLString,
      resolve() {
        return 'test string';
      },
    },
  },
});

const schema = new GraphQLSchema({
  query: queryType,
});

const makeGatewayMock = ({
  optionsSpy = _options => {},
  unsubscribeSpy = () => {},
  executor = () => ({}),
}: {
  optionsSpy?: (_options: any) => void;
  unsubscribeSpy?: () => void;
  executor?: GraphQLExecutor;
} = {}) => {
  let resolution: GraphQLServiceConfig | null = null;
  let rejection: Error | null = null;
  const eventuallyAssigned = {
    resolveLoad: (config: GraphQLServiceConfig) => {
      resolution = config;
    },
    rejectLoad: (err: Error) => {
      rejection = err;
    },
    triggerSchemaChange: null as (newSchema) => void,
  };

  const mockedGateway: GraphQLService = {
    executor,
    load: async (options) => {
      optionsSpy(options);
      // Make sure it's async
      await new Promise(res => setImmediate(res));
      if (rejection) {
        throw rejection;
      }
      if (resolution) {
        return resolution;
      }
      throw Error("Neither resolving nor rejecting?");
    },
    onSchemaChange: callback => {
      eventuallyAssigned.triggerSchemaChange = callback;
      return unsubscribeSpy;
    },
  };

  return { gateway: mockedGateway, triggers: eventuallyAssigned };
};

export interface ServerInfo<AS extends ApolloServerBase> {
  address: string;
  family: string;
  url: string;
  port: number | string;
  server: AS;
  httpServer: http.Server;
}

export interface CreateServerFunc<AS extends ApolloServerBase> {
  (config: Config, suppressStartCall?: boolean): Promise<ServerInfo<AS>>;
}

export interface StopServerFunc {
  (): Promise<void>;
}

export function testApolloServer<AS extends ApolloServerBase>(
  createApolloServer: CreateServerFunc<AS>,
  stopServer: StopServerFunc,
) {
  describe('ApolloServer', () => {
    afterEach(stopServer);

    describe('constructor', () => {
      describe('validation rules', () => {
        it('accepts additional rules', async () => {
          const NoTestString = (context: ValidationContext) => ({
            Field(node: FieldDefinitionNode) {
              if (node.name.value === 'testString') {
                context.reportError(
                  new GraphQLError('Not allowed to use', [node]),
                );
              }
            },
          });

          const formatError = jest.fn(error => {
            expect(error instanceof Error).toBe(true);
            return error;
          });

          const { url: uri } = await createApolloServer({
            schema,
            validationRules: [NoTestString],
            introspection: false,
            formatError,
          });

          const apolloFetch = createApolloFetch({ uri });

          const introspectionResult = await apolloFetch({
            query: INTROSPECTION_QUERY,
          });
          expect(introspectionResult.data).toBeUndefined();
          expect(introspectionResult.errors).toBeDefined();
          expect(introspectionResult.errors[0].message).toMatch(
            /introspection/,
          );
          expect(formatError.mock.calls.length).toEqual(
            introspectionResult.errors.length,
          );

          const result = await apolloFetch({ query: TEST_STRING_QUERY });
          expect(result.data).toBeUndefined();
          expect(result.errors).toBeDefined();
          expect(result.errors[0].message).toMatch(/Not allowed/);
          expect(formatError.mock.calls.length).toEqual(
            introspectionResult.errors.length + result.errors.length,
          );
        });

        it('allows introspection by default', async () => {
          const nodeEnv = process.env.NODE_ENV;
          delete process.env.NODE_ENV;

          const { url: uri } = await createApolloServer({
            schema,
            stopOnTerminationSignals: false,
          });

          const apolloFetch = createApolloFetch({ uri });

          const result = await apolloFetch({ query: INTROSPECTION_QUERY });
          expect(result.data).toBeDefined();
          expect(result.errors).toBeUndefined();

          process.env.NODE_ENV = nodeEnv;
        });

        it('prevents introspection by default during production', async () => {
          const nodeEnv = process.env.NODE_ENV;
          process.env.NODE_ENV = 'production';

          const { url: uri } = await createApolloServer({
            schema,
            stopOnTerminationSignals: false,
          });

          const apolloFetch = createApolloFetch({ uri });

          const result = await apolloFetch({ query: INTROSPECTION_QUERY });
          expect(result.data).toBeUndefined();
          expect(result.errors).toBeDefined();
          expect(result.errors.length).toEqual(1);
          expect(result.errors[0].extensions.code).toEqual(
            'GRAPHQL_VALIDATION_FAILED',
          );

          process.env.NODE_ENV = nodeEnv;
        });

        it('allows introspection to be enabled explicitly', async () => {
          const nodeEnv = process.env.NODE_ENV;
          process.env.NODE_ENV = 'production';

          const { url: uri } = await createApolloServer({
            schema,
            introspection: true,
            stopOnTerminationSignals: false,
          });

          const apolloFetch = createApolloFetch({ uri });

          const result = await apolloFetch({ query: INTROSPECTION_QUERY });
          expect(result.data).toBeDefined();
          expect(result.errors).toBeUndefined();

          process.env.NODE_ENV = nodeEnv;
        });

        it('prohibits providing a gateway in addition to schema/typedefs/resolvers', async () => {
          const { gateway } = makeGatewayMock();

          const incompatibleArgsSpy = jest.fn();
          await createApolloServer({ gateway, schema }).catch(err =>
            incompatibleArgsSpy(err.message),
          );
          expect(incompatibleArgsSpy.mock.calls[0][0]).toMatch(
            /Cannot define both/,
          );

          await createApolloServer({ gateway, modules: {} as any }).catch(err =>
            incompatibleArgsSpy(err.message),
          );
          expect(incompatibleArgsSpy.mock.calls[1][0]).toMatch(
            /Cannot define both/,
          );

          await createApolloServer({ gateway, typeDefs: {} as any }).catch(
            err => incompatibleArgsSpy(err.message),
          );
          expect(incompatibleArgsSpy.mock.calls[2][0]).toMatch(
            /Cannot define both/,
          );
        });

        it('prohibits providing a gateway in addition to subscription options', async () => {
          const { gateway } = makeGatewayMock();

          const expectedError =
            'Subscriptions are not yet compatible with the gateway';

          const incompatibleArgsSpy = jest.fn();
          await createApolloServer({
            gateway,
            subscriptions: 'pathToSubscriptions',
          }).catch(err => incompatibleArgsSpy(err.message));
          expect(incompatibleArgsSpy.mock.calls[0][0]).toMatch(expectedError);

          await createApolloServer({
            gateway,
            subscriptions: true as any,
          }).catch(err => incompatibleArgsSpy(err.message));
          expect(incompatibleArgsSpy.mock.calls[1][0]).toMatch(expectedError);

          await createApolloServer({
            gateway,
            subscriptions: { path: '' } as any,
          }).catch(err => incompatibleArgsSpy(err.message));
          expect(incompatibleArgsSpy.mock.calls[2][0]).toMatch(expectedError);

          await createApolloServer({
            gateway,
          }).catch(err => incompatibleArgsSpy(err.message));
          expect(incompatibleArgsSpy.mock.calls[3][0]).toMatch(expectedError);
        });
      });

      describe('schema creation', () => {
        it('accepts typeDefs and resolvers', async () => {
          const typeDefs = gql`
            type Query {
              hello: String
            }
          `;
          const resolvers = { Query: { hello: () => 'hi' } };
          const { url: uri } = await createApolloServer({
            typeDefs,
            resolvers,
          });

          const apolloFetch = createApolloFetch({ uri });
          const result = await apolloFetch({ query: '{hello}' });

          expect(result.data).toEqual({ hello: 'hi' });
          expect(result.errors).toBeUndefined();
        });

        it("accepts a gateway's schema and calls its executor", async () => {
          const executor = jest.fn();
          executor.mockReturnValue(
            Promise.resolve({ data: { testString: 'hi - but federated!' } }),
          );

          const { gateway, triggers } = makeGatewayMock({ executor });

          triggers.resolveLoad({ schema, executor });

          const { url: uri } = await createApolloServer({
            gateway,
            subscriptions: false,
          });

          const apolloFetch = createApolloFetch({ uri });
          const result = await apolloFetch({ query: '{testString}' });

          expect(result.data).toEqual({ testString: 'hi - but federated!' });
          expect(result.errors).toBeUndefined();
          expect(executor).toHaveBeenCalled();
        });

        it("rejected load promise is thrown by server.start", async () => {
          const { gateway, triggers } = makeGatewayMock();

          const loadError = new Error("load error which should be be thrown by start");
          triggers.rejectLoad(loadError);

          expect(createApolloServer({
            gateway,
            subscriptions: false,
          })).rejects.toThrowError(loadError);
        });

        it("rejected load promise acts as an error boundary", async () => {
          const executor = jest.fn();
          executor.mockResolvedValueOnce(
            { data: { testString: 'should not get this' } }
          );

          executor.mockRejectedValueOnce(
            { errors: [{errorWhichShouldNot: "ever be triggered"}] }
          );

          const consoleErrorSpy =
            jest.spyOn(console, 'error').mockImplementation();

          const { gateway, triggers } = makeGatewayMock({ executor });

          triggers.rejectLoad(new Error("load error which should be masked"));

          const { url: uri } = await createApolloServer({
            gateway,
            subscriptions: false,
          }, true);

          const apolloFetch = createApolloFetch({ uri });
          const result = await apolloFetch({ query: '{testString}' });

          expect(result.data).toBeUndefined();
          expect(result.errors).toContainEqual(
            expect.objectContaining({
              extensions: expect.objectContaining({
                code: "INTERNAL_SERVER_ERROR",
              }),
              message: "This data graph is missing a valid configuration. " +
                "More details may be available in the server logs."
            })
          );
          expect(consoleErrorSpy).toHaveBeenCalledWith(
            'Apollo Server was started implicitly and an error occurred during startup. ' +
              '(Consider calling `await server.start()` immediately after ' +
              '`server = new ApolloServer()` so you can handle these errors directly before ' +
              'starting your web server.) All GraphQL requests will now fail. The startup error ' +
              'was: ' +
              'load error which should be masked',
          );
          expect(executor).not.toHaveBeenCalled();
        });

        it('uses schema over resolvers + typeDefs', async () => {
          const typeDefs = gql`
            type Query {
              hello: String
            }
          `;
          const resolvers = { Query: { hello: () => 'hi' } };
          const { url: uri } = await createApolloServer({
            typeDefs,
            resolvers,
            schema,
          });

          const apolloFetch = createApolloFetch({ uri });
          const typeDefResult = await apolloFetch({ query: '{hello}' });

          expect(typeDefResult.data).toBeUndefined();
          expect(typeDefResult.errors).toBeDefined();

          const result = await apolloFetch({ query: '{testString}' });
          expect(result.data).toEqual({ testString: 'test string' });
          expect(result.errors).toBeUndefined();
        });

        it('allows mocks as boolean', async () => {
          const typeDefs = gql`
            type Query {
              hello: String
            }
          `;
          const { url: uri } = await createApolloServer({
            typeDefs,
            mocks: true,
          });

          const apolloFetch = createApolloFetch({ uri });
          const result = await apolloFetch({ query: '{hello}' });
          expect(result.data).toEqual({ hello: 'Hello World' });
          expect(result.errors).toBeUndefined();
        });

        it('allows mocks as an object', async () => {
          const typeDefs = gql`
            type Query {
              hello: String
            }
          `;
          const { url: uri } = await createApolloServer({
            typeDefs,
            mocks: { String: () => 'mock city' },
          });

          const apolloFetch = createApolloFetch({ uri });
          const result = await apolloFetch({ query: '{hello}' });

          expect(result.data).toEqual({ hello: 'mock city' });
          expect(result.errors).toBeUndefined();
        });

        it('allows mocks as an object without overriding the existing resolvers', async () => {
          const typeDefs = gql`
            type User {
              first: String
              last: String
            }
            type Query {
              user: User
            }
          `;
          const resolvers = {
            Query: {
              user: () => ({
                first: 'James',
                last: 'Heinlen',
              }),
            },
          };
          const { url: uri } = await createApolloServer({
            typeDefs,
            resolvers,
            mocks: {
              User: () => ({
                last: () => 'mock city',
              }),
            },
          });

          const apolloFetch = createApolloFetch({ uri });
          const result = await apolloFetch({
            query: '{user{first last}}',
          });
          expect(result.data).toEqual({
            user: { first: 'Hello World', last: 'mock city' },
          });
          expect(result.errors).toBeUndefined();
        });

        // Need to fix bug in graphql-tools to enable mocks to override the existing resolvers
        it.skip('allows mocks as an object with overriding the existing resolvers', async () => {
          const typeDefs = gql`
            type User {
              first: String
              last: String
            }
            type Query {
              user: User
            }
          `;
          const resolvers = {
            Query: {
              user: () => ({
                first: 'James',
                last: 'Heinlen',
              }),
            },
          };
          const { url: uri } = await createApolloServer({
            typeDefs,
            resolvers,
            mocks: {
              User: () => ({
                last: () => 'mock city',
              }),
            },
            mockEntireSchema: false,
          });

          const apolloFetch = createApolloFetch({ uri });
          const result = await apolloFetch({
            query: '{user{first last}}',
          });
          expect(result.data).toEqual({
            user: { first: 'James', last: 'mock city' },
          });
          expect(result.errors).toBeUndefined();
        });
      });
    });

    describe('Plugins', () => {
      let apolloFetch: ApolloFetch;
      let apolloFetchResponse: ParsedResponse;
      let serverInstance: ApolloServerBase;

      const setupApolloServerAndFetchPairForPlugins = async (
        plugins: PluginDefinition[] = [],
      ) => {
        const { url: uri, server } = await createApolloServer({
          context: { customContext: true },
          typeDefs: gql`
            type Query {
              justAField: String
            }
          `,
          plugins,
        });

        serverInstance = server;

        apolloFetch = createApolloFetch({ uri })
          // Store the response so we can inspect it.
          .useAfter(({ response }, next) => {
            apolloFetchResponse = response;
            next();
          });
      };

      // Test for https://github.com/apollographql/apollo-server/issues/4170
      it('works when using executeOperation', async () => {
        const encounteredFields = [];
        const encounteredContext = [];
        await setupApolloServerAndFetchPairForPlugins([
          {
            requestDidStart: () => ({
              executionDidStart: () => ({
                willResolveField({ info, context }) {
                  encounteredFields.push(info.path);
                  encounteredContext.push(context);
                },
              }),
            }),
          },
        ]);

        // The bug in 4170 (linked above) was occurring because of a failure
        // to clone context in `executeOperation` in the same way that occurs
        // in `runHttpQuery` prior to entering the request pipeline.  That
        // resulted in the inability to attach a symbol to the context because
        // the symbol already existed on the context.  Of course, a context
        // is only created after the first invocation, so we'll run this twice
        // to encounter the error where it was in the way when we tried to set
        // it the second time.  While we could have tested for the property
        // before assigning to it, that is not the contract we have with the
        // context, which should have been copied on `executeOperation` (which
        // is meant to be used by testing, currently).
        await serverInstance.executeOperation({
          query: '{ justAField }',
        });
        await serverInstance.executeOperation({
          query: '{ justAField }',
        });

        expect(encounteredFields).toStrictEqual([
          { key: 'justAField', prev: undefined },
          { key: 'justAField', prev: undefined },
        ]);

        // This bit is just to ensure that nobody removes `context` from the
        // `setupApolloServerAndFetchPairForPlugins` thinking it's unimportant.
        // When a custom context is not provided, a new one is initialized
        // on each request.
        expect(encounteredContext).toStrictEqual([
          expect.objectContaining({customContext: true}),
          expect.objectContaining({customContext: true}),
        ]);
      });

      it('returns correct status code for a normal operation', async () => {
        await setupApolloServerAndFetchPairForPlugins();

        const result = await apolloFetch({ query: '{ justAField }' });
        expect(result.errors).toBeUndefined();
        expect(apolloFetchResponse.status).toEqual(200);
      });

      it('allows setting a custom status code for an error', async () => {
        await setupApolloServerAndFetchPairForPlugins([
          {
            requestDidStart() {
              return {
                didResolveOperation() {
                  throw new Error('known_error');
                },
                willSendResponse({ response: { http, errors } }) {
                  if (errors[0].message === 'known_error') {
                    http.status = 403;
                  }
                },
              };
            },
          },
        ]);

        const result = await apolloFetch({ query: '{ justAField }' });
        expect(result.errors).toBeDefined();
        expect(apolloFetchResponse.status).toEqual(403);
      });

      it('preserves user-added "extensions" in the response when parsing errors occur', async () => {
        await setupApolloServerAndFetchPairForPlugins([
          {
            requestDidStart() {
              return {
                willSendResponse({ response }) {
                  response.extensions = { myExtension: true };
                },
              };
            },
          },
        ]);

        const result =
          await apolloFetch({ query: '{ 🦠' });
        expect(result.errors).toBeDefined();
        expect(result.extensions).toEqual(expect.objectContaining({
          myExtension: true
        }));
      });

      it('preserves user-added "extensions" in the response when validation errors occur', async () => {
        await setupApolloServerAndFetchPairForPlugins([
          {
            requestDidStart() {
              return {
                willSendResponse({ response }) {
                  response.extensions = { myExtension: true };
                },
              };
            },
          },
        ]);

        const result =
          await apolloFetch({ query: '{ missingFieldWhichWillNotValidate }' });
        expect(result.errors).toBeDefined();
        expect(result.extensions).toEqual(expect.objectContaining({
          myExtension: true
        }));
      });
    });

    describe('formatError', () => {
      it('wraps thrown error from validation rules', async () => {
        const throwError = jest.fn(() => {
          throw new Error('nope');
        });

        const formatError = jest.fn(error => {
          expect(error instanceof Error).toBe(true);
          expect(error.constructor.name).toEqual('Error');
          return error;
        });

        const { url: uri } = await createApolloServer({
          schema,
          validationRules: [throwError],
          introspection: true,
          formatError,
        });

        const apolloFetch = createApolloFetch({ uri });

        const introspectionResult = await apolloFetch({
          query: INTROSPECTION_QUERY,
        });
        expect(introspectionResult.data).toBeUndefined();
        expect(introspectionResult.errors).toBeDefined();
        expect(formatError).toHaveBeenCalledTimes(1);
        expect(throwError).toHaveBeenCalledTimes(1);

        const result = await apolloFetch({ query: TEST_STRING_QUERY });
        expect(result.data).toBeUndefined();
        expect(result.errors).toBeDefined();
        expect(formatError).toHaveBeenCalledTimes(2);
        expect(throwError).toHaveBeenCalledTimes(2);
      });

      it('works with errors similar to GraphQL errors, such as yup', async () => {
        // https://npm.im/yup is a package that produces a particular type of
        // error that we test compatibility with. This test was first brought
        // with https://github.com/apollographql/apollo-server/pull/1288. We
        // used to use the actual `yup` package to generate the error, but we
        // don't need to actually bundle that dependency just to test
        // compatibility with that particular error shape.  To be honest, it's
        // not clear from the original PR which attribute of this error need be
        // mocked, but for the sake not not breaking anything, all of yup's
        // error properties have been reproduced here.
        const throwError = jest.fn(async () => {
          // Intentionally `any` because this is a custom Error class with
          // various custom properties (like `value` and `params`).
          const yuppieError: any = new Error('email must be a valid email');
          yuppieError.name = 'ValidationError';

          // Set `message` to enumerable, which `yup` does and `Error` doesn't.
          Object.defineProperty(yuppieError, 'message', {
            enumerable: true,
          });

          // Set other properties which `yup` sets.
          yuppieError.path = 'email';
          yuppieError.type = undefined;
          yuppieError.value = { email: 'invalid-email' };
          yuppieError.errors = ['email must be a valid email'];
          yuppieError.inner = [];
          yuppieError.params = {
            path: 'email',
            value: 'invalid-email',
            originalValue: 'invalid-email',
            label: undefined,
            regex: /@/,
          };

          // This stack is fake, but roughly what `yup` generates!
          yuppieError.stack = [
            'ValidationError: email must be a valid email',
            '    at createError (yup/lib/util/createValidation.js:64:35)',
            '    at yup/lib/util/createValidation.js:113:108',
            '    at process._tickCallback (internal/process/next_tick.js:68:7)',
          ].join('\n');

          throw yuppieError;
        });

        const formatError = jest.fn(error => {
          expect(error instanceof Error).toBe(true);
          expect(error.extensions.code).toEqual('INTERNAL_SERVER_ERROR');
          expect(error.extensions.exception.name).toEqual('ValidationError');
          expect(error.extensions.exception.message).toBeDefined();
          const inputError = new UserInputError('User Input Error');
          return {
            message: inputError.message,
            extensions: inputError.extensions,
          };
        });

        const { url: uri } = await createApolloServer({
          typeDefs: gql`
            type Query {
              fieldWhichWillError: String
            }
          `,
          resolvers: {
            Query: {
              fieldWhichWillError: () => {
                return throwError();
              },
            },
          },
          introspection: true,
          debug: true,
          formatError,
        });

        const apolloFetch = createApolloFetch({ uri });

        const result = await apolloFetch({
          query: '{fieldWhichWillError}',
        });
        expect(result.data).toEqual({ fieldWhichWillError: null });
        expect(result.errors).toBeDefined();
        expect(result.errors[0].extensions.code).toEqual('BAD_USER_INPUT');
        expect(result.errors[0].message).toEqual('User Input Error');
        expect(formatError).toHaveBeenCalledTimes(1);
        expect(throwError).toHaveBeenCalledTimes(1);
      });
    });

    describe('lifecycle', () => {
      describe('for Apollo usage reporting', () => {
        let nodeEnv: string;
        let reportIngress: MockReportIngress;

        class MockReportIngress {
          private app: express.Application;
          private server: http.Server;
          private reports: Report[] = [];
          public readonly promiseOfReports: Promise<Report[]>;

          constructor() {
            let reportResolver: (reports: Report[]) => void;
            this.promiseOfReports = new Promise<Report[]>(resolve => {
              reportResolver = resolve;
            });

            this.app = express();
            this.app.use((req, _res, next) => {
              // body parser requires a content-type
              req.headers['content-type'] = 'text/plain';
              next();
            });
            this.app.use(
              bodyParser.raw({
                inflate: true,
                type: '*/*',
              }),
            );

            this.app.use((req, res) => {
              const report = Report.decode(req.body);
              this.reports.push(report);
              res.end();

              // Resolve any outstanding Promises with our new report data.
              reportResolver(this.reports);
            });
          }

          async listen(): Promise<http.Server> {
            return await new Promise(resolve => {
              const server = (this.server = this.app.listen(
                0,
                // Intentionally IPv4.
                '127.0.0.1',
                () => {
                  resolve(server);
                },
              ));
            });
          }

          async stop(): Promise<void> {
            if (!this.server) {
              return;
            }

            return new Promise(resolve => {
              this.server && this.server.close(() => resolve());
            });
          }

          getUrl(): string {
            if (!this.server) {
              throw new Error('must listen before getting URL');
            }
            const { family, address, port } = this.server.address();

            if (family !== 'IPv4') {
              throw new Error(`The family was unexpectedly ${family}.`);
            }
            return new URL(`http://${address}:${port}`).toString();
          }
        }

        beforeEach(async () => {
          nodeEnv = process.env.NODE_ENV;
          delete process.env.NODE_ENV;
          reportIngress = new MockReportIngress();
          return await reportIngress.listen();
        });

        afterEach(done => {
          process.env.NODE_ENV = nodeEnv;

          (reportIngress.stop() || Promise.resolve()).then(done);
        });

        describe('extensions', () => {
          // While it's been broken down quite a bit, this test is still
          // overloaded and is a prime candidate for de-composition!
          it('calls formatError and other overloaded client identity tests', async () => {
            const throwError = jest.fn(() => {
              throw new Error('nope');
            });

            const validationRule = jest.fn(() => {
              // formatError should be called after validation
              expect(formatError).not.toBeCalled();
              // extension should be called after validation
              expect(willSendResponseInExtension).not.toBeCalled();
              return true;
            });

            const willSendResponseInExtension = jest.fn();

            const formatError = jest.fn(error => {
              try {
                expect(error).toBeInstanceOf(Error);
                // extension should be called before formatError
                expect(willSendResponseInExtension).toHaveBeenCalledTimes(1);
                // validationRules should be called before formatError
                expect(validationRule).toHaveBeenCalledTimes(1);
              } finally {
                error.message = 'masked';
                return error;
              }
            });

            class Extension<TContext = any> extends GraphQLExtension {
              willSendResponse(o: {
                graphqlResponse: GraphQLResponse;
                context: TContext;
              }) {
                expect(o.graphqlResponse.errors.length).toEqual(1);
                // formatError should be called before willSendResponse
                expect(formatError).toHaveBeenCalledTimes(1);
                // validationRule should be called before willSendResponse
                expect(validationRule).toHaveBeenCalledTimes(1);
                willSendResponseInExtension();
              }
            }

            const { url: uri } = await createApolloServer({
              typeDefs: gql`
                type Query {
                  fieldWhichWillError: String
                }
              `,
              resolvers: {
                Query: {
                  fieldWhichWillError: () => {
                    throwError();
                  },
                },
              },
              validationRules: [validationRule],
              extensions: [() => new Extension()],
              apollo: {
                key: 'service:my-app:secret',
                graphVariant: 'current',
              },
              plugins: [
                ApolloServerPluginUsageReporting({
                  endpointUrl: reportIngress.getUrl(),
                  maxUncompressedReportSize: 1,
                  generateClientInfo: () => ({
                    clientName: 'testing',
                    clientReferenceId: '1234',
                    clientVersion: 'v1.0.1',
                  }),
                }),
              ],
              formatError,
              debug: true,
              stopOnTerminationSignals: false,
            });

            const apolloFetch = createApolloFetch({ uri });

            const result = await apolloFetch({
              query: `{fieldWhichWillError}`,
            });
            expect(result.data).toEqual({
              fieldWhichWillError: null,
            });
            expect(result.errors).toBeDefined();
            expect(result.errors[0].message).toEqual('masked');

            expect(validationRule).toHaveBeenCalledTimes(1);
            expect(throwError).toHaveBeenCalledTimes(1);
            expect(formatError).toHaveBeenCalledTimes(1);
            expect(willSendResponseInExtension).toHaveBeenCalledTimes(1);

            const reports = await reportIngress.promiseOfReports;

            expect(reports.length).toBe(1);

            const trace = Object.values(reports[0].tracesPerQuery)[0].trace[0];

            expect(trace.clientReferenceId).toMatch(/1234/);
            expect(trace.clientName).toMatch(/testing/);
            expect(trace.clientVersion).toEqual('v1.0.1');

            expect(trace.root!.child![0].error![0].message).toMatch(/nope/);
            expect(trace.root!.child![0].error![0].message).not.toMatch(
              /masked/,
            );
          });
        });

        describe('traces', () => {
          let throwError: jest.Mock;
          let apolloFetch: ApolloFetch;

          beforeEach(async () => {
            throwError = jest.fn();
          });

          const setupApolloServerAndFetchPair = async (
            usageReportingOptions: Partial<ApolloServerPluginUsageReportingOptions<any>> = {},
            constructorOptions: Partial<CreateServerFunc<AS>> = {},
            plugins: PluginDefinition[] = [],
          ) => {
            const { url: uri } = await createApolloServer({
              typeDefs: gql`
                type Query {
                  fieldWhichWillError: String
                  justAField: String
                }
              `,
              resolvers: {
                Query: {
                  fieldWhichWillError: () => {
                    throwError();
                  },
                  justAField: () => 'a string',
                },
              },
              apollo: {
                key: 'service:my-app:secret',
                graphVariant: 'current',
              },
              plugins: [
                ApolloServerPluginUsageReporting({
                  endpointUrl: reportIngress.getUrl(),
                  maxUncompressedReportSize: 1,
                  ...usageReportingOptions,
                }),
                ...plugins,
              ],
              debug: true,
              stopOnTerminationSignals: false,
              ...constructorOptions,
            });

            apolloFetch = createApolloFetch({ uri });
          };

          it('does not expose stack', async () => {
            throwError.mockImplementationOnce(() => {
              throw new Error('how do I stack up?');
            });

            await setupApolloServerAndFetchPair();

            const result = await apolloFetch({
              query: `{fieldWhichWillError}`,
            });
            expect(result.data).toEqual({
              fieldWhichWillError: null,
            });
            expect(result.errors).toBeDefined();

            // The original error message should still be sent to the client.
            expect(result.errors[0].message).toEqual('how do I stack up?');
            expect(throwError).toHaveBeenCalledTimes(1);

            const reports = await reportIngress.promiseOfReports;
            expect(reports.length).toBe(1);
            const trace = Object.values(reports[0].tracesPerQuery)[0].trace[0];

            // There should be no error at the root, our error is a child.
            expect(trace.root.error).toStrictEqual([]);

            // There should only be one child.
            expect(trace.root.child.length).toBe(1);

            // The error should not have the stack in it.
            expect(trace.root.child[0].error[0]).not.toHaveProperty('stack');
            expect(
              JSON.parse(trace.root.child[0].error[0].json),
            ).not.toHaveProperty('stack');
          });

          it('sets the trace key to operationName when it is defined', async () => {
            await setupApolloServerAndFetchPair();

            const result = await apolloFetch({
              query: `query AnOperationName {justAField}`,
            });
            expect(result.data).toEqual({
              justAField: 'a string',
            });
            expect(result.errors).not.toBeDefined();

            const reports = await reportIngress.promiseOfReports;
            expect(reports.length).toBe(1);

            expect(Object.keys(reports[0].tracesPerQuery)[0]).toMatch(
              /^# AnOperationName\n/,
            );
          });

          it('sets the trace key to unknown operation for missing operation', async () => {
            await setupApolloServerAndFetchPair();

            await apolloFetch({
              query: `query notQ {justAField}`,
              operationName: 'q'
            });

            const reports = await reportIngress.promiseOfReports;
            expect(reports.length).toBe(1);

            expect(Object.keys(reports[0].tracesPerQuery)[0]).toBe('## GraphQLUnknownOperationName\n',);
          });

          it('sets the trace key to parse failure when non-parseable gql', async () => {
            await setupApolloServerAndFetchPair();

            await apolloFetch({
              query: `{nonExistentField`,
            });

            const reports = await reportIngress.promiseOfReports;
            expect(reports.length).toBe(1);

            expect(Object.keys(reports[0].tracesPerQuery)[0]).toBe('## GraphQLParseFailure\n',);
          });

          it('sets the trace key to validation failure when invalid operation', async () => {
            await setupApolloServerAndFetchPair();

            await apolloFetch({
              query: `{nonExistentField}`,
            });

            const reports = await reportIngress.promiseOfReports;
            expect(reports.length).toBe(1);

            expect(Object.keys(reports[0].tracesPerQuery)[0]).toBe('## GraphQLValidationFailure\n',);
          });


          it('sets the trace key to "-" when operationName is undefined', async () => {
            await setupApolloServerAndFetchPair();

            const result = await apolloFetch({
              query: `{justAField}`,
            });
            expect(result.data).toEqual({
              justAField: 'a string',
            });
            expect(result.errors).not.toBeDefined();

            const reports = await reportIngress.promiseOfReports;
            expect(reports.length).toBe(1);

            expect(Object.keys(reports[0].tracesPerQuery)[0]).toMatch(/^# -\n/);
          });

          it("doesn't resort to query body signature on `didResolveOperation` error", async () => {
            await setupApolloServerAndFetchPair({}, {}, [
              {
                requestDidStart() {
                  return {
                    didResolveOperation() {
                      throw new Error('known_error');
                    },
                  };
                },
              },
            ]);

            const result = await apolloFetch({
              query: `{ aliasedField: justAField }`,
            });

            expect(result.errors).toBeDefined();
            expect(result.errors[0].extensions).toBeDefined();
            expect(result.errors[0].message).toEqual('known_error');

            const reports = await reportIngress.promiseOfReports;
            expect(reports.length).toBe(1);

            expect(Object.keys(reports[0].tracesPerQuery)[0]).not.toEqual(
              '# -\n{ aliasedField: justAField }',
            );
          });

          it("doesn't internal server error on an APQ", async () => {
            await setupApolloServerAndFetchPair();

            const TEST_STRING_QUERY = `
              { onlyForThisApqTest${
                Math.random()
                  .toString()
                  .split('.')[1]
              }: justAField }
            `;
            const hash = sha256
              .create()
              .update(TEST_STRING_QUERY)
              .hex();

            const result = await apolloFetch({
            // @ts-ignore The `ApolloFetch` types don't allow `extensions` to be
            // passed in, in the same way as `variables`, with a request. This
            // is a typing omission in `apollo-fetch`, as can be seen here:
            // https://git.io/Jeb63  This will all be going away soon (and
            // that package is already archived and deprecated.
              extensions: {
                persistedQuery: {
                  version: VERSION,
                  sha256Hash: hash,
                }
              },
            });

            // Having a persisted query not found error is fine.
            expect(result.errors).toContainEqual(
              expect.objectContaining({
                extensions: expect.objectContaining({
                  code: "PERSISTED_QUERY_NOT_FOUND",
                })
              })
            );

            // However, having an internal server error is not okay!
            expect(result.errors).not.toContainEqual(
              expect.objectContaining({
                extensions: expect.objectContaining({
                  code: "INTERNAL_SERVER_ERROR",
                })
              })
            );

          });

          describe('error munging', () => {
            describe('rewriteError', () => {
              it('new error', async () => {
                throwError.mockImplementationOnce(() => {
                  throw new Error('rewriteError nope');
                });

                await setupApolloServerAndFetchPair({
                  rewriteError: () =>
                    new GraphQLError('rewritten as a new error'),
                });

                const result = await apolloFetch({
                  query: `{fieldWhichWillError}`,
                });
                expect(result.data).toEqual({
                  fieldWhichWillError: null,
                });
                expect(result.errors).toBeDefined();

                // The original error message should be sent to the client.
                expect(result.errors[0].message).toEqual('rewriteError nope');
                expect(throwError).toHaveBeenCalledTimes(1);

                const reports = await reportIngress.promiseOfReports;
                expect(reports.length).toBe(1);
                const trace = Object.values(reports[0].tracesPerQuery)[0]
                  .trace[0];
                // There should be no error at the root, our error is a child.
                expect(trace.root.error).toStrictEqual([]);

                // There should only be one child.
                expect(trace.root.child.length).toBe(1);

                // The child should maintain the path, but have its message
                // rewritten.
                expect(trace.root.child[0].error).toMatchObject([
                  {
                    json:
                      '{"message":"rewritten as a new error","locations":[{"line":1,"column":2}],"path":["fieldWhichWillError"]}',
                    message: 'rewritten as a new error',
                    location: [{ column: 2, line: 1 }],
                  },
                ]);
              });

              it('modified error', async () => {
                throwError.mockImplementationOnce(() => {
                  throw new Error('rewriteError mod nope');
                });

                await setupApolloServerAndFetchPair({
                  rewriteError: err => {
                    err.message = 'rewritten as a modified error';
                    return err;
                  },
                });

                const result = await apolloFetch({
                  query: `{fieldWhichWillError}`,
                });
                expect(result.data).toEqual({
                  fieldWhichWillError: null,
                });
                expect(result.errors).toBeDefined();
                expect(result.errors[0].message).toEqual(
                  'rewriteError mod nope',
                );
                expect(throwError).toHaveBeenCalledTimes(1);

                const reports = await reportIngress.promiseOfReports;
                expect(reports.length).toBe(1);
                const trace = Object.values(reports[0].tracesPerQuery)[0]
                  .trace[0];
                // There should be no error at the root, our error is a child.
                expect(trace.root.error).toStrictEqual([]);

                // There should only be one child.
                expect(trace.root.child.length).toBe(1);

                // The child should maintain the path, but have its message
                // rewritten.
                expect(trace.root.child[0].error).toMatchObject([
                  {
                    json:
                      '{"message":"rewritten as a modified error","locations":[{"line":1,"column":2}],"path":["fieldWhichWillError"]}',
                    message: 'rewritten as a modified error',
                    location: [{ column: 2, line: 1 }],
                  },
                ]);
              });

              it('nulled error', async () => {
                throwError.mockImplementationOnce(() => {
                  throw new Error('rewriteError null nope');
                });

                await setupApolloServerAndFetchPair({
                  rewriteError: () => null,
                });

                const result = await apolloFetch({
                  query: `{fieldWhichWillError}`,
                });
                expect(result.data).toEqual({
                  fieldWhichWillError: null,
                });
                expect(result.errors).toBeDefined();
                expect(result.errors[0].message).toEqual(
                  'rewriteError null nope',
                );
                expect(throwError).toHaveBeenCalledTimes(1);

                const reports = await reportIngress.promiseOfReports;
                expect(reports.length).toBe(1);
                const trace = Object.values(reports[0].tracesPerQuery)[0]
                  .trace[0];

                // There should be no error at the root, our error is a child.
                expect(trace.root.error).toStrictEqual([]);

                // There should only be one child.
                expect(trace.root.child.length).toBe(1);

                // There should be no error in the trace for this property!
                expect(trace.root.child[0].error).toStrictEqual([]);
              });
            });

            it('undefined error', async () => {
              throwError.mockImplementationOnce(() => {
                throw new Error('rewriteError undefined whoops');
              });

              await setupApolloServerAndFetchPair({
                rewriteError: () => undefined,
              });

              const result = await apolloFetch({
                query: `{fieldWhichWillError}`,
              });
              expect(result.data).toEqual({
                fieldWhichWillError: null,
              });
              expect(result.errors).toBeDefined();
              expect(result.errors[0].message).toEqual(
                'rewriteError undefined whoops',
              );
              expect(throwError).toHaveBeenCalledTimes(1);

              const reports = await reportIngress.promiseOfReports;
              expect(reports.length).toBe(1);
              const trace = Object.values(reports[0].tracesPerQuery)[0]
                .trace[0];

              // There should be no error at the root, our error is a child.
              expect(trace.root.error).toStrictEqual([]);

              // There should only be one child.
              expect(trace.root.child.length).toBe(1);

              // The child should maintain the path, but have its message
              // rewritten.
              expect(trace.root.child[0].error).toMatchObject([
                {
                  json:
                    '{"message":"rewriteError undefined whoops","locations":[{"line":1,"column":2}],"path":["fieldWhichWillError"]}',
                  message: 'rewriteError undefined whoops',
                  location: [{ column: 2, line: 1 }],
                },
              ]);
            });
          });
        });
      });

      it('errors thrown in extensions call formatError and are wrapped', async () => {
        const extension = jest.fn(() => {
          throw new Error('nope');
        });

        const formatError = jest.fn(error => {
          expect(error instanceof Error).toBe(true);
          // extension should be called before formatError
          expect(extension).toHaveBeenCalledTimes(1);

          error.message = 'masked';
          return error;
        });

        class Extension<TContext = any> extends GraphQLExtension {
          willSendResponse(_o: {
            graphqlResponse: GraphQLResponse;
            context: TContext;
          }) {
            // formatError should be called after extensions
            expect(formatError).not.toBeCalled();
            extension();
          }
        }

        const { url: uri } = await createApolloServer({
          typeDefs: gql`
            type Query {
              fieldWhichWillError: String
            }
          `,
          resolvers: {
            Query: {
              fieldWhichWillError: () => {},
            },
          },
          extensions: [() => new Extension()],
          formatError,
          debug: true,
        });

        const apolloFetch = createApolloFetch({ uri });

        const result = await apolloFetch({
          query: `{fieldWhichWillError}`,
        });
        expect(result.data).toBeUndefined();
        expect(result.errors).toBeDefined();
        expect(result.errors[0].message).toEqual('masked');
        expect(formatError).toHaveBeenCalledTimes(1);
      });

      describe('context field', () => {
        const typeDefs = gql`
          type Query {
            hello: String
          }
        `;

        const resolvers = {
          Query: {
            hello: () => 'hi',
          },
        };

        it('defers context eval with thunk until after options creation', async () => {
          const uniqueContext = { key: 'major' };
          const typeDefs = gql`
            type Query {
              hello: String
            }
          `;
          const resolvers = {
            Query: {
              hello: (_parent: any, _args: any, context: any) => {
                expect(context).toEqual(Promise.resolve(uniqueContext));
                return 'hi';
              },
            },
          };
          const spy = jest.fn(() => ({}));
          const { url: uri } = await createApolloServer({
            typeDefs,
            resolvers,
            context: spy,
          });

          const apolloFetch = createApolloFetch({ uri });

          expect(spy).not.toBeCalled();

          await apolloFetch({ query: '{hello}' });
          expect(spy).toHaveBeenCalledTimes(1);
          await apolloFetch({ query: '{hello}' });
          expect(spy).toHaveBeenCalledTimes(2);
        });

        describe('context cloning', () => {
          it('clones the context for request pipeline requests', async () => {
            const uniqueContext = { key: 'major' };
            const spy = jest.fn(() => 'hi');
            const typeDefs = gql`
              type Query {
                hello: String
              }
            `;
            const resolvers = {
              Query: {
                hello: (_parent: any, _args: any, context: any) => {
                  expect(context.key).toEqual('major');
                  context.key = 'minor';
                  return spy();
                },
              },
            };
            const { url: uri } = await createApolloServer({
              typeDefs,
              resolvers,
              context: uniqueContext,
            });

            const apolloFetch = createApolloFetch({ uri });

            expect(spy).not.toBeCalled();

            await apolloFetch({ query: '{hello}' });
            expect(spy).toHaveBeenCalledTimes(1);
            await apolloFetch({ query: '{hello}' });
            expect(spy).toHaveBeenCalledTimes(2);
          });

          // https://github.com/apollographql/apollo-server/issues/4170
          it('for every request with executeOperation', async () => {
            const uniqueContext = { key: 'major' };
            const spy = jest.fn(() => 'hi');
            const typeDefs = gql`
              type Query {
                hello: String
              }
            `;
            const resolvers = {
              Query: {
                hello: (_parent: any, _args: any, context: any) => {
                  expect(context.key).toEqual('major');
                  context.key = 'minor';
                  return spy();
                },
              },
            };
            const { server } = await createApolloServer({
              typeDefs,
              resolvers,
              context: uniqueContext,
            });

            expect(spy).not.toBeCalled();

            await server.executeOperation({ query: '{hello}' });
            expect(spy).toHaveBeenCalledTimes(1);
            await server.executeOperation({ query: '{hello}' });
            expect(spy).toHaveBeenCalledTimes(2);
          });
        });

        describe('as a function', () => {
          it('can accept and return `req`', async () => {
            expect(
              await createApolloServer({
                typeDefs,
                resolvers,
                context: ({ req }) => ({ req }),
              }),
            ).not.toThrow;
          });

          it('can accept nothing and return an empty object', async () => {
            expect(
              await createApolloServer({
                typeDefs,
                resolvers,
                context: () => ({}),
              }),
            ).not.toThrow;
          });

          it('can be an async function', async () => {
            const uniqueContext = { key: 'major' };
            const spy = jest.fn(() => 'hi');
            const typeDefs = gql`
              type Query {
                hello: String
              }
            `;
            const resolvers = {
              Query: {
                hello: (_parent: any, _args: any, context: any) => {
                  expect(context.key).toEqual('major');
                  return spy();
                },
              },
            };
            const { url: uri } = await createApolloServer({
              typeDefs,
              resolvers,
              context: async () => uniqueContext,
            });

            const apolloFetch = createApolloFetch({ uri });

            expect(spy).not.toBeCalled();
            await apolloFetch({ query: '{hello}' });
            expect(spy).toHaveBeenCalledTimes(1);
          });

          it('returns thrown context error as a valid graphql result', async () => {
            const nodeEnv = process.env.NODE_ENV;
            delete process.env.NODE_ENV;
            const typeDefs = gql`
              type Query {
                hello: String
              }
            `;
            const resolvers = {
              Query: {
                hello: () => {
                  throw Error('never get here');
                },
              },
            };
            const { url: uri } = await createApolloServer({
              typeDefs,
              resolvers,
              stopOnTerminationSignals: false,
              context: () => {
                throw new AuthenticationError('valid result');
              },
            });

            const apolloFetch = createApolloFetch({ uri });

            const result = await apolloFetch({ query: '{hello}' });
            expect(result.errors.length).toEqual(1);
            expect(result.data).toBeUndefined();

            const e = result.errors[0];
            expect(e.message).toMatch('valid result');
            expect(e.extensions).toBeDefined();
            expect(e.extensions.code).toEqual('UNAUTHENTICATED');
            expect(e.extensions.exception.stacktrace).toBeDefined();

            process.env.NODE_ENV = nodeEnv;
          });
        });

        describe('as an object', () => {
          it('can be an empty object', async () => {
            expect(
              await createApolloServer({
                typeDefs,
                resolvers,
                context: {},
              }),
            ).not.toThrow;
          });

          it('can contain arbitrary values', async () => {
            expect(
              await createApolloServer({
                typeDefs,
                resolvers,
                context: { value: 'arbitrary' },
              }),
            ).not.toThrow;
          });
        });
      });

      it('propagates error codes in production', async () => {
        const nodeEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';

        const { url: uri } = await createApolloServer({
          typeDefs: gql`
            type Query {
              fieldWhichWillError: String
            }
          `,
          resolvers: {
            Query: {
              fieldWhichWillError: () => {
                throw new AuthenticationError('we the best music');
              },
            },
          },
          stopOnTerminationSignals: false,
        });

        const apolloFetch = createApolloFetch({ uri });

        const result = await apolloFetch({ query: `{fieldWhichWillError}` });
        expect(result.data).toBeDefined();
        expect(result.data).toEqual({ fieldWhichWillError: null });

        expect(result.errors).toBeDefined();
        expect(result.errors.length).toEqual(1);
        expect(result.errors[0].extensions.code).toEqual('UNAUTHENTICATED');
        expect(result.errors[0].extensions.exception).toBeUndefined();

        process.env.NODE_ENV = nodeEnv;
      });

      it('propagates error codes with null response in production', async () => {
        const nodeEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';

        const { url: uri } = await createApolloServer({
          typeDefs: gql`
            type Query {
              fieldWhichWillError: String!
            }
          `,
          resolvers: {
            Query: {
              fieldWhichWillError: () => {
                throw new AuthenticationError('we the best music');
              },
            },
          },
          stopOnTerminationSignals: false,
        });

        const apolloFetch = createApolloFetch({ uri });

        const result = await apolloFetch({ query: `{fieldWhichWillError}` });
        expect(result.data).toBeNull();

        expect(result.errors).toBeDefined();
        expect(result.errors.length).toEqual(1);
        expect(result.errors[0].extensions.code).toEqual('UNAUTHENTICATED');
        expect(result.errors[0].extensions.exception).toBeUndefined();

        process.env.NODE_ENV = nodeEnv;
      });
    });

    describe('subscriptions', () => {
      const SOMETHING_CHANGED_TOPIC = 'something_changed';
      const pubsub = new PubSub();
      let subscription:
        | {
            unsubscribe: () => void;
          }
        | undefined;

      function createEvent(num: number) {
        return setTimeout(
          () =>
            pubsub.publish(SOMETHING_CHANGED_TOPIC, {
              num,
            }),
          num + 10,
        );
      }

      afterEach(async () => {
        if (subscription) {
          try {
            await subscription.unsubscribe();
          } catch (e) {}
          subscription = null;
        }
      });

      it('enables subscriptions after creating subscriptions server', done => {
        const typeDefs = gql`
          type Query {
            hi: String
          }

          type Subscription {
            num: Int
          }
        `;

        const query = `
        subscription {
          num
        }
      `;

        const resolvers = {
          Query: {
            hi: () => 'here to placate graphql-js',
          },
          Subscription: {
            num: {
              subscribe: () => {
                createEvent(1);
                createEvent(2);
                createEvent(3);
                return pubsub.asyncIterator(SOMETHING_CHANGED_TOPIC);
              },
            },
          },
        };

        createApolloServer({
          typeDefs,
          resolvers,
        }).then(({ port, server, httpServer }) => {
          server.installSubscriptionHandlers(httpServer);

          const client = new SubscriptionClient(
            `ws://localhost:${port}${server.subscriptionsPath}`,
            {},
            WebSocket,
          );

          const observable = client.request({ query });

          let i = 1;
          subscription = observable.subscribe({
            next: ({ data }) => {
              try {
                expect(data.num).toEqual(i);
                if (i === 3) {
                  done();
                }
                i++;
              } catch (e) {
                done.fail(e);
              }
            },
            error: done.fail,
            complete: () => {
              done.fail(new Error('should not complete'));
            },
          });
        });
      });
      it('disables subscriptions when option set to false', done => {
        const typeDefs = gql`
          type Query {
            "graphql-js forces there to be a query type"
            hi: String
          }

          type Subscription {
            num: Int
          }
        `;

        const query = `
        subscription {
          num
        }
      `;

        const resolvers = {
          Query: {
            hi: () => 'here to placate graphql-js',
          },
          Subscription: {
            num: {
              subscribe: () => {
                createEvent(1);
                return pubsub.asyncIterator(SOMETHING_CHANGED_TOPIC);
              },
            },
          },
        };

        createApolloServer({
          typeDefs,
          resolvers,
          subscriptions: false,
        }).then(({ port, server, httpServer }) => {
          try {
            server.installSubscriptionHandlers(httpServer);
            done.fail(
              'subscription server creation should fail, since subscriptions are disabled',
            );
          } catch (e) {
            expect(e.message).toMatch(/disabled/);
          }

          const client = new SubscriptionClient(
            `ws://localhost:${port}${server.subscriptionsPath || ''}`,
            {},
            WebSocket,
          );

          const observable = client.request({ query });

          subscription = observable.subscribe({
            next: () => {
              done.fail(new Error('should not call next'));
            },
            error: () => {
              done.fail(new Error('should not notify of error'));
            },
            complete: () => {
              done.fail(new Error('should not complete'));
            },
          });

          // Unfortunately the error connection is not propagated to the
          // observable. What should happen is we provide a default onError
          // function that notifies the returned observable and can customize
          // the behavior with an option in the client constructor. If you're
          // available to make a PR to the following please do!
          // https://github.com/apollographql/subscriptions-transport-ws/blob/master/src/client.ts
          client.onError((_: Error) => {
            done();
          });
        });
      });
      it('accepts subscriptions configuration', done => {
        const onConnect = jest.fn(connectionParams => ({
          ...connectionParams,
        }));
        const typeDefs = gql`
          type Query {
            hi: String
          }

          type Subscription {
            num: Int
          }
        `;

        const query = `
        subscription {
          num
        }
      `;

        const resolvers = {
          Query: {
            hi: () => 'here to placate graphql-js',
          },
          Subscription: {
            num: {
              subscribe: () => {
                createEvent(1);
                createEvent(2);
                createEvent(3);
                return pubsub.asyncIterator(SOMETHING_CHANGED_TOPIC);
              },
            },
          },
        };

        const path = '/sub';
        createApolloServer({
          typeDefs,
          resolvers,
          subscriptions: { onConnect, path },
        })
          .then(({ port, server, httpServer }) => {
            server.installSubscriptionHandlers(httpServer);
            expect(onConnect).not.toBeCalled();

            expect(server.subscriptionsPath).toEqual(path);
            const client = new SubscriptionClient(
              `ws://localhost:${port}${server.subscriptionsPath}`,
              {},
              WebSocket,
            );

            const observable = client.request({ query });

            let i = 1;
            subscription = observable.subscribe({
              next: ({ data }) => {
                try {
                  expect(onConnect).toHaveBeenCalledTimes(1);
                  expect(data.num).toEqual(i);
                  if (i === 3) {
                    done();
                  }
                  i++;
                } catch (e) {
                  done.fail(e);
                }
              },
              error: done.fail,
              complete: () => {
                done.fail(new Error('should not complete'));
              },
            });
          })
          .catch(done.fail);
      });

      it('takes websocket server subscriptions configuration', done => {
        const onConnect = jest.fn(connectionParams => ({
          ...connectionParams,
        }));
        const typeDefs = gql`
          type Query {
            hi: String
          }

          type Subscription {
            num: Int
          }
        `;

        const query = `
        subscription {
          num
        }
      `;

        const resolvers = {
          Query: {
            hi: () => 'here to placate graphql-js',
          },
          Subscription: {
            num: {
              subscribe: () => {
                createEvent(1);
                createEvent(2);
                createEvent(3);
                return pubsub.asyncIterator(SOMETHING_CHANGED_TOPIC);
              },
            },
          },
        };

        const path = '/sub';
        createApolloServer({
          typeDefs,
          resolvers,
          subscriptions: { onConnect, path },
        })
          .then(({ port, server }) => {
            const subPort = (typeof port === "number" ? port : parseInt(port)) + 1
            const websocketServer = new WebSocket.Server({port: subPort})
            server.installSubscriptionHandlers(websocketServer);
            expect(onConnect).not.toBeCalled();

            expect(server.subscriptionsPath).toEqual(path);
            const client = new SubscriptionClient(
              `ws://localhost:${subPort}${server.subscriptionsPath}`,
              {},
              WebSocket,
            );

            const observable = client.request({ query });

            let i = 1;
            subscription = observable.subscribe({
              next: ({ data }) => {
                try {
                  expect(onConnect).toHaveBeenCalledTimes(1);
                  expect(data.num).toEqual(i);
                  if (i === 3) {
                    done();
                  }
                  i++;
                } catch (e) {
                  done.fail(e);
                }
              },
              error: done.fail,
              complete: () => {
                done.fail(new Error('should not complete'));
              },
            });
          })
          .catch(done.fail);
      });

      it('allows introspection when introspection is enabled on ApolloServer', done => {
        const typeDefs = gql`
          type Query {
            hi: String
          }

          type Subscription {
            num: Int
          }
        `;

        const query = getIntrospectionQuery();

        const resolvers = {
          Query: {
            hi: () => 'here to placate graphql-js',
          },
          Subscription: {
            num: {
              subscribe: () => {
                createEvent(1);
                createEvent(2);
                createEvent(3);
                return pubsub.asyncIterator(SOMETHING_CHANGED_TOPIC);
              },
            },
          },
        };

        createApolloServer({
          typeDefs,
          resolvers,
          introspection: true,
        }).then(({ port, server, httpServer }) => {
          server.installSubscriptionHandlers(httpServer);

          const client = new SubscriptionClient(
            `ws://localhost:${port}${server.subscriptionsPath}`,
            {},
            WebSocket,
          );

          const observable = client.request({ query });

          subscription = observable.subscribe({
            next: ({ data }) => {
              try {
                expect(data).toMatchObject({ __schema: expect.any(Object) })
              } catch (e) {
                done.fail(e);
              }
              done();
            }
          });
        });
      });
      it('disallows introspection when it\'s disabled on ApolloServer', done => {
        const typeDefs = gql`
          type Query {
            hi: String
          }

          type Subscription {
            num: Int
          }
        `;

        const query = getIntrospectionQuery();

        const resolvers = {
          Query: {
            hi: () => 'here to placate graphql-js',
          },
          Subscription: {
            num: {
              subscribe: () => {
                createEvent(1);
                createEvent(2);
                createEvent(3);
                return pubsub.asyncIterator(SOMETHING_CHANGED_TOPIC);
              },
            },
          },
        };

        createApolloServer({
          typeDefs,
          resolvers,
          introspection: false,
        }).then(({ port, server, httpServer }) => {
          server.installSubscriptionHandlers(httpServer);

          const client = new SubscriptionClient(
            `ws://localhost:${port}${server.subscriptionsPath}`,
            {},
            WebSocket,
          );

          const observable = client.request({ query });

          subscription = observable.subscribe({
            next: ({ data }) => {
              try {
                expect(data).toBeUndefined();
              } catch (e) {
                done.fail(e);
              }
              done();
            }
          });
        });
      });
    });

    describe('Persisted Queries', () => {
      let uri: string;
      const query = gql`
        ${TEST_STRING_QUERY}
      `;
      const hash = sha256
        .create()
        .update(TEST_STRING_QUERY)
        .hex();
      const extensions = {
        persistedQuery: {
          version: VERSION,
          sha256Hash: hash,
        },
      };

      beforeEach(async () => {
        const serverInfo = await createApolloServer({
          schema,
          introspection: false,
          persistedQueries: {
            cache: new Map<string, string>() as any,
          },
        });
        uri = serverInfo.url;
      });

      it('returns PersistedQueryNotFound on the first try', async () => {
        const apolloFetch = createApolloFetch({ uri });

        const result = await apolloFetch({
          extensions,
        } as any);

        expect(result.data).toBeUndefined();
        expect(result.errors.length).toEqual(1);
        expect(result.errors[0].message).toEqual('PersistedQueryNotFound');
        expect(result.errors[0].extensions.code).toEqual(
          'PERSISTED_QUERY_NOT_FOUND',
        );
      });
      it('returns result on the second try', async () => {
        const apolloFetch = createApolloFetch({ uri });

        await apolloFetch({
          extensions,
        } as any);
        const result = await apolloFetch({
          extensions,
          query: TEST_STRING_QUERY,
        } as any);

        expect(result.data).toEqual({ testString: 'test string' });
        expect(result.errors).toBeUndefined();
      });

      it('returns result on the persisted query', async () => {
        const apolloFetch = createApolloFetch({ uri });

        await apolloFetch({
          extensions,
        } as any);
        await apolloFetch({
          extensions,
          query: TEST_STRING_QUERY,
        } as any);
        const result = await apolloFetch({
          extensions,
        } as any);

        expect(result.data).toEqual({ testString: 'test string' });
        expect(result.errors).toBeUndefined();
      });

      // Apollo Fetch's result depends on the server implementation, if the
      // statusText of the error is unparsable, then we'll fall into the catch,
      // such as with express. If it is parsable, then we'll use the afterware
      it('returns error when hash does not match', async () => {
        const apolloFetch = createApolloFetch({ uri }).useAfter((res, next) => {
          expect(res.response.status).toEqual(400);
          expect(res.response.raw).toMatch(/does not match query/);
          next();
        });

        try {
          await apolloFetch({
            extensions: {
              persistedQuery: {
                version: VERSION,
                sha:
                  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
              },
            },
            query: TEST_STRING_QUERY,
          } as any);
        } catch (e) {
          expect(e.response).toBeDefined();
          expect(e.response.status).toEqual(400);
          expect(e.response.raw).toMatch(/does not match query/);
        }
      });

      it('returns correct result for persisted query link', done => {
        const variables = { id: 1 };
        const link = createPersistedQuery().concat(
          createHttpLink({ uri, fetch } as any),
        );

        execute(link, { query, variables } as any).subscribe(result => {
          expect(result.data).toEqual({ testString: 'test string' });
          done();
        }, done.fail);
      });

      it('returns correct result for persisted query link using get request', done => {
        const variables = { id: 1 };
        const link = createPersistedQuery({
          useGETForHashedQueries: true,
        }).concat(createHttpLink({ uri, fetch } as any));

        execute(link, { query, variables } as any).subscribe(result => {
          expect(result.data).toEqual({ testString: 'test string' });
          done();
        }, done.fail);
      });
    });

    describe('usage reporting', () => {
      async function makeFakeTestableEngineServer({
        status,
        waitWriteResponse = false,
      }: {
        status: number;
        waitWriteResponse?: boolean;
      }) {
        let writeResponseResolve: () => void;
        const writeResponsePromise = new Promise(
          resolve => (writeResponseResolve = resolve),
        );
        const fakeEngineServer = http.createServer(async (_, res) => {
          await writeResponsePromise;
          res.writeHead(status);
          res.end('Important text in the body');
        });
        await new Promise(resolve => {
          fakeEngineServer.listen(0, '127.0.0.1', () => {
            resolve();
          });
        });
        async function closeServer() {
          await new Promise(resolve => fakeEngineServer.close(() => resolve()));
        }

        const { family, address, port } = fakeEngineServer.address();
        if (family !== 'IPv4') {
          throw new Error(`The family was unexpectedly ${family}.`);
        }

        const fakeEngineUrl = `http://${address}:${port}`;

        if (!waitWriteResponse) {
          writeResponseResolve();
        }

        return {
          closeServer,
          fakeEngineServer,
          fakeEngineUrl,
          writeResponseResolve,
        };
      }

      describe('graphql server functions even when Apollo servers are down', () => {
        async function testWithStatus(
          status: number,
          expectedRequestCount: number,
        ) {
          const networkError = status === 0;

          const {
            closeServer,
            fakeEngineUrl,
            writeResponseResolve,
          } = await makeFakeTestableEngineServer({
            status,
            waitWriteResponse: true,
          });

          try {
            // To simulate a network error, we create and close the server.
            // This lets us still generate a port that is hopefully unused.
            if (networkError) {
              await closeServer();
            }

            let requestCount = 0;
            const requestAgent = new http.Agent({ keepAlive: false });
            const realCreateConnection = (requestAgent as any).createConnection;
            (requestAgent as any).createConnection = function() {
              requestCount++;
              return realCreateConnection.apply(this, arguments);
            };

            let reportErrorPromiseResolve: (error: Error) => void;
            const reportErrorPromise = new Promise<Error>(
              resolve => (reportErrorPromiseResolve = resolve),
            );
            const { url: uri } = await createApolloServer({
              typeDefs: gql`
                type Query {
                  something: String!
                }
              `,
              resolvers: { Query: { something: () => 'hello' } },
              apollo: {
                key: 'service:my-app:secret',
                graphVariant: 'current',
              },
              plugins: [
                ApolloServerPluginUsageReporting({
                  endpointUrl: fakeEngineUrl,
                  reportIntervalMs: 1,
                  maxAttempts: 3,
                  requestAgent,
                  reportErrorFunction(error: Error) {
                    reportErrorPromiseResolve(error);
                  },
                }),
              ],
            });

            const apolloFetch = createApolloFetch({ uri });

            // Run a GraphQL query. Ensure that it returns successfully even
            // though reporting is going to fail. (Note that reporting can't
            // actually have failed yet (except in the network-error case)
            // because we haven't let writeResponsePromise resolve.)
            const result = await apolloFetch({
              query: `{ something }`,
            });
            expect(result.data.something).toBe('hello');

            if (!networkError) {
              // Allow reporting to return its response (for every retry).
              writeResponseResolve();
            }

            // Make sure we can get the error from reporting.
            const sendingError = await reportErrorPromise;
            expect(sendingError).toBeTruthy();
            if (networkError) {
              expect(sendingError.message).toContain(
                'Error sending report to Apollo servers',
              );
              expect(sendingError.message).toContain('ECONNREFUSED');
            } else {
              expect(sendingError.message).toBe(
                `Error sending report to Apollo servers: HTTP status ${status}, Important text in the body`,
              );
            }
            expect(requestCount).toBe(expectedRequestCount);
          } finally {
            if (!networkError) {
              await closeServer();
            }
          }
        }
        it('with retryable error', async () => {
          await testWithStatus(500, 3);
        });
        it('with network error', async () => {
          await testWithStatus(0, 3);
        });
        it('with non-retryable error', async () => {
          await testWithStatus(400, 1);
        });
      });
    });

    describe('Tracing', () => {
      const typeDefs = gql`
        type Book {
          title: String
          author: String
        }

        type Movie {
          title: String
        }

        type Query {
          books: [Book]
          movies: [Movie]
        }
      `;

      const resolvers = {
        Query: {
          books: () =>
            new Promise(resolve =>
              setTimeout(() => resolve([{ title: 'H', author: 'J' }]), 10),
            ),
          movies: () =>
            new Promise(resolve =>
              setTimeout(() => resolve([{ title: 'H' }]), 12),
            ),
        },
      };

      it('reports a total duration that is longer than the duration of its resolvers', async () => {
        const { url: uri } = await createApolloServer({
          typeDefs,
          resolvers,
          tracing: true,
        });

        const apolloFetch = createApolloFetch({ uri });
        const result = await apolloFetch({
          query: `{ books { title author } }`,
        });

        const tracing: TracingFormat = result.extensions.tracing;

        const earliestStartOffset = tracing.execution.resolvers
          .map(resolver => resolver.startOffset)
          .reduce((currentEarliestOffset, nextOffset) =>
            Math.min(currentEarliestOffset, nextOffset),
          );

        const latestEndOffset = tracing.execution.resolvers
          .map(resolver => resolver.startOffset + resolver.duration)
          .reduce((currentLatestEndOffset, nextEndOffset) =>
            Math.max(currentLatestEndOffset, nextEndOffset),
          );

        const resolverDuration = latestEndOffset - earliestStartOffset;

        expect(resolverDuration).not.toBeGreaterThan(tracing.duration);
      });
    });

    describe('Federated tracing', () => {
      // Enable federated tracing by pretending to be federated.
      const federationTypeDefs = gql`
        type _Service {
          sdl: String
        }
      `;

      const baseTypeDefs = gql`
        type Book {
          title: String
          author: String
        }

        type Movie {
          title: String
        }

        type Query {
          books: [Book]
          movies: [Movie]
          error: String
        }
      `;

      const allTypeDefs = [federationTypeDefs, baseTypeDefs];

      const resolvers = {
        Query: {
          books: () =>
            new Promise(resolve =>
              setTimeout(() => resolve([{ title: 'H', author: 'J' }]), 10),
            ),
          movies: () =>
            new Promise(resolve =>
              setTimeout(() => resolve([{ title: 'H' }]), 12),
            ),
          error: () => {
            throw new GraphQLError('It broke');
          },
        },
      };

      function createApolloFetchAsIfFromGateway(uri: string): ApolloFetch {
        return createApolloFetch({ uri }).use(({ options }, next) => {
          options.headers = { 'apollo-federation-include-trace': 'ftv1' };
          next();
        });
      }

      it("doesn't include federated trace without the special header", async () => {
        const { url: uri } = await createApolloServer({
          typeDefs: allTypeDefs,
          resolvers,
        });

        const apolloFetch = createApolloFetch({ uri });

        const result = await apolloFetch({
          query: `{ books { title author } }`,
        });

        expect(result.extensions).toBeUndefined();
      });

      it("doesn't include federated trace without _Service in the schema", async () => {
        const { url: uri } = await createApolloServer({
          typeDefs: baseTypeDefs,
          resolvers,
        });

        const apolloFetch = createApolloFetchAsIfFromGateway(uri);

        const result = await apolloFetch({
          query: `{ books { title author } }`,
        });

        expect(result.extensions).toBeUndefined();
      });

      it('reports a total duration that is longer than the duration of its resolvers', async () => {
        const { url: uri, server } = await createApolloServer({
          typeDefs: allTypeDefs,
          resolvers,
        });

        const apolloFetch = createApolloFetchAsIfFromGateway(uri);

        const result = await apolloFetch({
          query: `{ books { title author } }`,
        });

        const ftv1: string = result.extensions.ftv1;

        expect(ftv1).toBeTruthy();
        const encoded = Buffer.from(ftv1, 'base64');
        const trace = Trace.decode(encoded);

        let earliestStartOffset = Infinity;
        let latestEndOffset = -Infinity;
        function walk(node: Trace.INode) {
          if (node.startTime !== 0 && node.endTime !== 0) {
            earliestStartOffset = Math.min(earliestStartOffset, node.startTime);
            latestEndOffset = Math.max(latestEndOffset, node.endTime);
          }
          node.child.forEach(n => walk(n));
        }
        walk(trace.root);
        expect(earliestStartOffset).toBeLessThan(Infinity);
        expect(latestEndOffset).toBeGreaterThan(-Infinity);
        const resolverDuration = latestEndOffset - earliestStartOffset;
        expect(resolverDuration).toBeGreaterThan(0);
        expect(trace.durationNs).toBeGreaterThanOrEqual(resolverDuration);

        expect(trace.startTime.seconds).toBeLessThanOrEqual(
          trace.endTime.seconds,
        );
        if (trace.startTime.seconds === trace.endTime.seconds) {
          expect(trace.startTime.nanos).toBeLessThanOrEqual(
            trace.endTime.nanos,
          );
        }
      });

      it('includes errors in federated trace', async () => {
        const { url: uri } = await createApolloServer({
          typeDefs: allTypeDefs,
          resolvers,
          formatError(err) {
            err.message = `Formatted: ${err.message}`;
            return err;
          },
          plugins: [ApolloServerPluginInlineTrace({
            rewriteError(err) {
              err.message = `Rewritten for Engine: ${err.message}`;
              return err;
            },
          })],
        });

        const apolloFetch = createApolloFetchAsIfFromGateway(uri);

        const result = await apolloFetch({
          query: `{ error }`,
        });

        expect(result.data).toStrictEqual({ error: null });
        expect(result.errors).toBeTruthy();
        expect(result.errors.length).toBe(1);
        expect(result.errors[0].message).toBe('Formatted: It broke');

        const ftv1: string = result.extensions.ftv1;

        expect(ftv1).toBeTruthy();
        const encoded = Buffer.from(ftv1, 'base64');
        const trace = Trace.decode(encoded);
        expect(trace.root.child[0].error[0].message).toBe(
          'Rewritten for Engine: It broke',
        );
      });
    });

    describe('Response caching', () => {
      beforeAll(() => {
        mockDate();
      });

      afterAll(() => {
        unmockDate();
      });

      it('basic caching', async () => {
        const typeDefs = gql`
          type Query {
            cached: String @cacheControl(maxAge: 10)
            asynccached: String @cacheControl(maxAge: 10)
            asyncuncached: String @cacheControl(maxAge: 10)
            asyncnowrite: String @cacheControl(maxAge: 10)
            uncached: String
            private: String @cacheControl(maxAge: 9, scope: PRIVATE)
          }
        `;

        type FieldName = 'cached'| 'asynccached' | 'asyncuncached' | 'asyncnowrite' | 'uncached' | 'private';
        const fieldNames: FieldName[] = ['cached', 'asynccached', 'asyncuncached', 'asyncnowrite', 'uncached', 'private'];
        const resolverCallCount: Partial<Record<FieldName, number>> = {};
        const expectedResolverCallCount: Partial<
          Record<FieldName, number>
        > = {};
        const expectCacheHit = (fn: FieldName) =>
          expect(resolverCallCount[fn]).toBe(expectedResolverCallCount[fn]);
        const expectCacheMiss = (fn: FieldName) =>
          expect(resolverCallCount[fn]).toBe(++expectedResolverCallCount[fn]);

        const resolvers = {
          Query: {},
        };
        fieldNames.forEach(name => {
          resolverCallCount[name] = 0;
          expectedResolverCallCount[name] = 0;
          resolvers.Query[name] = () => {
            resolverCallCount[name]++;
            return `value:${name}`;
          };
        });

        const { url: uri } = await createApolloServer({
          typeDefs,
          resolvers,
          plugins: [
            ApolloServerPluginResponseCache({
              sessionId: (requestContext: GraphQLRequestContext<any>) => {
                return (
                  requestContext.request.http.headers.get('session-id') || null
                );
              },
              extraCacheKeyData: (
                requestContext: GraphQLRequestContext<any>,
              ) => {
                return (
                  requestContext.request.http.headers.get(
                    'extra-cache-key-data',
                  ) || null
                );
              },
              shouldReadFromCache: (
                requestContext: GraphQLRequestContext<any>,
              ) => {
                console.debug('shouldReadFromCache', requestContext.request.query);
                if (requestContext.request.http.headers.get('no-read-from-cache'))
                  return false;

                if (requestContext.request.query.indexOf('asynccached') >= 0) {
                  return new Promise((resolve) => resolve(true));
                }

                if (requestContext.request.query.indexOf('asyncuncached') >= 0) {
                  return new Promise((resolve) => resolve(false));
                }

                return true;
              },
              shouldWriteToCache: (
                requestContext: GraphQLRequestContext<any>,
              ) => {
                if (requestContext.request.http.headers.get('no-write-to-cache'))
                  return false;

                if (requestContext.request.query.indexOf('asyncnowrite') >= 0) {
                  return new Promise((resolve) => resolve(false));
                }

                return true;
              },
            }),
          ],
        });

        const apolloFetch = createApolloFetch({ uri });
        apolloFetch.use(({ request, options }, next) => {
          const headers = (request as any).headers;
          if (headers) {
            if (!options.headers) {
              options.headers = {};
            }
            for (const k in headers) {
              options.headers[k] = headers[k];
            }
          }
          next();
        });
        // Make HTTP response headers visible on the result next to 'data'.
        apolloFetch.useAfter(({ response }, next) => {
          response.parsed.httpHeaders = response.headers;
          next();
        });
        // Use 'any' because we're sneaking httpHeaders onto response.parsed.
        function httpHeader(result: any, header: string): string | null {
          const value = (result.httpHeaders as Headers).get(header);
          // hack: hapi sets cache-control: no-cache by default; make it
          // look to our tests like the other servers.
          if (header === 'cache-control' && value === 'no-cache') {
            return null;
          }
          return value;
        }
        // Just for the typing.
        function doFetch(
          options: GraphQLRequest & { headers?: Record<string, string> },
        ) {
          return apolloFetch(options as any);
        }

        const basicQuery = '{ cached }';
        const fetch = async () => {
          const result = await doFetch({
            query: basicQuery,
          });
          expect(result.data.cached).toBe('value:cached');
          return result;
        };

        // Cache miss
        {
          const result = await fetch();
          expectCacheMiss('cached');
          expect(httpHeader(result, 'cache-control')).toBe(
            'max-age=10, public',
          );
          expect(httpHeader(result, 'age')).toBe(null);
        }

        // Cache hit
        {
          const result = await fetch();
          expectCacheHit('cached');
          expect(httpHeader(result, 'cache-control')).toBe(
            'max-age=10, public',
          );
          expect(httpHeader(result, 'age')).toBe('0');
        }

        // Cache hit partway to ttl.
        advanceTimeBy(5 * 1000);
        {
          const result = await fetch();
          expectCacheHit('cached');
          expect(httpHeader(result, 'cache-control')).toBe(
            'max-age=10, public',
          );
          expect(httpHeader(result, 'age')).toBe('5');
        }

        // Cache miss after ttl.
        advanceTimeBy(6 * 1000);
        {
          const result = await fetch();
          expectCacheMiss('cached');
          expect(httpHeader(result, 'cache-control')).toBe(
            'max-age=10, public',
          );
          expect(httpHeader(result, 'age')).toBe(null);
        }

        // Cache hit async
        {
          await doFetch({
            query: '{asynccached}',
          });
          expectCacheMiss('asynccached');

          await doFetch({
            query: '{asynccached}',
          });
          expectCacheHit('asynccached');
        }

        // Cache Miss async
        {
          await doFetch({
            query: '{asyncuncached}',
          });
          expectCacheMiss('asyncuncached');

          await doFetch({
            query: '{asyncuncached}',
          });
          expectCacheMiss('asyncuncached');
        }

        // Even we cache read, we did not write (async)
        {
          const asyncNoWriteQuery = '{asyncnowrite}'
          await doFetch({
            query: asyncNoWriteQuery,
          });
          expectCacheMiss('asyncnowrite');

          const result = await doFetch({
            query: asyncNoWriteQuery,
          });
          expectCacheMiss('asyncnowrite');
          expect(httpHeader(result, 'cache-control')).toBe(
            'max-age=10, public',
          );
        }

        // Cache hit.
        {
          const result = await fetch();
          expectCacheHit('cached');
          expect(httpHeader(result, 'cache-control')).toBe(
            'max-age=10, public',
          );
          expect(httpHeader(result, 'age')).toBe('0');
        }

        // For now, caching is based on the original document text, not the AST,
        // so this should be a cache miss.
        {
          const result = await doFetch({
            query: '{       cached           }',
          });
          expect(result.data.cached).toBe('value:cached');
          expectCacheMiss('cached');
        }

        // This definitely should be a cache miss because the output is different.
        {
          const result = await doFetch({
            query: '{alias: cached}',
          });
          expect(result.data.alias).toBe('value:cached');
          expectCacheMiss('cached');
        }

        // Reading both a cached and uncached data should not get cached (it's a
        // full response cache).
        {
          const result = await doFetch({
            query: '{cached uncached}',
          });
          expect(result.data.cached).toBe('value:cached');
          expect(result.data.uncached).toBe('value:uncached');
          expectCacheMiss('cached');
          expectCacheMiss('uncached');
          expect(httpHeader(result, 'cache-control')).toBe(null);
          expect(httpHeader(result, 'age')).toBe(null);
        }

        // Just double-checking that it didn't get cached.
        {
          const result = await doFetch({
            query: '{cached uncached}',
          });
          expect(result.data.cached).toBe('value:cached');
          expect(result.data.uncached).toBe('value:uncached');
          expectCacheMiss('cached');
          expectCacheMiss('uncached');
          expect(httpHeader(result, 'cache-control')).toBe(null);
          expect(httpHeader(result, 'age')).toBe(null);
        }

        // Let's just remind ourselves that the basic query is cacheable.
        {
          await doFetch({ query: basicQuery });
          expectCacheHit('cached');
        }

        // But if we give it some extra cache key data, it'll be cached separately.
        {
          const result = await doFetch({
            query: basicQuery,
            headers: { 'extra-cache-key-data': 'foo' },
          });
          expect(result.data.cached).toBe('value:cached');
          expectCacheMiss('cached');
        }

        // But if we give it the same extra cache key data twice, it's a hit.
        {
          const result = await doFetch({
            query: basicQuery,
            headers: { 'extra-cache-key-data': 'foo' },
          });
          expect(result.data.cached).toBe('value:cached');
          expectCacheHit('cached');
        }

        // Without a session ID, private fields won't be cached.
        {
          const result = await doFetch({
            query: '{private}',
          });
          expect(result.data.private).toBe('value:private');
          expectCacheMiss('private');
          // Note that the HTTP header calculator doesn't know about session
          // IDs, so it'll still tell HTTP-level caches to cache this, albeit
          // privately.
          expect(httpHeader(result, 'cache-control')).toBe(
            'max-age=9, private',
          );
          expect(httpHeader(result, 'age')).toBe(null);
        }

        // See?
        {
          const result = await doFetch({
            query: '{private}',
          });
          expect(result.data.private).toBe('value:private');
          expectCacheMiss('private');
          expect(httpHeader(result, 'cache-control')).toBe(
            'max-age=9, private',
          );
        }

        // OK, how about with a session ID.  First try should be a miss.
        {
          const result = await doFetch({
            query: '{private}',
            headers: { 'session-id': 'foo' },
          });
          expect(result.data.private).toBe('value:private');
          expectCacheMiss('private');
          expect(httpHeader(result, 'cache-control')).toBe(
            'max-age=9, private',
          );
        }

        // But next try should be a hit.
        {
          const result = await doFetch({
            query: '{private}',
            headers: { 'session-id': 'foo' },
          });
          expect(result.data.private).toBe('value:private');
          expectCacheHit('private');
          expect(httpHeader(result, 'cache-control')).toBe(
            'max-age=9, private',
          );
        }

        // But a different session ID should be a miss again.
        {
          const result = await doFetch({
            query: '{private}',
            headers: { 'session-id': 'bar' },
          });
          expect(result.data.private).toBe('value:private');
          expectCacheMiss('private');
          expect(httpHeader(result, 'cache-control')).toBe(
            'max-age=9, private',
          );
        }

        // As should be no session.
        {
          const result = await doFetch({
            query: '{private}',
          });
          expect(result.data.private).toBe('value:private');
          expectCacheMiss('private');
          expect(httpHeader(result, 'cache-control')).toBe(
            'max-age=9, private',
          );
        }

        // Let's remind ourselves once again that the basic (public) query is *still* cached.
        {
          const result = await doFetch({ query: basicQuery });
          expectCacheHit('cached');
          expect(httpHeader(result, 'cache-control')).toBe(
            'max-age=10, public',
          );
        }

        // If you're logged in, though, you get your own cache shared with all
        // other authenticated users (the "authenticated public" cache), so this
        // is a miss. It's still a public cache, though, for the HTTP header.
        // XXX Does that makes sense? Maybe this should be private, or maybe we
        // should drop the entire "authenticated public" concept.
        {
          const result = await doFetch({
            query: basicQuery,
            headers: { 'session-id': 'bar' },
          });
          expect(result.data.cached).toBe('value:cached');
          expectCacheMiss('cached');
          expect(httpHeader(result, 'cache-control')).toBe(
            'max-age=10, public',
          );
        }

        // See, this other session sees it!
        {
          const result = await doFetch({
            query: basicQuery,
            headers: { 'session-id': 'baz' },
          });
          expect(result.data.cached).toBe('value:cached');
          expectCacheHit('cached');
          expect(httpHeader(result, 'cache-control')).toBe(
            'max-age=10, public',
          );
          expect(httpHeader(result, 'age')).toBe('0');
        }

        // Let's continue to remind ourselves that the basic (public) query is *still* cached.
        {
          const result = await doFetch({ query: basicQuery });
          expectCacheHit('cached');
          expect(httpHeader(result, 'cache-control')).toBe(
            'max-age=10, public',
          );
        }

        // But what if we specifically ask to not read from the cache?
        {
          const result = await doFetch({
            query: basicQuery,
            headers: { 'no-read-from-cache': 'y' },
          });
          expect(result.data.cached).toBe('value:cached');
          expectCacheMiss('cached');
          expect(httpHeader(result, 'cache-control')).toBe(
            'max-age=10, public',
          );
        }

        // Let's expire the cache, and run again, not writing to the cache.
        advanceTimeBy(15 * 1000);
        {
          const result = await doFetch({
            query: basicQuery,
            headers: { 'no-write-to-cache': 'y' },
          });
          expect(result.data.cached).toBe('value:cached');
          expectCacheMiss('cached');
          expect(httpHeader(result, 'cache-control')).toBe(
            'max-age=10, public',
          );
        }

        // And now verify that in fact we did not write!
        {
          const result = await doFetch({
            query: basicQuery,
          });
          expect(result.data.cached).toBe('value:cached');
          expectCacheMiss('cached');
          expect(httpHeader(result, 'cache-control')).toBe(
            'max-age=10, public',
          );
        }
      });
    });

    describe('Gateway', () => {
      it('receives schema updates from the gateway', async () => {
        const makeQueryTypeWithField = fieldName =>
          new GraphQLSchema({
            query: new GraphQLObjectType({
              name: 'QueryType',
              fields: {
                [fieldName]: {
                  type: GraphQLString,
                },
              },
            }),
          });

        const executor = req =>
          (req.source as string).match(/1/)
            ? Promise.resolve({ data: { testString1: 'hello' } })
            : Promise.resolve({ data: { testString2: 'aloha' } });

        const { gateway, triggers } = makeGatewayMock({ executor });

        triggers.resolveLoad({
          schema: makeQueryTypeWithField('testString1'),
          executor,
        });

        const { url: uri } = await createApolloServer({
          gateway,
          subscriptions: false,
        });

        const apolloFetch = createApolloFetch({ uri });
        const result1 = await apolloFetch({ query: '{testString1}' });

        expect(result1.data).toEqual({ testString1: 'hello' });
        expect(result1.errors).toBeUndefined();

        triggers.triggerSchemaChange(makeQueryTypeWithField('testString2'));

        const result2 = await apolloFetch({ query: '{testString2}' });
        expect(result2.data).toEqual({ testString2: 'aloha' });
        expect(result2.errors).toBeUndefined();
      });

      it('passes apollo and engine data to the gateway', async () => {
        const optionsSpy = jest.fn();

        const { gateway, triggers } = makeGatewayMock({ optionsSpy });
        triggers.resolveLoad({ schema, executor: () => {} });
        const { server } = await createApolloServer({
          gateway,
          subscriptions: false,
          apollo: { key: 'service:tester:1234abc', graphVariant: 'staging' },
        });

        expect(optionsSpy).toHaveBeenLastCalledWith({
          apollo: {
            key: 'service:tester:1234abc',
            keyHash:
              '0ca858e7fe8cffc01c5f1db917d2463b348b50d267427e54c1c8c99e557b242f4145930b949905ec430642467613610e471c40bb7a251b1e2248c399bb0498c4',
            graphId: 'tester',
            graphVariant: 'staging',
          },
          engine: {
            apiKeyHash:
              '0ca858e7fe8cffc01c5f1db917d2463b348b50d267427e54c1c8c99e557b242f4145930b949905ec430642467613610e471c40bb7a251b1e2248c399bb0498c4',
            graphId: 'tester',
            graphVariant: 'staging',
          },
        });
      });

      it('unsubscribes from schema update on close', async () => {
        const unsubscribeSpy = jest.fn();
        const { gateway, triggers } = makeGatewayMock({ unsubscribeSpy });
        triggers.resolveLoad({ schema, executor: () => {} });
        await createApolloServer({ gateway, subscriptions: false });
        expect(unsubscribeSpy).not.toHaveBeenCalled();
        await stopServer();
        expect(unsubscribeSpy).toHaveBeenCalled();
      });

      it('waits until gateway has resolved a schema to respond to queries', async () => {
        let startPromiseResolver: any, endPromiseResolver: any;
        const startPromise = new Promise(res => {
          startPromiseResolver = res;
        });
        const endPromise = new Promise(res => {
          endPromiseResolver = res;
        });
        const executor = async () => {
          startPromiseResolver();
          await endPromise;
          return { data: { testString: 'hi - but federated!' } };
        };

        const { gateway, triggers } = makeGatewayMock({ executor });

        triggers.resolveLoad({ schema, executor });
        const { url: uri } = await createApolloServer({
          gateway,
          subscriptions: false,
        });
        const fetchComplete = jest.fn();
        const apolloFetch = createApolloFetch({ uri });
        const result = apolloFetch({ query: '{testString}' }).then(result => {
          fetchComplete(result);
          return result;
        });
        expect(fetchComplete).not.toHaveBeenCalled();
        await startPromise;
        expect(fetchComplete).not.toHaveBeenCalled();
        endPromiseResolver();
        const resolved = await result;
        expect(fetchComplete).toHaveBeenCalled();
        expect(resolved.data).toEqual({ testString: 'hi - but federated!' });
        expect(resolved.errors).toBeUndefined();
      });

      it('can serve multiple active schemas simultaneously during a schema rollover', async () => {
        const makeQueryTypeWithField = fieldName =>
          new GraphQLSchema({
            query: new GraphQLObjectType({
              name: 'QueryType',
              fields: {
                [fieldName]: {
                  type: GraphQLString,
                },
              },
            }),
          });

        const executorData = {};
        [1, 2, 3].forEach(i => {
          const query = `{testString${i}}`;
          let startPromiseResolver: any, endPromiseResolver: any;
          const startPromise = new Promise(res => {
            startPromiseResolver = res;
          });
          const endPromise = new Promise(res => {
            endPromiseResolver = res;
          });
          executorData[query] = {
            startPromiseResolver,
            endPromiseResolver,
            startPromise,
            endPromise,
            i,
          }
        });

        const executor = async (req) => {
          const source = req.source as string;
          const {startPromiseResolver, endPromise, i} =
            executorData[source];
          startPromiseResolver();
          await endPromise;
          return { data: { [`testString${i}`]: `${i}` } };
        };

        const { gateway, triggers } = makeGatewayMock({ executor });

        triggers.resolveLoad({
          schema: makeQueryTypeWithField('testString1'),
          executor,
        });

        const { url: uri, server } = await createApolloServer({
          gateway,
          subscriptions: false,
        });

        const apolloFetch = createApolloFetch({ uri });
        const result1 = apolloFetch({ query: '{testString1}' });
        await executorData['{testString1}'].startPromise;
        triggers.triggerSchemaChange(makeQueryTypeWithField('testString2'));
        // Hacky, but: executeOperation awaits schemaDerivedData, so when it
        // finishes we know the new schema is loaded.
        await server.executeOperation({query: '{__typename}'});
        const result2 = apolloFetch({ query: '{testString2}' });
        await executorData['{testString2}'].startPromise;
        triggers.triggerSchemaChange(makeQueryTypeWithField('testString3'));
        await server.executeOperation({query: '{__typename}'});
        const result3 = apolloFetch({ query: '{testString3}' });
        await executorData['{testString3}'].startPromise;
        executorData['{testString3}'].endPromiseResolver();
        executorData['{testString1}'].endPromiseResolver();
        executorData['{testString2}'].endPromiseResolver();

        await Promise.all([result1, result2, result3]).then(([v1, v2, v3]) => {
          expect(v1.errors).toBeUndefined();
          expect(v2.errors).toBeUndefined();
          expect(v3.errors).toBeUndefined();
          expect(v1.data).toEqual({ testString1: '1' });
          expect(v2.data).toEqual({ testString2: '2' });
          expect(v3.data).toEqual({ testString3: '3' });
        });
      });
    });
  });
}
