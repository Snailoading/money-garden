import { afterEach, describe, expect, it, vi } from "vitest";
import { checkPersistentStorage, requestPersistentStorage, storageNote } from "./storageNote";

describe("storageNote — the shed says where the garden actually lives", () => {
  it("says nothing until the first storage call has answered", () => {
    expect(storageNote(null, null)).toBeNull();
  });

  it("names this browser and device for localStorage, and reports the eviction answer", () => {
    const granted = storageNote("local", true)!;
    expect(granted.warn).toBe(false);
    expect(granted.text).toContain("in this browser, on this device");
    expect(granted.text).toContain("agreed not to clear it");

    // Denied or not asked yet: honest, and points at backups instead.
    for (const persisted of [false, null]) {
      const n = storageNote("local", persisted)!;
      expect(n.warn).toBe(false);
      expect(n.text).toContain("in this browser, on this device");
      expect(n.text).not.toContain("agreed");
      expect(n.text).toContain("backup");
    }
  });

  it("names the app's own storage for the platform tier (a future native shell)", () => {
    const n = storageNote("platform", null)!;
    expect(n.warn).toBe(false);
    expect(n.text).toContain("this app's storage");
  });

  it("warns plainly when nothing is being saved (memory tier)", () => {
    const n = storageNote("memory", null)!;
    expect(n.warn).toBe(true);
    expect(n.text).toContain("isn't available");
    expect(n.text).toContain("until this tab closes");
    expect(n.text).not.toContain("saves automatically"); // the old, untrue claim
  });
});

describe("requestPersistentStorage / checkPersistentStorage — never throw, never ask twice for nothing", () => {
  // vi.stubGlobal swaps globalThis.navigator for the test, like
  // unittest.mock.patch on a module attribute.
  afterEach(() => { vi.unstubAllGlobals(); });
  const stub = (storage: unknown) => vi.stubGlobal("navigator", { storage });

  it("returns null where the API doesn't exist", async () => {
    stub(undefined);
    expect(await requestPersistentStorage()).toBeNull();
    expect(await checkPersistentStorage()).toBeNull();
  });

  it("skips persist() when the browser already granted it", async () => {
    const persist = vi.fn(async () => true);
    stub({ persisted: async () => true, persist });
    expect(await requestPersistentStorage()).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it("asks when not yet granted, and reports the answer", async () => {
    stub({ persisted: async () => false, persist: async () => false });
    expect(await requestPersistentStorage()).toBe(false);
    stub({ persisted: async () => false, persist: async () => true });
    expect(await requestPersistentStorage()).toBe(true);
  });

  it("check only reads — it never calls persist() (no Firefox prompt)", async () => {
    const persist = vi.fn(async () => true);
    stub({ persisted: async () => false, persist });
    expect(await checkPersistentStorage()).toBe(false);
    expect(persist).not.toHaveBeenCalled();
  });

  it("turns a throwing browser API into null instead of an error", async () => {
    stub({ persisted: async () => { throw new Error("SecurityError"); }, persist: async () => true });
    expect(await requestPersistentStorage()).toBeNull();
    expect(await checkPersistentStorage()).toBeNull();
  });
});
