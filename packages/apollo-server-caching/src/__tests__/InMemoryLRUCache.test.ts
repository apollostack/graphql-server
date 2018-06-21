import { testKeyValueCache } from './testsuite';
import { InMemoryLRUCache } from '../InMemoryLRUCache';
testKeyValueCache(new InMemoryLRUCache());
