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
import { describeProblems, findStateProblems } from "./validate";

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

export function parseBackup(raw: string, now: Date = new Date()): ParseResult {
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
  let state: State;
  try {
    state = migrate({ ...emptyState(), ...candidate }, now);
  } catch {
    // e.g. a null inside "goals" — migrate can't even start. Without this
    // the exception escaped to the file picker and the import died silently.
    return { ok: false, error: "That backup looks damaged — part of it can't be read by this version. Nothing was changed." };
  }
  // Entry-level inspection, AFTER migrate (so legacy shapes have been
  // upgraded first). The checks above only see the outline; a file can
  // pass them and still carry an entry that would crash every render or
  // turn sums into string-glue — and an import is saved the moment it's
  // confirmed. Refuse it here, while the current garden is still intact.
  const problems = findStateProblems(state);
  if (problems.length > 0) {
    return { ok: false, error: `That backup looks damaged — ${describeProblems(problems)}. Nothing was changed.` };
  }
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

/* ------------------------------------------------------------------ *
 * The backup reminder's bookkeeping. Kept under its own storage key
 * (BACKUP_META_KEY), never inside the garden: it's about this browser's
 * copy, not the money — and a backup file shouldn't carry "when was I
 * last backed up". The UI shows the result in the shed (a passive line,
 * amber when due); nothing here ever interrupts.
 * ------------------------------------------------------------------ */

/** Due once the oldest change no backup covers is this many calendar days old. */
export const BACKUP_DUE_DAYS = 14;

/**
 * What's known about backups in this browser. ISO timestamps; null =
 * never / nothing. The index signature keeps fields a newer build may add
 * (like a dict's extra keys) through every update — never silently dropped.
 */
export interface BackupMeta {
  /** When a backup file was last saved from this browser. */
  lastAt: string | null;
  /** When the garden first changed after the last backup (or ever, if
   * none) — the age of the oldest change that exists only in the browser. */
  unsavedSince: string | null;
  [extra: string]: unknown;
}

// Frozen (like a frozen dataclass): every update returns a new object, and
// a stray in-place write to this shared default would throw instead.
export const NO_BACKUP_META: BackupMeta = Object.freeze({ lastAt: null, unsavedSince: null });

/** An ISO-ish string that parses to a real moment, or null. */
const asMoment = (v: unknown): string | null =>
  typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null;

/** Never throws: anything unreadable means "nothing known" (the reminder
 * then simply starts over — it guards data, it isn't data). */
export function parseBackupMeta(raw: string | null | undefined): BackupMeta {
  if (!raw) return NO_BACKUP_META;
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return NO_BACKUP_META; }
  if (typeof v !== "object" || v === null || Array.isArray(v)) return NO_BACKUP_META;
  const o = v as Record<string, unknown>;
  return { ...o, lastAt: asMoment(o.lastAt), unsavedSince: asMoment(o.unsavedSince) };
}

export const serializeBackupMeta = (m: BackupMeta): string => JSON.stringify(m);

/**
 * The garden was just saved. Starts the "unsaved since" clock if it isn't
 * running — later changes never restart it, so it always dates the OLDEST
 * uncovered change. A fresh (empty) garden has nothing to lose, so the
 * clock stops (after "Start fresh", the next real change starts a new one).
 * A start time in the future (the device clock was ahead) restarts it.
 * Returns the same object when nothing changed — the caller skips the write,
 * like the engine actions' "same state back = no-op".
 */
export function noteGardenChange(m: BackupMeta, gardenIsFresh: boolean, now: Date): BackupMeta {
  if (gardenIsFresh) return m.unsavedSince === null ? m : { ...m, unsavedSince: null };
  // A clock that was running ahead (since corrected) left a start time in
  // the "future": keeping it would hide the reminder until that date comes
  // round — possibly months. Restart from now instead.
  const running = m.unsavedSince !== null && Date.parse(m.unsavedSince) <= now.getTime();
  return running ? m : { ...m, unsavedSince: now.toISOString() };
}

/** A backup file was just saved: every change so far is covered. */
export const noteBackupSaved = (m: BackupMeta, now: Date): BackupMeta =>
  ({ ...m, lastAt: now.toISOString(), unsavedSince: null });

/** A backup was just restored: the garden now IS that file, so nothing is
 * uncovered — but no new backup was saved, so lastAt stays as it was. */
export const noteBackupRestored = (m: BackupMeta): BackupMeta =>
  m.unsavedSince === null ? m : { ...m, unsavedSince: null };

export type BackupStatus =
  | { kind: "hidden" } // fresh garden — nothing to back up, say nothing
  | { kind: "never" } // no backup yet, nothing overdue
  | { kind: "saved"; lastAt: Date } // last backup date, nothing overdue
  | { kind: "due"; days: number; lastAt: Date | null }; // oldest uncovered change is `days` old

/** Whole local-calendar days from `from`'s date to `to`'s date. Midnight to
 * midnight, ROUNDED: a daylight-saving day of 23 or 25 hours still counts
 * as one (flooring would lose a day across spring-forward). */
const calendarDaysBetween = (from: Date, to: Date): number =>
  Math.round(
    (new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime() -
      new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()) / 86_400_000,
  );

export function backupStatus(m: BackupMeta, gardenIsFresh: boolean, now: Date): BackupStatus {
  if (gardenIsFresh) return { kind: "hidden" };
  const lastAt = m.lastAt ? new Date(m.lastAt) : null;
  if (m.unsavedSince) {
    const days = calendarDaysBetween(new Date(m.unsavedSince), now);
    // A clock set backwards makes `days` negative — simply not due.
    if (days >= BACKUP_DUE_DAYS) return { kind: "due", days, lastAt };
  }
  return lastAt ? { kind: "saved", lastAt } : { kind: "never" };
}
