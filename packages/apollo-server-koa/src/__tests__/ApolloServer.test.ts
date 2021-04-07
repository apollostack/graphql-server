import http from 'http';

import request from 'request';
import FormData from 'form-data';
import fs from 'fs';
import { createApolloFetch } from 'apollo-fetch';

import { gql, AuthenticationError, Config } from 'apollo-server-core';
import { ServerRegistration } from '../ApolloServer';

import {
  NODE_MAJOR_VERSION,
  testApolloServer,
  createServerInfo,
} from 'apollo-server-integration-testsuite';

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

// If we're on Node.js v6, skip this test, since `koa-bodyparser` has dropped
// support for it and there was an important update to it which we brought in
// through https://github.com/apollographql/apollo-server/pull/3229.
// It's worth noting that Node.js v6 has been out of Long-Term-Support status
// for four months and is no longer recommended by the Node.js Foundation.
(
  NODE_MAJOR_VERSION === 6 ?
  describe.skip :
  describe
)('apollo-server-koa', () => {
  const { ApolloServer } = require('../ApolloServer');
  const Koa = require('koa');
  let server: ApolloServer;
  let httpServer: http.Server;
  testApolloServer(
    async (options, suppressStartCall?: boolean) => {
      server = new ApolloServer(options);
      if (!suppressStartCall) {
        await server.start();
      }
      const app = new Koa();
      server.applyMiddleware({ app });
      httpServer = await new Promise<http.Server>(resolve => {
        const s = app.listen({ port: 0 }, () => resolve(s));
      });
      return createServerInfo(server, httpServer);
    },
    async () => {
      if (server) await server.stop();
      if (httpServer && httpServer.listening) await httpServer.close();
    },
  );
});

