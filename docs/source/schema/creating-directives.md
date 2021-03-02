---
title: Implementing directives
description: Implementing custom directives to transform schema types, fields, and arguments
---

Before learning how to implement schema directives, [this section](/schema/directives/) will provide the necessary background on schema directives and their use.

## Implementing schema directives

Since the GraphQL specification does not discuss any specific implementation strategy for directives, it's up to each GraphQL server framework to expose an API for implementing new directives.

If you're using Apollo Server, you are using the [`graphql-tools`](https://github.com/apollographql/graphql-tools) npm package, which provides a convenient yet powerful tool for implementing directive syntax: the [`SchemaDirectiveVisitor`](https://github.com/ardatan/graphql-tools/blob/master/packages/utils/src/SchemaDirectiveVisitor.ts) class.

To implement a schema directive using `SchemaDirectiveVisitor`, simply create a subclass of `SchemaDirectiveVisitor` that overrides one or more of the following visitor methods:

* `visitSchema(schema: GraphQLSchema)`
* `visitScalar(scalar: GraphQLScalarType)`
* `visitObject(object: GraphQLObjectType)`
* `visitFieldDefinition(field: GraphQLField<any, any>)`
* `visitArgumentDefinition(argument: GraphQLArgument)`
* `visitInterface(iface: GraphQLInterfaceType)`
* `visitUnion(union: GraphQLUnionType)`
* `visitEnum(type: GraphQLEnumType)`
* `visitEnumValue(value: GraphQLEnumValue)`
* `visitInputObject(object: GraphQLInputObjectType)`
* `visitInputFieldDefinition(field: GraphQLInputField)`

By overriding methods like `visitObject`, a subclass of `SchemaDirectiveVisitor` expresses interest in certain schema types such as `GraphQLObjectType` (the first parameter type of `visitObject`).

These method names correspond to all possible [locations](https://github.com/graphql/graphql-js/blob/a62eea88d5844a3bd9725c0f3c30950a78727f3e/src/language/directiveLocation.js#L22-L33) where a directive may be used in a schema. For example, the location `INPUT_FIELD_DEFINITION` is handled by `visitInputFieldDefinition`.

Here is one possible implementation of the `@deprecated` directive we saw above:

```js
const { SchemaDirectiveVisitor } = require("apollo-server");

class DeprecatedDirective extends SchemaDirectiveVisitor {
  public visitFieldDefinition(field: GraphQLField<any, any>) {
    field.isDeprecated = true;
    field.deprecationReason = this.args.reason;
  }

  public visitEnumValue(value: GraphQLEnumValue) {
    value.isDeprecated = true;
    value.deprecationReason = this.args.reason;
  }
}
```

In order to apply this implementation to a schema that contains `@deprecated` directives, simply pass the `DeprecatedDirective` class to Apollo Server's constructor via the `schemaDirectives` option:

```js
const { ApolloServer, gql } = require("apollo-server");

const typeDefs = gql`
  type ExampleType {
    newField: String
    oldField: String @deprecated(reason: "Use \`newField\`.")
  }
`;

const server = new ApolloServer({
  typeDefs,
  resolvers,
  schemaDirectives: {
    deprecated: DeprecatedDirective
  }
});

server.listen().then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`);
});
```

Alternatively, if you want to modify an existing schema object, you can use the `SchemaDirectiveVisitor.visitSchemaDirectives` interface directly:

```js
SchemaDirectiveVisitor.visitSchemaDirectives(schema, {
  deprecated: DeprecatedDirective
});
```

Note that a subclass of `SchemaDirectiveVisitor` may be instantiated multiple times to visit multiple different occurrences of the `@deprecated` directive. That's why you provide a class rather than an instance of that class.

If for some reason you have a schema that uses another name for the `@deprecated` directive, but you want to use the same implementation, you can! The same `DeprecatedDirective` class can be passed with a different name, simply by changing its key in the `schemaDirectives` object passed to the Apollo Server constructor. In other words, `SchemaDirectiveVisitor` implementations are effectively anonymous, so it's up to whoever uses them to assign names to them.

## Examples

To appreciate the range of possibilities enabled by `SchemaDirectiveVisitor`, let's examine a variety of practical examples.

### Uppercasing strings

Suppose you want to ensure a string-valued field is converted to uppercase. Though this use case is simple, it's a good example of a directive implementation that works by wrapping a field's `resolve` function:

```js
const { ApolloServer, gql, SchemaDirectiveVisitor } = require("apollo-server");
const { defaultFieldResolver } = require("graphql");

