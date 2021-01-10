---
title: Custom scalars and enums
description: Add custom scalar and enum types to a schema.
---

The GraphQL specification includes the following default scalar types: `Int`, `Float`, `String`, `Boolean` and `ID`. While this covers most of the use cases, some need to support custom atomic data types (e.g. `Date`), or add validation to an existing type. To enable this, GraphQL allows custom scalar types. Enumerations are similar to custom scalars with the limitation that their values can only be one of a pre-defined list of strings.

## Custom scalars

To define a custom scalar, add it to the schema string with the following notation:

```js
scalar MyCustomScalar
```

Afterwards, define the behavior of a `MyCustomScalar` custom scalar by passing an instance of the [`GraphQLScalarType`](http://graphql.org/graphql-js/type/#graphqlscalartype) class in the [resolver map](https://www.apollographql.com/docs/graphql-tools/resolvers.html#Resolver-map). This instance can be defined with a [dependency](#using-a-package) or in [source code](#custom-graphqlscalartype-instance).

For more information about GraphQL's type system, please refer to the [official documentation](http://graphql.org/graphql-js/type/) or to the [Learning GraphQL](https://github.com/mugli/learning-graphql/blob/master/7.%20Deep%20Dive%20into%20GraphQL%20Type%20System.md) tutorial.

Note that [Apollo Client does not currently have a way to automatically interpret custom scalars](https://github.com/apollostack/apollo-client/issues/585), so there's no way to automatically reverse the serialization on the client.

### Using a package

Here, we'll take the [graphql-type-json](https://github.com/taion/graphql-type-json) package as an example to demonstrate what can be done. This npm package defines a JSON GraphQL scalar type.

Add the `graphql-type-json` package to the project's dependencies :

```shell
$ npm install graphql-type-json
```

In code, require the type defined by in the npm package and use it :

```js
const { ApolloServer, gql } = require('apollo-server');
const GraphQLJSON = require('graphql-type-json');

const typeDefs = gql`
  scalar JSON

  type Foo {
    aField: JSON
  }

  type Query {
    foo: Foo
  }
`;

const resolvers = {
  JSON: GraphQLJSON
};

const server = new ApolloServer({ typeDefs, resolvers });

server.listen().then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`)
});
```

Remark : `GraphQLJSON` is a [`GraphQLScalarType`](http://graphql.org/graphql-js/type/#graphqlscalartype) instance.

### Custom `GraphQLScalarType` instance

Defining a [GraphQLScalarType](http://graphql.org/graphql-js/type/#graphqlscalartype) instance provides more control over the custom scalar and can be added to Apollo server in the following way:

```js
const { ApolloServer, gql } = require('apollo-server');
const { GraphQLScalarType, Kind } = require('graphql');

const myCustomScalarType = new GraphQLScalarType({
  name: 'MyCustomScalar',
  description: 'Description of my custom scalar type',
  serialize(value) {
    let result;
    // Implement custom behavior by setting the 'result' variable
    return result;
  },
  parseValue(value) {
    let result;
    // Implement custom behavior here by setting the 'result' variable
    return result;
  },
  parseLiteral(ast) {
    switch (ast.kind) {
      case Kind.Int:
      // return a literal value, such as 1 or 'static string'
    }
  }
});

const typeDefs = gql`
  scalar MyCustomScalar

  type Foo {
    aField: MyCustomScalar
  }

  type Query {
    foo: Foo
  }
`;

const resolvers = {
  MyCustomScalar: myCustomScalarType
};

const server = new ApolloServer({ typeDefs, resolvers });

server.listen().then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`)
});
```

## Custom scalar examples

Let's look at a couple of examples to demonstrate how a custom scalar type can be defined.

### Date as a scalar

The goal is to define a `Date` data type for returning `Date` values from the database. Let's say we're using a MongoDB driver that uses the native JavaScript `Date` data type. The `Date` data type can be easily serialized as a number using the [`getTime()` method](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getTime). Therefore, we would like our GraphQL server to send and receive `Date`s as numbers when serializing to JSON. This number will be resolved to a `Date` on the server representing the date value. On the client, the user can simply create a new date from the received numeric value.

The following is the implementation of the `Date` data type. First, the schema:

