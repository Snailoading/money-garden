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

import type { Commitment, Holding, Invest, State, Transaction } from "./types";
import { DEFAULT_INVEST } from "./types";
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

/* ---- the orchard ---- */

/** The invest block, defaulted — states predating the Orchard may lack it. */
const investOf = (state: State): Invest => state.invest || DEFAULT_INVEST;

/**
 * A one-off orchard watering (bonus, windfall): add `amount` to the holding
 * and log a linked saving entry (holdingId) so later edits/deletes move the
 * holding too. A junk stored value counts as 0 before adding. Same-state
 * no-op for an unknown holding or a non-positive/NaN amount.
 */
export function waterHolding(state: State, holdingId: string, amount: number, now: Date): ActionResult {
  const inv = investOf(state);
  const target = inv.holdings.find((h) => h.id === holdingId);
  if (!target || !(amount > 0)) return { state, events: [] };
  const holdings = inv.holdings.map((h) => (h.id === holdingId ? { ...h, value: (Number(h.value) || 0) + amount } : h));
  const tx: Transaction = {
    id: uid(), type: "saving", amount, category: "other",
    note: `→ Orchard: ${target.name}`, date: todayISO(now), holdingId,
  };
  const tended = tend(state, now);
  return {
    state: { ...state, invest: { ...inv, holdings }, transactions: [tx, ...state.transactions], streak: tended.streak },
    events: tended.events,
  };
}

/** Merge a growing-conditions patch (monthly, ret, wr, birthYear, …).
 * Values pass through as given — incl. the Orchard's "" while a box is
 * cleared; the FIRE math coerces on read (deriveFire). */
export function updateInvest(state: State, patch: Partial<Invest>): ActionResult {
  return { state: { ...state, invest: { ...investOf(state), ...patch } }, events: [] };
}

/** Plant a holding (appended, fresh id). Not a journal entry and not
 * logging: the value is a starting fact, like a goal's opening balance.
 * `Omit<Holding, "id">` = a Holding minus its id field — like a TypedDict
 * copy without one key; the engine mints the id. */
export function addHolding(state: State, holding: Omit<Holding, "id">): ActionResult {
  const inv = investOf(state);
  return { state: { ...state, invest: { ...inv, holdings: [...(inv.holdings || []), { ...holding, id: uid() }] } }, events: [] };
}

/**
 * Revalue a holding — a plain value edit that always wins over the journal
 * (markets move; waterings don't explain every dollar). Never below 0, and
 * a non-number (a junk box) becomes 0. Unknown id → same state.
 */
export function revalueHolding(state: State, holdingId: string, value: number): ActionResult {
  const inv = investOf(state);
  if (!inv.holdings.some((h) => h.id === holdingId)) return { state, events: [] };
  // `value || 0` turns NaN (Number("abc") from the box) into 0.
  const holdings = inv.holdings.map((h) => (h.id === holdingId ? { ...h, value: Math.max(0, value || 0) } : h));
  return { state: { ...state, invest: { ...inv, holdings } }, events: [] };
}

/** Fell a tree. Its journal entries stay; their holdingId links dangle and
 * are silent no-ops on later edits/deletes. Unknown id → same state. */
export function removeHolding(state: State, holdingId: string): ActionResult {
  const inv = investOf(state);
  if (!inv.holdings.some((h) => h.id === holdingId)) return { state, events: [] };
  return { state: { ...state, invest: { ...inv, holdings: inv.holdings.filter((h) => h.id !== holdingId) } }, events: [] };
}

/* ---- vines & trellis (commitments) ---- */

/**
 * "Log payment": a linked expense (commitmentId) — the next-due date is
 * derived from it (commitments.ts), so deleting the entry reverts the date;
 * an installment also counts the payment (paidCount + 1), which deleting
 * un-counts (removeTransaction). Damaged amounts log as 0 and a missing
 * category as "subs", as before. Unknown commitment → same state.
 * A legacy installment with no paidCount comes back as 0 after pay → undo
 * — intended: every reader treats a missing count as 0 (`paidCount || 0`).
 */
export function payCommitment(state: State, commitmentId: string, now: Date): ActionResult {
  const all = state.commitments || [];
  const c = all.find((x) => x.id === commitmentId);
  if (!c) return { state, events: [] };
  const tx: Transaction = {
    id: uid(), type: "expense", amount: Number(c.amount) || 0, category: c.category || "subs",
    note: `${c.kind === "inst" ? "Installment" : "Subscription"}: ${c.name}`, date: todayISO(now), commitmentId: c.id,
  };
  const commitments = all.map((x) => (x.id === commitmentId && x.kind === "inst" ? { ...x, paidCount: (x.paidCount || 0) + 1 } : x));
  const tended = tend(state, now);
  return {
    state: { ...state, commitments, transactions: [tx, ...state.transactions], streak: tended.streak },
    events: tended.events,
  };
}

/** Plant a vine or stake a trellis plan (appended, fresh id). Not logging. */
export function addCommitment(state: State, commitment: Omit<Commitment, "id">): ActionResult {
  return { state: { ...state, commitments: [...(state.commitments || []), { ...commitment, id: uid() }] }, events: [] };
}

/** Cut a vine. Its logged payments stay; their commitmentId links dangle
 * and are silent no-ops on later deletes. Unknown id → same state. */
export function removeCommitment(state: State, commitmentId: string): ActionResult {
  const all = state.commitments || [];
  if (!all.some((c) => c.id === commitmentId)) return { state, events: [] };
  return { state: { ...state, commitments: all.filter((c) => c.id !== commitmentId) }, events: [] };
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