const typeDefs = gql`
  directive @upper on FIELD_DEFINITION

  type Query {
    hello: String @upper
  }
`;

class UpperCaseDirective extends SchemaDirectiveVisitor {
  visitFieldDefinition(field) {
    const { resolve = defaultFieldResolver } = field;
    field.resolve = async function (...args) {
      const result = await resolve.apply(this, args);
      if (typeof result === "string") {
        return result.toUpperCase();
      }
      return result;
    };
  }
}

const server = new ApolloServer({
  typeDefs,
  schemaDirectives: {
    upper: UpperCaseDirective,
    upperCase: UpperCaseDirective
  }
});

server.listen().then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`);
});
```

Notice how easy it is to handle both `@upper` and `@upperCase` with the same `UpperCaseDirective` implementation.

### Fetching data from a REST API

Suppose you've defined an object type that corresponds to a [REST](https://en.wikipedia.org/wiki/Representational_state_transfer) resource, and you want to avoid implementing resolver functions for every field:

```js
const { ApolloServer, gql, SchemaDirectiveVisitor } = require("apollo-server");

const typeDefs = gql`
  directive @rest(url: String) on FIELD_DEFINITION

  type Query {
    people: [Person] @rest(url: "/api/v1/people")
  }
`;

class RestDirective extends SchemaDirectiveVisitor {
  public visitFieldDefinition(field) {
    const { url } = this.args;
    field.resolve = () => fetch(url);
  }
}

const server = new ApolloServer({
  typeDefs,
  schemaDirectives: {
    rest: RestDirective
  }
});

server.listen().then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`);
});
```

There are many more issues to consider when implementing a real GraphQL wrapper over a REST endpoint (such as how to do caching or pagination), but this example demonstrates the basic structure.

### Formatting date strings

Suppose your resolver returns a `Date` object but you want to return a formatted string to the client:

```js
const { ApolloServer, gql, SchemaDirectiveVisitor } = require("apollo-server");
const { defaultFieldResolver } = require("graphql");

const typeDefs = gql`
  directive @date(format: String) on FIELD_DEFINITION

  scalar Date

  type Post {
    published: Date @date(format: "mmmm d, yyyy")
  }
`;

class DateFormatDirective extends SchemaDirectiveVisitor {
  visitFieldDefinition(field) {
    const { resolve = defaultFieldResolver } = field;
    const { format } = this.args;
    field.resolve = async function (...args) {
      const date = await resolve.apply(this, args);
      return require('dateformat')(date, format);
    };
    // The formatted Date becomes a String, so the field type must change:
    field.type = GraphQLString;
  }
}

const server = new ApolloServer({
  typeDefs,
  schemaDirectives: {
    date: DateFormatDirective
  }
});

server.listen().then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`);
});
```

Of course, it would be even better if the schema author did not have decide on a specific `Date` format, but could instead leave that decision to the client. To make this work, the directive just needs to add an additional argument to the field:

```js
const { ApolloServer, gql, SchemaDirectiveVisitor } = require("apollo-server");
const formatDate = require("dateformat");
const { defaultFieldResolver, GraphQLString } = require("graphql");

const typeDefs = gql`
  directive @date(
    defaultFormat: String = "mmmm d, yyyy"
  ) on FIELD_DEFINITION

  scalar Date

  type Query {
    today: Date @date
  }
`;

class FormattableDateDirective extends SchemaDirectiveVisitor {
  public visitFieldDefinition(field) {
    const { resolve = defaultFieldResolver } = field;
    const { defaultFormat } = this.args;

    field.args.push({
      name: 'format',
      type: GraphQLString
    });

    field.resolve = async function (
      source,
      { format, ...otherArgs },
      context,
      info,
    ) {
      const date = await resolve.call(this, source, otherArgs, context, info);
      // If a format argument was not provided, default to the optional
      // defaultFormat argument taken by the @date directive:
      return formatDate(date, format || defaultFormat);
    };

    field.type = GraphQLString;
  }
}

const server = new ApolloServer({
  typeDefs,
  schemaDirectives: {
    date: FormattableDateDirective
  }
});

server.listen().then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`);
});
```

Now the client can specify a desired `format` argument when requesting the `Query.today` field, or omit the argument to use the `defaultFormat` string specified in the schema:

```js
const { request } = require("graphql-request");