```js
const typeDefs = gql`
  scalar Date

  type MyType {
    created: Date
  }
`
```

Next, the resolver:

```js
const { GraphQLScalarType } = require('graphql');
const { Kind } = require('graphql/language');

const resolvers = {
  Date: new GraphQLScalarType({
    name: 'Date',
    description: 'Date custom scalar type',
    parseValue(value) {
      return new Date(value); // value from the client
    },
    serialize(value) {
      return value.getTime(); // value sent to the client
    },
    parseLiteral(ast) {
      if (ast.kind === Kind.INT) {
        return parseInt(ast.value, 10); // ast value is always in string format
      }
      return null;
    },
  }),
};

const server = new ApolloServer({ typeDefs, resolvers });

server.listen().then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`)
});
```

### Validations

In this example, we follow the [official GraphQL documentation](http://graphql.org/docs/api-reference-type-system/) for the scalar datatype, which demonstrates how to validate a database field that should only contain odd numbers in GraphQL. First, the schema:

```js
const typeDefs = gql`
  scalar Odd

  type MyType {
    oddValue: Odd
  }
`
```

Next, the resolver:

```js
const { ApolloServer, gql } = require('apollo-server');
const { GraphQLScalarType } = require('graphql');
const { Kind } = require('graphql/language');

function oddValue(value) {
  return value % 2 === 1 ? value : null;
}

const resolvers = {
  Odd: new GraphQLScalarType({
    name: 'Odd',
    description: 'Odd custom scalar type',
    parseValue: oddValue,
    serialize: oddValue,
    parseLiteral(ast) {
      if (ast.kind === Kind.INT) {
        return oddValue(parseInt(ast.value, 10));
      }
      return null;
    },
  }),
};

const server = new ApolloServer({ typeDefs, resolvers });

server.listen().then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`)
});
```

## Enums

An Enum is similar to a scalar type, but it can only be one of several values defined in the schema. Enums are most useful in a situation where the user must pick from a prescribed list of options. Additionally enums improve development velocity, since they will auto-complete in tools like GraphQL Playground.

In the schema language, an enum looks like this:

```graphql
enum AllowedColor {
  RED
  GREEN
  BLUE
}
```

An enum can be used anywhere a scalar can be:

```graphql
type Query {
  favoriteColor: AllowedColor # As a return value
  avatar(borderColor: AllowedColor): String # As an argument
}
```

A query might look like this:

```graphql
query GetAvatar {
  avatar(borderColor: RED)
}
```

To pass the enum value as a variable, use a string of JSON, like so:

```graphql
query GetAvatar($color: AllowedColor) {
  avatar(borderColor: $color)
}
```

```js
{
  "color": "RED"
}
```

Putting it all together:

```js
const { ApolloServer, gql } = require('apollo-server');

const typeDefs = gql`
  enum AllowedColor {
    RED
    GREEN
    BLUE
  }

  type Query {
    favoriteColor: AllowedColor # As a return value
    avatar(borderColor: AllowedColor): String # As an argument
  }
`;

const resolvers = {
  Query: {
    favoriteColor: () => 'RED',
    avatar: (parent, args) => {
      // args.borderColor is 'RED', 'GREEN', or 'BLUE'
    },
  }
};

const server = new ApolloServer({ typeDefs, resolvers });

server.listen().then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`)
});
```

### Internal values

Sometimes a backend forces a different value for an enum internally than in the public API. In this example the API contains `RED`, however in resolvers we use `#f00` instead. The `resolvers` argument to `ApolloServer` allows the addition of custom values to enums that only exist internally:

```js
const resolvers = {
  AllowedColor: {
    RED: '#f00',
    GREEN: '#0f0',
    BLUE: '#00f',
  }
};
```

These don't change the public API at all and the resolvers accept these value instead of the schema value, like so:

```js
const resolvers = {
  AllowedColor: {
    RED: '#f00',
    GREEN: '#0f0',
    BLUE: '#00f',
  },
  Query: {
    favoriteColor: () => '#f00',
    avatar: (parent, args) => {
      // args.borderColor is '#f00', '#0f0', or '#00f'
    },
  }
};
```

Most of the time, this feature of enums isn't used unless interoperating with another library that expects its values in a different form.
