import { describe, expect, it } from "vitest";
import { STORAGE_KEY } from "./types";
import { createSaveQueue, createStore, type PlatformStorage, type SetResult, type StoreEnv } from "./storage";

// Fake hosts injected instead of globalThis — like passing a fake filesystem
// into a Python function under test.
const fakeLocal = () => {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => { data[k] = v; },
  };
};
const fakePlatform = (): PlatformStorage & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return {
    data,
    async get(k) { return k in data ? { value: data[k] } : null; },
    async set(k, v) { data[k] = v; },
  };
};
const env = (platform: PlatformStorage | null, local: ReturnType<typeof fakeLocal> | null): StoreEnv => ({
  platform: () => platform,
  local: () => local,
});

it("uses the exact persisted key everywhere", () => {
  expect(STORAGE_KEY).toBe("money-garden:state-v1");
});

describe("tier order", () => {
  it("prefers platform storage when the host provides it", async () => {
    const platform = fakePlatform();
    const local = fakeLocal();
    const store = createStore(env(platform, local));
    const res = await store.set(STORAGE_KEY, "data");
    expect(res).toEqual({ persisted: true, mode: "platform" });
    expect(platform.data[STORAGE_KEY]).toBe("data");
    expect(local.data[STORAGE_KEY]).toBeUndefined();
    expect((await store.get(STORAGE_KEY))).toEqual({ value: "data", mode: "platform" });
  });

  it("falls back to localStorage without platform storage", async () => {
    const local = fakeLocal();
    const store = createStore(env(null, local));
    const res = await store.set(STORAGE_KEY, "data");
    expect(res).toEqual({ persisted: true, mode: "local" });
    expect(local.data[STORAGE_KEY]).toBe("data");
    expect((await store.get(STORAGE_KEY))).toEqual({ value: "data", mode: "local" });
  });

  it("lands in memory when nothing else exists, reporting persisted: false", async () => {
    const store = createStore(env(null, null));
    const res = await store.set(STORAGE_KEY, "data");
    expect(res).toEqual({ persisted: false, mode: "memory" });
    expect((await store.get(STORAGE_KEY))).toEqual({ value: "data", mode: "memory" });
    expect(store.mode()).toBe("memory");
  });
});

describe("error fallthrough", () => {
  it("drops to localStorage when platform storage throws", async () => {
    const broken: PlatformStorage = {
      async get() { throw new Error("host revoked"); },
      async set() { throw new Error("host revoked"); },
    };
    const local = fakeLocal();
    const store = createStore(env(broken, local));
    expect(await store.set(STORAGE_KEY, "data")).toEqual({ persisted: true, mode: "local" });
    expect(await store.get(STORAGE_KEY)).toEqual({ value: "data", mode: "local" });
  });

  it("drops to memory when localStorage throws (quota / privacy mode)", async () => {
    const blocked = {
      getItem: () => { throw new Error("SecurityError"); },
      setItem: () => { throw new Error("QuotaExceededError"); },
    };
    const store = createStore(env(null, blocked as unknown as ReturnType<typeof fakeLocal>));
    expect(await store.set(STORAGE_KEY, "data")).toEqual({ persisted: false, mode: "memory" });
    expect(await store.get(STORAGE_KEY)).toEqual({ value: "data", mode: "memory" });
  });
});

describe("get misses and mode reporting", () => {
  it("returns null for a missing key at every tier", async () => {
    expect(await createStore(env(fakePlatform(), null)).get("nope")).toBeNull();
    expect(await createStore(env(null, fakeLocal())).get("nope")).toBeNull();
    expect(await createStore(env(null, null)).get("nope")).toBeNull();
  });

  it("reports the tier that handled the most recent operation", async () => {
    const store = createStore(env(null, fakeLocal()));
    await store.set(STORAGE_KEY, "x");
    expect(store.mode()).toBe("local");
  });

  it("keeps memory instances isolated from each other", async () => {
    const a = createStore(env(null, null));
    const b = createStore(env(null, null));
    await a.set(STORAGE_KEY, "a-only");
    expect(await b.get(STORAGE_KEY)).toBeNull();
  });
});

/**
 * A platform store whose writes finish only when the test says so — like an
 * async native store (Expo) where a big write can take longer than a small
 * one. `release(i)` completes the i-th write.
 */
