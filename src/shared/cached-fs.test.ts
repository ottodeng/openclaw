import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createExistsSyncCache } from "./cached-fs.js";

describe("createExistsSyncCache", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cached-fs-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns true for a path that exists and false for one that does not", () => {
    const cache = createExistsSyncCache();
    const present = path.join(tmpDir, "present");
    const missing = path.join(tmpDir, "missing");
    fs.writeFileSync(present, "x");
    expect(cache.existsSync(present)).toBe(true);
    expect(cache.existsSync(missing)).toBe(false);
  });

  it("memoizes the result so a follow-up call does not hit the disk", () => {
    const cache = createExistsSyncCache();
    const target = path.join(tmpDir, "target");
    fs.writeFileSync(target, "x");
    expect(cache.existsSync(target)).toBe(true);

    const spy = vi.spyOn(fs, "existsSync");
    expect(cache.existsSync(target)).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("invalidate(path) drops a single entry", () => {
    const cache = createExistsSyncCache();
    const target = path.join(tmpDir, "target");
    expect(cache.existsSync(target)).toBe(false);
    fs.writeFileSync(target, "x");
    // Stale cached result until invalidation.
    expect(cache.existsSync(target)).toBe(false);
    cache.invalidate(target);
    expect(cache.existsSync(target)).toBe(true);
  });

  it("invalidate() clears every entry", () => {
    const cache = createExistsSyncCache();
    const a = path.join(tmpDir, "a");
    const b = path.join(tmpDir, "b");
    expect(cache.existsSync(a)).toBe(false);
    expect(cache.existsSync(b)).toBe(false);
    fs.writeFileSync(a, "x");
    fs.writeFileSync(b, "x");
    expect(cache.existsSync(a)).toBe(false);
    expect(cache.existsSync(b)).toBe(false);
    cache.invalidate();
    expect(cache.existsSync(a)).toBe(true);
    expect(cache.existsSync(b)).toBe(true);
  });

  it("two separate instances do not share state", () => {
    const instanceA = createExistsSyncCache();
    const instanceB = createExistsSyncCache();
    const target = path.join(tmpDir, "shared-target");

    // Prime instance A with a false result.
    expect(instanceA.existsSync(target)).toBe(false);

    // Instance B should hit the disk independently — it does not see A's cached false.
    fs.writeFileSync(target, "x");
    expect(instanceB.existsSync(target)).toBe(true);

    // A still has its stale false cached.
    expect(instanceA.existsSync(target)).toBe(false);
  });

  it("a stale false can be invalidated and re-probed after filesystem state changes", () => {
    const cache = createExistsSyncCache();
    const target = path.join(tmpDir, "late-arrival");

    expect(cache.existsSync(target)).toBe(false);
    fs.writeFileSync(target, "x");
    // Still false from cache.
    expect(cache.existsSync(target)).toBe(false);

    cache.invalidate(target);
    // Now re-probes the disk and sees the new file.
    expect(cache.existsSync(target)).toBe(true);
  });
});
