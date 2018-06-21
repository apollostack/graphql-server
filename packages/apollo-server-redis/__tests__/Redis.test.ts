// use mock implementations for underlying databases
jest.mock('redis', () => require('redis-mock'));

import { RedisCache } from '../src/index';
import { testKeyValueCache } from '../../apollo-server-caching/src/__tests__/testsuite';

testKeyValueCache(new RedisCache({ host: 'localhost' }));
