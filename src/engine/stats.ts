/*
 * Derived monthly stats + garden health score + weather.
 * Ported verbatim from the reference `derived` useMemo (lines 303–416) and
 * weatherFor (239–244). Pure — no React, no DOM; `now` is injected.
 */

import type { State, Transaction } from "./types";
import { CATEGORIES } from "./types";
import { monthKey, toLocalISO } from "./format";
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
 * Everything the UI derives from state, in one pass — the exact shape the
 * reference computed in its `derived` useMemo.
 */
export function derive(state: State, now: Date = new Date()): Derived {
  const mk = monthKey(now);
  // Month filter is a string-prefix match on the stored YYYY-MM-DD date,
  // local calendar throughout (the reference mixed UTC and local here).
  const monthTx = state.transactions.filter((t) => t.date.startsWith(mk));
  const spent = monthTx.filter((t) => t.type === "expense").reduce((a, t) => a + t.amount, 0);
  const earned = monthTx.filter((t) => t.type === "income").reduce((a, t) => a + t.amount, 0);
  // Any logged income this month REPLACES the stated income entirely (it does
  // not top it up) — reference behavior (line 309), preserved and flagged.
  const income = earned || state.income || 0;
  const savedThisMonth = monthTx.filter((t) => t.type === "saving").reduce((a, t) => a + t.amount, 0);
  const left = income - spent - savedThisMonth;
  const savingsRate = income > 0 ? savedThisMonth / income : 0;

  const byCat: Record<string, number> = {};
  for (const c of CATEGORIES) byCat[c.id] = 0;
  for (const t of monthTx) if (t.type === "expense") byCat[t.category] = (byCat[t.category] || 0) + t.amount;

  const totalBudget = Object.values(state.budgets).reduce((a, b) => a + (Number(b) || 0), 0);
  const overruns = CATEGORIES.filter(
    (c) => byCat[c.id] > (state.budgets[c.id] || 0) && (state.budgets[c.id] || 0) > 0,
  );

  const needs = CATEGORIES.filter((c) => c.kind === "need").reduce((a, c) => a + byCat[c.id], 0);
  const wants = CATEGORIES.filter((c) => c.kind === "want").reduce((a, c) => a + byCat[c.id], 0);

  // Health score: budget adherence (55) + savings behaviour (30) + streak (15).
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthFrac = Math.min(1, now.getDate() / daysInMonth);
  // With no budgets set, paceRatio pins to 1 → adherence = 1, i.e. the full
  // 55 points regardless of spending — reference behavior, preserved/flagged.
  const paceRatio = totalBudget > 0 ? spent / (totalBudget * monthFrac || 1) : 1;
  const adherence = Math.max(0, Math.min(1, 2 - paceRatio)); // 1 when on/under pace
  const saveScore = Math.min(1, savingsRate / 0.2);
  const streakScore = Math.min(1, state.streak.count / 7);
  const health = Math.round(adherence * 55 + saveScore * 30 + streakScore * 15);

  // Daily cumulative spend for the pace chart.
  const daily: DailyPoint[] = [];
  let run = 0;
  for (let day = 1; day <= now.getDate(); day++) {
    const dstr = toLocalISO(new Date(now.getFullYear(), now.getMonth(), day));
    run += monthTx.filter((t) => t.type === "expense" && t.date === dstr).reduce((a, t) => a + t.amount, 0);
    daily.push({ day, spent: Math.round(run), pace: Math.round((totalBudget / daysInMonth) * day) });
  }

  const emergency = state.goals.find((g) => g.isEmergency);
  // Projects the month's spend to a full month by dividing by the elapsed
  // fraction. Early in the month this multiplies a single expense ~30× —
  // reference behavior (line 344), preserved and flagged. retireSpend > 0
  // is the intended escape hatch for FIRE sizing.
  const monthlyExpenses = spent > 0 ? spent / monthFrac : totalBudget || 1;
  const emergencyMonths = emergency ? emergency.saved / (monthlyExpenses || 1) : 0;

  const fire = deriveFire(state.invest, monthlyExpenses);
  const commit = deriveCommitments(state.commitments || [], now);

  return {
    monthTx, spent, earned, income, savedThisMonth, left, savingsRate, byCat,
    totalBudget, overruns, needs, wants, health, daily, daysInMonth, monthFrac,
    emergency, emergencyMonths, monthlyExpenses, fire, commit,
  };
}