server.listen().then(({ url }) => {
  request(url, `query { today }`).then(result => {
    // Logs with the default "mmmm d, yyyy" format:
    console.log(result.data.today);
  });

  request(url, `query {
    today(format: "d mmm yyyy")
  }`).then(result => {
    // Logs with the requested "d mmm yyyy" format:
    console.log(result.data.today);
  });
})
```

### Marking strings for internationalization

Suppose you have a function called `translate` that takes a string, a path identifying that string's role in your application, and a target locale for the translation.

Here's how you might make sure `translate` is used to localize the `greeting` field of a `Query` type:

```js
const { ApolloServer, gql, SchemaDirectiveVisitor } = require("apollo-server");
const { defaultFieldResolver } = require("graphql");

const typeDefs = gql`
  directive @intl on FIELD_DEFINITION

  type Query {
    greeting: String @intl
  }
`;

class IntlDirective extends SchemaDirectiveVisitor {
  visitFieldDefinition(field, details) {
    const { resolve = defaultFieldResolver } = field;
    field.resolve = async function (...args) {
      const context = args[2];
      const defaultText = await resolve.apply(this, args);
      // In this example, path would be ["Query", "greeting"]:
      const path = [details.objectType.name, field.name];
      return translate(defaultText, path, context.locale);
    };
  }
}

const server = new ApolloServer({
  typeDefs,
  schemaDirectives: {
    intl: IntlDirective
  }
});

server.listen().then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`);
});
```

GraphQL is great for internationalization, since a GraphQL server can access unlimited translation data, and clients can simply ask for the translations they need.

### Enforcing access permissions

Imagine a hypothetical `@auth` directive that takes an argument `requires` of type `Role`, which defaults to `ADMIN`. This `@auth` directive can appear on an `OBJECT` like `User` to set default access permissions for all `User` fields, as well as appearing on individual fields, to enforce field-specific `@auth` restrictions:

```graphql
directive @auth(
  requires: Role = ADMIN,
) on OBJECT | FIELD_DEFINITION

enum Role {
  ADMIN
  REVIEWER
  USER
  UNKNOWN
}

type User @auth(requires: USER) {
  name: String
  banned: Boolean @auth(requires: ADMIN)
  canPost: Boolean @auth(requires: REVIEWER)
}
```

What makes this example tricky is that the `OBJECT` version of the directive needs to wrap all fields of the object, even though some of those fields may be individually wrapped by `@auth` directives at the `FIELD_DEFINITION` level, and we would prefer not to rewrap resolvers if we can help it:

```js
const { ApolloServer, gql, SchemaDirectiveVisitor } = require("apollo-server");
const { defaultFieldResolver } = require("graphql");

class AuthDirective extends SchemaDirectiveVisitor {
  visitObject(type) {
    this.ensureFieldsWrapped(type);
    type._requiredAuthRole = this.args.requires;
  }
  // Visitor methods for nested types like fields and arguments
  // also receive a details object that provides information about
  // the parent and grandparent types.
  visitFieldDefinition(field, details) {
    this.ensureFieldsWrapped(details.objectType);
    field._requiredAuthRole = this.args.requires;
  }

  ensureFieldsWrapped(objectType) {
    // Mark the GraphQLObjectType object to avoid re-wrapping:
    if (objectType._authFieldsWrapped) return;
    objectType._authFieldsWrapped = true;

    const fields = objectType.getFields();

    Object.keys(fields).forEach(fieldName => {
      const field = fields[fieldName];
      const { resolve = defaultFieldResolver } = field;
      field.resolve = async function (...args) {
        // Get the required Role from the field first, falling back
        // to the objectType if no Role is required by the field:
        const requiredRole =
          field._requiredAuthRole ||
          objectType._requiredAuthRole;

        if (! requiredRole) {
          return resolve.apply(this, args);
        }

        const context = args[2];
        const user = await getUser(context.headers.authToken);
        if (! user.hasRole(requiredRole)) {
          throw new Error("not authorized");
        }

        return resolve.apply(this, args);
      };
    });
  }
}

const server = new ApolloServer({
  typeDefs,
  schemaDirectives: {
    auth: AuthDirective,
    authorized: AuthDirective,
    authenticated: AuthDirective
  }
});

server.listen().then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`);
});
```

One drawback of this approach is that it does not guarantee fields will be wrapped if they are added to the schema after `AuthDirective` is applied, and the whole `getUser(context.headers.authToken)` is a made-up API that would need to be fleshed out. In other words, we’ve glossed over some of the details that would be required for a production-ready implementation of this directive, though we hope the basic structure shown here inspires you to find clever solutions to the remaining problems.

### Enforcing value restrictions

Suppose you want to enforce a maximum length for a string-valued field:

```js
const { ApolloServer, gql, SchemaDirectiveVisitor } = require('apollo-server');
const { GraphQLScalarType, GraphQLNonNull } = require('graphql');

