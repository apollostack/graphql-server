import {
  TestableKeyValueCache,
  KeyValueCacheSetOptions,
} from 'apollo-server-caching';
import Redis, { RedisOptions } from 'ioredis';
import DataLoader from 'dataloader';

export class RedisCache implements TestableKeyValueCache<string> {
  readonly client: any;
  readonly defaultSetOptions: KeyValueCacheSetOptions = {
    ttl: 300,
  };

  private loader: DataLoader<string, string | null>;

  constructor(port: number, host: string, options: RedisOptions);
  constructor(path: string, options: RedisOptions);
  constructor(port: number, options: RedisOptions);
  constructor(port: number, host: string);
  constructor(options?: RedisOptions);
  constructor(port: number);
  constructor(path: string);
  constructor() {
    const client = new Redis(arguments[0], arguments[1], arguments[2]);
    this.client = client;

    this.loader = new DataLoader(keys => client.mget(...keys), {
      cache: false,
    });
  }

  async set(
    key: string,
    value: string,
    options?: KeyValueCacheSetOptions,
  ): Promise<void> {
    const { ttl } = Object.assign({}, this.defaultSetOptions, options);
    if (typeof ttl === 'number') {
      await this.client.set(key, value, 'EX', ttl);
    } else {
      // We'll leave out the EXpiration when no value is specified.  Of course,
      // it may be purged from the cache for other reasons as deemed necessary.
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | undefined> {
    const reply = await this.loader.load(key);
    if (reply !== null) {
      return reply;
    }
    return;
  }

  async delete(key: string): Promise<boolean> {
    return await this.client.del(key);
  }

  // Drops all data from Redis. This should only be used by test suites ---
  // production code should never drop all data from an end user Redis cache!
  async flush(): Promise<void> {
    await this.client.flushdb();
  }

  async close(): Promise<void> {
    await this.client.quit();
    return;
  }
}
