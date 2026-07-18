/*
 * State construction, (de)serialization, and migration.
 * Pure — no React, no DOM. Ported from reference lines 133–184 (states),
 * 264 (load-time normalization) and 294–300 (streak).
 */

import type { Commitment, Goal, Invest, State, Streak, Transaction } from "./types";
import { CATEGORIES, DEFAULT_INVEST } from "./types";
import { toLocalISO, todayISO, uid } from "./format";

/**
 * The rain-barrel invariant (v0.12.0): exactly one emergency goal always
 * exists, and it always sits first. `target: 0` is the "not set up yet"
 * sentinel — normal goals require target > 0, so the Garden knows to show
 * the setup card instead of a plant. Missing → inject an unfunded barrel;
 * duplicates (a hand-edited or corrupt backup) → first wins, rest unflag.
 * Already-canonical input returns the SAME array reference, so migrate is
 * id-stable and round-trip tests stay exact.
 */
export function ensureEmergencyGoal(goals: Goal[]): Goal[] {
  const idx = goals.findIndex((g) => g.isEmergency);
  if (idx === -1) {
    // A fixed id keeps the injection deterministic: a pre-0.12 save re-runs
    // this on every load until something persists, and the barrel must not
    // change identity between loads. uid() only as a collision escape hatch
    // (an imported goal could theoretically already use the sentinel).
    const id = goals.some((g) => g.id === "the-rain-barrel") ? uid() : "the-rain-barrel";
    return [
      { id, name: "Emergency fund", plant: "sunflower", target: 0, saved: 0, isEmergency: true },
      ...goals,
    ];
  }
  const hasDupes = goals.some((g, i) => g.isEmergency && i !== idx);
  if (idx === 0 && !hasDupes) return goals;
  const rest = goals
    .filter((_, i) => i !== idx)
    .map((g) => (g.isEmergency ? { ...g, isEmergency: false } : g));
  return [goals[idx], ...rest];
}

export function emptyState(): State {
  return {
    income: 0,
    // Object.fromEntries over a map ≈ {c.id: c.budget for c in CATEGORIES}
    budgets: Object.fromEntries(CATEGORIES.map((c) => [c.id, c.budget])),
    transactions: [],
    goals: ensureEmergencyGoal([]),
    invest: { ...DEFAULT_INVEST },
    commitments: [],
    streak: { count: 0, lastDate: null },
  };
}

