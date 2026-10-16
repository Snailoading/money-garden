/*
 * The gardener's hands — every user action that changes money, as a pure
 * function. Pure — no React, no DOM; `now` is injected (dates, streak).
 *
 * Before v0.18 these lived inside App.tsx as UI closures, untested, while
 * their exact reverses (removeTransaction / updateTransaction in state.ts)
 * lived here with tests. Now both halves of every linked entry sit in the
 * engine, and actions.test.ts proves each forward action is undone exactly
 * by deleting the entry it created.
 *
 * Shape: (state, args…, now) → { state, events }. Like a Python function
 * returning a (new_state, events) tuple instead of mutating anything. The
 * events are facts ("the streak grew to 5"), never UI copy — the App turns
 * them into toasts. An action that changes nothing returns the SAME state
 * object, so the caller can tell "no-op" by identity (`r.state === state`).
 */

import type { State, Transaction } from "./types";
import { uid } from "./format";
import { bumpStreak } from "./state";

/** Something worth telling the user about. A tagged union — like a set of
 * small Python dataclasses sharing a `kind` field. */
export type ActionEvent =
  | { kind: "streakGrew"; count: number };

export interface ActionResult {
  state: State;
  events: ActionEvent[];
}

/** The streak after tending today, plus the growth event if it grew. */
function tend(state: State, now: Date): { streak: State["streak"]; events: ActionEvent[] } {
  const streak = bumpStreak(state.streak, now);
  return {
    streak,
    events: streak.count > state.streak.count ? [{ kind: "streakGrew", count: streak.count }] : [],
  };
}

/**
 * Log an entry from the Log tab: prepend it with a fresh id and tend the
 * streak. The entry's fields arrive already validated by the form (amount
 * > 0, a date) — exactly as before the move; engine-level validation comes
 * in a later, separate change.
 */
export function logEntry(state: State, entry: Omit<Transaction, "id">, now: Date): ActionResult {
  const { streak, events } = tend(state, now);
  return {
    state: { ...state, transactions: [{ ...entry, id: uid() }, ...state.transactions], streak },
    events,
  };
}

/**
 * A no-spend day: a tended garden isn't always a watered one, so this keeps
 * the streak alive without inventing a journal entry. Same-reference no-op
 * if today was already tended.
 */
export function markNoSpendDay(state: State, now: Date): ActionResult {
  const { streak, events } = tend(state, now);
  if (streak === state.streak) return { state, events: [] };
  return { state: { ...state, streak }, events };
}
