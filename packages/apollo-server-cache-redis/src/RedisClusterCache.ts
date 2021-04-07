import Redis, {
  ClusterOptions,
  ClusterNode,
  Redis as RedisInstance,
} from 'ioredis';
import { BaseRedisCache } from './BaseRedisCache';

export class RedisClusterCache extends BaseRedisCache {
  private readonly clusterClient: Redis.Cluster;

  constructor(nodes: ClusterNode[], options?: ClusterOptions) {
    const clusterClient = new Redis.Cluster(nodes, options);
    super({ clusterClient });
    this.clusterClient = clusterClient;
  }

  async flush(): Promise<void> {
    const masters = this.clusterClient.nodes('master') || [];
    await Promise.all(masters.map((node: RedisInstance) => node.flushdb()));
  }
}