/** Realistic example numbers for first-time visitors ("Plant sample data"). */
export function sampleState(now: Date = new Date()): State {
  const y = now.getFullYear(), m = now.getMonth();
  // Sample dates are clamped to today so everything lands in the current
  // month so far (local calendar).
  const d = (day: number) => toLocalISO(new Date(y, m, Math.min(day, now.getDate())));
  // Day `day` of the month `k` months ago, clamped into that month — the two
  // completed months of history light up Seasons, month navigation, and the
  // trailing-average spending estimate.
  const dp = (k: number, day: number) => {
    const dim = new Date(y, m - k + 1, 0).getDate();
    return toLocalISO(new Date(y, m - k, Math.min(day, dim)));
  };
  const priorMonth = (k: number, tweaks: { groceriesA: number; groceriesB: number; utilities: number; dining: number; transport: number; extraCat: string; extraNote: string; extra: number; savingNote: string; saving: number }): Transaction[] => [
    { id: uid(), type: "income",  amount: 4200, category: "other", note: "Paycheck", date: dp(k, 1) },
    { id: uid(), type: "expense", amount: 1400, category: "housing", note: "Rent", date: dp(k, 1) },
    { id: uid(), type: "expense", amount: tweaks.groceriesA, category: "groceries", note: "Weekly shop", date: dp(k, 6) },
    { id: uid(), type: "expense", amount: tweaks.groceriesB, category: "groceries", note: "Weekly shop", date: dp(k, 19) },
    { id: uid(), type: "expense", amount: tweaks.utilities, category: "utilities", note: "Electric bill", date: dp(k, 6) },
    { id: uid(), type: "expense", amount: 15.99, category: "subs", note: "Streaming", date: dp(k, 12) },
    { id: uid(), type: "expense", amount: tweaks.dining, category: "dining", note: "Eating out", date: dp(k, 13) },
    { id: uid(), type: "expense", amount: tweaks.transport, category: "transport", note: "Transit pass", date: dp(k, 9) },
    { id: uid(), type: "expense", amount: tweaks.extra, category: tweaks.extraCat, note: tweaks.extraNote, date: dp(k, 21) },
    { id: uid(), type: "saving", amount: tweaks.saving, category: "other", note: tweaks.savingNote, date: dp(k, 26) },
  ];
  return {
    income: 4200,
    budgets: Object.fromEntries(CATEGORIES.map((c) => [c.id, c.budget])),
    transactions: [
      { id: uid(), type: "income",  amount: 4200,  category: "other",     note: "Paycheck",       date: d(1) },
      { id: uid(), type: "expense", amount: 1400,  category: "housing",   note: "Rent",           date: d(1) },
      { id: uid(), type: "expense", amount: 96.4,  category: "groceries", note: "Weekly shop",    date: d(3) },
      { id: uid(), type: "expense", amount: 42.0,  category: "dining",    note: "Ramen with Sam", date: d(5) },
      { id: uid(), type: "expense", amount: 58.9,  category: "utilities", note: "Electric bill",  date: d(6) },
      { id: uid(), type: "expense", amount: 15.99, category: "subs",      note: "Streaming",      date: d(7) },
      { id: uid(), type: "expense", amount: 112.3, category: "groceries", note: "Groceries",      date: d(10) },
      { id: uid(), type: "expense", amount: 34.5,  category: "fun",       note: "Climbing gym",   date: d(12) },
      { id: uid(), type: "expense", amount: 67.8,  category: "shopping",  note: "Running shoes",  date: d(14) },
      { id: uid(), type: "expense", amount: 28.0,  category: "transport", note: "Transit pass",   date: d(15) },
      ...priorMonth(1, { groceriesA: 196.4, groceriesB: 188.25, utilities: 61.2, dining: 118, transport: 44, extraCat: "fun", extraNote: "Climbing gym", extra: 38, savingNote: "→ Japan trip", saving: 400 }),
      ...priorMonth(2, { groceriesA: 205.1, groceriesB: 179.6, utilities: 58.7, dining: 84.5, transport: 52, extraCat: "shopping", extraNote: "Winter boots", extra: 45, savingNote: "→ Emergency fund", saving: 500 }),
    ],
    goals: [
      { id: uid(), name: "Emergency fund", plant: "sunflower", target: 6000, saved: 2150, isEmergency: true },
      { id: uid(), name: "Japan trip",     plant: "tulip",     target: 2800, saved: 640,  isEmergency: false },
      { id: uid(), name: "New laptop",     plant: "bluebell",  target: 1500, saved: 1275, isEmergency: false },
    ],
    invest: {
      holdings: [
        { id: uid(), name: "Global index fund ETF", value: 14200 },
        { id: uid(), name: "Retirement account",    value: 9800 },
      ],
      monthly: 400, ret: 7, age: 29, retireAge: 65, wr: 4, retireSpend: 0,
    },
    commitments: [
      { id: uid(), kind: "sub",  name: "Streaming bundle", amount: 15.99, cadence: "monthly", payDay: 12, payMonth: 1, endDate: "", category: "subs" },
      { id: uid(), kind: "sub",  name: "Gym membership",   amount: 35,    cadence: "monthly", payDay: 1,  payMonth: 1, endDate: "", category: "subs" },
      { id: uid(), kind: "sub",  name: "Car insurance",    amount: 640,   cadence: "annual",  payDay: 15, payMonth: 9, endDate: "", category: "transport" },
      { id: uid(), kind: "inst", name: "Tax bill (plan)",  amount: 240,   cadence: "monthly", payDay: 20, payMonth: 1, totalPayments: 6, paidCount: 2, category: "other" },
    ],
    streak: { count: 3, lastDate: todayISO(now) },
  };
}

/**
 * Normalize a parsed stored state — the reference's load-time migration:
 * fill any missing invest keys from defaults, default commitments to [],
 * and enforce the rain-barrel invariant (backup import routes through here
 * too, so imported barrel-less backups gain the barrel the same way).
 * Spreads keep every unknown field intact (CLAUDE.md: never silently drop
 * unknown fields), so data written by future versions survives a round-trip.
 */
