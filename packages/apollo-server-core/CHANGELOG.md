# Changelog

### vNEXT

* `apollo-server-core`: Add persisted queries [PR#1149](https://github.com/apollographql/apollo-server/pull/1149)
* `apollo-server-core`: added `BadUserInputError`
* `apollo-server-core`: **breaking** gql is exported from gql-tag and ApolloServer requires a DocumentNode [PR#1146](https://github.com/apollographql/apollo-server/pull/1146)
* `apollo-server-core`: accept `Request` object in `runQuery` [PR#1108](https://github.com/apollographql/apollo-server/pull/1108)
* `apollo-server-core`: move query parse into runQuery and no longer accept GraphQL AST over the wire [PR#1097](https://github.com/apollographql/apollo-server/pull/1097)
* `apollo-server-core`: custom errors allow instanceof checks [PR#1074](https://github.com/apollographql/apollo-server/pull/1074)
* `apollo-server-core`: move subscriptions options into listen [PR#1059](https://github.com/apollographql/apollo-server/pull/1059)
* `apollo-server-core`: Replace console.error with logFunction for opt-in logging [PR #1024](https://github.com/apollographql/apollo-server/pull/1024)
* `apollo-server-core`: context creation can be async and errors are formatted to include error code [PR #1024](https://github.com/apollographql/apollo-server/pull/1024)
* `apollo-server-core`: add `mocks` parameter to the base constructor(applies to all variants) [PR#1017](https://github.com/apollographql/apollo-server/pull/1017)
* `apollo-server-core`: Remove printing of stack traces with `debug` option and include response in logging function[PR#1018](https://github.com/apollographql/apollo-server/pull/1018)
* `apollo-server-core`: Custom `execute` and `subscribe` functions [PR #4167](https://github.com/apollographql/apollo-server/pull/4167)