// If we're on Node.js v6, skip this test, since `koa-bodyparser` has dropped
// support for it and there was an important update to it which we brought in
// through https://github.com/apollographql/apollo-server/pull/3229.
// It's worth noting that Node.js v6 has been out of Long-Term-Support status
// for four months and is no longer recommended by the Node.js Foundation.
(
  NODE_MAJOR_VERSION === 6 ?
  describe.skip :
  describe
)('apollo-server-koa', () => {
  const Koa = require('koa');
  const { ApolloServer } = require('../ApolloServer');
  let server: import('../ApolloServer').ApolloServer;
  let app: import('koa');
  let httpServer: http.Server;

  async function createServer(
    serverOptions: Config,
    options: Partial<import('../ApolloServer').ServerRegistration> = {},
  ) {
    server = new ApolloServer({ stopOnTerminationSignals: false, ...serverOptions });
    app = new Koa();

    server.applyMiddleware({ ...options, app });

    httpServer = await new Promise(resolve => {
      const l: http.Server = app.listen({ port: 0 }, () => resolve(l));
    });

    return createServerInfo(server, httpServer);
  }

  afterEach(async () => {
    if (server) await server.stop();
    if (httpServer) await httpServer.close();
  });

  describe('constructor', () => {
    it('accepts typeDefs and resolvers', () => {
      return createServer({ typeDefs, resolvers });
    });
  });

  describe('applyMiddleware', () => {
    it('can be queried', async () => {
      const { url: uri } = await createServer({
        typeDefs,
        resolvers,
      });
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

      const { url: uri } = await createServer({
        typeDefs,
        resolvers,
        introspection: false,
      });

      const apolloFetch = createApolloFetch({ uri });
      const result = await apolloFetch({ query: INTROSPECTION_QUERY });

      expect(result.errors.length).toEqual(1);
      expect(result.errors[0].extensions.code).toEqual(
        'GRAPHQL_VALIDATION_FAILED',
      );

      return new Promise<http.Server>((resolve, reject) => {
        request(
          {
            url: uri,
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

      const { url } = await createServer({
        typeDefs,
        resolvers,
      });

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
      const { url: uri } = await createServer(
        {
          typeDefs,
          resolvers,
        },
        {
          cors: { origin: 'apollographql.com' },
        },
      );

      const apolloFetch = createApolloFetch({ uri })
        .use(({ options }, next) => {
          if (!options.headers) {
            options.headers = {}; // Create the headers object if needed.
          }
          options.headers['origin'] = 'apollographql.com';

          next();
        })
        .useAfter((response, next) => {
          expect(
            response.response.headers.get('access-control-allow-origin'),
          ).toEqual('apollographql.com');
          next();
        });
      await apolloFetch({ query: '{hello}' });
    });

    it('accepts body parser configuration', async () => {
      const { url: uri } = await createServer(
        {
          typeDefs,
          resolvers,
        },
        {
          bodyParserConfig: { jsonLimit: '0' },
        },
      );

      const apolloFetch = createApolloFetch({ uri });

      return new Promise((resolve, reject) => {
        apolloFetch({ query: '{hello}' })
          .then(reject)
          .catch(error => {
            expect(error.response).toBeDefined();
            expect(error.response.status).toEqual(413);
            expect(error.toString()).toMatch('Payload Too Large');
            resolve();
          });
      });
    });

    describe('healthchecks', () => {
      afterEach(async () => {
        await server.stop();
      });

      it('creates a healthcheck endpoint', async () => {
        const { port } = await createServer({
          typeDefs,
          resolvers,
        });

        return new Promise((resolve, reject) => {
          request(
            {
              url: `http://localhost:${port}/.well-known/apollo/server-health`,
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
        const { port } = await createServer(
          {
            typeDefs,
            resolvers,
          },
          {
            onHealthCheck: async () => {
              throw Error("can't connect to DB");
            },
          },
        );

        return new Promise((resolve, reject) => {
          request(
            {
              url: `http://localhost:${port}/.well-known/apollo/server-health`,
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
        const { port } = await createServer(
          {
            typeDefs,
            resolvers,
          },
          {
            disableHealthCheck: true,
          },
        );

        return new Promise((resolve, reject) => {
          request(
            {
              url: `http://localhost:${port}/.well-known/apollo/server-health`,
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
    // NODE: Skip Node.js 6 and 14, but only because `graphql-upload`
    // doesn't support them on the version we use.
    ([6, 14].includes(NODE_MAJOR_VERSION) ? describe.skip : describe)(
      'file uploads',
      () => {
        it('enabled uploads', async () => {
          const { port } = await createServer({
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
            const resolved = await fetch(`http://localhost:${port}/graphql`, {
              method: 'POST',
              body: body as any,
            });
            const text = await resolved.text();
            const response = JSON.parse(text);

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
      },
    );

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
        const { url: uri } = await createServer({
          typeDefs,
          resolvers,
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

      it('propogates error codes in dev mode', async () => {
        const nodeEnv = process.env.NODE_ENV;
        delete process.env.NODE_ENV;

        const { url: uri } = await createServer({
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
        });

        const apolloFetch = createApolloFetch({ uri });

        const result = await apolloFetch({ query: `{error}` });
        expect(result.data).toBeDefined();
        expect(result.data).toEqual({ error: null });

        expect(result.errors).toBeDefined();
        expect(result.errors.length).toEqual(1);
        expect(result.errors[0].extensions.code).toEqual('UNAUTHENTICATED');
        expect(result.errors[0].extensions.exception).toBeDefined();
        expect(result.errors[0].extensions.exception.stacktrace).toBeDefined();

        process.env.NODE_ENV = nodeEnv;
      });

      it('propogates error codes in production', async () => {
        const nodeEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';

        const { url: uri } = await createServer({
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
        });

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

        const { url: uri } = await createServer({
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
        });

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

  describe('extensions', () => {
    const books = [
      {
        title: 'H',
        author: 'J',
      },
    ];

    const typeDefs = gql`
      type Book {
        title: String
        author: String
      }

      type Cook @cacheControl(maxAge: 200) {
        title: String
        author: String
      }

      type Pook @cacheControl(maxAge: 200) {
        title: String
        books: [Book] @cacheControl(maxAge: 20, scope: PRIVATE)
      }

      type Query {
        books: [Book]
        cooks: [Cook]
        pooks: [Pook]
      }
    `;

    const resolvers = {
      Query: {
        books: () => books,
        cooks: () => books,
        pooks: () => [{ title: 'pook', books }],
      },
    };

    describe('Cache Control Headers', () => {
      it('applies cacheControl Headers and strips out extension', async () => {
        const { url: uri } = await createServer({ typeDefs, resolvers });

        const apolloFetch = createApolloFetch({ uri }).useAfter(
          (response, next) => {
            expect(response.response.headers.get('cache-control')).toEqual(
              'max-age=200, public',
            );
            next();
          },
        );
        const result = await apolloFetch({
          query: `{ cooks { title author } }`,
        });
        expect(result.data).toEqual({ cooks: books });
        expect(result.extensions).toBeUndefined();
      });

      it('contains no cacheControl Headers and keeps extension with engine proxy', async () => {
        const { url: uri } = await createServer({
          typeDefs,
          resolvers,
          cacheControl: true,
        });

        const apolloFetch = createApolloFetch({ uri }).useAfter(
          (response, next) => {
            expect(response.response.headers.get('cache-control')).toBeNull();
            next();
          },
        );
        const result = await apolloFetch({
          query: `{ cooks { title author } }`,
        });
        expect(result.data).toEqual({ cooks: books });
        expect(result.extensions).toBeDefined();
        expect(result.extensions.cacheControl).toBeDefined();
      });

      it('contains no cacheControl Headers when uncachable', async () => {
        const { url: uri } = await createServer({ typeDefs, resolvers });

        const apolloFetch = createApolloFetch({ uri }).useAfter(
          (response, next) => {
            expect(response.response.headers.get('cache-control')).toBeNull();
            next();
          },
        );
        const result = await apolloFetch({
          query: `{ books { title author } }`,
        });
        expect(result.data).toEqual({ books });
        expect(result.extensions).toBeUndefined();
      });

      it('contains private cacheControl Headers when scoped', async () => {
        const { url: uri } = await createServer({ typeDefs, resolvers });

        const apolloFetch = createApolloFetch({ uri }).useAfter(
          (response, next) => {
            expect(response.response.headers.get('cache-control')).toEqual(
              'max-age=20, private',
            );
            next();
          },
        );
        const result = await apolloFetch({
          query: `{ pooks { title books { title author } } }`,
        });
        expect(result.data).toEqual({
          pooks: [{ title: 'pook', books }],
        });
        expect(result.extensions).toBeUndefined();
      });

      it('runs when cache-control is false', async () => {
        const { url: uri } = await createServer({
          typeDefs,
          resolvers,
          cacheControl: false,
        });

        const apolloFetch = createApolloFetch({ uri }).useAfter(
          (response, next) => {
            expect(response.response.headers.get('cache-control')).toBeNull();
            next();
          },
        );
        const result = await apolloFetch({
          query: `{ pooks { title books { title author } } }`,
        });
        expect(result.data).toEqual({
          pooks: [{ title: 'pook', books }],
        });
        expect(result.extensions).toBeUndefined();
      });
    });

    describe('Tracing', () => {
      const typeDefs = gql`
        type Book {
          title: String
          author: String
        }

        type Query {
          books: [Book]
        }
      `;

      const resolvers = {
        Query: {
          books: () => books,
        },
      };

      it('applies tracing extension', async () => {
        const { url: uri } = await createServer({
          typeDefs,
          resolvers,
          tracing: true,
        });

        const apolloFetch = createApolloFetch({ uri });
        const result = await apolloFetch({
          query: `{ books { title author } }`,
        });
        expect(result.data).toEqual({ books });
        expect(result.extensions).toBeDefined();
        expect(result.extensions.tracing).toBeDefined();
      });

      it('applies tracing extension with cache control enabled', async () => {
        const { url: uri } = await createServer({
          typeDefs,
          resolvers,
          tracing: true,
          cacheControl: true,
        });

        const apolloFetch = createApolloFetch({ uri });
        const result = await apolloFetch({
          query: `{ books { title author } }`,
        });
        expect(result.data).toEqual({ books });
        expect(result.extensions).toBeDefined();
        expect(result.extensions.tracing).toBeDefined();
      });
    });
  });
});
