export interface KeyValueCache {
  get(key: string): Promise<string | undefined>;
  set(
    key: string,
    value: string,
    options?: { ttl?: number; tags?: string[] },
  ): Promise<void>;
  invalidate(tags: string[]): Promise<void>;
  flush(): Promise<void>;
  close(): Promise<void>;
}
