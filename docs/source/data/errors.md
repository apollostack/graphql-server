---
title: Error handling
description: Making errors actionable on the client and server
---

Apollo Server provides a collection of predefined errors, including
`AuthenticationError`, `ForbiddenError`, `UserInputError`, and a generic
`ApolloError`. These errors are designed to enhance errors thrown before and during GraphQL execution, making it easier to debug your Apollo Server integration and enabling clients to take specific actions based on an error.

When an error occurs in Apollo Server both inside and outside of resolvers, each error inside of the `errors` array contains an `extensions` object that contains the information added by Apollo Server.

## Default information

The first step to improving the usability of a server is providing the error stack trace by default. The following example demonstrates the response returned from Apollo Server with a resolver that throws a node [`SystemError`](https://nodejs.org/api/errors.html#errors_system_errors).

```js{14-16}
const {
  ApolloServer,
  gql,
} = require('apollo-server');

const typeDefs = gql`
  type Query {
    readError: String
  }
`;

const resolvers = {
  Query: {
    readError: (parent, args, context) => {
      fs.readFileSync('/does/not/exist');
    },
  },
};
```

The response will return:

![Screenshot demonstrating an error stacktrace and additional](../images/features/error-stacktrace.png)

> To disable stacktraces for production, pass `debug: false` to the Apollo Server constructor or set the `NODE_ENV` environment variable to 'production' or 'test'. Note that this will make the stacktrace unavailable to your application. If you want to log the stacktrace, but not send it in the response to the client, see [Masking and logging errors](#masking-and-logging-errors) below.

## Codes

In addition to stacktraces, Apollo Server's exported errors specify a human-readable string in the `code` field of `extensions` that enables the client to perform corrective actions. In addition to improving the client experience, the `code` field allows the server to categorize errors. For example, an `AuthenticationError` sets the code to `UNAUTHENTICATED`, which enables the client to reauthenticate and would generally be ignored as a server anomaly.

```js{4,15-17}
const {
  ApolloServer,
  gql,
  AuthenticationError,
} = require('apollo-server');

const typeDefs = gql`
  type Query {
    authenticationError: String
  }
`;

const resolvers = {
  Query: {
    authenticationError: (parent, args, context) => {
      throw new AuthenticationError('must authenticate');
    },
  },
};
```

The response will return:

![Screenshot demonstrating unauthenticated error code](../images/features/error-code.png)

## Augmenting error details

When clients provide bad input, you may want to return additional information
like a localized message for each field or argument that was invalid. The
following example demonstrates how you can use `UserInputError` to augment
your error messages with additional details.

```js{15-21}
const {
  ApolloServer,
  UserInputError,
  gql,
} = require('apollo-server');

const typeDefs = gql`
  type Mutation {
    userInputError(input: String): String
  }
`;

const resolvers = {
  Mutation: {
    userInputError: (parent, args, context, info) => {
      if (args.input !== 'expected') {
        throw new UserInputError('Form Arguments invalid', {
          invalidArgs: Object.keys(args),
        });
      }
    },
  },
};
```

The response will return:

![Screenshot demonstrating augmented error](../images/features/error-user-input.png)

## Other errors

If you need to define other error codes that are specific to your
application, you can use the base `ApolloError` class.

```js
new ApolloError(message, code, additionalProperties);
```

## Masking and logging errors

### For the client response

The Apollo Server constructor accepts a `formatError` function that is run on each error passed back to the client. This can be used to mask errors as well as for logging. Note that in production, you must `debug: true` when creating the server; otherwise, `formatError` will only send `INTERNAL_SERVER_ERROR`s.

> Note that while this changes the error which is sent to the client, it doesn't change the error that is sent to Apollo Studio.  See the `rewriteError` function in [For Apollo Studio reporting](#for-apollo-studio-reporting) below if this behavior is desired.

This example demonstrates throwing a different error when the error's message starts with `Database Error: `:

```js{4-10}
const server = new ApolloServer({
  typeDefs,
  resolvers,
  debug: true,
  formatError: (err) => {
    // Don't give the specific errors to the client.
    if (err.message.startsWith("Database Error: ")) {
      return new Error('Internal server error');
    }

    // Otherwise return the original error.  The error can also
    // be manipulated in other ways, so long as it's returned.
    return err;
  },
});

server.listen().then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`);
});
```

The error instance received by `formatError` (a `GraphQLError`) contains an `originalError` property which represents the original error thrown within the resolver.  This can be used to `instanceof` check against a specific error class, such as `AuthenticationError`, `ValidationError`, etc.:

```js
  /* ... */
  formatError(err) {
    if (err.originalError instanceof AuthenticationError) {
      return new Error('Different authentication error message!');
    }
  },
  /* ... */
