/*
 * Seasons — month-over-month history for the trend charts and the
 * month-navigation bounds. Pure — no React, no DOM; `now` is injected.
 */

import type { State } from "./types";
import { MONTH_NAMES, monthKey } from "./format";
import { monthAggregates } from "./stats";

export interface TrendPoint {
  /** YYYY-MM. */
  ym: string;
  /** Short axis label: "Feb", with the year on the first point and each
   * January ("Feb ’26") so long ranges stay readable. */
  label: string;
  spent: number;
  earned: number;
  saved: number;
  savingsRate: number;
  needs: number;
  wants: number;
  /** true for the current, still-unfolding month. */
  partial: boolean;
}

/** First day of the month `offset` months after ym (offset may be negative). */
const shiftYm = (ym: string, offset: number): string => {
  const [y, m] = ym.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + offset, 1));
};

/**
 * Every month from the earliest transaction through the current month,
 * oldest first — months without data included so the range is continuous.
 * This is the navigation range: browsing is NOT capped at 12 months.
 */
export function monthRange(state: State, now: Date = new Date()): string[] {
  const current = monthKey(now);
  // ISO YYYY-MM strings sort chronologically, so min() is the earliest month.
  const txMonths = state.transactions.map((t) => t.date.slice(0, 7)).filter((ym) => ym <= current);
  const first = txMonths.length > 0 ? txMonths.reduce((a, b) => (a < b ? a : b)) : current;
  const range: string[] = [];
  for (let ym = first; ym <= current; ym = shiftYm(ym, 1)) range.push(ym);
  return range;
}

/**
 * The trend series: a `maxMonths`-wide window of the range, oldest → newest.
 * `offset` shifts the window back in time by that many months (clamped to
 * the start of history) — the Seasons pager pages in steps of 12.
 * The cap is purely for chart legibility (12 grouped bars fit a phone),
 * never a data limit: the whole history is always available.
 */
export function monthlyTrends(state: State, now: Date = new Date(), maxMonths = 12, offset = 0): TrendPoint[] {
  const current = monthKey(now);
  const range = monthRange(state, now);
  const end = Math.max(maxMonths, range.length - Math.max(0, offset));
  const window = range.slice(Math.max(0, end - maxMonths), end);
  return window.map((ym, i) => {
    const { spent, earned, savedThisMonth, needs, wants } = monthAggregates(state, ym);
    const income = earned || state.income || 0;
    const [, m] = ym.split("-").map(Number);
    const monthName = MONTH_NAMES[m - 1];
    const label = i === 0 || m === 1 ? `${monthName} ’${ym.slice(2, 4)}` : monthName;
    return {
      ym,
      label,
      spent,
      earned,
      saved: savedThisMonth,
      savingsRate: income > 0 ? savedThisMonth / income : 0,
      needs,
      wants,
      partial: ym === current,
    };
  });
}
