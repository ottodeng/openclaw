import fs from "node:fs";

/**
 * Per-scan memoization for `fs.existsSync` checks performed during plugin
 * discovery and other hot startup paths.
 *
 * `fs.existsSync` is synchronous and shows up as a top contributor in CPU
 * profiles of cold starts (see https://github.com/openclaw/openclaw/issues/76209).
 * The plugin scan phase repeatedly probes the same paths (e.g.
 * `<rootDir>/skills`, `<rootDir>/.cursor/rules`) across many manifest
 * resolvers, so caching the result is safe — the directory tree is stable
 * for the duration of the scan.
 *
 * Callers OWN the cache lifetime. The typical use is: create one cache per
 * plugin scan / loader operation via `createExistsSyncCache()`, thread it
 * through all helpers in that scan, then discard when the scan finishes.
 * This prevents a stale `false` miss from leaking into later discovery passes
 * within the same Node process (e.g. after marker files like `skills/` or
 * `.cursor/rules` are created between scans).
 *
 * Call `invalidate(path?)` to drop a single entry or the entire cache when
 * filesystem state changes mid-scan.
 */
export type ExistsSyncCache = {
  existsSync(p: string): boolean;
  invalidate(p?: string): void;
};

export function createExistsSyncCache(): ExistsSyncCache {
  const cache = new Map<string, boolean>();
  return {
    existsSync(p: string): boolean {
      const cached = cache.get(p);
      if (cached !== undefined) {
        return cached;
      }
      const result = fs.existsSync(p);
      cache.set(p, result);
      return result;
    },
    invalidate(p?: string): void {
      if (p === undefined) {
        cache.clear();
        return;
      }
      cache.delete(p);
    },
  };
}
