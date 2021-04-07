## RedisCache

[![npm version](https://badge.fury.io/js/apollo-server-cache-redis.svg)](https://badge.fury.io/js/apollo-server-cache-redis)
[![Build Status](https://circleci.com/gh/apollographql/apollo-server/tree/main.svg?style=svg)](https://circleci.com/gh/apollographql/apollo-server)

This package exports an implementation of `KeyValueCache` that allows using Redis as a backing store for resource caching in [Data Sources](https://www.apollographql.com/docs/apollo-server/data/data-sources).

It currently supports a single instance of Redis, [Cluster](http://redis.io/topics/cluster-tutorial) and [Sentinel](http://redis.io/topics/sentinel).

## Usage

This package is built to be compatible with the [ioredis](https://www.npmjs.com/package/ioredis) Redis client. The recommended usage is to use the `BaseRedisCache` class which takes either a `client` option (a client that talks to a single server) or a `clusterClient` option (a client that talks to Redis Cluster). (The difference is that ioredis [only supports the `mget` multi-get command in non-cluster mode](https://github.com/luin/ioredis/issues/811), so using `clusterClient` tells `BaseRedisCache` to use parallel `get` commands instead.)

You may also use the older `RedisCache` and `RedisClusterCache` classes, which allow you to pass the ioredis constructor arguments directly to the cache class's constructor.
### Single instance

```js
const { BaseRedisCache } = require('apollo-server-cache-redis');
const Redis = require('ioredis');

const server = new ApolloServer({
  typeDefs,
  resolvers,
  cache: new BaseRedisCache({
    client: new Redis({
      host: 'redis-server',
    }),
  }),
  dataSources: () => ({
    moviesAPI: new MoviesAPI(),
  }),
});
```

### Sentinels

```js
const { BaseRedisCache } = require('apollo-server-cache-redis');
const Redis = require('ioredis');

const server = new ApolloServer({
  typeDefs,
  resolvers,
  cache: new BaseRedisCache({
    client: new Redis({
      sentinels: [{
        host: 'sentinel-host-01',
        port: 26379
      }],
      password: 'my_password',
      name: 'service_name',
    }),
  }),
  dataSources: () => ({
    moviesAPI: new MoviesAPI(),
  }),
});
```

### Cluster

```js
const { BaseRedisCache } = require('apollo-server-cache-redis');
const Redis = require('ioredis');

const server = new ApolloServer({
  typeDefs,
  resolvers,
  cache: new BaseRedisCache({
    clusterClient: new Redis.Cluster(
      [{
        host: 'redis-node-01-host',
        // Options are passed through to the Redis cluster client
      }],
      {
        // Redis cluster client options
      }
    ),
  }),
  dataSources: () => ({
    moviesAPI: new MoviesAPI(),
  }),
});
```

For documentation of the options you can pass to the underlying redis client, look [here](https://github.com/luin/ioredis).
