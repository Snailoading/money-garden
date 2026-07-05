import { describe, expect, it } from "vitest";
import { STORAGE_KEY } from "./types";
import { createStore, type PlatformStorage, type StoreEnv } from "./storage";

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
