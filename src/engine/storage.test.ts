import { afterEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEY } from "./types";
import { createSaveQueue, createStore, type LocalChange, type PlatformStorage, type SetResult, type StoreEnv } from "./storage";

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

/**
 * A fake "other tabs": `emit` plays a change another tab made to local
 * storage, the way the browser's `storage` event would deliver it. Counts
 * live listeners so tests can see unsubscribe really let go.
 */
const fakeWatch = () => {
  const listeners = new Set<(c: LocalChange) => void>();
  return {
    emit: (c: LocalChange) => { for (const l of [...listeners]) l(c); },
    live: () => listeners.size,
    watchLocal: (l: (c: LocalChange) => void) => {
      listeners.add(l);
      return () => { listeners.delete(l); };
    },
  };
};

describe("subscribe — hear saves made by other tabs", () => {
  const watched = (platform: PlatformStorage | null = null) => {
    const w = fakeWatch();
    const store = createStore({ ...env(platform, fakeLocal()), watchLocal: w.watchLocal });
    return { w, store };
  };

  it("passes on the new value when another tab saves the watched key", () => {
    const { w, store } = watched();
    const heard: (string | null)[] = [];
    store.subscribe(STORAGE_KEY, (v) => heard.push(v));
    w.emit({ key: STORAGE_KEY, newValue: "newer garden" });
    expect(heard).toEqual(["newer garden"]);
  });

  it("ignores other keys (the theme, the install hint…)", () => {
    const { w, store } = watched();
    const heard: (string | null)[] = [];
    store.subscribe(STORAGE_KEY, (v) => heard.push(v));
    w.emit({ key: "money-garden:theme", newValue: "night" });
    expect(heard).toEqual([]);
  });

  it("reports a removed key as null", () => {
    const { w, store } = watched();
    const heard: (string | null)[] = [];
    store.subscribe(STORAGE_KEY, (v) => heard.push(v));
    w.emit({ key: STORAGE_KEY, newValue: null });
    expect(heard).toEqual([null]);
  });

  it("reports a cleared store (key: null) as null for every subscriber", () => {
    const { w, store } = watched();
    const garden: (string | null)[] = [];
    const theme: (string | null)[] = [];
    store.subscribe(STORAGE_KEY, (v) => garden.push(v));
    store.subscribe("money-garden:theme", (v) => theme.push(v));
    w.emit({ key: null, newValue: null });
    expect(garden).toEqual([null]);
    expect(theme).toEqual([null]);
  });

  it("stops listening after unsubscribe", () => {
    const { w, store } = watched();
    const heard: (string | null)[] = [];
    const stop = store.subscribe(STORAGE_KEY, (v) => heard.push(v));
    expect(w.live()).toBe(1);
    stop();
    expect(w.live()).toBe(0);
    w.emit({ key: STORAGE_KEY, newValue: "after stop" });
    expect(heard).toEqual([]);
  });

  it("ignores local changes while platform storage holds the data", () => {
    const { w, store } = watched(fakePlatform());
    const heard: (string | null)[] = [];
    store.subscribe(STORAGE_KEY, (v) => heard.push(v));
    w.emit({ key: STORAGE_KEY, newValue: "a stray local write" });
    expect(heard).toEqual([]);
  });

  it("never writes and never moves the reported tier", async () => {
    const local = fakeLocal();
    const w = fakeWatch();
    const store = createStore({ ...env(null, local), watchLocal: w.watchLocal });
    await store.set(STORAGE_KEY, "mine");
    store.subscribe(STORAGE_KEY, () => {});
    w.emit({ key: STORAGE_KEY, newValue: "theirs" });
    expect(local.data[STORAGE_KEY]).toBe("mine"); // hearing is not saving
    expect(store.mode()).toBe("local");
  });

  it("is a harmless no-op on a host that can't watch (memory-only, native shells)", () => {
    const store = createStore(env(null, null));
    const stop = store.subscribe(STORAGE_KEY, () => { throw new Error("must never fire"); });
    expect(() => stop()).not.toThrow();
  });
});

describe("subscribe — the default browser host (the real `storage` event wiring)", () => {
  // vi.stubGlobal swaps globalThis.x for one test, like
  // unittest.mock.patch("builtins.x"); unstubAllGlobals puts it back.
  afterEach(() => { vi.unstubAllGlobals(); });

  /** Stubs globalThis as a browser page: a localStorage plus storage events. */
  const browserHost = () => {
    const local = fakeLocal();
    const session = fakeLocal();
    const listeners = new Set<(e: unknown) => void>();
    vi.stubGlobal("localStorage", local);
    vi.stubGlobal("addEventListener", (type: string, l: (e: unknown) => void) => {
      if (type === "storage") listeners.add(l);
    });
    vi.stubGlobal("removeEventListener", (type: string, l: (e: unknown) => void) => {
      if (type === "storage") listeners.delete(l);
    });
    const fire = (e: { key: string | null; newValue: string | null; storageArea: unknown }) => {
      for (const l of [...listeners]) l(e);
    };
    return { local, session, listeners, fire };
  };

  it("hears a localStorage change made by another tab", () => {
    const host = browserHost();
    const heard: (string | null)[] = [];
    createStore().subscribe(STORAGE_KEY, (v) => heard.push(v));
    host.fire({ key: STORAGE_KEY, newValue: "theirs", storageArea: host.local });
    expect(heard).toEqual(["theirs"]);
  });

  it("ignores sessionStorage changes (same event, different storage area)", () => {
    const host = browserHost();
    const heard: (string | null)[] = [];
    createStore().subscribe(STORAGE_KEY, (v) => heard.push(v));
    host.fire({ key: STORAGE_KEY, newValue: "session only", storageArea: host.session });
    expect(heard).toEqual([]);
  });

  it("removes its browser listener on unsubscribe", () => {
    const host = browserHost();
    const stop = createStore().subscribe(STORAGE_KEY, () => {});
    expect(host.listeners.size).toBe(1);
    stop();
    expect(host.listeners.size).toBe(0);
  });

  it("ignores the event, without throwing, when localStorage itself is blocked", () => {
    const host = browserHost();
    // Some browsers throw a SecurityError just for READING the localStorage
    // property when site data is blocked.
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() { throw new Error("SecurityError"); },
    });
    const heard: (string | null)[] = [];
    createStore().subscribe(STORAGE_KEY, (v) => heard.push(v));
    expect(() => host.fire({ key: STORAGE_KEY, newValue: "x", storageArea: host.local })).not.toThrow();
    expect(heard).toEqual([]);
  });

  it("is a no-op where there are no events to listen to (plain Node)", () => {
    vi.stubGlobal("addEventListener", undefined);
    const stop = createStore().subscribe(STORAGE_KEY, () => {});
    expect(() => stop()).not.toThrow();
  });
});
