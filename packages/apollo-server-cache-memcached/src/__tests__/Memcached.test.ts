// use mock implementations for underlying databases
jest.mock('memcached', () => require('memcached-mock'));

import { MemcachedCache } from '../index';
import {
  testKeyValueCache_Basics,
  testKeyValueCache_Expiration,
} from '../../../apollo-server-caching/src/__tests__/testsuite';

describe('Memcached', () => {
  const cache = new MemcachedCache('localhost');
  afterAll(async () => {
    await cache.close();
  })
  testKeyValueCache_Basics(cache);
  testKeyValueCache_Expiration(cache);
});