export function migrate(parsed: Record<string, unknown>): State {
  return {
    ...(parsed as unknown as State),
    goals: ensureEmergencyGoal((parsed.goals as Goal[]) || []),
    invest: { ...DEFAULT_INVEST, ...((parsed.invest as Partial<Invest>) || {}) },
    commitments: (parsed.commitments as Commitment[]) || [],
  };
}

export const serialize = (state: State): string => JSON.stringify(state);

/** Parse + migrate. Throws on invalid JSON — callers decide the fallback. */
export function deserialize(raw: string): State {
  return migrate(JSON.parse(raw));
}

/**
 * Move a linked goal's balance by delta, floored at 0. No target cap:
 * goals may overflow (v0.7.0) — "$900 of $500" is truthful, and it keeps
 * every journal entry exactly reversible.
 */
function adjustLinkedGoal(state: State, goalId: string | undefined, delta: number): State["goals"] {
  if (!goalId || delta === 0) return state.goals;
  return state.goals.map((g) =>
    g.id === goalId ? { ...g, saved: Math.max(0, g.saved + delta) } : g,
  );
}

/**
 * The direction a linked entry moves its goal: saving entries watered it
 * (reversal drains), expense entries drew from it (reversal re-waters).
 */
const linkSign = (t: Transaction): number => (t.type === "expense" ? -1 : 1);

/**
 * Move a linked holding's value by delta, floored at 0 — the orchard twin of
 * adjustLinkedGoal. Waterings are the only holding-linked entries (always
 * saving-type, no sign flip). Unknown/absent ids are silent no-ops, and
 * manual holding edits are revaluations that always win: reversal subtracts
 * what the entry put in, never reconstructs a "correct" value after the fact.
 */
function adjustLinkedHolding(state: State, holdingId: string | undefined, delta: number): State["invest"] {
  if (!holdingId || delta === 0) return state.invest;
  return {
    ...state.invest,
    holdings: state.invest.holdings.map((h) =>
      h.id === holdingId ? { ...h, value: Math.max(0, (Number(h.value) || 0) + delta) } : h,
    ),
  };
}

/**
 * Edit a goal in place (unknown id = no-op). The balance is deliberately
 * NOT editable here — it stays journal-driven via watering/draw entries so
 * every dollar remains traceable. `isEmergency` is structural (the barrel
 * is permanent, v0.12.0); both it and `saved` are stripped even if a caller
 * sneaks them past the types — like popping keys before a {**existing, **d}
 * merge. The barrel also refuses a non-positive target: target 0 is the
 * setup sentinel, and re-entering it would let setupEmergencyFund overwrite
 * a journal-driven balance (breaking exact reversibility of linked entries).
 */
export function updateGoal(
  state: State,
  id: string,
  patch: Partial<Omit<Goal, "id" | "saved" | "isEmergency">>,
): State {
  const existing = state.goals.find((g) => g.id === id);
  if (!existing) return state;
  const { isEmergency: _flag, saved: _saved, ...safe } = patch as Partial<Goal>;
  if (existing.isEmergency && safe.target !== undefined && !(safe.target > 0)) delete safe.target;
  const goals = state.goals.map((g) => (g.id === id ? { ...existing, ...safe, id } : g));
  return { ...state, goals };
}

/**
 * Add a goal. Always a regular planting: the emergency flag is forced off
 * (only ensureEmergencyGoal may mint a barrel — a flagged insert would mean
 * two, or a deletable one). A provided `saved` is kept: it's the opening
 * balance for money set aside before the goal existed here — a starting
 * fact, not a monthly flow, so no journal entry accompanies it.
 */
export function insertGoal(state: State, goal: Goal): State {
  return { ...state, goals: [...state.goals, { ...goal, isEmergency: false }] };
}

/**
 * Delete a goal — except the rain barrel, which is permanent (same-reference
 * no-op, like unknown ids). Linked journal entries survive deletion; their
 * dangling goalIds are silent no-ops on reversal (the v0.8.0 contract).
 */
