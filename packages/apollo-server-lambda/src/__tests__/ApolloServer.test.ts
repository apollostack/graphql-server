import http from 'http';
import request from 'supertest';
import express from 'express';
import { createMockServer } from './mockAPIGatewayServer';
import { Config, gql } from 'apollo-server-core';
import {
  ApolloServer,
  CreateHandlerOptions,
  LambdaContextFunctionParams,
} from '../ApolloServer';
import {
  createServerInfo,
  testApolloServer,
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

describe('apollo-server-lambda', () => {
  let server: ApolloServer;
  let httpServer: http.Server;
  testApolloServer(
    async (config: Config, options) => {
      server = new ApolloServer(config);
      // Ignore suppressStartCall because serverless ApolloServers don't
      // get `start`ed.
      const lambdaHandler = server.createHandler({
        expressGetMiddlewareOptions: { path: options?.graphqlPath },
      });
      const httpHandler = createMockServer(lambdaHandler);
      httpServer = new http.Server(httpHandler);
      await new Promise<void>((resolve) => {
        httpServer.listen({ port: 0 }, () => resolve());
      });
      return createServerInfo(server, httpServer);
    },
    async () => {
      if (httpServer && httpServer.listening) {
        await new Promise<void>((resolve) => {
          httpServer.close(() => resolve());
        });
      }
      if (server) await server.stop();
    },
    { serverlessFramework: true },
  );

  const createLambda = (
    createHandlerOptions: CreateHandlerOptions = {},
    config: Config<LambdaContextFunctionParams> = { typeDefs, resolvers },
  ) => {
    const server = new ApolloServer(config);
    const handler = server.createHandler(createHandlerOptions);
    return createMockServer(handler);
  };

  describe('context', () => {
    it('context functions typecheck', async () => {
      // We want to make sure that TS allows you to write the context function
      // arguments. Note that the calls to createLambda that set context below
      // are only good enough if we're confident that the declaration of the
      // `config` argument on `createLambda` above matches the generics used in
      // ApolloServer itself, so it's reasonable for us to validate against
      // ApolloServer directly.
      new ApolloServer({
        typeDefs: 'type Query { x: Int }',
        context({ event: _event, context: _context, express }) {
          const { req: _req, res: _res } = express;
        },
      });
    });

    it('receives both Express and Lambda context', async () => {
      const app = createLambda(
        {},
        {
          typeDefs: 'type Query { context: String }',
          resolvers: {
            Query: {
              context: (_parent, _args, context) => JSON.stringify(context),
            },
          },
          // Add something interesting from each context argument part to the
          // context.
          context({ event, context, express }) {
            const { req, res } = express;
            return {
              reqHttpVersion: req.httpVersion,
              resHasApp: !!res.app,
              eventVersion: event.version,
              contextFunctionName: context.functionName,
            };
          },
        },
      );
      await request(app)
        .post('/graphql')
        .send({ query: '{context}' })
        .expect(200)
        .expect((res) => {
          expect(typeof res.body.data.context).toBe('string');
          const context = JSON.parse(res.body.data.context);
          expect(context).toEqual({
            reqHttpVersion: '1.1',
            resHasApp: true,
            eventVersion: '2.0',
            contextFunctionName: 'someFunc',
          });
        });
    });
  });

  it('expressAppFromMiddleware', async () => {
    const app = createLambda({
      expressAppFromMiddleware(middleware) {
        const app = express();
        app.get('/lambda-test', (_req, res) => {
          res.send('some body');
        });
        app.use(middleware);
        return app;
      },
    });
    await request(app).get('/lambda-test').expect(200, 'some body');
  });

  describe('healthchecks', () => {
    it('creates a healthcheck endpoint', async () => {
      const app = createLambda();

      const req = request(app).get('/.well-known/apollo/server-health');

      return req.then((res: any) => {
        expect(res.status).toEqual(200);
        expect(res.body).toEqual({ status: 'pass' });
        expect(res.headers['content-type']).toEqual(
          'application/health+json; charset=utf-8',
        );
      });
    });

    it('provides a callback for the healthcheck', async () => {
      const app = createLambda({
        expressGetMiddlewareOptions: {
          onHealthCheck: async () => {
            return new Promise((resolve) => {
              return resolve('Success!');
            });
          },
        },
      });

      const req = request(app).get('/.well-known/apollo/server-health');

      return req.then((res: any) => {
        expect(res.status).toEqual(200);
        expect(res.body).toEqual({ status: 'pass' });
        expect(res.headers['content-type']).toEqual(
          'application/health+json; charset=utf-8',
        );
      });
    });

    it('returns a 503 if healthcheck fails', async () => {
      const app = createLambda({
        expressGetMiddlewareOptions: {
          onHealthCheck: async () => {
            return new Promise(() => {
              throw new Error('Failed to connect!');
            });
          },
        },
      });

      const req = request(app).get('/.well-known/apollo/server-health');

      return req.then((res: any) => {
        expect(res.status).toEqual(503);
        expect(res.body).toEqual({ status: 'fail' });
        expect(res.headers['content-type']).toEqual(
          'application/health+json; charset=utf-8',
        );
      });
    });
  });
});
