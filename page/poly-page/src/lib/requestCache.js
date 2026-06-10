export function createRequestCache({ now = () => Date.now(), defaultTtl = 60000 } = {}) {
  const cache = new Map();

  function isFresh(entry, ttl) {
    return entry && now() - entry.createdAt < ttl;
  }

  return {
    async get(key, loader, options = {}) {
      const ttl = Number(options.ttl ?? defaultTtl);
      const entry = cache.get(key);
      if (!options.force && isFresh(entry, ttl)) {
        return entry.promise || entry.value;
      }

      const promise = Promise.resolve()
        .then(loader)
        .then((value) => {
          cache.set(key, { value, createdAt: now() });
          return value;
        })
        .catch((error) => {
          cache.delete(key);
          throw error;
        });

      cache.set(key, { promise, createdAt: now() });
      return promise;
    },

    invalidate(keyPrefix) {
      if (!keyPrefix) {
        cache.clear();
        return;
      }
      for (const key of cache.keys()) {
        if (key === keyPrefix || key.startsWith(keyPrefix)) {
          cache.delete(key);
        }
      }
    },
  };
}

export const adminRequestCache = createRequestCache();
