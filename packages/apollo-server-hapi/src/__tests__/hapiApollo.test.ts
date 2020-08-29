import { ApolloServer } from '../ApolloServer';
import { Config } from 'apollo-server-core';

import testSuite, {
  schema as Schema,
  CreateAppOptions,
  NODE_MAJOR_VERSION,
} from 'apollo-server-integration-testsuite';

// NODE: Intentionally skip on Node.js < 12 since Hapi 19 doesn't support less
// Ref: https://github.com/hapijs/hapi/issues/4012
(NODE_MAJOR_VERSION < 12 ? describe.skip : describe)('integration:Hapi', () => {
  async function createApp(options: CreateAppOptions = {}) {
    const { Server } = require('@hapi/hapi');

    const app: import('@hapi/hapi').Server = new Server({
      host: 'localhost',
    });

    const server = new ApolloServer(
      (options.graphqlOptions as Config) || { schema: Schema },
    );
    await server.applyMiddleware({
      app,
    });

    await app.start();

    return app.listener;
  }

  async function destroyApp(app) {
    if (!app || !app.close) {
      return;
    }
    await new Promise(resolve => app.close(resolve));
  }

  testSuite(createApp, destroyApp);
});
