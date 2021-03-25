import { ApolloServer } from '../ApolloServer';
import testSuite, {
  schema as Schema,
  CreateAppOptions,
} from 'apollo-server-integration-testsuite';
import { Config } from 'apollo-server-core';
import url from 'url';
import { IncomingMessage, ServerResponse } from 'http';

const healthCheckRequest = {
  method: 'GET',
  body: null,
  url: '/.well-known/apollo/server-health',
  query: null,
  headers: {},
};

const createAzureFunction = (options: CreateAppOptions = {}) => {
  const server = new ApolloServer(
    (options.graphqlOptions as Config) || { schema: Schema },
  );

  const handler = server.createHandler();

  return (req: IncomingMessage, res: ServerResponse) => {
    // return 404 if path is /bogus-route to pass the test, azure doesn't have paths
    if (req.url.includes('/bogus-route')) {
      res.statusCode = 404;
      return res.end();
    }

    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      const urlObject = url.parse(req.url, true);
      const request = {
        method: req.method,
        body: body && JSON.parse(body),
        path: req.url,
        query: urlObject.query,
        headers: req.headers,
      };
      const context = {
        done(error, result) {
          if (error) throw error;
          res.statusCode = result.status;
          for (let key in result.headers) {
            if (result.headers.hasOwnProperty(key)) {
              res.setHeader(key, result.headers[key]);
            }
          }
          res.write(result.body);
          res.end();
        },
      };
      handler(context as any, request as any);
    });
  };
};

describe('integration:AzureFunctions', () => {
  testSuite(createAzureFunction);

  it('can append CORS headers to GET request', async () => {
    const server = new ApolloServer({ schema: Schema });
    const handler = server.createHandler({
      cors: {
        origin: 'CORSOrigin',
        methods: ['GET', 'POST', 'PUT'],
        allowedHeaders: 'AllowedCORSHeader1,AllowedCORSHeader1',
        exposedHeaders: 'ExposedCORSHeader1,ExposedCORSHeader2',
        credentials: true,
        maxAge: 42,
      },
    });
    const expectedResult = {
      testString: 'it works',
    };
    const query = {
      query: 'query test{ testString }',
    };
    const request = {
      method: 'GET',
      body: null,
      url: '/graphql',
      query: query,
      headers: {},
    };
    const context: any = {};
    const p = new Promise((resolve, reject) => {
      context.done = (error: Error, result: any) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      };
    });
    handler(context as any, request as any);
    const result: any = await p;

    expect(result.status).toEqual(200);
    expect(result.body).toEqual(
      JSON.stringify({ data: expectedResult }) + '\n',
    );
    expect(result.headers['Access-Control-Allow-Origin']).toEqual('CORSOrigin');
    expect(result.headers['Access-Control-Allow-Methods']).toEqual(
      'GET,POST,PUT',
    );
    expect(result.headers['Access-Control-Allow-Headers']).toEqual(
      'AllowedCORSHeader1,AllowedCORSHeader1',
    );
    expect(result.headers['Access-Control-Expose-Headers']).toEqual(
      'ExposedCORSHeader1,ExposedCORSHeader2',
    );
    expect(result.headers['Access-Control-Allow-Credentials']).toEqual('true');
    expect(result.headers['Access-Control-Max-Age']).toEqual(42);
  });

  it('can handle OPTIONS request with CORS headers', () => {
    const server = new ApolloServer({ schema: Schema });
    const handler = server.createHandler({
      cors: {
        allowedHeaders: 'AllowedCORSHeader1,AllowedCORSHeader1',
      },
    });
    const request = {
      method: 'OPTIONS',
      body: null,
      url: '/graphql',
      query: null,
      headers: {},
    };
    const context = {
      done(error, result) {
        if (error) throw error;
        expect(result.status).toEqual(204);
        expect(result.headers['Access-Control-Allow-Headers']).toEqual(
          'AllowedCORSHeader1,AllowedCORSHeader1',
        );
      },
    };
    handler(context as any, request as any);
  });

  it('can return playground html', () => {
    const server = new ApolloServer({ schema: Schema });
    const handler = server.createHandler({});
    const request = {
      method: 'GET',
      body: null,
      url: '/',
      query: null,
      headers: {
        Accept: 'text/html',
      },
    };
    const context = {
      done(error, result) {
        if (error) throw error;
        expect(result.status).toEqual(200);
        expect(result.body).toMatch(/GraphQL Playground/gi);
        expect(result.headers['Content-Type']).toEqual('text/html');
      },
    };
    handler(context as any, request as any);
  });

  describe('healthchecks', () => {
    it('creates a healthcheck endpoint', async () => {
      const server = new ApolloServer({ schema: Schema });
      const handler = server.createHandler({});

      const context: any = {};
      const p = new Promise((resolve, reject) => {
        context.done = (error: Error, result: any) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        };
      });

      handler(context as any, healthCheckRequest as any);
      const result: any = await p;
      expect(result.statusCode).toEqual(200);
      expect(result.body).toEqual(JSON.stringify({ status: 'pass' }));
      expect(result.headers['Content-Type']).toEqual('application/health+json');
    });

    it('provides a callback for the healthcheck', async () => {
      const server = new ApolloServer({ schema: Schema });
      const handler = server.createHandler({
        onHealthCheck: async () => {
          return new Promise((resolve) => {
            return resolve("Success!");
          });
        }
      });

      const context: any = {};
      const p = new Promise((resolve, reject) => {
        context.done = (error: Error, result: any) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        };
      });

      handler(context as any, healthCheckRequest as any);
      const result: any = await p;
      expect(result.statusCode).toEqual(200);
      expect(result.body).toEqual(JSON.stringify({ status: 'pass' }));
      expect(result.headers['Content-Type']).toEqual('application/health+json');
    });

    it('returns a 503 if healthcheck fails', async () => {
      const server = new ApolloServer({ schema: Schema });
      const handler = server.createHandler({
        onHealthCheck: async () => {
          return new Promise(() => {
            throw new Error("Failed to connect!");
          });
        }
      });

      const context = {
        done(error, result) {
          if (error) throw error;
          expect(result.statusCode).toEqual(503);
          expect(result.body).toEqual(JSON.stringify({ status: 'fail' }));
          expect(result.headers['Content-Type']).toEqual('application/health+json');
        },
      };

      handler(context as any, healthCheckRequest as any);
    });
  });
});
