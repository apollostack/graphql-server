---
title: Data sources
description: Caching Partial Query Results
---

Data sources are classes that encapsulate fetching data from a particular service, with built-in support for caching, deduplication, and error handling. You write the code that is specific to interacting with your backend, and Apollo Server takes care of the rest.

## REST Data Source

A `RESTDataSource` is responsible for fetching data from a given REST API.

To get started, install the REST data source package:

```bash
npm install apollo-datasource-rest
```

To define a data source, extend the `RESTDataSource` class and implement the data fetching methods that your resolvers require. Your implementation of these methods can call on convenience methods built into the `RESTDataSource` class to perform HTTP requests, while making it easy to build up query parameters, parse JSON results, and handle errors.

```js
const { RESTDataSource } = require('apollo-datasource-rest');

class MoviesAPI extends RESTDataSource {
  constructor() {
    super();
    this.baseURL = 'https://movies-api.example.com/';
  }

  async getMovie(id) {
    return this.get(`movies/${id}`);
  }

  async getMostViewedMovies(limit = 10) {
    const data = await this.get('movies', {
      per_page: limit,
      order_by: 'most_viewed',
    });
    return data.results;
  }
}
```

### HTTP Methods

The `get` method on the `RESTDataSource` makes an HTTP `GET` request. Similarly, there are methods built-in to allow for `HEAD`, `POST`, `PUT`, `PATCH`, and `DELETE` requests.

```js
class MoviesAPI extends RESTDataSource {
  constructor() {
    super();
    this.baseURL = 'https://movies-api.example.com/';
  }

  // an example making an HTTP POST request
  async postMovie(movie) {
    return this.post(
      `movies`, // path
      movie, // request body
    );
  }

  // an example making an HTTP PUT request
  async newMovie(movie) {
    return this.put(
      `movies`, // path
      movie, // request body
    );
  }

  // an example making an HTTP PATCH request
  async updateMovie(movie) {
    return this.patch(
      `movies`, // path
      { id: movie.id, movie }, // request body
    );
  }

  // an example making an HTTP DELETE request
  async deleteMovie(movie) {
    return this.delete(
      `movies/${movie.id}`, // path
    );
  }
}
```

All of the HTTP helper functions (`get`, `head`, `put`, `post`, `patch`, and `delete`) accept a third `options` parameter, which can be used to set things like headers and referrers. For more info on the options available, see MDN's [fetch docs](https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/fetch#Parameters).

### Intercepting fetches

Data sources allow you to intercept fetches to set headers, query parameters, or make other changes to the outgoing request. This is most often used for authorization or other common concerns that apply to all requests. Data sources also get access to the GraphQL context, which is a great place to store a user token or other information you need to have available.

You can easily set a header on every request:

```js
class PersonalizationAPI extends RESTDataSource {
  willSendRequest(request) {
    request.headers.set('Authorization', this.context.token);
  }
}
```

Or add a query parameter:

```js
class PersonalizationAPI extends RESTDataSource {
  willSendRequest(request) {
    request.params.set('api_key', this.context.token);
  }
}
```

If you're using TypeScript, make sure to import the `RequestOptions` type:

```typescript
import { RESTDataSource, RequestOptions } from 'apollo-datasource-rest';

class PersonalizationAPI extends RESTDataSource {
  baseURL = 'https://personalization-api.example.com/';

  willSendRequest(request: RequestOptions) {
    request.headers.set('Authorization', this.context.token);
  }
}
```

### Resolving URLs dynamically

In some cases, you'll want to set the URL based on the environment or other contextual values. You can use a getter for this:

```js
get baseURL() {
  if (this.context.env === 'development') {
    return 'https://movies-api-dev.example.com/';
  } else {
    return 'https://movies-api.example.com/';
  }
}
```

If you need more customization, including the ability to resolve a URL asynchronously, you can also override `resolveURL`:

```js
async resolveURL(request: RequestOptions) {
  if (!this.baseURL) {
    const addresses = await resolveSrv(request.path.split("/")[1] + ".service.consul");
    this.baseURL = addresses[0];
  }
  return super.resolveURL(request);
}
```

## Community data sources

The following data sources are community contributions which offer their own extensions to the base `DataSource` class provided by `apollo-datasource`.  While the packages here have been given cursory reviews, Apollo offers no assurance that they follow best practices or that they will continue to be maintained.  If you're the author of a data source that extends `DataSource`, please open a PR to this documentation to have it featured here.  For more details on specific packages, or to report an issue with one of these packages, please refer to the appropriate repository.

