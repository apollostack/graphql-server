---
title: "API Reference: graphql-tools"
sidebar_title: graphql-tools
---

The `graphql-tools` library enables the creation and manipulation of GraphQL schema. Apollo Server is able to accept a `schema` that has been enabled by `graphql-tools`. Apollo server directly exports all the function from `graphql-tools`, enabling a migration path for more complicated use cases.

> Apollo Server includes `graphql-tools` version 4. To use another version of the library, see [Using a different version of graphql-tools](../installing-graphql-tools/).

```js
const { makeExecutableSchema } = require('apollo-server');

const typeDefs = gql`
  type Query {
    hello: String
  }
`;

const resolvers = {
  Query: {
    hello: () => 'Hello world!'
  },
};

const schema = makeExecutableSchema({
  typeDefs,
  resolvers,
});

const rootResolveFunction = (parent, args, context, info) => {
  //perform action before any other resolvers
};

addSchemaLevelResolveFunction(schema, rootResolveFunction)

const server = new ApolloServer({ schema });

// normal ApolloServer listen call but url will contain /graphql
server.listen().then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`)
});
```

## makeExecutableSchema(options)

`makeExecutableSchema` takes a single argument: an object of options. Only the `typeDefs` option is required.

```
const { makeExecutableSchema } = require('apollo-server');

const jsSchema = makeExecutableSchema({
  typeDefs,
  resolvers, // optional
  logger, // optional
  allowUndefinedInResolve = false, // optional
  resolverValidationOptions = {}, // optional
  directiveResolvers = null, // optional
  schemaDirectives = null,  // optional
  parseOptions = {},  // optional
  inheritResolversFromInterfaces = false  // optional
});
```

- `typeDefs` is a required argument and should be a GraphQL schema language string or array of GraphQL schema language strings or a function that takes no arguments and returns an array of GraphQL schema language strings. The order of the strings in the array is not important, but it must include a schema definition.

- `resolvers` is an optional argument _(empty object by default)_ and should be an object that follows the pattern explained in the [resolvers documentation](/data/resolvers/).

- `logger` is an optional argument, which can be used to print errors to the server console that are usually swallowed by GraphQL. The `logger` argument should be an object with a `log` function, eg. `const logger = { log: e => console.log(e) }`

- `parseOptions` is an optional argument which allows customization of parse when specifying `typeDefs` as a string.

- `allowUndefinedInResolve` is an optional argument, which is `true` by default. When set to `false`, causes your resolve functions to throw errors if they return undefined, which can help make debugging easier.

- `resolverValidationOptions` is an optional argument which accepts an `ResolverValidationOptions` object which has the following boolean properties:
  - `requireResolversForArgs` will cause `makeExecutableSchema` to throw an error if no resolve function is defined for a field that has arguments.

  - `requireResolversForNonScalar` will cause `makeExecutableSchema` to throw an error if a non-scalar field has no resolver defined. Setting this to `true` can be helpful in catching errors, but defaults to `false` to avoid confusing behavior for those coming from other GraphQL libraries.

  - `requireResolversForAllFields` asserts that *all* fields have a valid resolve function.

  - `requireResolversForResolveType` will require a `resolveType()` method for Interface and Union types. This can be passed in with the field resolvers as `__resolveType()`. False to disable the warning.

  - `allowResolversNotInSchema` turns off the functionality which throws errors when resolvers are found which are not present in the schema. Defaults to `false`, to help catch common errors.

- `inheritResolversFromInterfaces` GraphQL Objects that implement interfaces will inherit missing resolvers from their interface types defined in the `resolvers` object.

## addMockFunctionsToSchema(options)

```js
const { addMockFunctionsToSchema } = require('apollo-server');

addMockFunctionsToSchema({
  schema,
  mocks: {},
  preserveResolvers: false,
});
```

Given an instance of GraphQLSchema and a mock object, `addMockFunctionsToSchema` modifies the schema in place to return mock data for any valid query that is sent to the server. If `mocks` is not passed, the defaults will be used for each of the scalar types. If `preserveResolvers` is set to `true`, existing resolve functions will not be overwritten to provide mock data. This can be used to mock some parts of the server and not others.

## MockList(list, mockFunction)

```js
const { MockList } = require('apollo-server');

