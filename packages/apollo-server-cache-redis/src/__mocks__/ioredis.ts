const IORedis = jest.genMockFromModule('ioredis');

const keyValue: Record<string, { value: string, ttl: number | null }> = {};

const deleteKey = (key: string) => {
  delete keyValue[key];
  return Promise.resolve(true);
};

const getKey = (key: string): Promise<string | null> => {
  if (keyValue[key]) {
    return Promise.resolve(keyValue[key].value);
  }

  return Promise.resolve(null);
};

const mGetKey = (key: string, cb: (result: Array<string | null>) => void) : Promise<(string | null)[]> => getKey(key).then(val => [val]);

const setKey = (key: string, value: string, type?: string, ttl?: number | null | undefined): Promise<true> => {
  keyValue[key] = {
    value,
    ttl,
  };
  if (ttl) {
    setTimeout(() => {
      delete keyValue[key];
    }, ttl * 1000);
  }
  return Promise.resolve(true);
};

IORedis.prototype.del.mockImplementation(deleteKey);
IORedis.prototype.get.mockImplementation(getKey);
IORedis.prototype.mget.mockImplementation(mGetKey);
IORedis.prototype.set.mockImplementation(setKey);

export default IORedis;