const slowPlatform = () => {
  const data: Record<string, string> = {};
  const pending: { key: string; value: string; done: () => void }[] = [];
  const platform: PlatformStorage = {
    async get(k) { return k in data ? { value: data[k] } : null; },
    set(k, v) {
      return new Promise<void>((resolve) => {
        pending.push({ key: k, value: v, done: () => { data[k] = v; resolve(); } });
      });
    },
  };
  return { data, pending, platform, release: (i: number) => pending[i].done() };
};
/** Let queued promise callbacks run (one macrotask). */
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("why a save queue: unsequenced async writes can land out of order", () => {
  it("the hazard — two direct writes, the older one finishing last, leave STALE data", async () => {
    const slow = slowPlatform();
    const store = createStore(env(slow.platform, null));
    void store.set("k", "old");
    void store.set("k", "new");
    await tick();
    slow.release(1); // the newer write finishes first…
    slow.release(0); // …then the older one overwrites it
    await tick();
    expect(slow.data.k).toBe("old"); // the newer garden is lost
  });
});

describe("createSaveQueue — one write at a time, newest wins", () => {
  it("never lets an older garden overwrite a newer one", async () => {
    const slow = slowPlatform();
    const q = createSaveQueue(createStore(env(slow.platform, null)), "k", (v: string) => v, () => {});
    q.save("old");
    q.save("new");
    await tick();
    expect(slow.pending).toHaveLength(1); // the second write waits for the first
    slow.release(0); await tick();
    slow.release(1); await tick();
    expect(slow.data.k).toBe("new");
  });

  it("skips intermediate values that were overtaken while a write was in flight", async () => {
    const slow = slowPlatform();
    const serialized: string[] = [];
    const q = createSaveQueue(createStore(env(slow.platform, null)), "k", (v: string) => { serialized.push(v); return v; }, () => {});
    q.save("2"); q.save("25"); q.save("250"); // typing "250" into a budget box
    await tick();
    slow.release(0); await tick();
    slow.release(1); await tick();
    expect(slow.pending.map((p) => p.value)).toEqual(["2", "250"]); // "25" never written
    expect(serialized).toEqual(["2", "250"]); // …nor even serialized
    expect(slow.data.k).toBe("250");
  });

  it("reports every write that actually happened, in order", async () => {
    const slow = slowPlatform();
    const results: SetResult[] = [];
    const q = createSaveQueue(createStore(env(slow.platform, null)), "k", (v: string) => v, (r) => results.push(r));
    q.save("a"); q.save("b");
    await tick(); slow.release(0); await tick(); slow.release(1); await tick();
    expect(results).toEqual([{ persisted: true, mode: "platform" }, { persisted: true, mode: "platform" }]);
  });

  it("idle() resolves once everything queued so far is written", async () => {
    const slow = slowPlatform();
    const q = createSaveQueue(createStore(env(slow.platform, null)), "k", (v: string) => v, () => {});
    q.save("x");
    let idle = false;
    void q.idle().then(() => { idle = true; });
    await tick();
    expect(idle).toBe(false);
    slow.release(0); await tick();
    expect(idle).toBe(true);
    expect(slow.data.k).toBe("x");
  });

  it("with localStorage the first save lands synchronously; a back-to-back one a microtask later", async () => {
    const local = fakeLocal();
    const q = createSaveQueue(createStore(env(null, local)), "k", (v: string) => v, () => {});
    q.save("one");
    expect(local.data.k).toBe("one"); // no await needed — same as the old direct write
    q.save("two");
    // Not yet: "one" is still formally in flight. A microtask still runs
    // inside the same browser task, so a closing page can't cut it off.
    expect(local.data.k).toBe("one");
    await Promise.resolve(); await Promise.resolve();
    expect(local.data.k).toBe("two");
  });
});

describe("createSaveQueue — one failed write must never stop later saves (verifier round on commit 6)", () => {
  it("keeps saving after a write that rejects", async () => {
    let calls = 0;
    const data: Record<string, string> = {};
    const flaky: PlatformStorage = {
      async get() { return null; },
      async set(k, v) { calls++; if (calls === 1) throw new Error("disk hiccup"); data[k] = v; },
    };
    // A bare store whose set() can reject — the real adapter catches errors,
    // but a future shell's might not.
    const store = { get: async () => null, set: async (k: string, v: string) => { await flaky.set(k, v); return { persisted: true, mode: "platform" as const }; }, mode: () => "platform" as const };
    const q = createSaveQueue(store, "k", (v: string) => v, () => {});
    q.save("lost");
    await q.idle().catch(() => {});
    q.save("kept");
    await q.idle();
    expect(data.k).toBe("kept");
  });

  it("keeps saving after serialize throws, and never rejects idle()", async () => {
    const local = fakeLocal();
    const q = createSaveQueue(createStore(env(null, local)), "k", (v: string) => { if (v === "bad") throw new Error("cyclic"); return v; }, () => {});
    q.save("bad");
    await expect(q.idle()).resolves.toBeUndefined();
    q.save("good");
    await q.idle();
    expect(local.data.k).toBe("good");
  });
});
