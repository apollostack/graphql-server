import { createConnection } from 'net';
import request from 'request';
import { createApolloFetch } from 'apollo-fetch';
import resolvable from '@josephg/resolvable';

import { gql, ApolloServer } from '../index';

const typeDefs = gql`
  type Query {
    hello: String
    hang: String
  }
`;

const resolvers = {
  Query: {
    hello: () => 'hi',
  },
};

describe('apollo-server', () => {
  describe('constructor', () => {
    it('accepts typeDefs and resolvers', () => {
      expect(() => new ApolloServer({ typeDefs, resolvers })).not.toThrow;
    });

    it('accepts typeDefs and mocks', () => {
      expect(() => new ApolloServer({ typeDefs, mocks: true })).not.toThrow;
    });

    it('runs serverWillStart and serverWillStop', async () => {
      const fn = jest.fn();
      const beAsync = () => new Promise((res) => res());
      const server = new ApolloServer({
        typeDefs,
        resolvers,
        plugins: [
          {
            async serverWillStart() {
              fn('a');
              await beAsync();
              fn('b');
              return {
                async serverWillStop() {
                  fn('c');
                  await beAsync();
                  fn('d');
                },
              };
            },
          },
        ],
      });
      await server.listen();
      expect(fn.mock.calls).toEqual([['a'], ['b']]);
      await server.stop();
      expect(fn.mock.calls).toEqual([['a'], ['b'], ['c'], ['d']]);
    });

    describe('stops even with open HTTP connections', () => {
      it('all connections are idle', async () => {
        const server = new ApolloServer({
          typeDefs,
          resolvers,
          // Disable killing non-idle connections. This means the test will only
          // pass if the fast graceful close of the idle connection works.
          stopGracePeriodMillis: Infinity,
        });
        const { port } = await server.listen({ port: 0 });

        // Open a TCP connection to the server, and let it dangle idle
        // without starting a request.
        const connectionBarrier = resolvable();
        createConnection({ host: 'localhost', port: port as number }, () =>
          connectionBarrier.resolve(),
        );
        await connectionBarrier;

        // Stop the server. Before, when this was just net.Server.close, this
        // would hang. Now that we use stoppable, the idle connection is immediately
        // killed.
        await server.stop();
      });

      it('a connection with an active HTTP request', async () => {
        const gotToHangBarrier = resolvable();
        const hangBarrier = resolvable();
        const server = new ApolloServer({
          typeDefs,
          resolvers: {
            ...resolvers,
            Query: {
              ...resolvers.Query,
              async hang() {
                gotToHangBarrier.resolve();
                await hangBarrier; // never unblocks
              },
            },
          },
          // A short grace period, because we're going to actually let this
          // strike.
          stopGracePeriodMillis: 10,
        });
        const { url } = await server.listen({ port: 0 });

        // Start an HTTP request that won't ever finish. (Ignore the very
        // expected error that happens after the server is stopped.)
        const apolloFetch = createApolloFetch({ uri: url });
        apolloFetch({ query: '{hang}' }).catch(() => {});
        await gotToHangBarrier;

        // Stop the server. Before, when this was just net.Server.close, this
        // would hang. Now that we use stoppable, the idle connection is immediately
        // killed.
        await server.stop();
      });
    });

    // These tests are duplicates of ones in apollo-server-integration-testsuite
    // We don't actually expect Jest to do much here, the purpose of these
    // tests is to make sure our typings are correct, and to trigger a
    // compile error if they aren't
    describe('context field', () => {
      describe('as a function', () => {
        it('can accept and return `req`', () => {
          expect(
            new ApolloServer({
              typeDefs,
              resolvers,
              context: ({ req }) => ({ req }),
            }),
          ).not.toThrow;
        });

        it('can accept nothing and return an empty object', () => {
          expect(
            new ApolloServer({
              typeDefs,
              resolvers,
              context: () => ({}),
            }),
          ).not.toThrow;
        });
      });
    });
    describe('as an object', () => {
      it('can be an empty object', () => {
        expect(
          new ApolloServer({
            typeDefs,
            resolvers,
            context: {},
          }),
        ).not.toThrow;
      });

      it('can contain arbitrary values', () => {
        expect(
          new ApolloServer({
            typeDefs,
            resolvers,
            context: { value: 'arbitrary' },
          }),
        ).not.toThrow;
      });
    });
  });

  describe('without registerServer', () => {
    let server: ApolloServer;
    afterEach(async () => {
      await server.stop();
    });

    it('can be queried', async () => {
      server = new ApolloServer({
        typeDefs,
        resolvers,
      });

      const { url: uri } = await server.listen({ port: 0 });
      const apolloFetch = createApolloFetch({ uri });
      const result = await apolloFetch({ query: '{hello}' });

      expect(result.data).toEqual({ hello: 'hi' });
      expect(result.errors).toBeUndefined();
    });

    it('renders GraphQL playground when browser requests', async () => {
      const nodeEnv = process.env.NODE_ENV;
      delete process.env.NODE_ENV;

      server = new ApolloServer({
        typeDefs,
        resolvers,
        stopOnTerminationSignals: false,
      });

      const { url } = await server.listen({ port: 0 });
      return new Promise((resolve, reject) => {
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

    it('configures cors', async () => {
      server = new ApolloServer({
        typeDefs,
        resolvers,
      });

      const { url: uri } = await server.listen({ port: 0 });

      const apolloFetch = createApolloFetch({ uri }).useAfter(
        (response, next) => {
          expect(
            response.response.headers.get('access-control-allow-origin'),
          ).toEqual('*');
          next();
        },
      );
      await apolloFetch({ query: '{hello}' });
    });

    it('configures cors', async () => {
      server = new ApolloServer({
        typeDefs,
        resolvers,
        cors: { origin: 'localhost' },
      });

      const { url: uri } = await server.listen({ port: 0 });

      const apolloFetch = createApolloFetch({ uri }).useAfter(
        (response, next) => {
          expect(
            response.response.headers.get('access-control-allow-origin'),
          ).toEqual('localhost');
          next();
        },
      );
      await apolloFetch({ query: '{hello}' });
    });

    it('creates a healthcheck endpoint', async () => {
      server = new ApolloServer({
        typeDefs,
        resolvers,
      });

      const { port } = await server.listen({ port: 0 });
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
  });
});
