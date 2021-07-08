---
title: Using a different version of graphql-tools
---

Apollo Server includes `graphql-tools` version 4 by default. If you want to use a newer version, you can do so with the following steps:

1. Install `graphql-tools` separately in your project.

2. Update your `ApolloServer` constructor to provide the `schema` option _instead of_ `typeDefs`, `resolvers`, and `schemaDirectives`. You instead pass these options to the `makeExecutableSchema` function, which you provide as the value of `schema`:

    ```js:title=index.js
    const { ApolloServer, gql } = require("apollo-server");
    const { makeExecutableSchema } = require("@graphql-tools/schema");

    const server = new ApolloServer({
      schema: makeExecutableSchema({
        typeDefs,
        resolvers,
        schemaDirectives: {
          // ...directive subclasses...
        }
      }),
      // ...other options...
    });
    ```

3. Add the following definitions to your schema `typeDefs`:

    ```graphql:title=schema.graphql
    enum CacheControlScope {
      PUBLIC
      PRIVATE
    }

    directive @cacheControl(
      maxAge: Int
      scope: CacheControlScope
    ) on FIELD_DEFINITION | OBJECT | INTERFACE

    scalar Upload
    ```

    Apollo Server uses these types for its [caching](./performance/caching/) and [file upload](./data/file-uploads/) functionality. It usually defines these types automatically on startup, but it _doesn't_ if you provide the `schema` option to the `ApolloServer` constructor.

For more information on the latest version of `graphql-tools`, see the [official documentation](https://www.graphql-tools.com/docs/introduction/).
