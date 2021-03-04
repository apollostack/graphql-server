---
title: Caching
description: Automatically set HTTP cache headers and save full responses in a cache.
---

Production apps often rely on caching for scalability.

A single GraphQL request consists of running many different resolvers, each of which can have different caching semantics. Some fields may be uncacheable. Some fields may be cacheable for a few seconds, and others for a few hours. Some fields may have values that are the same for all users of your app, and other fields may vary based on the current session.

Apollo Server provides a mechanism for server authors to declare fine-grained cache control parameters on individual GraphQL types and fields, both statically inside your schema using the `@cacheControl` directive and dynamically within your resolvers using the `info.cacheControl.setCacheHint` API.

For each request, Apollo Server combines all the cache hints from all the queried fields and uses it to power several caching features. These features include **HTTP caching headers** for CDNs and browsers, and a GraphQL **full response cache**.

## Defining cache hints

You can define cache hints *statically* in your schema and *dynamically* in your resolvers.

> **Important note on compatibility:** Setting cache hints is currently incompatible with the `graphql-tools` implementation of schema stitching, because cache hints are not appropriately communicated from one service to the other.

### Adding cache hints statically in your schema

The easiest way to add cache hints is directly in your schema using the `@cacheControl` directive. Apollo Server automatically adds the definition of the `@cacheControl` directive to your schema when you create a new `ApolloServer` object with `typeDefs` and `resolvers`. Hints look like this:

```graphql
type Post @cacheControl(maxAge: 240) {
  id: Int!
  title: String
  author: Author
  votes: Int @cacheControl(maxAge: 30)
  comments: [Comment]
  readByCurrentUser: Boolean! @cacheControl(scope: PRIVATE)
}

type Comment @cacheControl(maxAge: 1000) {
  post: Post!
}

type Query {
  latestPost: Post @cacheControl(maxAge: 10)
}
```

You can apply `@cacheControl` to an individual field or to a type.

Hints on a field describe the cache policy for that field itself; for example, `Post.votes` can be cached for 30 seconds.

Hints on a type apply to all fields that *return* objects of that type (possibly wrapped in lists and non-null specifiers). For example, the hint `@cacheControl(maxAge: 240)` on `Post` applies to the field `Comment.post`, and the hint `@cacheControl(maxAge:1000)` on `Comment` applies to the field `Post.comments`.

Hints on fields override hints specified on the target type. For example, the hint `@cacheControl(maxAge: 10)` on `Query.latestPost` takes precedence over the hint `@cacheControl(maxAge: 240)` on `Post`.

