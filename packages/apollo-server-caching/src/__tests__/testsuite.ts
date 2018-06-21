import {
  advanceTimeBy,
  mockDate,
  unmockDate,
} from '../../../../__mocks__/date';
import { KeyValueCache } from '../KeyValueCache';

export function testKeyValueCache(keyValueCache: KeyValueCache) {
  describe('KeyValueCache Test Suite', () => {
    beforeAll(() => {
      mockDate();
      jest.useFakeTimers();
    });

    beforeEach(() => {
      keyValueCache.flush();
    });

    afterAll(() => {
      unmockDate();
      keyValueCache.close();
    });

    it('can do a basic get and set', async () => {
      await keyValueCache.set('hello', 'world');
      expect(await keyValueCache.get('hello')).toBe('world');
      expect(await keyValueCache.get('missing')).not.toBeDefined();
    });

    it('can set same key multiple times', async () => {
      await keyValueCache.set('hello', 'world');
      await keyValueCache.set('hello', 'world');
      expect(await keyValueCache.get('hello')).toBe('world');
      expect(await keyValueCache.get('missing')).not.toBeDefined();
    });

    it('can expire keys based on ttl', async () => {
      await keyValueCache.set('short', 's', { ttl: 1 });
      await keyValueCache.set('long', 'l', { ttl: 5 });
      expect(await keyValueCache.get('short')).toBe('s');
      expect(await keyValueCache.get('long')).toBe('l');
      advanceTimeBy(1100);
      jest.advanceTimersByTime(1100);
      expect(await keyValueCache.get('short')).not.toBeDefined();
      expect(await keyValueCache.get('long')).toBe('l');
      advanceTimeBy(4100);
      jest.advanceTimersByTime(4100);
      expect(await keyValueCache.get('short')).not.toBeDefined();
      expect(await keyValueCache.get('long')).not.toBeDefined();
    });

    it('can set tags', async () => {
      await keyValueCache.set('tagged', 'data', {
        ttl: 1,
        tags: ['tag1', 'tag2'],
      });
      expect(await keyValueCache.get('tagged')).toBe('data');
    });

    it('can invalidate tags', async () => {
      await keyValueCache.set('key1', 'v1', {
        ttl: 10,
        tags: ['tag1', 'tag2'],
      });
      await keyValueCache.set('key2', 'v2', {
        ttl: 10,
        tags: ['tag2', 'tag3'],
      });

      expect(await keyValueCache.get('key1')).toBe('v1');
      expect(await keyValueCache.get('key2')).toBe('v2');
      await keyValueCache.invalidate(['tag1']);
      expect(await keyValueCache.get('key1')).not.toBeDefined();
      expect(await keyValueCache.get('key2')).toBe('v2');
      await keyValueCache.invalidate(['tag3']);
      expect(await keyValueCache.get('key1')).not.toBeDefined();
      expect(await keyValueCache.get('key2')).not.toBeDefined();
    });

    it('can invalidate tag for multiple keys', async () => {
      await keyValueCache.set('key1', 'v1', {
        ttl: 10,
        tags: ['tag1', 'tag2'],
      });
      await keyValueCache.set('key2', 'v2', {
        ttl: 10,
        tags: ['tag2', 'tag3'],
      });

      expect(await keyValueCache.get('key1')).toBe('v1');
      expect(await keyValueCache.get('key2')).toBe('v2');
      await keyValueCache.invalidate(['tag2']);
      expect(await keyValueCache.get('key1')).not.toBeDefined();
      expect(await keyValueCache.get('key2')).not.toBeDefined();
    });

    it('can reset tags', async () => {
      await keyValueCache.set('key1', 'v1', {
        ttl: 10,
        tags: ['tag1', 'tag2'],
      });
      await keyValueCache.set('key1', 'v1', {
        ttl: 10,
        tags: ['tag2', 'tag3'],
      });

      await keyValueCache.invalidate(['tag1']);
      expect(await keyValueCache.get('key1')).toBe('v1');
      await keyValueCache.invalidate(['tag3']);
      expect(await keyValueCache.get('key1')).not.toBeDefined();
    });

    it('can invalidate tags before they have been set', async () => {
      await keyValueCache.invalidate(['tag1']);
      await keyValueCache.set('key1', 'v1', {
        ttl: 10,
        tags: ['tag1', 'tag2'],
      });
      expect(await keyValueCache.get('key1')).toBe('v1');
    });

    it('can invalidate tags after keys expire', async () => {
      await keyValueCache.set('key1', 'v1', {
        ttl: 10,
        tags: ['tag1'],
      });
      advanceTimeBy(5100);
      jest.advanceTimersByTime(5100);
      expect(await keyValueCache.get('key1')).toBe('v1');
      advanceTimeBy(5100);
      jest.advanceTimersByTime(5100);
      // key has expired
      await keyValueCache.invalidate(['tag1']);
      expect(await keyValueCache.get('key1')).not.toBeDefined();
    });
  });
}
