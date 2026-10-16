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
import { todayISO, uid } from "./format";
import { bumpStreak } from "./state";

/** Something worth telling the user about. A tagged union — like a set of
 * small Python dataclasses sharing a `kind` field. */
export type ActionEvent =
  | { kind: "streakGrew"; count: number }
  /** This watering carried the goal from below its target to at/over it. */
  | { kind: "bloomed"; goalName: string };

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
 * Water a goal: add `amount` to its balance and log a linked saving entry
 * (goalId) so later edits/deletes move the goal too. No target cap (v0.7.0):
 * overflowing is truthful and keeps the entry exactly reversible. Reports
 * "bloomed" when this watering crosses the target — never for the un-set-up
 * barrel, since `saved < target` is 0 < 0 → false there. Amount validation
 * stays in the form for now, as before the move.
 */
export function waterGoal(state: State, goalId: string, amount: number, now: Date): ActionResult {
  const events: ActionEvent[] = [];
  const goals = state.goals.map((g) => {
    if (g.id !== goalId) return g;
    const saved = g.saved + amount;
    if (saved >= g.target && g.saved < g.target) events.push({ kind: "bloomed", goalName: g.name });
    return { ...g, saved };
  });
  const tx: Transaction = {
    id: uid(), type: "saving", amount, category: "other",
    note: `→ ${state.goals.find((g) => g.id === goalId)?.name}`, date: todayISO(now), goalId,
  };
  const tended = tend(state, now);
  return {
    state: { ...state, goals, transactions: [tx, ...state.transactions], streak: tended.streak },
    events: [...events, ...tended.events],
  };
}

/**
 * Spend from a goal: one journal expense that also drains the goal via its
 * goalId. Draws are budget-basis EXCLUDED (isDraw in stats.ts) — they spend
 * the goal's pool, not the month's income. The amount is capped at the
 * balance (same-reference no-op beyond it), so the entry stays exactly
 * reversible; an empty note becomes `From "<goal>"`.
 */
export function drawFromGoal(state: State, goalId: string, amount: number, category: string, note: string, now: Date): ActionResult {
  const goal = state.goals.find((g) => g.id === goalId);
  // `!(amount > 0)` rather than `amount <= 0`: NaN fails every comparison,
  // so only the negated form rejects it too (≈ also checking math.isnan).
  if (!goal || !(amount > 0) || amount > goal.saved) return { state, events: [] };
  const tx: Transaction = {
    id: uid(), type: "expense", amount, category,
    note: note.trim() || `From "${goal.name}"`, date: todayISO(now), goalId,
  };
  const goals = state.goals.map((g) => (g.id === goalId ? { ...g, saved: g.saved - amount } : g));
  const tended = tend(state, now);
  return {
    state: { ...state, goals, transactions: [tx, ...state.transactions], streak: tended.streak },
    events: tended.events,
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
