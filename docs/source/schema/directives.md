---
title: Directives
sidebar_title: Directives
description: Configure GraphQL types, fields, and arguments
---

A **directive** decorates part of a GraphQL schema or operation with additional configuration. Tools like Apollo Server (and [Apollo Client](https://www.apollographql.com/docs/react/local-state/managing-state-with-field-policies/#querying)) can read a GraphQL document's directives and perform custom logic as appropriate.

Directives are preceded by the `@` character, like so:

```graphql{2}:title=schema.graphql
type ExampleType {
  oldField: String @deprecated(reason: "Use `newField`.")
  newField: String
}
```

This example shows the `@deprecated` directive, which is a [default directive](#default-directives) (i.e., it's part of the [GraphQL specification](http://spec.graphql.org/June2018/#sec--deprecated)). It demonstrates the following about directives:

* Directives can take arguments of their own (`reason` in this case).
* Directives appear _after_ the declaration of what they decorate (the `oldField` field in this case)

## Valid locations

Each directive can only appear in _certain_ locations within a GraphQL schema or operation. These locations are listed in the directive's definition.

For example, here's the GraphQL spec's definition of the `@deprecated` directive:

```graphql
directive @deprecated(
  reason: String = "No longer supported"
) on FIELD_DEFINITION | ENUM_VALUE
```

This indicates that `@deprecated` can decorate either a schema  `FIELD_DEFINITION` (as shown at the top of the article) or a schema `ENUM_VALUE` definition (as shown here):

```graphql:title=schema.graphql
enum MyEnum {
  OLD_VALUE @deprecated(reason: "Use `NEW_VALUE`.")
  NEW_VALUE
}
```

If `@deprecated` appears elsewhere in a GraphQL document, it produces an error.

> If you [create a custom directive](#custom-schema-directives), you need to define it (and its valid locations) in your schema. You don't need to define [default directives](#default-directives) like `@deprecated`.

### Schema directives vs. operation directives

Usually, a given directive appears _exclusively_ in GraphQL schemas or _exclusively_ in GraphQL operations (rarely both, although the spec allows this).

For example, among the [default directives](#default-directives), `@deprecated` is a schema-exclusive directive and `@skip` and `@include` are operation-exclusive directives.

The [GraphQL spec](https://spec.graphql.org/June2018/#sec-Type-System.Directives) lists all possible directive locations. Schema locations are listed under `TypeSystemDirectiveLocation`, and operation locations are listed under `ExecutableDirectiveLocation`.

## Default directives

The [GraphQL specification](http://spec.graphql.org/June2018/#sec-Type-System.Directives) defines the following default directives:

| Directive | Description |
|-----------|-------------|
| `@deprecated(reason: String)` | Marks the schema definition of a field or enum value as deprecated with an optional reason. |
| `@skip(if: Boolean!)` | If `true`, the decorated field or fragment in an operation is _not_ resolved by the GraphQL server. |
| `@include(if: Boolean!)` | If `false`, the decorated field or fragment in an operation is _not_ resolved by the GraphQL server. |

## Custom schema directives

You can extend Apollo Server with custom schema directives created by you or a third party.

> To learn how to create custom directives, see [Creating schema directives](./creating-directives/).

To use a custom directive:

1. Make sure the directive is defined in your schema with all valid locations listed.
2. If the directive uses a `SchemaDirectiveVisitor` subclass to perform custom logic, provide it to the `ApolloServer` constructor via the `schemaDirectives` object.

    _The `schemaDirectives` object maps the name of a directive (e.g., `upper`) to the subclass that implements its behavior (e.g., `UpperCaseDirective`)._

The following example defines an `UpperCaseDirective` subclass for use with the `@upper` custom directive. Because it's decorated with `@upper`, the `Query.hello` field returns `HELLO WORLD!` instead of `Hello world!`.

```js{20,40-42}
const { ApolloServer, gql, SchemaDirectiveVisitor } = require('apollo-server');
const { defaultFieldResolver } = require('graphql');

// Subclass definition for @upper directive logic
class UpperCaseDirective extends SchemaDirectiveVisitor {
  visitFieldDefinition(field) {
    const { resolve = defaultFieldResolver } = field;
    field.resolve = async function (...args) {
      const result = await resolve.apply(this, args);
      if (typeof result === 'string') {
        return result.toUpperCase();
      }
      return result;
    };
  }
}

// Schema definition (including custom directive)
const typeDefs = gql`
  directive @upper on FIELD_DEFINITION

  type Query {
    hello: String @upper
  }
`;

// Resolvers
const resolvers = {
  Query: {
    hello: (parent, args, context) => {
      return 'Hello world!';
    },
  },
};

// Add directive to the ApolloServer constructor
const server = new ApolloServer({
  typeDefs,
  resolvers,
  schemaDirectives: {
    upper: UpperCaseDirective,
  }
});

server.listen().then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`)
});
```
