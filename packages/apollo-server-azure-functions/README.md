This is the Azure functions integration of GraphQL Server. Apollo Server is a community-maintained open-source GraphQL server that works with many Node.js HTTP server frameworks. [Read the docs](https://www.apollographql.com/docs/apollo-server/v2). [Read the CHANGELOG](https://github.com/apollographql/apollo-server/blob/main/CHANGELOG.md).

```shell
npm install apollo-server-azure-functions graphql
```

## Writing azure function

Azure functions currently support two runtime versions. This package assumes that function is running under **runtime 2.0**.

Azure functions typically consist of at least 2 files - index.js (function handler definition) and function.json (function settings and bindings).
For more information about azure functions development model in general, refer to [official Azure functions docs](https://docs.microsoft.com/en-us/azure/azure-functions/functions-reference-node).

Example index.js:

```js
const { gql, ApolloServer } = require("apollo-server-azure-functions");

// Construct a schema, using GraphQL schema language
const typeDefs = gql`
  type Query {
    hello: String
  }
`;

// A map of functions which return data for the schema.
const resolvers = {
  Query: {
    hello: () => "world"
  }
};

const server = new ApolloServer({ typeDefs, resolvers });

module.exports = server.createHandler();
```

Example function.json:
```json
{
  "disabled": false,
  "bindings": [
    {
      "authLevel": "function",
      "type": "httpTrigger",
      "direction": "in",
      "name": "req",
      "methods": [
        "get",
        "post"
      ]
    },
    {
      "type": "http",
      "direction": "out",
      "name": "$return"
    }
  ]
}
```

It is important to set output binding name to '$return' for apollo-server-azure-function to work correctly.

## Modifying the Azure Function Response (Enable CORS)

To enable CORS the response HTTP headers need to be modified. To accomplish this use the `cors` option.

```js
const { ApolloServer, gql } = require('apollo-server-azure-functions');

// Construct a schema, using GraphQL schema language
const typeDefs = gql`
  type Query {
    hello: String
  }
`;

// Provide resolver functions for your schema fields
const resolvers = {
  Query: {
    hello: () => 'Hello world!',
  },
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
});

module.exports = server.createHandler({
  cors: {
    origin: '*',
    credentials: true,
  },
});
```

To enable CORS response for requests with credentials (cookies, http authentication) the allow origin header must equal the request origin and the allow credential header must be set to true.

```js
const { ApolloServer, gql } = require('apollo-server-azure-functions');

// Construct a schema, using GraphQL schema language
const typeDefs = gql`
  type Query {
    hello: String
  }
`;

// Provide resolver functions for your schema fields
const resolvers = {
  Query: {
    hello: () => 'Hello world!',
  },
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
});

module.exports = server.createHandler({
  cors: {
    origin: true,
    credentials: true,
  },
});
```

### Cors Options

The options correspond to the [express cors configuration](https://github.com/expressjs/cors#configuration-options) with the following fields(all are optional):

* `origin`: boolean | string | string[]
* `methods`: string | string[]
* `allowedHeaders`: string | string[]
* `exposedHeaders`: string | string[]
* `credentials`: boolean
* `maxAge`: number

## Enabling health checks

To enable the health checks it's necessary to modify the route template in the `function.json` file. To accomplish this add the `*` wildcard to the `route` property into the `bindings` section.

```
{
  "disabled": false,
  "bindings": [
    {
      "authLevel": "function",
      "type": "httpTrigger",
      "direction": "in",
      "name": "req",
      "route": "{*segments}",
      "methods": [
        "get",
        "post"
      ]
    },
    {
      "type": "http",
      "direction": "out",
      "name": "$return"
    }
  ]
}
```

## Principles

GraphQL Server is built with the following principles in mind:

* **By the community, for the community**: GraphQL Server's development is driven by the needs of developers
* **Simplicity**: by keeping things simple, GraphQL Server is easier to use, easier to contribute to, and more secure
* **Performance**: GraphQL Server is well-tested and production-ready - no modifications needed

Anyone is welcome to contribute to GraphQL Server, just read [CONTRIBUTING.md](https://github.com/apollographql/apollo-server/blob/main/CONTRIBUTING.md), take a look at the [roadmap](https://github.com/apollographql/apollo-server/blob/main/ROADMAP.md) and make your first PR!
