/*
 * Storage adapter: platform storage → localStorage → in-memory, with the
 * active tier reported so the UI can disclose where data actually lives.
 * Ported from reference lines 25–38, same tier order and per-call fallback.
 *
 * Engine purity note: this module never touches `window` or the DOM. Host
 * capabilities are looked up via `globalThis` (works in browsers, Node tests,
 * and future native shells alike) and can be injected for tests — like
 * passing a fake filesystem into a Python function instead of importing os.
 */

export type StorageMode = "platform" | "local" | "memory";

/** The shape platform storage exposes (e.g. Claude artifact storage, or a future Expo shim). */
export interface PlatformStorage {
  get(key: string): Promise<{ value: string } | null | undefined>;
  set(key: string, value: string): Promise<unknown>;
}

interface LocalStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface StoreEnv {
  /** Returns the platform storage iface if the host provides one. */
  platform: () => PlatformStorage | null;
  local: () => LocalStorageLike | null;
}

export interface GetResult {
  value: string;
  mode: StorageMode;
}

export interface SetResult {
  /** false only when the write fell through to memory (session-only). */
  persisted: boolean;
  mode: StorageMode;
}

export interface Store {
  get(key: string): Promise<GetResult | null>;
  set(key: string, value: string): Promise<SetResult>;
  /** The tier that handled the most recent operation. */
  mode(): StorageMode;
}

const defaultEnv = (): StoreEnv => ({
  platform: () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = globalThis as any;
    return g.storage && typeof g.storage.get === "function" && typeof g.storage.set === "function"
      ? (g.storage as PlatformStorage)
      : null;
  },
  local: () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = globalThis as any;
    return g.localStorage ?? null;
  },
});

export function createStore(env: StoreEnv = defaultEnv()): Store {
  // Module-scoped dict in the reference; instance-scoped here so tests are isolated.
  const mem: Record<string, string> = {};
  let lastMode: StorageMode = "memory";

  return {
    async get(key) {
      // Each tier swallows its own errors and falls through — same as the
      // reference's try/catch chain.
      try {
        const p = env.platform();
        if (p) {
          const res = await p.get(key);
          lastMode = "platform";
          return res && res.value != null ? { value: res.value, mode: "platform" } : null;
        }
      } catch { /* fall through */ }
      try {
        const l = env.local();
        if (l) {
          const v = l.getItem(key);
          lastMode = "local";
          return v == null ? null : { value: v, mode: "local" };
        }
      } catch { /* fall through */ }
      lastMode = "memory";
      return mem[key] != null ? { value: mem[key], mode: "memory" } : null;
    },

    async set(key, value) {
      try {
        const p = env.platform();
        if (p) {
          await p.set(key, value);
          lastMode = "platform";
          return { persisted: true, mode: "platform" };
        }
      } catch { /* fall through */ }
      try {
        const l = env.local();
        if (l) {
          l.setItem(key, value); // throws when quota-blocked → falls through
          lastMode = "local";
          return { persisted: true, mode: "local" };
        }
      } catch { /* fall through */ }
      mem[key] = value;
      lastMode = "memory";
      return { persisted: false, mode: "memory" };
    },

    mode: () => lastMode,
  };
}
