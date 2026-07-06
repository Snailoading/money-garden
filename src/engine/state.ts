/*
 * State construction, (de)serialization, and migration.
 * Pure — no React, no DOM. Ported from reference lines 133–184 (states),
 * 264 (load-time normalization) and 294–300 (streak).
 */

import type { Commitment, Invest, State, Streak } from "./types";
import { CATEGORIES, DEFAULT_INVEST } from "./types";
import { todayISO, uid } from "./format";

export function emptyState(): State {
  return {
    income: 0,
    // Object.fromEntries over a map ≈ {c.id: c.budget for c in CATEGORIES}
    budgets: Object.fromEntries(CATEGORIES.map((c) => [c.id, c.budget])),
    transactions: [],
    goals: [],
    invest: { ...DEFAULT_INVEST },
    commitments: [],
    streak: { count: 0, lastDate: null },
  };
}

/** Realistic example numbers for first-time visitors ("Plant sample data"). */
export function sampleState(now: Date = new Date()): State {
  const y = now.getFullYear(), m = now.getMonth();
  // Sample dates are clamped to today so everything lands in the current month
  // so far. (Local date → UTC ISO string: same quirk as the reference.)
  const d = (day: number) => new Date(y, m, Math.min(day, now.getDate())).toISOString().slice(0, 10);
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
 * fill any missing invest keys from defaults and default commitments to [].
 * Spreads keep every unknown field intact (CLAUDE.md: never silently drop
 * unknown fields), so data written by future versions survives a round-trip.
 */
export function migrate(parsed: Record<string, unknown>): State {
  return {
    ...(parsed as unknown as State),
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
 * Advance the logging streak for an action performed "today": consecutive-day
 * actions increment, a gap resets to 1, repeat actions on the same day are
 * no-ops. Compares UTC ISO dates (todayISO quirk).
 */
export function bumpStreak(streak: Streak, now: Date = new Date()): Streak {
  const t = todayISO(now);
  if (streak.lastDate === t) return streak;
  const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
  const count = streak.lastDate === yesterday ? streak.count + 1 : 1;
  return { count, lastDate: t };
}