const typeDefs = gql`
  directive @length(max: Int) on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

  type Query {
    books: [Book]
  }

  type Book {
    title: String @length(max: 50)
  }

  type Mutation {
    createBook(book: BookInput): Book
  }

  input BookInput {
    title: String! @length(max: 50)
  }
`;

class LengthDirective extends SchemaDirectiveVisitor {
  visitInputFieldDefinition(field) {
    this.wrapType(field);
  }

  visitFieldDefinition(field) {
    this.wrapType(field);
  }

  // Replace field.type with a custom GraphQLScalarType that enforces the
  // length restriction.
  wrapType(field) {
    if (
      field.type instanceof GraphQLNonNull &&
      field.type.ofType instanceof GraphQLScalarType
    ) {
      field.type = new GraphQLNonNull(
        new LimitedLengthType(field.type.ofType, this.args.max),
      );
    } else if (field.type instanceof GraphQLScalarType) {
      field.type = new LimitedLengthType(field.type, this.args.max);
    } else {
      throw new Error(`Not a scalar type: ${field.type}`);
    }
  }
}

class LimitedLengthType extends GraphQLScalarType {
  constructor(type, maxLength) {
    super({
      name: `LengthAtMost${maxLength}`,

      // For more information about GraphQLScalar type (de)serialization,
      // see the graphql-js implementation:
      // https://github.com/graphql/graphql-js/blob/31ae8a8e8312/src/type/definition.js#L425-L446

      serialize(value) {
        value = type.serialize(value);
        assert.isAtMost(value.length, maxLength);
        return value;
      },

      parseValue(value) {
        return type.parseValue(value);
      },

      parseLiteral(ast) {
        return type.parseLiteral(ast);
      },
    });
  }
}

const server = new ApolloServer({
  typeDefs,
  resolvers,
  schemaDirectives: {
    length: LengthDirective,
  },
});

server.listen().then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`);
});
```

### Synthesizing unique IDs

Suppose your database uses incrementing IDs for each resource type, so IDs are not unique across all resource types. Here’s how you might synthesize a field called `uid` that combines the object type with various field values to produce an ID that’s unique across your schema:

```js
const { ApolloServer, gql, SchemaDirectiveVisitor } = require("apollo-server");
const { GraphQLID } = require("graphql");
const { createHash } = require("crypto");

const typeDefs = gql`
  directive @uniqueID(
    # The name of the new ID field, "uid" by default:
    name: String = "uid"

    # Which fields to include in the new ID:
    from: [String] = ["id"]
  ) on OBJECT

  # Since this type just uses the default values of name and from,
  # we don't have to pass any arguments to the directive:
  type Location @uniqueID {
    id: Int
    address: String
  }

  # This type uses both the person's name and the personID field,
  # in addition to the "Person" type name, to construct the ID:
  type Person @uniqueID(from: ["name", "personID"]) {
    personID: Int
    name: String
  }
`;

class UniqueIdDirective extends SchemaDirectiveVisitor {
  visitObject(type) {
    const { name, from } = this.args;
    const fields = type.getFields();
    if (name in fields) {
      throw new Error(`Conflicting field name ${name}`);
    }
    fields[name] = {
      name,
      type: GraphQLID,
      description: 'Unique ID',
      args: [],
      resolve(object) {
        const hash = createHash("sha1");
        hash.update(type.name);
        from.forEach(fieldName => {
          hash.update(String(object[fieldName]));
        });
        return hash.digest("hex");
      }
    };
  }
}

const server = new ApolloServer({
  typeDefs,
  resolvers,
  schemaDirectives: {
    uniqueID: UniqueIdDirective
  }
});

server.listen().then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`);
});
```

## Declaring schema directives

While the above examples should be sufficient to implement any `@directive` used in your schema, SDL syntax also supports declaring the names, argument types, default argument values, and permissible locations of any available directives:

```js
directive @auth(
  requires: Role = ADMIN,
) on OBJECT | FIELD_DEFINITION

