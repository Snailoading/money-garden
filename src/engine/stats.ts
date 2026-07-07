/*
 * Derived monthly stats + garden health score + weather.
 * Ported verbatim from the reference `derived` useMemo (lines 303–416) and
 * weatherFor (239–244). Pure — no React, no DOM; `now` is injected.
 */

import type { State, Transaction } from "./types";
import { CATEGORIES } from "./types";
import { monthKey } from "./format";
import { deriveFire, type FireDerived } from "./fire";
import { deriveCommitments, type CommitmentsDerived } from "./commitments";

export interface DailyPoint {
  day: number;
  /** Cumulative spend through this day, rounded. */
  spent: number;
  /** The even-pace line: totalBudget spread evenly across the month. */
  pace: number;
}

export interface Weather {
  icon: string;
  word: string;
  blurb: string;
}

export interface Derived {
  monthTx: Transaction[];
  spent: number;
  earned: number;
  income: number;
  savedThisMonth: number;
  left: number;
  savingsRate: number;
  byCat: Record<string, number>;
  totalBudget: number;
  overruns: typeof CATEGORIES;
  needs: number;
  wants: number;
  health: number;
  daily: DailyPoint[];
  daysInMonth: number;
  monthFrac: number;
  emergency: State["goals"][number] | undefined;
  emergencyMonths: number;
  monthlyExpenses: number;
  fire: FireDerived;
  commit: CommitmentsDerived;
}

export function weatherFor(score: number): Weather {
  if (score >= 80) return { icon: "☀️", word: "Sunny", blurb: "Your money is thriving." };
  if (score >= 60) return { icon: "🌤️", word: "Fair", blurb: "Mostly healthy, a little drift." };
  if (score >= 40) return { icon: "☁️", word: "Overcast", blurb: "Spending is creeping up." };
  return { icon: "🌧️", word: "Stormy", blurb: "Budget needs shelter this month." };
}

/**
 * The month-scoped aggregation shared by derive() (current month),
 * deriveMonthView() (any month), and trends.ts. `ym` is a YYYY-MM key;
 * the filter is a string-prefix match on the stored local-calendar date.
 */
export function monthAggregates(state: State, ym: string) {
  const monthTx = state.transactions.filter((t) => t.date.startsWith(ym));
  const spent = monthTx.filter((t) => t.type === "expense").reduce((a, t) => a + t.amount, 0);
  const earned = monthTx.filter((t) => t.type === "income").reduce((a, t) => a + t.amount, 0);
  const savedThisMonth = monthTx.filter((t) => t.type === "saving").reduce((a, t) => a + t.amount, 0);

  const byCat: Record<string, number> = {};
  for (const c of CATEGORIES) byCat[c.id] = 0;
  for (const t of monthTx) if (t.type === "expense") byCat[t.category] = (byCat[t.category] || 0) + t.amount;

  const needs = CATEGORIES.filter((c) => c.kind === "need").reduce((a, c) => a + byCat[c.id], 0);
  const wants = CATEGORIES.filter((c) => c.kind === "want").reduce((a, c) => a + byCat[c.id], 0);

  return { monthTx, spent, earned, savedThisMonth, byCat, needs, wants };
}

/** Budget-dependent pieces shared by derive() and deriveMonthView(). */
function budgetStats(state: State, byCat: Record<string, number>) {
  const totalBudget = Object.values(state.budgets).reduce((a, b) => a + (Number(b) || 0), 0);
  const overruns = CATEGORIES.filter(
    (c) => byCat[c.id] > (state.budgets[c.id] || 0) && (state.budgets[c.id] || 0) > 0,
  );
  return { totalBudget, overruns };
}

/** Cumulative daily spend vs the even-pace line, for days 1..lastDay of ym. */
function dailySeries(monthTx: Transaction[], ym: string, lastDay: number, daysInMonth: number, totalBudget: number): DailyPoint[] {
  const daily: DailyPoint[] = [];
  let run = 0;
  for (let day = 1; day <= lastDay; day++) {
    const dstr = `${ym}-${String(day).padStart(2, "0")}`;
    run += monthTx.filter((t) => t.type === "expense" && t.date === dstr).reduce((a, t) => a + t.amount, 0);
    daily.push({ day, spent: Math.round(run), pace: Math.round((totalBudget / daysInMonth) * day) });
  }
  return daily;
}

/**
 * Everything the UI derives from state, in one pass — the exact shape the
 * reference computed in its `derived` useMemo.
 */
