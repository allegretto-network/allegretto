import os from "node:os";
import path from "node:path";
import { create } from "flat-cache";

// ~/.allegretto/alln/cache/<id>.json persists key/value pairs across CLI invocations.
// Callers pick their own cache id and key format; an entry expires after the
// ttl its setCached passed, or when the caller overwrites or clears it.
const caches = new Map<string, ReturnType<typeof create>>();

function cacheFor(id: string) {
  const existing = caches.get(id);
  if (existing) return existing;

  const cache = create({
    cacheDir: path.join(os.homedir(), ".allegretto", "alln", "cache"),
    cacheId: id,
  });
  caches.set(id, cache);
  return cache;
}

export function getCached<T>(id: string, key: string): T | undefined {
  return cacheFor(id).getKey<T>(key);
}

export function setCached<T>(id: string, key: string, value: T, ttl?: string | number): void {
  const cache = cacheFor(id);
  cache.setKey(key, value, ttl);
  cache.save();
}
