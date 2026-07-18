/*
 * The seed vault — JSON backup export and import.
 * Pure — no React, no DOM. The UI handles the actual file download/pick;
 * this module only builds and validates the content.
 *
 * Backup file = a versioned envelope around the exact State object:
 *   { app: "money-garden", schema: 1, exportedAt: "YYYY-MM-DD", state: {...} }
 * Pretty-printed so a curious user can open it and read their own data.
 * Import also accepts a bare State dump (e.g. a hand-copied localStorage
 * value) when it structurally looks like one.
 */

import type { State } from "./types";
import { emptyState, migrate } from "./state";
import { todayISO } from "./format";

/** Bump when the backup envelope itself changes shape (not the State — that
 * migrates via migrate()). Newer-schema files are refused with a clear message. */
export const SCHEMA_VERSION = 1;

export interface BackupFile {
  app: "money-garden";
  schema: number;
  exportedAt: string;
  state: State;
}

export interface ImportPreview {
  state: State;
  counts: {
    transactions: number;
    goals: number;
    commitments: number;
    holdings: number;
  };
  /** From the envelope; null for bare state dumps. */
  exportedAt: string | null;
}

export type ParseResult =
  | { ok: true; preview: ImportPreview }
  | { ok: false; error: string };

export function buildBackup(state: State, now: Date = new Date()): { filename: string; json: string } {
  const envelope: BackupFile = {
    app: "money-garden",
    schema: SCHEMA_VERSION,
    exportedAt: todayISO(now),
    state,
  };
  return {
    filename: `money-garden-backup-${todayISO(now)}.json`,
    json: JSON.stringify(envelope, null, 2),
  };
}

/** A value "looks like" a State if it's an object carrying at least one of the
 * signature keys. Deliberately loose — migrate() fills gaps, and rejecting a
 * real backup would be worse than accepting an odd one the user can inspect. */
const looksLikeState = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) &&
  ("transactions" in v || "budgets" in v || "goals" in v);

/** The array-valued State fields; anything present must actually be an array. */
const ARRAY_FIELDS = ["transactions", "goals", "commitments"] as const;

export function parseBackup(raw: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "That file isn't valid JSON — is it really a Money Garden backup?" };
  }

  let candidate: unknown;
  let exportedAt: string | null = null;

  const obj = parsed as Record<string, unknown> | null;
  if (obj && typeof obj === "object" && obj.app === "money-garden" && "state" in obj) {
    const schema = Number(obj.schema) || 0;
    if (schema > SCHEMA_VERSION) {
      return { ok: false, error: "This backup was made by a newer version of Money Garden — update the app and try again." };
    }
    candidate = obj.state;
    exportedAt = typeof obj.exportedAt === "string" ? obj.exportedAt : null;
  } else if (looksLikeState(parsed)) {
    // Bare state dump (no envelope) — accept for compatibility.
    candidate = parsed;
  } else {
    return { ok: false, error: "That file doesn't look like a Money Garden backup." };
  }

  if (!looksLikeState(candidate)) {
    return { ok: false, error: "That backup file has no garden data inside." };
  }
  for (const field of ARRAY_FIELDS) {
    if (field in candidate && !Array.isArray(candidate[field])) {
      return { ok: false, error: `That backup looks damaged — "${field}" isn't a list.` };
    }
  }

  // Fill any missing top-level fields from a fresh state (a partial dump
  // must not crash the app), then migrate() — which fills invest keys,
  // defaults commitments, and keeps unknown fields, so a backup from a
  // future minor version survives the round-trip intact.
  const state = migrate({ ...emptyState(), ...candidate });
  return {
    ok: true,
    preview: {
      state,
      counts: {
        transactions: state.transactions?.length ?? 0,
        // Goals are counted from the FILE, not the migrated state: migrate
        // injects the permanent rain barrel into barrel-less backups, and
        // the preview's job is "does this look like what I exported?" —
        // a 0-goal backup must preview as 0, not as the barrel it'll gain.
        goals: Array.isArray(candidate.goals) ? candidate.goals.length : 0,
        commitments: state.commitments?.length ?? 0,
        holdings: state.invest?.holdings?.length ?? 0,
      },
      exportedAt,
    },
  };
}
