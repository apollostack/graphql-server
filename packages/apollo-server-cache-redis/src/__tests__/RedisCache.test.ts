jest.mock('ioredis');

import { RedisCache } from '../index';
import {
  testKeyValueCache_Basics,
  testKeyValueCache_Expiration,
} from '../../../apollo-server-caching/src/__tests__/testsuite';

describe('Redis', () => {
  const cache = new RedisCache();
  afterAll(async () => {
    await cache.close();
  })
  testKeyValueCache_Basics(cache);
  testKeyValueCache_Expiration(cache);
});