new MockList(length: number | number[], mockFunction: Function);
```

This is an object you can return from your mock resolvers which calls the `mockFunction` once for each list item. The first argument can either be an exact length, or an inclusive range of possible lengths for the list, in case you want to see how your UI responds to varying lists of data.

## addResolveFunctionsToSchema({ schema, resolvers, resolverValidationOptions?, inheritResolversFromInterfaces? })

`addResolveFunctionsToSchema` takes an options object of `IAddResolveFunctionsToSchemaOptions` and modifies the schema in place by attaching the resolvers to the relevant types.


```js
const { addResolveFunctionsToSchema } = require('apollo-server');

const resolvers = {
  RootQuery: {
    author(obj, { name }, context) {
      console.log("RootQuery called with context " +
        context + " to find " + name);
      return Author.find({ name });
    },
  },
};

addResolveFunctionsToSchema({ schema, resolvers });
```

The `IAddResolveFunctionsToSchemaOptions` object has 4 properties that are described in [`makeExecutableSchema`](https://www.apollographql.com/docs/graphql-tools/generate-schema/#makeexecutableschemaoptions).

```ts
export interface IAddResolveFunctionsToSchemaOptions {
  schema: GraphQLSchema;
  resolvers: IResolvers;
  resolverValidationOptions?: IResolverValidationOptions;
  inheritResolversFromInterfaces?: boolean;
}
```

## addSchemaLevelResolveFunction(schema, rootResolveFunction)

Some operations, such as authentication, need to be done only once per query. Logically, these operations belong in an obj resolve function, but unfortunately GraphQL-JS does not let you define one. `addSchemaLevelResolveFunction` solves this by modifying the GraphQLSchema that is passed as the first argument.


## delegateToSchema

The `delegateToSchema` method can be found on the `info.mergeInfo` object within any resolver function, and should be called with the following named options:

```
delegateToSchema(options: {
  schema: GraphQLSchema;
  operation: 'query' | 'mutation' | 'subscription';
  fieldName: string;
  args?: { [key: string]: any };
  context: { [key: string]: any };
  info: GraphQLResolveInfo;
  transforms?: Array<Transform>;
}): Promise<any>
```

### schema: GraphQLSchema

A subschema to delegate to.

### operation: 'query' | 'mutation' | 'subscription'

The operation type to use during the delegation.

### fieldName: string

A root field in a subschema from which the query should start.

### args: { [key: string]: any }

Additional arguments to be passed to the field. Arguments passed to the field that is being resolved will be preserved if the subschema expects them, so you don't have to pass existing arguments explicitly, though you could use the additional arguments to override the existing ones. For example:

```graphql
# Subschema

type Booking {
  id: ID!
}

type Query {
  bookingsByUser(userId: ID!, limit: Int): [Booking]
}

# Schema

type User {
  id: ID!
  bookings(limit: Int): [Booking]
}

