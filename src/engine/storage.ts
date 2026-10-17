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

/** A change ANOTHER tab made to local storage (a browser only tells the
 * other tabs, never the one that wrote). key null = the whole store was
 * cleared; newValue null = the key was removed. */
export interface LocalChange {
  key: string | null;
  newValue: string | null;
}

export interface StoreEnv {
  /** Returns the platform storage iface if the host provides one. */
  platform: () => PlatformStorage | null;
  local: () => LocalStorageLike | null;
  /** Calls `listener` for each local-storage change made by another tab;
   * returns a function that stops listening. Optional — a host without
   * tabs (or a test that doesn't care) simply leaves it out. */
  watchLocal?: (listener: (change: LocalChange) => void) => () => void;
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
  /**
   * Hear saves of `key` made in another tab: `onChange` gets the new value
   * (null when it was removed or the store was cleared). Only reads — it
   * never writes, so two tabs can't echo saves back and forth. Returns an
   * unsubscribe function (handy as a React effect's cleanup).
   */
  subscribe(key: string, onChange: (value: string | null) => void): () => void;
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
  watchLocal: (listener) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = globalThis as any;
    if (typeof g.addEventListener !== "function") return () => {};
    // The browser's `storage` event fires in every OTHER tab of this site.
    // sessionStorage changes fire the same event, so check the area.
    const onStorage = (e: { key: string | null; newValue: string | null; storageArea: unknown }) => {
      let isLocal = false;
      try {
        isLocal = e.storageArea === g.localStorage;
      } catch { /* blocked site data: reading localStorage throws — not ours */ }
      if (isLocal) listener({ key: e.key, newValue: e.newValue });
    };
    g.addEventListener("storage", onStorage);
    return () => g.removeEventListener("storage", onStorage);
  },
});

export interface SaveQueue<T> {
  /** Queue `value` to be written. Writes run one at a time, in order; if
   * newer values arrive while a write is in flight, only the newest is
   * written next (the overtaken ones are never serialized at all). */
  save(value: T): void;
  /** Resolves once everything queued so far has been written. */
  idle(): Promise<void>;
}

/**
 * One writer per key, newest wins — so an older garden can never overwrite
 * a newer one. With an async store (a future Expo shell), two quick saves
 * started side by side could finish in either order; this queue never has
 * more than one write in flight. Like a single-worker asyncio queue that
 * keeps only the latest item.
 *
 * With localStorage the first save still lands synchronously, as before; a
 * save made while one is still "in flight" lands a microtask later — still
 * inside the same browser task, so a closing page can't interrupt it.
 * `onWritten` receives each real write's result (tier + persisted flag).
 */
export function createSaveQueue<T>(
  // Only set() is used — Pick asks for just that (like a typing.Protocol
  // with one method), so any writer will do, not only a full Store.
  store: Pick<Store, "set">,
  key: string,
  serialize: (value: T) => string,
  onWritten: (result: SetResult) => void,
): SaveQueue<T> {
  // Boxed in an object so any T (even null/undefined) counts as "pending".
  let pending: { value: T } | null = null;
  // Two separate variables on purpose. `busy` is set BEFORE drain() starts
  // and cleared in its `finally`; `drained` is just the promise idle() hands
  // out. One combined variable broke: when a drain finished without ever
  // awaiting (serialize threw first), its cleanup ran INSIDE the call, and
  // the assignment of drain()'s promise then re-marked the queue as busy —
  // forever.
  let busy = false;
  let drained: Promise<void> = Promise.resolve();

  const drain = async () => {
    try {
      while (pending) {
        const { value } = pending;
        pending = null;
        // Each write is isolated: a failure (a store that rejects, a value
        // that won't serialize) is reported to the console and the queue
        // moves on — it must never wedge and silently drop later saves.
        // (Like try/except inside a Python worker loop.)
        try {
          onWritten(await store.set(key, serialize(value)));
        } catch (e) {
          console.warn("Money Garden: a save failed; the next change will try again.", e);
        }
      }
    } finally {
      busy = false;
    }
  };

  return {
    save(value) {
      pending = { value };
      if (busy) return; // the running drain picks this up (newest wins)
      busy = true;
      drained = drain();
    },
    idle: () => drained,
  };
}

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

    subscribe(key, onChange) {
      if (!env.watchLocal) return () => {};
      return env.watchLocal((change) => {
        // With platform storage the data doesn't live in localStorage, so a
        // local change isn't news about it. (Checked per change — a host's
        // tiers can come and go, like the per-call fallback above.)
        try {
          if (env.platform()) return;
        } catch { /* same fall-through as get/set */ }
        // key null = another tab cleared the whole store: the key is gone too.
        if (change.key === key) onChange(change.newValue);
        else if (change.key === null) onChange(null);
      });
    },
  };
}