export function derive(state: State, now: Date = new Date()): Derived {
  const mk = monthKey(now);
  const { monthTx, spent, earned, savedThisMonth, byCat, needs, wants } = monthAggregates(state, mk);
  // Any logged income this month REPLACES the stated income entirely (it does
  // not top it up) — reference behavior (line 309), preserved and flagged.
  const income = earned || state.income || 0;
  const left = income - spent - savedThisMonth;
  const savingsRate = income > 0 ? savedThisMonth / income : 0;
  const { totalBudget, overruns } = budgetStats(state, byCat);

  // Health score: budget adherence (55) + savings behaviour (30) + streak (15).
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthFrac = Math.min(1, now.getDate() / daysInMonth);
  // With no budgets set, paceRatio pins to 1 → adherence = 1, i.e. the full
  // 55 points regardless of spending — deliberate: no budget, no pace signal.
  const paceRatio = totalBudget > 0 ? spent / (totalBudget * monthFrac || 1) : 1;
  // Confidence ramp: the even-pace comparison carries little signal early in
  // the month (rent on the 1st is ~half a typical budget), so the penalty
  // scales in with monthFrac and reaches full strength at mid-month.
  const adherenceRaw = Math.max(0, Math.min(1, 2 - paceRatio)); // 1 when on/under pace
  const adherence = 1 - (1 - adherenceRaw) * Math.min(1, monthFrac / 0.5);
  const saveScore = Math.min(1, savingsRate / 0.2);
  const streakScore = Math.min(1, state.streak.count / 7);
  const health = Math.round(adherence * 55 + saveScore * 30 + streakScore * 15);

  // Daily cumulative spend for the pace chart — up to today only.
  const daily = dailySeries(monthTx, mk, now.getDate(), daysInMonth, totalBudget);

  const emergency = state.goals.find((g) => g.isEmergency);
  // Typical monthly spending (feeds emergency coverage and FIRE sizing when
  // retireSpend isn't set). Prefer real history: the average of the last
  // up-to-3 completed months that logged any expenses — stable all month.
  // Fallbacks for users without a completed month yet: actuals so far plus
  // the budget rate for the rest of the month; then a floored projection
  // (the reference's bare spent/monthFrac multiplied day-1 entries ~30×);
  // then the budget itself.
  const priorMonthTotals: number[] = [];
  for (let k = 1; k <= 3; k++) {
    const key = monthKey(new Date(now.getFullYear(), now.getMonth() - k, 1));
    const total = state.transactions
      .filter((t) => t.type === "expense" && t.date.startsWith(key))
      .reduce((a, t) => a + t.amount, 0);
    if (total > 0) priorMonthTotals.push(total);
  }
  const monthlyExpenses =
    priorMonthTotals.length > 0
      ? priorMonthTotals.reduce((a, b) => a + b, 0) / priorMonthTotals.length
      : spent > 0 && totalBudget > 0
        ? spent + (1 - monthFrac) * totalBudget
        : spent > 0
          ? spent / Math.max(monthFrac, 0.05)
          : totalBudget || 1;
  const emergencyMonths = emergency ? emergency.saved / (monthlyExpenses || 1) : 0;

  const fire = deriveFire(state.invest, monthlyExpenses);
  const commit = deriveCommitments(state.commitments || [], now, state.transactions);

  return {
    monthTx, spent, earned, income, savedThisMonth, left, savingsRate, byCat,
    totalBudget, overruns, needs, wants, health, daily, daysInMonth, monthFrac,
    emergency, emergencyMonths, monthlyExpenses, fire, commit,
  };
}

/**
 * A single month viewed in full — the shape Overview/Log/Budgets need when
 * browsing history. Field names deliberately match Derived so the UI can
 * read from `view ?? derived`. No health/monthFrac/fire here: those are
 * "now" concepts, not properties of a past month.
 */
export interface MonthView {
  ym: string;
  monthTx: Transaction[];
  spent: number;
  earned: number;
  income: number;
  savedThisMonth: number;
  left: number;
  savingsRate: number;
  byCat: Record<string, number>;
  totalBudget: number;
  overruns: typeof CATEGORIES;
  needs: number;
  wants: number;
  daily: DailyPoint[];
  daysInMonth: number;
}

export function deriveMonthView(state: State, ym: string): MonthView {
  const { monthTx, spent, earned, savedThisMonth, byCat, needs, wants } = monthAggregates(state, ym);
  // Same earned-replaces-stated-income convention as derive(): the stated
  // income is a monthly recurring figure, so it stands in for months where
  // no paycheck was logged.
  const income = earned || state.income || 0;
  const left = income - spent - savedThisMonth;
  const savingsRate = income > 0 ? savedThisMonth / income : 0;
  const { totalBudget, overruns } = budgetStats(state, byCat);
  const [y, m] = ym.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate(); // m is 1-based → day 0 of next month
  // A browsed month renders complete: the daily series runs to its last day.
  const daily = dailySeries(monthTx, ym, daysInMonth, daysInMonth, totalBudget);
  return {
    ym, monthTx, spent, earned, income, savedThisMonth, left, savingsRate,
    byCat, totalBudget, overruns, needs, wants, daily, daysInMonth,
  };
}
