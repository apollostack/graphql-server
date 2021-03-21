import { KeyValueCache, KeyValueCacheSetOptions } from 'apollo-server-caching';
import {
  Cluster,
  ClusterOptions,
  ClusterNode,
  Redis as RedisInstance,
} from 'ioredis';
import DataLoader from 'dataloader';

export class RedisClusterCache implements KeyValueCache {
  readonly client: Cluster;
  readonly defaultSetOptions: KeyValueCacheSetOptions = {
    ttl: 300,
  };

  private loader: DataLoader<string, string | null>;

  constructor(value: ClusterNode[] | Cluster, options?: ClusterOptions) {
    if (value instanceof Cluster) {
      this.client = value;
    } else {
      this.client = new Cluster(value as ClusterNode[], options);
    }
    this.client.mget

    this.loader = new DataLoader<string, string | null>(
      (keys = []) =>
        Promise.all(keys.map(key => this.client.get(key).catch(() => null))),
      { cache: false },
    );
  }

  async set(
    key: string,
    data: string,
    options?: KeyValueCacheSetOptions,
  ): Promise<void> {
    const { ttl } = Object.assign({}, this.defaultSetOptions, options);
    if (typeof ttl === 'number') {
      await this.client.set(key, data, 'EX', ttl);
    } else {
      // We'll leave out the EXpiration when no value is specified.  Of course,
      // it may be purged from the cache for other reasons as deemed necessary.
      await this.client.set(key, data);
    }
  }

  async get(key: string): Promise<string | undefined> {
    const reply = await this.loader.load(key);
    // reply is null if key is not found
    if (reply !== null) {
      return reply;
    }
    return;
  }

  async delete(key: string): Promise<boolean> {
    return await this.client.del(key) > 0;
  }

  async flush(): Promise<void> {
    const masters = this.client.nodes('master') || [];
    await Promise.all(masters.map((node: RedisInstance) => node.flushdb()));
  }

  async close(): Promise<void> {
    await this.client.quit();
    return;
  }
}
