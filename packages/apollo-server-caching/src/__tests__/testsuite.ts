import { advanceTimeBy, mockDate, unmockDate } from '__mocks__/date';
import { TestableKeyValueCache } from '../';

export function testKeyValueCache_Basics(keyValueCache: TestableKeyValueCache) {
  describe('basic cache functionality', () => {
    beforeEach(() => {
      keyValueCache.flush && keyValueCache.flush();
    });

    it('can do a basic get and set', async () => {
      await keyValueCache.set('hello', 'world');
      expect(await keyValueCache.get('hello')).toBe('world');
      expect(await keyValueCache.get('missing')).toBeUndefined();
    });

    it('can do a basic set and delete', async () => {
      await keyValueCache.set('hello', 'world');
      expect(await keyValueCache.get('hello')).toBe('world');
      await keyValueCache.delete('hello');
      expect(await keyValueCache.get('hello')).toBeUndefined();
    });
  });
}

export function testKeyValueCache_Expiration(
  keyValueCache: TestableKeyValueCache,
) {
  describe('time-based cache expunging', () => {
    beforeAll(() => {
      mockDate();
      jest.useFakeTimers();
    });

    beforeEach(() => {
      keyValueCache.flush && keyValueCache.flush();
    });

    afterAll(() => {
      jest.useRealTimers();
      unmockDate();
    });

    it('is able to expire keys based on ttl', async () => {
      await keyValueCache.set('short', 's', { ttl: 1 });
      await keyValueCache.set('long', 'l', { ttl: 5 });
      expect(await keyValueCache.get('short')).toBe('s');
      expect(await keyValueCache.get('long')).toBe('l');
      advanceTimeBy(1500);
      jest.advanceTimersByTime(1500);
      expect(await keyValueCache.get('short')).toBeUndefined();
      expect(await keyValueCache.get('long')).toBe('l');
      advanceTimeBy(4000);
      jest.advanceTimersByTime(4000);
      expect(await keyValueCache.get('short')).toBeUndefined();
      expect(await keyValueCache.get('long')).toBeUndefined();
    });

    it('does not expire when ttl is null', async () => {
      await keyValueCache.set('forever', 'yours', { ttl: null });
      expect(await keyValueCache.get('forever')).toBe('yours');
      advanceTimeBy(1500);
      jest.advanceTimersByTime(1500);
      expect(await keyValueCache.get('forever')).toBe('yours');
      advanceTimeBy(4000);
      jest.advanceTimersByTime(4000);
      expect(await keyValueCache.get('forever')).toBe('yours');
    });
  });
}

export function testKeyValueCache(keyValueCache: TestableKeyValueCache) {
  describe('KeyValueCache Test Suite', () => {
    afterAll(async () => {
      if (keyValueCache.close) {
        await keyValueCache.close();
      }
    });
    testKeyValueCache_Basics(keyValueCache);
    testKeyValueCache_Expiration(keyValueCache);
  });
}