```

> To make context-specific adjustments to the error received by `formatError` (e.g. localization or personalization), consider using the `didEncounterErrors` lifecycle hook to attach additional properties to the error, which can be accessed and utilized within `formatError`.

### For Apollo Studio reporting

You can use Apollo Studio to analyze error rates instead of simply logging errors to the console. If you connect Apollo Server to Studio, all errors are sent to Studio by default. If you _don't_ want certain error information to be sent to Studio (either because the error is unimportant or because certain information is confidential), you can modify or redact errors entirely before they're transmitted.

To account for these needs, a `rewriteError` function can be passed to the [usage reporting plugin](../api/plugin/usage-reporting/). (The usage reporting plugin is installed automatically with its default configuration when you specify an Apollo API key; you will need to install it explicitly in your `ApolloServer` in order to configure `rewriteError`, as shown below.) At a high-level, the function will receive the error to be reported (i.e., a `GraphQLError` or an `ApolloError`) as the first argument. The function should then return a modified form of that error (e.g., after changing the `err.message` to remove potentially sensitive information), or should return an explicit `null` in order to avoid reporting the error entirely.

(For federated services, instead of setting `rewriteError` in the usage reporting plugin in the gateway's `ApolloServer`, set [`rewriteError` in the inline trace plugin](../api/plugin/inline-trace/#rewriteerror) in the implementing service's `ApolloServer`.)

The following sections give some examples of various use-cases for `rewriteError`.

#### Avoid reporting lower-severity, predefined errors

If an application is using the predefined errors noted above (`AuthenticationError`, `ForbiddenError`, `UserInputError`, etc.), these can be used with `rewriteError`.

For example, if the current server is `throw`ing the `AuthenticationError`
when an incorrect password is supplied, an implementor can avoid reporting
this to Apollo Studio by defining `rewriteError` as follows:

```js{7-17}
const { ApolloServer, AuthenticationError } = require("apollo-server");
const { ApolloServerPluginUsageReporting } = require("apollo-server-core");
const server = new ApolloServer({
  typeDefs,
  resolvers,
  plugins: [
    ApolloServerPluginUsageReporting({
      rewriteError(err) {
        // Return `null` to avoid reporting `AuthenticationError`s
        if (err instanceof AuthenticationError) {
          return null;
        }

        // All other errors will be reported.
        return err;
      }
    }),
  ],
});
```

This example configuration ensures that any `AuthenticationError` that's thrown within a resolver is only reported to the client, and never sent to Apollo Studio. All other errors are transmitted to Studio normally.

#### Avoid reporting an error based on other properties

When generating an error (e.g., `new ApolloError("Failure!")`), the `message`
is the most common property (in this case it's `Failure!`). However, any number of properties can be attached to the error (such as a `code` property). These properties can be checked when determining whether an error should be reported to Apollo Studio using the `rewriteError` function as follows:

```js{7-17}
const { ApolloServer } = require("apollo-server");
const { ApolloServerPluginUsageReporting } = require("apollo-server-core");
const server = new ApolloServer({
  typeDefs,
  resolvers,
  plugins: [
    ApolloServerPluginUsageReporting({
      rewriteError(err) {
        // Using a more stable, known error property (e.g. `err.code`) would be
        // more defensive, however checking the `message` might serve most needs!
        if (err.message && err.message.startsWith("Known error message")) {
          return null;
        }

        // All other errors should still be reported!
        return err;
      }
    }),
  ],
});
```

This example configuration ensures that any error that starts with `Known error message` is not transmitted to Apollo Studio, but all other errors are sent as normal.

#### Redacting the error message

If it is necessary to change an error prior to reporting it to Apollo Studio (for example, if there is personally identifiable information in the error `message`), the `rewriteError` function can also help.

Consider an example where the error contains a piece of information like
an API key:

```
throw new ApolloError("The x-api-key:12345 doesn't have sufficient privileges.");
```

The `rewriteError` function can be used to ensure
such information is not sent to Apollo Studio and potentially revealed outside
its intended scope:

```js{7-13}
const { ApolloServer } = require("apollo-server");
const { ApolloServerPluginUsageReporting } = require("apollo-server-core");
const server = new ApolloServer({
  typeDefs,
  resolvers,
  plugins: [
    ApolloServerPluginUsageReporting({
      rewriteError(err) {
        // Make sure that a specific pattern is removed from all error messages.
        err.message = err.message.replace(/x-api-key:[A-Z0-9-]+/, "REDACTED");
        return err;
      }
    }),
  ],
});
```

In this case, the error above is reported to Apollo Studio as:

```
The REDACTED doesn't have sufficient privileges.
```
