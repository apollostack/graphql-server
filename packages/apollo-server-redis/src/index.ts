import { KeyValueCache } from 'apollo-server-caching';
import * as Redis from 'redis';
import { promisify } from 'util';

/**
 * Defines a KeyValueCache implementation that supports cache tag invalidation.
 * When cache entry is associated with 1 or more tags, we store tag:version
 * pairs as metadata, as well as the current version associated with each tag.
 * Version numbers are simply integers that are incremented whenever a tag is
 * invalidated. For a cache entry to be valid, all of its associated tags must
 * have version numbers that match their current version numbers.
 *
 * Performance:
 * - set()        : # of db reads = # of tags
 * - get()        : # of db reads = # of tags
 * - invalidate() : # of db writes/incr = 1 for each tag
 *
 * Storage overhead:
 * - key->data + tag:version pairs for each tag
 * - tag->version stored for each tag
 */

interface CachePayload {
  d: string;
  t: Record<string, number>;
}

export class RedisCache implements KeyValueCache {
  readonly client;
  readonly defaultSetOptions = {
    ttl: 300,
    tags: [] as string[],
  };

  constructor(options: Redis.ClientOpts) {
    this.client = Redis.createClient(options);
    // promisify client calls for convenience
    this.client.get = promisify(this.client.get).bind(this.client);
    this.client.mget = promisify(this.client.mget).bind(this.client);
    this.client.incr = promisify(this.client.incr).bind(this.client);
    this.client.set = promisify(this.client.set).bind(this.client);
    this.client.flushdb = promisify(this.client.flushdb).bind(this.client);
    this.client.quit = promisify(this.client.quit).bind(this.client);
  }

  async set(
    key: string,
    data: string,
    options?: { ttl?: number; tags?: string[] },
  ): Promise<void> {
    const { ttl, tags } = Object.assign({}, this.defaultSetOptions, options);

    // get current versions for all tags
    let currentTagVersions: Record<string, number> = {};
    if (tags.length > 0) {
      // redis stores numbers as strings
      const tagVersionsArr: string[] = await this.client.mget(tags);

      const unknownTags: string[] = [];
      for (let i = 0; i < tagVersionsArr.length; i++) {
        if (tagVersionsArr[i] === null) {
          unknownTags.push(tags[i]);
        } else {
          currentTagVersions[tags[i]] = parseInt(tagVersionsArr[i]);
        }
      }

      // wait for all unknown tags to initialize
      const versions = await Promise.all(
        unknownTags.map(tag => this.client.incr(tag)),
      );

      unknownTags.forEach((tag, index) => {
        currentTagVersions[tag] = versions[index];
      });
    }

    const payload: CachePayload = {
      d: data,
      t: currentTagVersions,
    };

    await this.client.set(key, JSON.stringify(payload), 'EX', ttl);
  }

  async get(key: string): Promise<string | undefined> {
    const data = await this.client.get(key);
    if (data === null) return; // null is returned if key is not found

    // deserialize data
    const payload: CachePayload = JSON.parse(data);

    // compare tag versions of cache entry against current versions
    const tags = Object.keys(payload.t);
    if (tags.length !== 0) {
      const currentTagVersionsArr = await this.client.mget(tags);

      for (let i = 0; i < currentTagVersionsArr.length; i++) {
        if (
          currentTagVersionsArr[i] !== null &&
          parseInt(currentTagVersionsArr[i]) !== payload.t[tags[i]]
        ) {
          return; // tag has been invalidated, therefore cache entry not valid
        }
      }
    }

    // all tag versions up to date
    return payload.d;
  }

  async invalidate(tags: string[]): Promise<void> {
    // increment version numbers for all the tags to be invalidated
    if (tags.length > 0) {
      // Note: in Redis, if key does not exist, it is set to 0 before performing
      // the incr operation.
      await Promise.all(tags.map(tag => this.client.incr(tag)));
    }
  }

  async flush(): Promise<void> {
    await this.client.flushdb();
  }

  async close(): Promise<void> {
    await this.client.quit();
    return;
  }
}
