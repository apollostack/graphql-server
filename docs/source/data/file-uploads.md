---
title: File uploads
description: Enabling file uploads in Apollo Server
---

You can add file upload support to Apollo Server via the third-party [`graphql-upload`](https://npm.im/graphql-upload) library. This package provides support for the `multipart/form-data` content-type.

**New in Apollo Server 3:** Apollo Server 3 does not contain a built-in integration with `graphql-upload` like in Apollo Server 2. Instead, the instructions below show how to integrate it yourself. You cannot do this with the "batteries-included" `apollo-server` library; you must use a web framework integration such as `apollo-server-express` instead. To implement similar functionality with another Node.js HTTP framework (e.g., Koa), see the [`graphql-upload` documentation](https://github.com/jaydenseric/graphql-upload) for more information. Some integrations might need to use `graphql-upload`'s `processRequest` directly.

```js
const express = require('express');
const { ApolloServer, gql } = require('apollo-server-express');
const {
  GraphQLUpload,
  graphqlUploadExpress, // A Koa implementation is also exported.
} = require('graphql-upload');
const { finished } = require('stream/promises');

const typeDefs = gql`
  # The implementation for this scalar is provided by the
  # 'GraphQLUpload' export from the 'graphql-upload' package
  # in the resolver map below.
  scalar Upload

  type File {
    filename: String!
    mimetype: String!
    encoding: String!
  }

  type Query {
    # This is only here to satisfy the requirement that at least one
    # field be present within the 'Query' type.  This example does not
    # demonstrate how to fetch uploads back.
    otherFields: Boolean!
  }

  type Mutation {
    # Multiple uploads are supported. See graphql-upload docs for details.
    singleUpload(file: Upload!): File!
  }
`;

const resolvers = {
  // This maps the `Upload` scalar to the implementation provided
  // by the `graphql-upload` package.
  Upload: GraphQLUpload,

  Mutation: {
    singleUpload: async (parent, { file }) => {
      const { createReadStream, filename, mimetype, encoding } = await file;

      // Invoking the `createReadStream` will return a Readable Stream.
      // See https://nodejs.org/api/stream.html#stream_readable_streams
      const stream = createReadStream();

      // This is purely for demonstration purposes and will overwrite the
      // local-file-output.txt in the current working directory on EACH upload.
      const out = require('fs').createWriteStream('local-file-output.txt');
      stream.pipe(out);
      await finished(out);

      return { filename, mimetype, encoding };
    },
  },
};

async function startServer() {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
  });
  await server.start();

  const app = express();

  // This middleware should be added before calling `applyMiddleware`.
  app.use(graphqlUploadExpress());

  server.applyMiddleware({ app });

  await new Promise(r => app.listen({ port: 4000 }, r));

  console.log(`🚀 Server ready at http://localhost:4000${server.graphqlPath}`);
}

startServer();
```

The following is an example for Fastify with `apollo-server-fastify`


```js
const { ApolloServer, gql } = require('apollo-server');
const { processRequest } = require('graphql-upload');
const { finished } = require('stream/promises');

const typeDefs = gql`
  # The implementation for this scalar is provided by the
  # 'GraphQLUpload' export from the 'graphql-upload' package
  # in the resolver map below.
  scalar Upload

  type File {
    filename: String!
    mimetype: String!
    encoding: String!
  }

  type Query {
    # This is only here to satisfy the requirement that at least one
    # field be present within the 'Query' type.  This example does not
    # demonstrate how to fetch uploads back.
    otherFields: Boolean!
  }

  type Mutation {
    # Multiple uploads are supported. See graphql-upload docs for details.
    singleUpload(file: Upload!): File!
  }
`;

const resolvers = {
  // This maps the `Upload` scalar to the implementation provided
  // by the `graphql-upload` package.
  Upload: GraphQLUpload,

  Mutation: {
    singleUpload: async (parent, { file }) => {
      const { createReadStream, filename, mimetype, encoding } = await file;

      // Invoking the `createReadStream` will return a Readable Stream.
      // See https://nodejs.org/api/stream.html#stream_readable_streams
      const stream = createReadStream();

      // This is purely for demonstration purposes and will overwrite the
      // local-file-output.txt in the current working directory on EACH upload.
      const out = require('fs').createWriteStream('local-file-output.txt');
      stream.pipe(out);
      await finished(out);

      return { filename, mimetype, encoding };
    },
  },
};

const app = require('fastify')({
  logger: true
});

const start = async () => {
  try {
    // Handle all requests that have the `Content-Type` header set as mutlipart
    app.addContentTypeParser('multipart', (request, payload, done) => {
      request.isMultipart = true;
      done();
    });

    // Format the request body to follow graphql-upload's
    app.addHook('preValidation', async function (request, reply) {
      if (!request.isMultipart) {
        return;
      }

      request.body = await processRequest(request.raw, reply.res);
    });

    const server = new ApolloServer({
      typeDefs,
      resolvers,
    });

    // Start Apollo Server
    await server.start();

    app.register(server.createHandler());
    await app.listen(3000);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

export default start().then(async () => {
  app.log.info(`🚀 Server ready at http://localhost:3000${server.graphqlPath}`);
});
```
