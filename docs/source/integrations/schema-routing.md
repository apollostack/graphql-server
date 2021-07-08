---
title: Dynamic schema routing
sidebar_title: Dynamic schema routing
description: Dynamically switching the schema on a per-request basis.
---

In some cases, you might want to expose different schemas to different users based on arbitrary criteria. For instance: presenting privileged users with an augmented version of your schema whilst keeping the public API stable/less complex.

You can use dynamic schema routing to implement this functionality. Here's an Express example that selects a different schema based on a query string:

```js
const express = require('express');
const { ApolloServer } = require('apollo-server-express');
const { publicSchema, protectedSchema } = require('./schemas');

async function startApolloServer() {
  const app = express();
  const server = new ApolloServer({
    schema: publicSchema,
    schemaRouter: async ({ req }) => {
      if (req && req.query["role"] === "admin")
        return protectedSchema;
    }
  });

  await server.start();

  server.applyMiddleware({ app });

  await new Promise(resolve => app.listen({ port: 4000 }, resolve));
  console.log(`🚀 Server ready at http://localhost:4000${server.graphqlPath}`);
  return { server, app };
}
```

In a real world scenario this could be done by having your authentication middleware load the user's session and attach the relevant authorization flags to the request object.

> Note that this should **not** replace proper authorization. You should always secure your schema with proper access control.
