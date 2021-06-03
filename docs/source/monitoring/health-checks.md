---
title: Health checks
description: Determining the health status of the Apollo Server 
---

Health checks are often used by load balancers to determine if a server is available and ready to start serving traffic.  By default, Apollo Server provides a health check endpoint at `/.well-known/apollo/server-health` which returns a 200 status code if the server has started. One can also change the default path by supplying a `healthCheckPath` variable to the `ApolloServer` constructor options.

This basic health check may not be comprehensive enough for some applications and depending on individual circumstances, it may be beneficial to provide a more thorough implementation by defining an `onHealthCheck` function to the `ApolloServer` constructor options.  If defined, this `onHealthCheck` function should return a `Promise` which _rejects_ if there is an error, or _resolves_ if the server is deemed _ready_.  A `Promise` _rejection_ will result in an HTTP status code of 503, and a _resolution_ will result in an HTTP status code of 200, which is generally desired by most health-check tooling (e.g. Kubernetes, AWS, etc.).

> **Note:** Alternatively, the `onHealthCheck` can be defined as an `async` function which `throw`s if it encounters an error and returns when conditions are considered normal.

```js{10-19}
const { ApolloServer, gql } = require('apollo-server');

// Undefined for brevity.
const typeDefs = gql``;
const resolvers = {};

const server = new ApolloServer({
  typeDefs,
  resolvers,
  onHealthCheck: () => {
    return new Promise((resolve, reject) => {
      // Replace the `true` in this conditional with more specific checks!
      if (true) {
        resolve();
      } else {
        reject();
      }
    });
  },
});

server.listen().then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`);
  console.log(
    `Try your health check at: ${url}.well-known/apollo/server-health`,
  );
});
```
