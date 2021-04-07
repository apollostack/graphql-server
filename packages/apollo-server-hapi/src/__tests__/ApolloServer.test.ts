import {
  NODE_MAJOR_VERSION,
  testApolloServer,
  createServerInfo,
} from 'apollo-server-integration-testsuite';

import http = require('http');
import request = require('request');
import FormData = require('form-data');
import fs = require('fs');
import { createApolloFetch } from 'apollo-fetch';

import { gql, AuthenticationError } from 'apollo-server-core';
import { ApolloServer } from '../ApolloServer';

const port = 0;

// NODE: Intentionally skip for Node.js < 8 since Hapi 17 doesn't support those.
(NODE_MAJOR_VERSION < 8 ? describe.skip : describe)(
  'apollo-server-hapi',
  () => {
    let server: ApolloServer;

    let app: import('hapi').Server;
    let httpServer: http.Server;

    const { Server } = require('hapi');

    testApolloServer(
      async (options, suppressStartCall?: boolean) => {
        server = new ApolloServer(options);
        app = new Server({ host: 'localhost', port });
        if (!suppressStartCall) {
          await server.start();
        }
        await server.applyMiddleware({ app });
        await app.start();
        const httpServer = app.listener;
        return createServerInfo(server, httpServer);
      },
      async () => {
        if (server) await server.stop();
        if (app) await app.stop();
        if (httpServer && httpServer.listening) await httpServer.close();
      },
    );

    //Non-integration tests
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

    afterEach(async () => {
      if (server) await server.stop();
      if (httpServer) await httpServer.close();
    });

    describe('constructor', () => {
      it('accepts typeDefs and resolvers', async () => {
        const app = new Server();
        const server = new ApolloServer({ typeDefs, resolvers });
        return server.applyMiddleware({ app });
      });
    });

    describe('applyMiddleware', () => {
      it('can be queried', async () => {
        server = new ApolloServer({
          typeDefs,
          resolvers,
        });
        app = new Server({ port });

        await server.applyMiddleware({ app });
        await app.start();

        httpServer = app.listener;
        const uri = app.info.uri + '/graphql';

        const apolloFetch = createApolloFetch({ uri });
        const result = await apolloFetch({ query: '{hello}' });

        expect(result.data).toEqual({ hello: 'hi' });
        expect(result.errors).toBeUndefined();
      });

      // XXX Unclear why this would be something somebody would want (vs enabling
      // introspection without graphql-playground, which seems reasonable, eg you
      // have your own graphql-playground setup with a custom link)
      it('can enable playground separately from introspection during production', async () => {
        const INTROSPECTION_QUERY = `
  {
    __schema {
      directives {
        name
      }
    }
  }
`;

        server = new ApolloServer({
          typeDefs,
          resolvers,
          introspection: false,
        });
        app = new Server({ port });

        await server.applyMiddleware({ app });
        await app.start();

        httpServer = app.listener;
        const uri = app.info.uri + '/graphql';
        const url = uri;

        const apolloFetch = createApolloFetch({ uri });
        const result = await apolloFetch({ query: INTROSPECTION_QUERY });

        expect(result.errors.length).toEqual(1);
        expect(result.errors[0].extensions.code).toEqual(
          'GRAPHQL_VALIDATION_FAILED',
        );

        return new Promise<http.Server>((resolve, reject) => {
          request(
            {
              url,
              method: 'GET',
              headers: {
                accept:
                  'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
              },
            },
            (error, response, body) => {
              if (error) {
                reject(error);
              } else {
                expect(body).toMatch('GraphQLPlayground');
                expect(response.statusCode).toEqual(200);
                resolve();
              }
            },
          );
        });
      });

      it('renders GraphQL playground when browser requests', async () => {
        const nodeEnv = process.env.NODE_ENV;
        delete process.env.NODE_ENV;

        server = new ApolloServer({
          typeDefs,
          resolvers,
          stopOnTerminationSignals: false,
        });
        app = new Server({ port });

        await server.applyMiddleware({ app });
        await app.start();

        httpServer = app.listener;
        const url = app.info.uri + '/graphql';

        return new Promise<http.Server>((resolve, reject) => {
          request(
            {
              url,
              method: 'GET',
              headers: {
                accept:
                  'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
              },
            },
            (error, response, body) => {
              process.env.NODE_ENV = nodeEnv;
              if (error) {
                reject(error);
              } else {
                expect(body).toMatch('GraphQLPlayground');
                expect(response.statusCode).toEqual(200);
                resolve();
              }
            },
          );
        });
      });

      it('accepts cors configuration', async () => {
        server = new ApolloServer({
          typeDefs,
          resolvers,
        });
        app = new Server({
          port,
        });

        await server.applyMiddleware({
          app,
          cors: {
            additionalExposedHeaders: ['X-Apollo'],
            exposedHeaders: [
              'Accept',
              'Authorization',
              'Content-Type',
              'If-None-Match',
              'Another-One',
            ],
          },
        });
        await app.start();

        httpServer = app.listener;
        const uri = app.info.uri + '/graphql';

        const apolloFetch = createApolloFetch({ uri }).useAfter(
          (response, next) => {
            expect(
              response.response.headers.get('access-control-expose-headers'),
            ).toEqual(
              'Accept,Authorization,Content-Type,If-None-Match,Another-One,X-Apollo',
            );
            next();
          },
        );
        await apolloFetch({ query: '{hello}' });
      });

      it('accepts custom route configuration', async () => {
        server = new ApolloServer({
          typeDefs,
          resolvers,
        });
        app = new Server({
          port,
        });

        await server.applyMiddleware({
          app,
          route: {
            cors: {
              additionalExposedHeaders: ['X-Apollo'],
              exposedHeaders: [
                'Accept',
                'Authorization',
                'Content-Type',
                'If-None-Match',
                'Another-One',
              ],
            },
          },
        });

        await app.start();

        httpServer = app.listener;
        const uri = app.info.uri + '/graphql';

        const apolloFetch = createApolloFetch({ uri }).useAfter(
          (response, next) => {
            expect(
              response.response.headers.get('access-control-expose-headers'),
            ).toEqual(
              'Accept,Authorization,Content-Type,If-None-Match,Another-One,X-Apollo',
            );
            next();
          },
        );

        await apolloFetch({ query: '{hello}' });
      });

      it('passes each request and response toolkit through to the context function', async () => {
        const context = async ({ request, h }) => {
          expect(request).toBeDefined();
          expect(h).toBeDefined();
          return {};
        };

        server = new ApolloServer({
          typeDefs,
          resolvers,
          context,
        });
        app = new Server({ port });

        await server.applyMiddleware({ app });
        await app.start();

        httpServer = app.listener;
        const uri = app.info.uri + '/graphql';

        const apolloFetch = createApolloFetch({ uri });
        const result = await apolloFetch({ query: '{hello}' });

        expect(result.data).toEqual({ hello: 'hi' });
        expect(result.errors).toBeUndefined();
      });

      describe('healthchecks', () => {
        afterEach(async () => {
          await server.stop();
        });

        it('creates a healthcheck endpoint', async () => {
          server = new ApolloServer({
            typeDefs,
            resolvers,
          });
          app = new Server({ port });

          await server.applyMiddleware({ app });
          await app.start();

          httpServer = app.listener;
          const { port: appPort } = app.info;

          return new Promise((resolve, reject) => {
            request(
              {
                url: `http://localhost:${appPort}/.well-known/apollo/server-health`,
                method: 'GET',
              },
              (error, response, body) => {
                if (error) {
                  reject(error);
                } else {
                  expect(body).toEqual(JSON.stringify({ status: 'pass' }));
                  expect(response.statusCode).toEqual(200);
                  resolve();
                }
              },
            );
          });
        });

        it('provides a callback for the healthcheck', async () => {
          server = new ApolloServer({
            typeDefs,
            resolvers,
          });
          app = new Server({ port });

          await server.applyMiddleware({
            app,
            onHealthCheck: async () => {
              throw Error("can't connect to DB");
            },
          });
          await app.start();

          httpServer = app.listener;
          const { port: appPort } = app.info;

          return new Promise((resolve, reject) => {
            request(
              {
                url: `http://localhost:${appPort}/.well-known/apollo/server-health`,
                method: 'GET',
              },
              (error, response, body) => {
                if (error) {
                  reject(error);
                } else {
                  expect(body).toEqual(JSON.stringify({ status: 'fail' }));
                  expect(response.statusCode).toEqual(503);
                  resolve();
                }
              },
            );
          });
        });

        it('can disable the healthCheck', async () => {
          server = new ApolloServer({
            typeDefs,
            resolvers,
          });

          app = new Server({ port });

          await server.applyMiddleware({
            app,
            disableHealthCheck: true,
          });
          await app.start();

          httpServer = app.listener;
          const { port: appPort } = app.info;

          return new Promise((resolve, reject) => {
            request(
              {
                url: `http://localhost:${appPort}/.well-known/apollo/server-health`,
                method: 'GET',
              },
              (error, response) => {
                if (error) {
                  reject(error);
                } else {
                  expect(response.statusCode).toEqual(404);
                  resolve();
                }
              },
            );
          });
        });
      });
      describe('file uploads', () => {
        xit('enabled uploads', async () => {
          server = new ApolloServer({
            typeDefs: gql`
              type File {
                filename: String!
                mimetype: String!
                encoding: String!
              }

              type Query {
                uploads: [File]
              }

              type Mutation {
                singleUpload(file: Upload!): File!
              }
            `,
            resolvers: {
              Query: {
                uploads: () => {},
              },
              Mutation: {
                singleUpload: async (_, args) => {
                  expect((await args.file).stream).toBeDefined();
                  return args.file;
                },
              },
            },
          });
          app = new Server({ port });

          await server.applyMiddleware({
            app,
            disableHealthCheck: true,
          });
          await app.start();

          httpServer = app.listener;
          const { port: appPort } = app.info;

          const body = new FormData();

          body.append(
            'operations',
            JSON.stringify({
              query: `
              mutation($file: Upload!) {
                singleUpload(file: $file) {
                  filename
                  encoding
                  mimetype
                }
              }
            `,
              variables: {
                file: null,
              },
            }),
          );

          body.append('map', JSON.stringify({ 1: ['variables.file'] }));
          body.append('1', fs.createReadStream('package.json'));

          try {
            const resolved = await fetch(
              `http://localhost:${appPort}/graphql`,
              {
                method: 'POST',
                body: body as any,
              },
            );
            const response = await resolved.json();

            expect(response.data.singleUpload).toEqual({
              filename: 'package.json',
              encoding: '7bit',
              mimetype: 'application/json',
            });
          } catch (error) {
            // This error began appearing randomly and seems to be a dev dependency bug.
            // https://github.com/jaydenseric/apollo-upload-server/blob/18ecdbc7a1f8b69ad51b4affbd986400033303d4/test.js#L39-L42
            if (error.code !== 'EPIPE') throw error;
          }
        });
      });

      describe('errors', () => {
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
          server = new ApolloServer({
            typeDefs,
            resolvers,
            stopOnTerminationSignals: false,
            context: () => {
              throw new AuthenticationError('valid result');
            },
          });

          app = new Server({ port });

          await server.applyMiddleware({
            app,
            disableHealthCheck: true,
          });
          await app.start();

          httpServer = app.listener;
          const uri = app.info.uri + '/graphql';

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

        it('propogates error codes in dev mode', async () => {
          const nodeEnv = process.env.NODE_ENV;
          delete process.env.NODE_ENV;

          server = new ApolloServer({
            typeDefs: gql`
              type Query {
                error: String
              }
            `,
            resolvers: {
              Query: {
                error: () => {
                  throw new AuthenticationError('we the best music');
                },
              },
            },
            stopOnTerminationSignals: false,
          });

          app = new Server({ port });

          await server.applyMiddleware({
            app,
            disableHealthCheck: true,
          });
          await app.start();

          httpServer = app.listener;
          const uri = app.info.uri + '/graphql';

          const apolloFetch = createApolloFetch({ uri });

          const result = await apolloFetch({ query: `{error}` });
          expect(result.data).toBeDefined();
          expect(result.data).toEqual({ error: null });

          expect(result.errors).toBeDefined();
          expect(result.errors.length).toEqual(1);
          expect(result.errors[0].extensions.code).toEqual('UNAUTHENTICATED');
          expect(result.errors[0].extensions.exception).toBeDefined();
          expect(
            result.errors[0].extensions.exception.stacktrace,
          ).toBeDefined();

          process.env.NODE_ENV = nodeEnv;
        });

        it('propogates error codes in production', async () => {
          const nodeEnv = process.env.NODE_ENV;
          process.env.NODE_ENV = 'production';

          server = new ApolloServer({
            typeDefs: gql`
              type Query {
                error: String
              }
            `,
            resolvers: {
              Query: {
                error: () => {
                  throw new AuthenticationError('we the best music');
                },
              },
            },
            stopOnTerminationSignals: false,
          });

          app = new Server({ port });

          await server.applyMiddleware({
            app,
            disableHealthCheck: true,
          });
          await app.start();

          httpServer = app.listener;
          const uri = app.info.uri + '/graphql';

          const apolloFetch = createApolloFetch({ uri });

          const result = await apolloFetch({ query: `{error}` });
          expect(result.data).toBeDefined();
          expect(result.data).toEqual({ error: null });

          expect(result.errors).toBeDefined();
          expect(result.errors.length).toEqual(1);
          expect(result.errors[0].extensions.code).toEqual('UNAUTHENTICATED');
          expect(result.errors[0].extensions.exception).toBeUndefined();

          process.env.NODE_ENV = nodeEnv;
        });

        it('propogates error codes with null response in production', async () => {
          const nodeEnv = process.env.NODE_ENV;
          process.env.NODE_ENV = 'production';

          server = new ApolloServer({
            typeDefs: gql`
              type Query {
                error: String!
              }
            `,
            resolvers: {
              Query: {
                error: () => {
                  throw new AuthenticationError('we the best music');
                },
              },
            },
            stopOnTerminationSignals: false,
          });

          app = new Server({ port });

          await server.applyMiddleware({
            app,
            disableHealthCheck: true,
          });
          await app.start();

          httpServer = app.listener;
          const uri = app.info.uri + '/graphql';

          const apolloFetch = createApolloFetch({ uri });

          const result = await apolloFetch({ query: `{error}` });
          expect(result.data).toBeNull();

          expect(result.errors).toBeDefined();
          expect(result.errors.length).toEqual(1);
          expect(result.errors[0].extensions.code).toEqual('UNAUTHENTICATED');
          expect(result.errors[0].extensions.exception).toBeUndefined();

          process.env.NODE_ENV = nodeEnv;
        });
      });
    });
  },
);
