class Redis {
  private keyValue = {};
  private timeouts = new Set<NodeJS.Timer>();

  async del(key: string) {
    const keysDeleted = this.keyValue.hasOwnProperty(key) ? 1 : 0;
    delete this.keyValue[key];
    return keysDeleted;
  }

  async get(key: string) {
    if (this.keyValue[key]) {
      return this.keyValue[key].value;
    }
  }

  async mget(...keys: string[]) {
    return keys.map((key) => {
      if (this.keyValue[key]) {
        return this.keyValue[key].value;
      }
    });
  }

  async set(key, value, type, ttl) {
    this.keyValue[key] = {
      value,
      ttl,
    };
    if (ttl) {
      const timeout = setTimeout(() => {
        this.timeouts.delete(timeout);
        delete this.keyValue[key];
      }, ttl * 1000);
      this.timeouts.add(timeout);
    }
    return true;
  }

  nodes() {
    return [];
  }

  async flushdb() {}

  async quit() {
    this.timeouts.forEach((t) => clearTimeout(t));
  }
}

// Use the same mock as Redis.Cluster.
(Redis as any).Cluster = Redis;

export default Redis;
