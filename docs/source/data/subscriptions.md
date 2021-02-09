---
title: Subscriptions
subtitle: Adding subscriptions to Apollo Server
---

Subscriptions are GraphQL operations that watch events emitted from Apollo Server.
The native Apollo Server supports GraphQL subscriptions without additional configuration.
All integrations that allow HTTP servers, such as express and Hapi, also provide GraphQL subscriptions.

## Subscriptions Example

Subscriptions depend on use of a publish and subscribe primitive to generate the events that notify a subscription. `PubSub` is a factory that creates event generators that is provided by all supported packages. `PubSub` is an implementation of the `PubSubEngine` interface, which has been adopted by a variety of additional [event-generating backends](#pubsub-implementations).

```js
const { PubSub } = require('apollo-server');

const pubsub = new PubSub();
```

Subscriptions are another root level type, similar to Query and Mutation. To start, we need to add the `Subscription` type to our schema:

```js{2-4}
const typeDefs = gql`
  type Subscription {
    postAdded: Post
  }

  type Query {
    posts: [Post]
  }

  type Mutation {
    addPost(author: String, comment: String): Post
  }

  type Post {
    author: String
    comment: String
  }
`
```

Inside our resolver map, we add a Subscription resolver that returns an `AsyncIterator`, which listens to the events asynchronously. To generate events in the example, we notified the `pubsub` implementation inside of our Mutation resolver with `publish`. This `publish` call can occur outside of a resolver if required.

```js{4-9,17}
const POST_ADDED = 'POST_ADDED';

const resolvers = {
  Subscription: {
    postAdded: {
      // Additional event labels can be passed to asyncIterator creation
      subscribe: () => pubsub.asyncIterator([POST_ADDED]),
    },
  },
  Query: {
    posts(root, args, context) {
      return postController.posts();
    },
  },
  Mutation: {
    addPost(root, args, context) {
      pubsub.publish(POST_ADDED, { postAdded: args });
      return postController.addPost(args);
    },
  },
};
```

## Context with Subscriptions

The function to create a context for subscriptions includes `connection`, while the function for Queries and Mutations contains the arguments for the integration, in express's case `req` and `res`. This means that the context creation function needs to check the input. This is especially important, since the auth tokens are handled differently depending on the transport:

```js
const server = new ApolloServer({
  schema,
  context: async ({ req, connection }) => {
    if (connection) {
      // check connection for metadata
      return connection.context;
    } else {
      // check from req
      const token = req.headers.authorization || "";

      return { token };
    }
  },
});
```

> `connection` contains various metadata, found [here](https://github.com/apollographql/subscriptions-transport-ws/blob/88970eaf6d2e3f68f98696de00631acf4062c088/src/server.ts#L312-L321).

As you can see Apollo Server 2.0 allows realtime data without invasive changes to existing code.
For a full working example please have a look to [this repo](https://github.com/daniele-zurico/apollo2-subscriptions-how-to) provided by [Daniele Zurico](https://github.com/daniele-zurico/apollo2-subscriptions-how-to)

## Authentication Over WebSocket

To support an authenticated transport, Apollo Server provides lifecycle hooks, including `onConnect` to validate the connection.

On the client, `SubscriptionsClient` supports adding token information to `connectionParams` ([example](https://www.apollographql.com/docs/react/advanced/subscriptions/#authentication-over-websocket)) that will be sent with the first WebSocket message. In the server, all GraphQL subscriptions are delayed until the connection has been fully authenticated and the `onConnect` callback returns a truthy value.

The `connectionParams` argument in the `onConnect` callback contains the information passed by the client and can be used to validate user credentials.
The GraphQL context can also be extended with the authenticated user data to enable fine grain authorization.

```js
const { ApolloServer } = require('apollo-server');
const { resolvers, typeDefs } = require('./schema');

const validateToken = authToken => {
  // ... validate token and return a Promise, rejects in case of an error
};

const findUser = authToken => {
  return tokenValidationResult => {
    // ... finds user by auth token and return a Promise, rejects in case of an error
  };
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
  subscriptions: {
    onConnect: (connectionParams, webSocket) => {
      if (connectionParams.authToken) {
        return validateToken(connectionParams.authToken)
          .then(findUser(connectionParams.authToken))
          .then(user => {
            return {
              currentUser: user,
            };
          });
      }

      throw new Error('Missing auth token!');
    },
  },
});

server.listen().then(({ url, subscriptionsUrl }) => {
  console.log(`🚀 Server ready at ${url}`);
  console.log(`🚀 Subscriptions ready at ${subscriptionsUrl}`);
});
```

The example above validates the user's token that is sent with the first initialization message on the transport, then it looks up the user and returns the user object as a Promise. The user object found will be available as `context.currentUser` in your GraphQL resolvers.

In case of an authentication error, the Promise will be rejected, which prevents the client's connection.

## Track user over connection

There is way to pass data from `onConnect` context parameter to `onDisconnect` context. It is useful in case of tracking online users. Example below demostrate traking user by id using jwt token.

```
subscriptions: {
  onConnect: (connectionParams) => {
    const accessToken = connectionParams['Authorization'];
    let user;
    try {
      // jwt magic
      user = this.jwtService.verifyToken(accessToken, 'accessToken');

      console.log(`user with id ${user.id} connected.`);

      return { user };
    } catch (e) {
      // do not fire error to allow unauthorized access to subscriptions
    }
  },
  onDisconnect: async (_, context) => {
    const initialContext = await context.initPromise;
    console.log(`user with id ${initialContext.user.id} disconnected.`);
  },
}
```

## Subscription Filters

Sometimes a client will want to filter out specific events based on context and arguments.

To do so, we can use the `withFilter` helper from the `apollo-server` or `apollo-server-{integration}` package to control each publication for each user. Inside of `withFilter`,  the `AsyncIterator` created by `PubSub` is wrapped with a filter function.

Let's see an example - for the `commentAdded` server-side subscription, the client want to subscribe only to comments added to a specific repo:

```
subscription($repoName: String!){
  commentAdded(repoFullName: $repoName) {
    id
    content
  }
}
```

When using `withFilter`, provide a filter function. The filter is executed with the payload (a published value), variables, context and operation info. This function must return a `boolean` or `Promise<boolean>` indicating if the payload should be passed to the subscriber.

The following definition of the subscription resolver will filter out all of the `commentAdded` events that are not associated with the requested repository:

```js{8,10-12}
const { withFilter } = require('apollo-server');

const resolvers = {
    Query: () => { ... },
    Mutation: () => { ... },
    Subscription: {
        commentAdded: {
          subscribe: withFilter(
            () => pubsub.asyncIterator('COMMENT_ADDED'),
            (payload, variables) => {
             return payload.commentAdded.repository_name === variables.repoFullName;
            },
          ),
        }
    },
};
```

## Subscriptions with Additional Middleware

With an existing HTTP server (created with `createServer`), we can add subscriptions using the `installSubscriptionHandlers`. Additionally, the subscription-capable integrations export `PubSub` and other subscription functionality.

For example: with an Express server already running on port 4000 that accepts GraphQL HTTP connections (POST) we can expose the subscriptions:

```js
const http = require('http');
const { ApolloServer } = require('apollo-server-express');
const express = require('express');

const PORT = 4000;
const app = express();
const server = new ApolloServer({ typeDefs, resolvers });

server.applyMiddleware({app})

const httpServer = http.createServer(app);
server.installSubscriptionHandlers(httpServer); // highlight-line

// ⚠️ Pay attention to the fact that we are calling `listen` on the http server variable, and not on `app`.
httpServer.listen(PORT, () => {
  console.log(`🚀 Server ready at http://localhost:${PORT}${server.graphqlPath}`)
  console.log(`🚀 Subscriptions ready at ws://localhost:${PORT}${server.subscriptionsPath}`)
})
```

## Lifecycle Events

`ApolloServer` exposes lifecycle hooks you can use to manage subscriptions and clients:

* `onConnect` - called upon client connection, with the `connectionParams` passed to `SubscriptionsClient` - you can return a Promise and reject the connection by throwing an exception. The resolved return value will be appended to the GraphQL `context` of your subscriptions.
* `onDisconnect` - called when the client disconnects.

```js
const server = new ApolloServer(
  subscriptions: {
    onConnect: (connectionParams, webSocket, context) => {
      // ...
    },
    onDisconnect: (webSocket, context) => {
      // ...
    },
  },
);
```

## `PubSub` Implementations

> **Please note**: By default `graphql-subscriptions` exports an in-memory (`EventEmitter`) event system to re-run subscriptions. This is not suitable for running in a serious production app, because there is no way to share subscriptions and publishes across many running servers.
>
> We recommend using one of the external `PubSub` implementations listed below for production environments.

The Apollo Server implementation of `PubSub` can be replaced by another implementations of [PubSubEngine interface](https://github.com/apollographql/graphql-subscriptions/blob/master/src/pubsub-engine.ts). The community has created the following integrations:

- [Redis](https://github.com/davidyaha/graphql-redis-subscriptions)
- [Google PubSub](https://github.com/axelspringer/graphql-google-pubsub)
- [MQTT enabled broker](https://github.com/davidyaha/graphql-mqtt-subscriptions)
- [RabbitMQ](https://github.com/cdmbase/graphql-rabbitmq-subscriptions)
- [Kafka](https://github.com/ancashoria/graphql-kafka-subscriptions)
- [Postgres](https://github.com/GraphQLCollege/graphql-postgres-subscriptions)
- [Google Cloud Firestore](https://github.com/MrBoolean/graphql-firestore-subscriptions)
- [Add your implementation...](https://github.com/apollographql/apollo-server/pull/new/main)

You can implement a `PubSub` of your own, using the exported `PubSubEngine` interface from `apollo-server` or another integration. If you want to set up a GraphQL server using the `graphql-subscriptions` package (not recommended for production), follow [this guide](https://www.apollographql.com/docs/graphql-subscriptions/).
