/*
 * Where the garden actually lives — the shed's storage disclosure, and the
 * "ask the browser to keep it" request (CLAUDE.md: the storage mode must be
 * disclosed, visibly). Wording is a pure function so it can be unit-tested
 * without a browser; the request is the one browser-touching helper here.
 */
import type { StorageMode } from "../engine/storage";

export interface StorageNote {
  text: string;
  /** true = nothing is being saved; render as a warning. */
  warn: boolean;
}

/**
 * The footer line for the active storage tier. `persisted` is the browser's
 * answer to "please don't evict this site's data": true granted, false
 * denied, null not asked / not supported. null mode = storage hasn't
 * answered yet (first paint) — say nothing rather than guess.
 */
export function storageNote(mode: StorageMode | null, persisted: boolean | null): StorageNote | null {
  if (mode === null) return null;
  if (mode === "memory") {
    return {
      warn: true,
      text: "⚠️ Saving isn't available in this browser right now — your changes last only until this tab closes. Save a backup to keep them.",
    };
  }
  if (mode === "platform") {
    return { warn: false, text: "your garden saves automatically to this app's storage." };
  }
  return {
    warn: false,
    text: persisted === true
      ? "your garden saves automatically in this browser, on this device — and the browser has agreed not to clear it when space runs low."
      : "your garden saves automatically in this browser, on this device. Browsers can clear site data, so save a backup now and then.",
  };
}

/**
 * Ask the browser to treat this site's storage as persistent (exempt from
 * automatic eviction when space runs low). Chrome and Safari decide
 * silently; Firefox shows a permission prompt — which is why the App only
 * asks once the garden holds real data. Resolves the browser's answer, or
 * null where the API doesn't exist (older browsers, file:// single-file).
 * Never throws: persistence is a bonus, not a requirement.
 */
export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    const sm = globalThis.navigator?.storage;
    if (!sm?.persist || !sm.persisted) return null;
    if (await sm.persisted()) return true;
    return await sm.persist();
  } catch {
    return null;
  }
}

/** The browser's current answer, without asking (no prompt anywhere). */
export async function checkPersistentStorage(): Promise<boolean | null> {
  try {
    const sm = globalThis.navigator?.storage;
    return sm?.persisted ? await sm.persisted() : null;
  } catch {
    return null;
  }
}
