---
title: GraphiQL IDE
description: How to set up GraphiQL with Apollo Server to explore your API with docs and auto-completion.
---

Apollo Server allows you to easily use [GraphiQL](https://github.com/graphql/graphiql). Here's how:

## Configuring GraphiQL

`graphiql<Express/Connect/Hapi/Koa>` accepts the following options object:

```js
const options = {
  endpointURL: String, // URL for the GraphQL POST endpoint this instance of GraphiQL serves
  query?: String, // optional query to pre-populate the GraphiQL UI with
  operationName?: String, // optional operationName to pre-populate the GraphiQL UI with
  variables?: Object, // optional variables to pre-populate the GraphiQL UI with
  result?: Object, // optional result to pre-populate the GraphiQL UI with
  passHeader?: String, // a string that will be added to the outgoing request header object (e.g "'Authorization': 'Bearer lorem ipsum'")
  editorTheme?: String, // optional CodeMirror theme to be applied to the GraphiQL UI
  rewriteURL?: Boolean, // optionally turn off url rewriting when editing queries
}
```

Apollo Server's `graphiql` middleware does not run any query passed to it, it simply renders it in the UI.
To actually execute the query, the user must submit it via the GraphiQL UI, which will
send the request to the GraphQL endpoint specified with `endpointURL`.

## Using with Express

If you are using Express, GraphiQL can be configured as follows:

```js
import { graphiqlExpress } from 'apollo-server-express';

app.use(
  '/graphiql',
  graphiqlExpress({
    endpointURL: '/graphql',
  }),
);
```

## Using with Connect

If you are using Connect, GraphiQL can be configured as follows:

```js
import { graphiqlConnect } from 'apollo-server-express';

app.use(
  '/graphiql',
  graphiqlConnect({
    endpointURL: '/graphql',
  }),
);
```

## Using with Hapi

If you are using Hapi, GraphiQL can be configured as follows:

```js
import { graphiqlHapi } from 'apollo-server-hapi';

server.register({
  plugin: graphiqlHapi,
  options: {
    path: '/graphiql',
    graphiqlOptions: {
      endpointURL: '/graphql',
    },
  },
});
```

## Using with Koa 2

If you are using Koa 2, GraphiQL can be configured as follows:

```js
import graphiql from 'koa-graphiql';

router.get('/graphiql', graphiql(async (ctx) => ({
  //This the path to the existing graphql playground, because queries are resolved using already running graphql playground only.
  url: '/graphql',
})));
```