type Booking {
  id: ID!
}
```

If we delegate at `User.bookings` to `Query.bookingsByUser`, we want to preserve the `limit` argument and add an `userId` argument by using the `User.id`. So the resolver would look like the following:

```js
const resolvers = {
  User: {
    bookings(parent, args, context, info) {
      return info.mergeInfo.delegateToSchema({
        schema: subschema,
        operation: 'query',
        fieldName: 'bookingsByUser',
        args: {
          userId: parent.id,
        },
        context,
        info,
      });
    },
    ...
  },
  ...
};
```

### context: { [key: string]: any }

GraphQL context that is going to be passed to subschema execution or subscription call.

### info: GraphQLResolveInfo

GraphQL resolve info of the current resolver. Provides access to the subquery that starts at the current resolver.

Also provides the `info.mergeInfo.delegateToSchema` function discussed above.

### transforms: Array<Transform>

Transforms to apply to the query and results. Should be the same transforms that were used to transform the schema, if any. After transformation, `transformedSchema.transforms` contains the transforms that were applied.

### Additional considerations - Aliases

Delegation preserves aliases that are passed from the parent query. However that presents problems, because default GraphQL resolvers retrieve field from parent based on their name, not aliases. This way results with aliases will be missing from the delegated result. `mergeSchemas` and `transformSchemas` go around that by using `src/stitching/defaultMergedResolver` for all fields without explicit resolver. When building new libraries around delegation, one should consider how the aliases will be handled.


## mergeSchemas

```ts
mergeSchemas({
  schemas: Array<string | GraphQLSchema | Array<GraphQLNamedType>>;
  resolvers?: Array<IResolvers> | IResolvers;
  onTypeConflict?: (
    left: GraphQLNamedType,
    right: GraphQLNamedType,
    info?: {
      left: {
        schema?: GraphQLSchema;
      };
      right: {
        schema?: GraphQLSchema;
      };
    },
  ) => GraphQLNamedType;
})
```

This is the main function that implements schema stitching. Read below for a description of each option.

### schemas

`schemas` is an array of `GraphQLSchema` objects, schema strings, or lists of `GraphQLNamedType`s. Strings can contain type extensions or GraphQL types, which will be added to resulting schema. Note that type extensions are always applied last, while types are defined in the order in which they are provided.

### resolvers

`resolvers` accepts resolvers in same format as [`makeExecutableSchema`](#makeexecutableschemaoptions). It can also take an Array of resolvers. One addition to the resolver format is the possibility to specify a `fragment` for a resolver. The `fragment` must be a GraphQL fragment definition string, specifying which fields from the parent schema are required for the resolver to function properly.

```js
resolvers: {
  Booking: {
    property: {
      fragment: 'fragment BookingFragment on Booking { propertyId }',
      resolve(parent, args, context, info) {
        return mergeInfo.delegateToSchema({
          schema: bookingSchema,
          operation: 'query',
          fieldName: 'propertyById',
          args: {
            id: parent.propertyId,
          },
          context,
          info,
        });
      },
    },
  },
}
```

### mergeInfo and delegateToSchema

The `info.mergeInfo` object provides the `delegateToSchema` method:

```js
type MergeInfo = {
  delegateToSchema<TContext>(options: IDelegateToSchemaOptions<TContext>): any;
}

interface IDelegateToSchemaOptions<TContext = {
    [key: string]: any;
}> {
    schema: GraphQLSchema;
    operation: Operation;
    fieldName: string;
    args?: {
        [key: string]: any;
    };
    context: TContext;
    info: GraphQLResolveInfo;
    transforms?: Array<Transform>;
}
```

As described in the documentation above, `info.mergeInfo.delegateToSchema` allows delegating to any `GraphQLSchema` object, optionally applying transforms in the process. See [Built-in transforms](#built-in-transforms).

### onTypeConflict

```js
type OnTypeConflict = (
  left: GraphQLNamedType,
  right: GraphQLNamedType,
  info?: {
    left: {
      schema?: GraphQLSchema;
    };
    right: {
      schema?: GraphQLSchema;
    };
  },
) => GraphQLNamedType;
```

The `onTypeConflict` option to `mergeSchemas` allows customization of type resolving logic.

The default behavior of `mergeSchemas` is to take the first encountered type of all the types with the same name. If there are conflicts, `onTypeConflict` enables explicit selection of the winning type.

For example, here's how we could select the last type among multiple types with the same name:

```js
const onTypeConflict = (left, right) => right;
```

And here's how we might select the type whose schema has the latest `version`:

```js
const onTypeConflict = (left, right, info) => {
  if (info.left.schema.version >= info.right.schema.version) {
    return left;
  } else {
    return right;
  }
}
```

When using schema transforms, `onTypeConflict` is often unnecessary, since transforms can be used to prevent conflicts before merging schemas. However, if you're not using schema transforms, `onTypeConflict` can be a quick way to make `mergeSchemas` produce more desirable results.

### Transform

```ts
interface Transform = {
  transformSchema?: (schema: GraphQLSchema) => GraphQLSchema;
  transformRequest?: (request: Request) => Request;
  transformResult?: (result: Result) => Result;
};

type Request = {
  document: DocumentNode;
  variables: Record<string, any>;
  extensions?: Record<string, any>;
};

