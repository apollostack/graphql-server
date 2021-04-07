---
title: "API Reference: Usage reporting plugin"
sidebar_title: Usage reporting plugin
api_reference: true
---

Apollo Server has a built-in usage reporting plugin that gathers data on how your clients use the operations and fields in your GraphQL schema. The plugin also handles pushing this usage data to [Apollo Studio](https://www.apollographql.com/docs/studio/), as described in [Metrics and logging](../../monitoring/metrics/).

> This plugin was introduced in Apollo Server 2.18. In previous versions, usage reporting is configured by providing the `engine` option to the `ApolloServer` constructor. That option continues to work (but is now deprecated). See [the migration guide](../../migration-engine-plugins/) for details.

## Default installation

Apollo Server automatically installs and enables this plugin with default settings if you [provide a graph API key to Apollo Server](https://www.apollographql.com/docs/apollo-server/monitoring/metrics/#connecting-to-apollo-studio) (usually by setting the value of the `APOLLO_KEY` environment variable). No other action is required.

If you don't provide an API key, this plugin is not installed.

## Custom installation

You can configure the usage reporting plugin's behavior by including it in the `plugins` array you pass to the `ApolloServer` constructor:

```js
import { ApolloServer } from "apollo-server";
import { ApolloServerPluginUsageReporting } from "apollo-server-core";

const server = new ApolloServer({
  typeDefs,
  resolvers,
  plugins: [
    ApolloServerPluginUsageReporting({
      sendVariableValues: { all: true },
    }),
  ],
});
```

Supported configuration options are listed below.

#### Options

<table class="field-table">
  <thead>
    <tr>
      <th>Name /<br/>Type</th>
      <th>Description</th>
    </tr>
  </thead>

<tbody>
<tr>
<td colspan="2">

**Configuring which data is sent to Apollo Studio**
</td>
</tr>

<tr>
<td>

###### `sendVariableValues`

`Object`
</td>
<td>

Provide this object to configure which GraphQL variable values are included in trace data that's sent to Apollo Studio. Valid options are described in [Valid `sendVariableValues` object signatures](#valid-sendvariablevalues-object-signatures).

The default value is `{ none: true }`, which means **no** variable values are sent to Studio. This is a security measure to prevent sensitive data from potentially reaching Apollo servers.

</td>
</tr>

<tr>
<td>

###### `sendHeaders`

`Object`
</td>
<td>

Provide this object to configure which request header names and values are included in trace data that's sent to Apollo Studio. Valid options are described in [Valid `sendHeaders` object signatures](#valid-sendheaders-object-signatures).

The default value is `{ none: true }`, which means **no** header names or values are sent to Studio. This is a security measure to prevent sensitive data from potentially reaching Apollo servers.

</td>
</tr>

<tr>
<td>

###### `rewriteError`

`Function`
</td>
<td>

Specify this function to modify GraphQL operation errors before Apollo Server reports those errors to Apollo Studio. The function takes a [`GraphQLError`](https://github.com/graphql/graphql-js/blob/master/src/error/GraphQLError.js) object and must also return one (or `null` to prevent Apollo Server from reporting a particular error entirely).

The only properties of the reported error you can modify are its `message` and its `extensions`.

**Note:** If this `ApolloServer` instance is acting as the gateway in an [Apollo Federation](https://www.apollographql.com/docs/federation/#architecture) architecture, this option does **not** modify errors that originate in implementing services. To modify those errors, instead configure the [`rewriteError` option in the inline trace plugin](./inline-trace/#rewriteerror), which you install in the implementing service's `ApolloServer` instance.
</td>
</tr>

<tr>
<td>

###### `includeRequest`

`async Function`
</td>
<td>

Specify this asynchronous function to configure which requests are included in usage reports sent to Apollo Studio. For example, you can omit requests that execute a particular operation or requests that include a particular HTTP header.

This function is called for each received request. It takes a [`GraphQLRequestContext`](https://github.com/apollographql/apollo-server/blob/main/packages/apollo-server-types/src/index.ts#L115-L150) object and must return a `Promise<Boolean>` that indicates whether to include the request. It's called either after the operation is successfully resolved (via [the `didResolveOperation` event](https://www.apollographql.com/docs/apollo-server/integrations/plugins/#didresolveoperation)), or after it generates an error (via [the `didEncounterErrors` event](https://www.apollographql.com/docs/apollo-server/integrations/plugins/#didencountererrors)).

By default, all requests are included in usage reports.

</td>
</tr>

<tr>
<td>

###### `generateClientInfo`

`Function`
</td>
<td>

Specify this function to provide Apollo Studio with client details for each processed request. Apollo Studio uses this information to [segment metrics by client](https://www.apollographql.com/docs/studio/client-awareness/).

This function is passed a [`GraphQLRequestContext`](https://github.com/apollographql/apollo-server/blob/main/packages/apollo-server-types/src/index.ts#L115-L150) object containing all available information about the request. It should return an object with `clientName` and `clientVersion` fields that identify the associated client.

By default, the plugin attempts to obtain these values from the incoming request's HTTP headers (specifically, `apollographql-client-name` and `apollographql-client-version`).

</td>
</tr>

<tr>
<td>

###### `overrideReportedSchema`

`string`
</td>
<td>

If you're using the `overrideReportedSchema` option with the [schema reporting plugin (`ApolloServerPluginSchemaReporting`)](./schema-reporting/#overridereportedschema), you should provide the same value for this option. This ensures that the schema ID associated with a request in this plugin's usage reports matches the schema ID that the other plugin reports.

</td>
</tr>

<tr>
<td>

###### `sendUnexecutableOperationDocuments`

`Boolean`
</td>
<td>

Statistics about operations that your server cannot execute are not reported under each document separately to Apollo Studio, but are grouped together as "parse failure", "validation failure", or "unknown operation name". By default, the usage reporting plugin does not include the full operation document in reported traces, because it is challenging to strip potential private information (like string constants) from invalid operations. If you'd like the usage reporting plugin to send the full operation document and operation name so you can view it in Apollo Studio's trace view, set this to true.

</td>
</tr>

<tr>
<td colspan="2">

**Configuring communication protocol**
</td>
</tr>

<tr>
<td>

###### `sendReportsImmediately`

`boolean`
</td>
<td>

If `true`, the plugin sends a usage report to Apollo Studio after every request instead of sending batched reports.

This option is useful for stateless environments like Amazon Lambda where processes terminate after handling a small number of requests.

The default value is `true` when using an `ApolloServer` subclass for a serverless framework (Amazon Lambda, Google Cloud Functions, or Azure Functions) and `false` otherwise.

Note that "immediately" does not mean _synchronously_ with completing the response, but rather "very soon", such as after a `setImmediate` call.

</td>
</tr>

<tr>
<td>

###### `requestAgent`

`http.Agent` or `https.Agent` or `false`
</td>
<td>

An HTTP(S) agent to use for reporting. Can be either an [`http.Agent`](https://nodejs.org/docs/latest-v10.x/api/http.html#http_class_http_agent) or an [`https.Agent`](https://nodejs.org/docs/latest-v10.x/api/https.html#https_class_https_agent). It behaves the same as the `agent` parameter to [`http.request`](https://nodejs.org/docs/latest-v8.x/api/http.html#http_http_request_options_callback).
</td>
</tr>

<tr>
<td>

###### `reportIntervalMs`

`number`
</td>
<td>

The interval at which Apollo Server should send batched trace reports to Studio, in milliseconds.

Regardless of this value, Apollo Server sends a trace report whenever the size of a pending batch exceeds the value of `maxUncompressedReportSize` (default 4MB).

</td>
</tr>

<tr>
<td>

###### `maxUncompressedReportSize`

`number`
</td>
<td>

Apollo Server sends a trace report whenever the size of a pending batched trace report exceeds this value (in bytes), regardless of its standard reporting interval.

Note that this is a rough limit that includes the size of serialized traces and signatures. It ignores the size of the report's header and some other top-level bytes.

The default value is 4MB (`4194304`).
</td>
</tr>

<tr>
<td>

###### `maxAttempts`

`number`
</td>
<td>

The maximum number of times Apollo Server should attempt to report each trace report, performing exponential backoff between attempts.

The default value is `5`.
</td>
</tr>

<tr>
<td>

###### `minimumRetryDelayMs`

`number`
</td>
<td>

The minimum amount of backoff (in milliseconds) Apollo Server should perform before retrying a failed trace report.

The default value is `100`.
</td>
</tr>

<tr>
<td>

###### `logger`

[`Logger`](https://github.com/apollographql/apollo-server/blob/main/packages/apollo-server-types/src/index.ts#L166-L172)
</td>
<td>

If you provide this object, the plugin sends it all log messages related to Apollo Studio communication, instead of sending them to the default logger. The object must implement all methods of [the `Logger` interface](https://github.com/apollographql/apollo-server/blob/main/packages/apollo-server-types/src/index.ts#L166-L172).

</td>
</tr>

<tr>
<td>

###### `reportErrorFunction`

`Function`
</td>
<td>

If you provide this function, the plugin calls it whenever it encounters an error while reporting usage data. The details of the error are passed to the function.

By default, the plugin logs these errors to its specified `logger`. _Unlike_ the `logger`, this function receives the actual `Error` object instead of only an error message.

</td>
</tr>

<tr>
<td colspan="2">

**Internal and non-recommended options**
</td>
</tr>

<tr>
<td>

###### `endpointUrl`

`string`
</td>
<td>

The URL base that the plugin sends reports to (not including the path). This option only needs to be set for testing and Apollo-internal uses.
</td>
</tr>

<tr>
<td>

###### `debugPrintReports`

`boolean`
</td>
<td>

If set, prints all reports as JSON when they are sent. (Note that for technical reasons, traces embedded in a report are printed separately when they are added to a report.)
</td>
</tr>

<tr>
<td>

###### `calculateSignature`

`Function`
</td>
<td>

Specify this function to create a signature for a query. This option is not recommended, because Apollo's servers make assumptions about how the signature relates to the operation you executed.
</td>
</tr>

</tbody>
</table>

#### Valid `sendVariableValues` object signatures

| Object | Description |
|--------|-------------|
| `{ none: true }` | If you provide this object, no GraphQL variable values are sent to Apollo Studio. This is the default behavior. |
| `{ all: true }` |  If you provide this object, **all** GraphQL variable values are sent to Apollo Studio. |
| `{ onlyNames: ["apple", "orange"]}`| If you provide an object with this structure, only values of the GraphQL variables with names that appear in the array are sent to Apollo Studio. Case-sensitive. |
| `{ exceptNames: ["apple", "orange"]}`| If you provide an object with this structure, all GraphQL variable values **except** values of variables with names that appear in the array are sent to Apollo Studio. Case-sensitive. |
| `{ transform: ({ variables, operationString)} => { ... } }` | <p>The value of `transform` is a function that takes the values of all GraphQL variables for an operation and the operation string. The function returns a new variables map containing values for the operation's variables that should be sent to Apollo Studio. This map does not need to contain all of the operation's variables, but it cannot _add_ variables to the map. You should not mutate `variables` itself or any of the values contained in it.</p><p>For security reasons, if an error occurs in the `transform` function, **all** variable values are replaced with `[PREDICATE_FUNCTION_ERROR]`. |

#### Valid `sendHeaders` object signatures

| Object | Description |
|--------|-------------|
| `{ none: true }` | If you provide this object, no request header names or values are sent to Apollo Studio. This is the default behavior. |
| `{ all: true }` |  If you provide this object, **all** GraphQL header names and values are sent to Apollo Studio, except for the protected headers listed above. |
| `{ onlyNames: ["apple", "orange"]}`| If you provide an object with this structure, only names and values of the request headers with names that appear in the array are sent to Apollo Studio. Case-insensitive. |
| `{ exceptNames: ["apple", "orange"]}`| If you provide an object with this structure, all GraphQL header values **except** values of headers with names that appear in the array are sent to Apollo Studio. Case-insensitive. |

**Note:** Regardless of your configuration, Apollo Server **never** sends the values of the following headers to Apollo Studio:

 * `authorization`
 * `cookie`
 * `set-cookie`

## Disabling the plugin

If you _don't_ want to install the usage reporting plugin and you _are_ providing an API key to Apollo Server for other purposes, you can disable usage reporting by installing the `ApolloServerPluginUsageReportingDisabled` plugin, like so:

```js
import { ApolloServer } from "apollo-server";
import { ApolloServerPluginUsageReportingDisabled } from "apollo-server-core";

const server = new ApolloServer({
  typeDefs,
  resolvers,
  plugins: [ApolloServerPluginUsageReportingDisabled()],
});
```