export function deleteGoal(state: State, id: string): State {
  const goal = state.goals.find((g) => g.id === id);
  if (!goal || goal.isEmergency) return state;
  return { ...state, goals: state.goals.filter((g) => g.id !== id) };
}

/**
 * One-time rain-barrel setup: give the barrel its target and, optionally,
 * the money already set aside for it. Allowed only while target === 0 (the
 * setup sentinel) — after that the balance is journal-driven like every
 * other goal. Deliberately creates NO transaction: an opening balance is a
 * starting fact, not one of this month's flows, so budgets, Left, and the
 * savings rate never see it. Streak untouched (setup isn't logging).
 */
export function setupEmergencyFund(state: State, target: number, openingBalance = 0): State {
  const barrel = state.goals.find((g) => g.isEmergency);
  if (!barrel || barrel.target !== 0 || !(target > 0)) return state;
  const saved = Math.max(0, Number(openingBalance) || 0);
  return {
    ...state,
    goals: state.goals.map((g) => (g.isEmergency ? { ...g, target, saved } : g)),
  };
}

/** Deleting a linked installment payment un-counts it (floored at 0). */
function revertInstallmentPayment(state: State, commitmentId: string | undefined): State["commitments"] {
  if (!commitmentId) return state.commitments;
  return state.commitments.map((c) =>
    c.id === commitmentId && c.kind === "inst"
      ? { ...c, paidCount: Math.max(0, (c.paidCount || 0) - 1) }
      : c,
  );
}

/**
 * Edit a logged entry in place. Editing is correction, not logging — the
 * streak is never touched. When the entry carries a goalId or holdingId and
 * the amount changes, the linked goal/holding moves by the difference
 * (dangling ids — goal or holding since deleted — are silent no-ops).
 */
export function updateTransaction(
  state: State,
  id: string,
  patch: Partial<Omit<Transaction, "id">>,
): State {
  const existing = state.transactions.find((t) => t.id === id);
  if (!existing) return state;
  const next = { ...existing, ...patch, id };
  const delta = patch.amount !== undefined ? next.amount - existing.amount : 0;
  return {
    ...state,
    transactions: state.transactions.map((t) => (t.id === id ? next : t)),
    goals: adjustLinkedGoal(state, existing.goalId, delta * linkSign(existing)),
    invest: adjustLinkedHolding(state, existing.holdingId, delta),
  };
}

/**
 * Delete a logged entry — the symmetric counterpart to updateTransaction:
 * a goal-linked entry drains its goal by the deleted amount (floor 0), a
 * holding-linked watering drains its holding likewise, and a commitment-
 * linked installment payment un-counts itself. The next-due date reverts on
 * its own — it's derived from the linked transactions.
 */
export function removeTransaction(state: State, id: string): State {
  const existing = state.transactions.find((t) => t.id === id);
  if (!existing) return state;
  return {
    ...state,
    transactions: state.transactions.filter((t) => t.id !== id),
    goals: adjustLinkedGoal(state, existing.goalId, -existing.amount * linkSign(existing)),
    invest: adjustLinkedHolding(state, existing.holdingId, -existing.amount),
    commitments: revertInstallmentPayment(state, existing.commitmentId),
  };
}

/**
 * Edit a commitment in place (unknown id = no-op). Pure field merge — the
 * derived due dates and monthly drains recompute from the new values.
 */
export function updateCommitment(
  state: State,
  id: string,
  patch: Partial<Omit<Commitment, "id">>,
): State {
  const existing = state.commitments.find((c) => c.id === id);
  if (!existing) return state;
  return {
    ...state,
    commitments: state.commitments.map((c) => (c.id === id ? { ...existing, ...patch, id } : c)),
  };
}

/**
 * Advance the logging streak for an action performed "today": consecutive-day
 * actions increment, a gap resets to 1, repeat actions on the same day are
 * no-ops. Local calendar dates throughout.
 */
export function bumpStreak(streak: Streak, now: Date = new Date()): Streak {
  const t = todayISO(now);
  if (streak.lastDate === t) return streak;
  // Calendar-day arithmetic (day − 1 rolls months/years over), not
  // now − 24h, which misbehaves across DST changes.
  const yesterday = toLocalISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const count = streak.lastDate === yesterday ? streak.count + 1 : 1;
  return { count, lastDate: t };
}
