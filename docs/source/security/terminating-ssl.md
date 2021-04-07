---
title: Terminating SSL
---

Most production environments include a load balancer or HTTP proxy (such as nginx)
that performs SSL termination on behalf of web applications that it serves.

If you are using Apollo Server in an application that must perform its _own_ SSL
termination, you can use the `https` module with the `apollo-server-express` [middleware
library](/integrations/middleware/).

Here's an example that uses HTTPS in production and HTTP in development:

```javascript
import express from 'express';
import { ApolloServer } from 'apollo-server-express';
import typeDefs from './graphql/schema';
import resolvers from './graphql/resolvers';
import fs from 'fs';
import https from 'https';
import http from 'http';

async function startApolloServer() {
  const configurations = {
    // Note: You may need sudo to run on port 443
    production: { ssl: true, port: 443, hostname: 'example.com' },
    development: { ssl: false, port: 4000, hostname: 'localhost' },
  };

  const environment = process.env.NODE_ENV || 'production';
  const config = configurations[environment];

  const server = new ApolloServer({ typeDefs, resolvers });
  await server.start();

  const app = express();
  server.applyMiddleware({ app });

  // Create the HTTPS or HTTP server, per configuration
  let server;
  if (config.ssl) {
    // Assumes certificates are in a .ssl folder off of the package root. Make sure
    // these files are secured.
    server = https.createServer(
      {
        key: fs.readFileSync(`./ssl/${environment}/server.key`),
        cert: fs.readFileSync(`./ssl/${environment}/server.crt`)
      },
      app,
    );
  } else {
    server = http.createServer(app);
  }

  await new Promise(resolve => server.listen({ port: config.port }, resolve));
  console.log(
    '🚀 Server ready at',
    `http${config.ssl ? 's' : ''}://${config.hostname}:${config.port}${server.graphqlPath}`
  );
  return { server, app };
}
```