enum Role {
  ADMIN
  REVIEWER
  USER
  UNKNOWN
}

type User @auth(requires: USER) {
  name: String
  banned: Boolean @auth(requires: ADMIN)
  canPost: Boolean @auth(requires: REVIEWER)
}
```

This hypothetical `@auth` directive takes an argument named `requires` of type `Role`, which defaults to `ADMIN` if `@auth` is used without passing an explicit `requires` argument. The `@auth` directive can appear on an `OBJECT` like `User` to set a default access control for all `User` fields, and also on individual fields, to enforce field-specific `@auth` restrictions.

Enforcing the requirements of the declaration is something a `SchemaDirectiveVisitor` implementation could do itself, in theory, but the SDL syntax is easer to read and write, and provides value even if you're not using the `SchemaDirectiveVisitor` abstraction.

However, if you're implementing a reusable `SchemaDirectiveVisitor` for public consumption, you will probably not be the person writing the SDL syntax, so you may not have control over which directives the schema author decides to declare, and how. That's why a well-implemented, reusable `SchemaDirectiveVisitor` should consider overriding the `getDirectiveDeclaration` method:

```js
const { ApolloServer, gql, SchemaDirectiveVisitor } = require("apollo-server");
const { DirectiveLocation, GraphQLDirective, GraphQLEnumType } = require("graphql");

class AuthDirective extends SchemaDirectiveVisitor {
  public visitObject(object: GraphQLObjectType) {...}
  public visitFieldDefinition(field: GraphQLField<any, any>) {...}

  public static getDirectiveDeclaration(
    directiveName: string,
    schema: GraphQLSchema,
  ): GraphQLDirective {
    const previousDirective = schema.getDirective(directiveName);
    if (previousDirective) {
      // If a previous directive declaration exists in the schema, it may be
      // better to modify it than to return a new GraphQLDirective object.
      previousDirective.args.forEach(arg => {
        if (arg.name === 'requires') {
          // Lower the default minimum Role from ADMIN to REVIEWER.
          arg.defaultValue = 'REVIEWER';
        }
      });

      return previousDirective;
    }

    // If a previous directive with this name was not found in the schema,
    // there are several options:
    //
    // 1. Construct a new GraphQLDirective (see below).
    // 2. Throw an exception to force the client to declare the directive.
    // 3. Return null, and forget about declaring this directive.
    //
    // All three are valid options, since the visitor will still work without
    // any declared directives. In fact, unless you're publishing a directive
    // implementation for public consumption, you can probably just ignore
    // getDirectiveDeclaration altogether.

    return new GraphQLDirective({
      name: directiveName,
      locations: [
        DirectiveLocation.OBJECT,
        DirectiveLocation.FIELD_DEFINITION,
      ],
      args: {
        requires: {
          // Having the schema available here is important for obtaining
          // references to existing type objects, such as the Role enum.
          type: (schema.getType('Role') as GraphQLEnumType),
          // Set the default minimum Role to REVIEWER.
          defaultValue: 'REVIEWER',
        }
      }]
    });
  }
}
```

Since the `getDirectiveDeclaration` method receives not only the name of the directive but also the `GraphQLSchema` object, it can modify and/or reuse previous declarations found in the schema, as an alternative to returning a totally new `GraphQLDirective` object. Either way, if the visitor returns a non-null `GraphQLDirective` from `getDirectiveDeclaration`, that declaration will be used to check arguments and permissible locations.

## What about query directives?

As its name suggests, the `SchemaDirectiveVisitor` abstraction is specifically designed to enable transforming GraphQL schemas based on directives that appear in your SDL text.

While directive syntax can also appear in GraphQL queries sent from the client, implementing query directives would require runtime transformation of query documents. We have deliberately restricted this implementation to transformations that take place at server construction time.

We believe confining this logic to your schema is more sustainable than burdening your clients with it, though you can probably imagine a similar sort of abstraction for implementing query directives. If that possibility becomes a desire that becomes a need for you, let us know, and we may consider supporting query directives in a future version of these tools.