- `SQLDataSource` from [`datasource-sql`](https://github.com/cvburgess/SQLDataSource)
- `MongoDataSource` from [`apollo-datasource-mongodb`](https://github.com/GraphQLGuide/apollo-datasource-mongodb/)

## Accessing data sources from resolvers

To give resolvers access to data sources, you pass them as options to the `ApolloServer` constructor:

```js
const server = new ApolloServer({
  typeDefs,
  resolvers,
  dataSources: () => {
    return {
      moviesAPI: new MoviesAPI(),
      personalizationAPI: new PersonalizationAPI(),
    };
  },
  context: () => {
    return {
      token: 'foo',
    };
  },
});
```

Apollo Server will put the data sources on the context for every request, so you can access them from your resolvers. It will also give your data sources access to the context. (The reason for not having users put data sources on the context directly is because that would lead to a circular dependency.)

From our resolvers, we can access the data source and return the result:

```js
 Query: {
    movie: async (_source, { id }, { dataSources }) => {
      return dataSources.moviesAPI.getMovie(id);
    },
    mostViewedMovies: async (_source, _args, { dataSources }) => {
      return dataSources.moviesAPI.getMostViewedMovies();
    },
    favorites: async (_source, _args, { dataSources }) => {
      return dataSources.personalizationAPI.getFavorites();
    },
  },
```

## What about DataLoader?

[DataLoader](https://github.com/graphql/dataloader) was designed by Facebook with a specific use case in mind: deduplicating and batching object loads from a data store. It provides a memoization cache, which avoids loading the same object multiple times during a single GraphQL request, and it coalesces loads that occur during a single tick of the event loop into a batched request that fetches multiple objects at once.

Although DataLoader is great for that use case, it’s less helpful when loading data from REST APIs because its primary feature is _batching_, not _caching_. What we’ve found to be far more important when layering GraphQL over REST APIs is having a resource cache that saves data across multiple GraphQL requests, can be shared across multiple GraphQL servers, and has cache management features like expiry and invalidation that leverage standard HTTP cache control headers.

#### Batching

Most REST APIs don't support batching, and if they do, using a batched endpoint may actually jeopardize caching. When you fetch data in a batch request, the response you receive is for the exact combination of resources you're requesting. Unless you request that same combination again, future requests for the same resource won't be served from cache.
Our recommendation is to restrict batching to requests that can't be cached. In those cases, you can actually take advantage of DataLoader as a private implementation detail inside your data source.

```js
class PersonalizationAPI extends RESTDataSource {
  constructor() {
    super();
    this.baseURL = 'https://personalization-api.example.com/';
  }

  willSendRequest(request) {
    request.headers.set('Authorization', this.context.token);
  }

  private progressLoader = new DataLoader(async (ids) => {
    const progressList = await this.get('progress', {
      ids: ids.join(','),
    });
    return ids.map(id =>
      progressList.find((progress) => progress.id === id),
    );
  });

  async getProgressFor(id) {
    return this.progressLoader.load(id);
  }
```

## Using Memcached/Redis as a cache storage backend

By default, resource caching will use an in-memory LRU cache. When running multiple server instances, you'll want to use a shared cache backend instead. That's why Apollo Server also includes support for using [Memcached](https://memcached.org/) or [Redis](https://redis.io/) as cache stores via the [`apollo-server-cache-memcached`](https://www.npmjs.com/package/apollo-server-cache-memcached) and [`apollo-server-cache-redis`](https://www.npmjs.com/package/apollo-server-cache-redis) packages. You can specify which one to use by creating an instance and passing it into the `ApolloServer` constructor:

```js
const { MemcachedCache } = require('apollo-server-cache-memcached');

const server = new ApolloServer({
  typeDefs,
  resolvers,
  cache: new MemcachedCache(
    ['memcached-server-1', 'memcached-server-2', 'memcached-server-3'],
    { retries: 10, retry: 10000 }, // Options
  ),
  dataSources: () => ({
    moviesAPI: new MoviesAPI(),
  }),
});
```

For documentation of the options you can pass to the underlying Memcached client, look [here](https://github.com/3rd-Eden/memcached).

```js
const { RedisCache } = require('apollo-server-cache-redis');

const server = new ApolloServer({
  typeDefs,
  resolvers,
  cache: new RedisCache({
    host: 'redis-server',
    // Options are passed through to the Redis client
  }),
  dataSources: () => ({
    moviesAPI: new MoviesAPI(),
  }),
});
```

For documentation of the options you can pass to the underlying Redis client, look [here](https://github.com/luin/ioredis).

## Implementing your own cache backend

Apollo Server exposes a `KeyValueCache` interface that you can use to implement connectors to other data stores, or to optimize for the query characteristics of your application. More information can be found in the package readme for [apollo-server-caching](https://www.npmjs.com/package/apollo-server-caching).
