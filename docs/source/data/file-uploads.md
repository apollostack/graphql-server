---
title: File uploads
description: Enabling file uploads in Apollo Server
---

> Note: Apollo Server's built-in file upload mechanism is not fully supported in Node 14 and later, and it will be removed in Apollo Server 3. For details, [see below](#uploads-in-node-14-and-later).

For server integrations that support file uploads (e.g. Express, hapi, Koa), Apollo Server enables file uploads by default. To enable file uploads, reference the `Upload` type in the schema passed to the Apollo Server construction.

```js
const { ApolloServer, gql } = require('apollo-server');

const typeDefs = gql`
  type File {
    filename: String!
    mimetype: String!
    encoding: String!
  }

  type Query {
    uploads: [File]
  }

  type Mutation {
    singleUpload(file: Upload!): File!
  }
`;

const resolvers = {
  Query: {
    uploads: (parent, args) => {},
  },
  Mutation: {
    singleUpload: (parent, args) => {
      return args.file.then(file => {
        //Contents of Upload scalar: https://github.com/jaydenseric/graphql-upload#class-graphqlupload
        //file.createReadStream() is a readable node stream that contains the contents of the uploaded file
        //node stream api: https://nodejs.org/api/stream.html
        return file;
      });
    },
  },
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
});

server.listen().then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`);
});
```

> Note: When using `typeDefs`, Apollo Server adds `scalar Upload` to your schema, so any existing declaration of `scalar Upload` in the type definitions should be removed. If you create your schema with `makeExecutableSchema` and pass it to `ApolloServer` constructor using the `schema` param, make sure to include [`scalar Upload`](https://www.apollographql.com/docs/guides/file-uploads.html#File-upload-with-schema-param).

## Uploads in Node 14 and later

Apollo Server's built-in support for file uploads relies on an old version of the [`graphql-upload` npm package](https://www.npmjs.com/package/graphql-upload) for backward compatibility. This old version is not fully compatible with Node 14.

> To prevent similar backward compatibility issues in the future, Apollo Server 3 will not include built-in file upload support.

To use file uploads with Node 14, you can disable built-in support by passing `uploads: false` to [the `ApolloServer` constructor](../api/apollo-server/#uploads). You can then install and use the lastest version of `graphql-upload` directly ([see the documentation](https://www.npmjs.com/package/graphql-upload#graphql-upload)).