type Result = ExecutionResult & {
  extensions?: Record<string, any>;
};
```

### transformSchema

Given a `GraphQLSchema` and an array of `Transform` objects, produce a new schema with those transforms applied.

Delegating resolvers will also be generated to map from new schema root fields to old schema root fields. Often these automatic resolvers are sufficient, so you don't have to implement your own.

## Built-in transforms

Built-in transforms are ready-made classes implementing the `Transform` interface. They are intended to cover many of the most common schema transformation use cases, but they also serve as examples of how to implement transforms for your own needs.

### Modifying types

* `FilterTypes(filter: (type: GraphQLNamedType) => boolean)`: Remove all types for which the `filter` function returns `false`.

* `RenameTypes(renamer, options?)`: Rename types by applying `renamer` to each type name. If `renamer` returns `undefined`, the name will be left unchanged. Options controls whether built-in types and scalars are renamed. Root objects are never renamed by this transform.

```ts
RenameTypes(
  (name: string) => string | void,
  options?: {
    renameBuiltins: Boolean;
    renameScalars: Boolean;
  },
)
```

### Modifying root fields

* `TransformRootFields(transformer: RootTransformer)`: Given a transformer, arbitrarily transform root fields. The `transformer` can return a `GraphQLFieldConfig` definition, a object with new `name` and a `field`, `null` to remove the field, or `undefined` to leave the field unchanged.

```ts
TransformRootFields(transformer: RootTransformer)

type RootTransformer = (
  operation: 'Query' | 'Mutation' | 'Subscription',
  fieldName: string,
  field: GraphQLField<any, any>,
) =>
  | GraphQLFieldConfig<any, any>
  | { name: string; field: GraphQLFieldConfig<any, any> }
  | null
  | void;
```

* `FilterRootFields(filter: RootFilter)`: Like `FilterTypes`, removes root fields for which the `filter` function returns `false`.

```ts
FilterRootFields(filter: RootFilter)

type RootFilter = (
  operation: 'Query' | 'Mutation' | 'Subscription',
  fieldName: string,
  field: GraphQLField<any, any>,
) => boolean;
```

* `RenameRootFields(renamer)`: Rename root fields, by applying the `renamer` function to their names.

```ts
RenameRootFields(
  renamer: (
    operation: 'Query' | 'Mutation' | 'Subscription',
    name: string,
    field: GraphQLField<any, any>,
  ) => string,
)
```

### Other

* `ExractField({ from: Array<string>, to: Array<string> })` - move selection at `from` path to `to` path.

* `WrapQuery(
    path: Array<string>,
    wrapper: QueryWrapper,
    extractor: (result: any) => any,
  )` - wrap a selection at `path` using function `wrapper`. Apply `extractor` at the same path to get the result. This is used to get a result nested inside other result

```js
transforms: [
  // Wrap document takes a subtree as an AST node
  new WrapQuery(
    // path at which to apply wrapping and extracting
    ['userById'],
    (subtree: SelectionSetNode) => ({
      // we create a wrapping AST Field
      kind: Kind.FIELD,
      name: {
        kind: Kind.NAME,
        // that field is `address`
        value: 'address',
      },
      // Inside the field selection
      selectionSet: subtree,
    }),
    // how to process the data result at path
    result => result && result.address,
  ),
],
```

* `ReplaceFieldWithFragment(targetSchema: GraphQLSchema, mapping: FieldToFragmentMapping)`: Replace the given fields with an inline fragment. Used by `mergeSchemas` to handle the `fragment` option.

```ts
type FieldToFragmentMapping = {
  [typeName: string]: { [fieldName: string]: InlineFragmentNode };
};
```

## delegateToSchema transforms

The following transforms are automatically applied by `delegateToSchema` during schema delegation, to translate between new and old types and fields:

* `AddArgumentsAsVariables`: Given a schema and arguments passed to a root field, make those arguments document variables.
* `FilterToSchema`: Given a schema and document, remove all fields, variables and fragments for types that don't exist in that schema.
* `AddTypenameToAbstract`: Add `__typename` to all abstract types in the document.
* `CheckResultAndHandleErrors`: Given a result from a subschema, propagate errors so that they match the correct subfield. Also provide the correct key if aliases are used.

By passing a custom `transforms` array to `delegateToSchema`, it's possible to run additional transforms before these default transforms, though it is currently not possible to disable the default transforms.