See [below](#setting-a-default-maxage) for the semantics of fields which don't have `maxAge` set on them (statically or dynamically).

`@cacheControl` can specify `maxAge` (in seconds, like in an HTTP `Cache-Control` header) and `scope`, which can be `PUBLIC` (the default) or `PRIVATE`. This is analogous to the http Cache-Control where `PRIVATE` means the request is only cacheable on a client browser and not any other intermediate cache.


### Adding cache hints dynamically in your resolvers

If you won't know if a field is cacheable until you've actually resolved it, you can use the dynamic API to set hints in your resolvers:

```javascript
const resolvers = {
  Query: {
    post: (_, { id }, _, info) => {
      info.cacheControl.setCacheHint({ maxAge: 60, scope: 'PRIVATE' });
      return find(posts, { id });
    }
  }
}
```

If you're using TypeScript, you need the following to teach TypeScript that the GraphQL `info` object has a `cacheControl` field:
```javascript
import 'apollo-cache-control';
```

### Setting a default `maxAge`

By default, root fields (ie, fields on `Query` and `Mutation`) and fields returning object and interface types are considered to have a `maxAge` of 0 (ie, uncacheable) if they don't have a static or dynamic cache hint. (Non-root scalar fields inherit their cacheability from their parent, so that in the common case of an object type with a bunch of strings and numbers which all have the same cacheability, you just need to declare the hint on the object type.)

The power of cache hints comes from being able to set them precisely to different values on different types and fields based on your understanding of your implementation's semantics. But when getting started with the cache control API, you might just want to apply the same `maxAge` to most of your resolvers.

You can achieve this by specifying a default max age when you create your `ApolloServer`. This max age will be used instead of 0 for root, object, and interface fields which don't explicitly set `maxAge` via schema hints (including schema hints on the type that they return) or the dynamic API. You can override this for a particular resolver or type by setting `@cacheControl(maxAge: 0)`. For example:

```javascript
const server = new ApolloServer({
  // ...
  cacheControl: {
    defaultMaxAge: 5,
  },
}));
```

### The overall cache policy

Apollo Server's cache API lets you declare fine-grained cache hints on specific resolvers. Apollo Server then combines these hints into an overall cache policy for the response. The `maxAge` of this policy is the minimum `maxAge` across all fields in your request. As [described above](#setting-a-default-maxage), the default `maxAge` of all root fields and non-scalar fields is 0, so the overall cache policy for a response will have `maxAge` 0 (ie, uncacheable) unless all root and non-scalar fields in the response have cache hints (or if `defaultMaxAge` is specified).

If the overall cache policy has a non-zero `maxAge`, its scope is `PRIVATE` if any hints have scope `PRIVATE`, and `PUBLIC` otherwise.

## Serving HTTP cache headers

For any response whose overall cache policy has a non-zero `maxAge`, Apollo Server will automatically set the `Cache-Control` HTTP response header to an appropriate value describing the `maxAge` and scope, such as `Cache-Control: max-age=60, private`.  If you run your Apollo Server instance behind a [CDN](https://en.wikipedia.org/wiki/Content_delivery_network) or other caching proxy, it can use this header's value to know how to cache your GraphQL responses.

As many CDNs and caching proxies only cache GET requests (not POST requests) and may have a limit on the size of a GET URL, you may find it helpful to use [automatic persisted queries](https://github.com/apollographql/apollo-link-persisted-queries), especially with the `useGETForHashedQueries` option to `apollo-link-persisted-queries`.

If you don't want to set HTTP cache headers, pass `cacheControl: {calculateHttpHeaders: false}` to `new ApolloServer()`.

## Saving full responses to a cache

Apollo Server lets you save cacheable responses to a Redis, Memcached, or in-process cache. Cached responses respect the `maxAge` cache hint.

To use the response cache, you need to install its plugin when you create your `ApolloServer`:

```javascript
import responseCachePlugin from 'apollo-server-plugin-response-cache';
const server = new ApolloServer({
  // ...
  plugins: [responseCachePlugin()],
});
```

By default, the response cache plugin will use the same cache used by other Apollo Server features, which defaults to an in-memory LRU cache. When running multiple server instances, you’ll want to use a shared cache backend such as Memcached or Redis instead.  See [the data sources documentation](/data/data-sources/#using-memcachedredis-as-a-cache-storage-backend) for details on how to customize Apollo Server's cache.  If you want to use a different cache backend for the response cache than for other Apollo Server caching features, just pass a `KeyValueCache` as the `cache` option to the `responseCachePlugin` function.

If you have data whose response should be cached separately for different users, set `@cacheControl(scope: PRIVATE)` hints on the data, and teach the cache control plugin how to tell your users apart by defining a `sessionId` hook:

```javascript
import responseCachePlugin from 'apollo-server-plugin-response-cache';
const server = new ApolloServer({
  // ...
  plugins: [responseCachePlugin({
    sessionId: (requestContext) => (requestContext.request.http.headers.get('sessionid') || null),
  })],
});
```

Responses whose overall cache policy scope is `PRIVATE` are shared only among sessions with the same session ID. Private responses are not cached if the `sessionId` hook is not defined or returns null.

Responses whose overall cache policy scope is `PUBLIC` are shared separately among all sessions with `sessionId` null and among all sessions with non-null `sessionId`.  Caching these separately allows you to have different caches for all logged-in users vs all logged-out users, if there is easily cacheable data that should only be visible to logged-in users.

Responses containing GraphQL errors or no data are never cached.

The plugin allows you to define a few more hooks to affect cache behavior for a specific request. All hooks take in a `GraphQLRequestContext`.

- `extraCacheKeyData`: this hook can return any JSON-stringifiable object which is added to the cache key. For example, if your API includes translatable text, this hook can return a string derived from `requestContext.request.http.headers.get('Accept-Language')`.
- `shouldReadFromCache`: if this hook returns false, the plugin will not read responses from the cache.
- `shouldWriteToCache`: if this hook returns false, the plugin will not write responses to the cache.

In addition to the [`Cache-Control` HTTP header](#serving-http-cache-headers), the response cache plugin will also set the `Age` HTTP header to the number of seconds the value has been sitting in the cache.
