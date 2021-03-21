jest.mock('ioredis');

import { RedisCache } from '../index';
import {
  testKeyValueCache_Basics,
  testKeyValueCache_Expiration,
} from '../../../apollo-server-caching/src/__tests__/testsuite';

describe('Redis without options', () => {
    const cache = new RedisCache();
    testKeyValueCache_Basics(cache);
    testKeyValueCache_Expiration(cache);
});

describe('Redis with options', () => {
    const cache = new RedisCache({ host: 'localhost' });
    testKeyValueCache_Basics(cache);
    testKeyValueCache_Expiration(cache);
});

describe('Redis with path', () => {
    const cache = new RedisCache("redis://localhost");
    testKeyValueCache_Basics(cache);
    testKeyValueCache_Expiration(cache);
});

describe('Redis with port only', () => {
    const cache = new RedisCache(3000);
    testKeyValueCache_Basics(cache);
    testKeyValueCache_Expiration(cache);
});

describe('Redis with port & host', () => {
    const cache = new RedisCache(3000, "localhost");
    testKeyValueCache_Basics(cache);
    testKeyValueCache_Expiration(cache);
});

describe('Redis with port & options', () => {
    const cache = new RedisCache(3000, { host: 'localhost' });
    testKeyValueCache_Basics(cache);
    testKeyValueCache_Expiration(cache);
});

describe('Redis with path & options', () => {
    const cache = new RedisCache("redis://localhost", { host: 'localhost' });
    testKeyValueCache_Basics(cache);
    testKeyValueCache_Expiration(cache);
});

describe('Redis with port & host & options', () => {
    const cache = new RedisCache(3000, "redis://localhost", { host: 'localhost' });
    testKeyValueCache_Basics(cache);
    testKeyValueCache_Expiration(cache);
});
