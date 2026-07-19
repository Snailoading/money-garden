/*
 * The Orchard — FIRE math: freedom number, Coast FIRE, month-by-month
 * projections with the ±2% return band, and the watering status.
 * Ported verbatim from reference/money-garden.html lines 347–402.
 * Pure — no React, no DOM; `now` is injected (age derives from birthYear,
 * and the watering status is month-scoped).
 *
 * Conventions (CLAUDE.md): everything is in today's dollars with real
 * (after-inflation) returns; projections simulate month by month, never with
 * closed-form annuity formulas; freedom dates are windows, not points.
 */

import type { Invest, Transaction } from "./types";
import { DEFAULT_INVEST } from "./types";
import { monthKey } from "./format";

export interface CurvePoint {
  age: number;
  value: number;
  /** [slower-market value, kinder-market value] at this age (ret ∓ 2%). */
  band: [number, number];
}

export interface FireDerived {
  portfolio: number;
  annualExpenses: number;
  fiMonthlySpend: number;
  /** "custom" when invest.retireSpend > 0, else "auto" (spending pace). */
  spendBasis: "custom" | "auto";
  fireNumber: number;
  /** Whole years to FI (ceil), 0 if already there, null if >60y away or no target. */
  yearsToFI: number | null;
  yearsToFIEarly: number | null;
  yearsToFILate: number | null;
  retLo: number;
  retHi: number;
  curve: CurvePoint[];
  coastNumber: number;
  coastReached: boolean;
  progress: number;
  monthly: number;
  ret: number;
  /** Derived at computation time: now.getFullYear() − birthYear (clamped). */
  age: number;
  retireAge: number;
  wr: number;
  /** What the wr rule of thumb would let you draw per month if you retired
   * today — portfolio × wr% ÷ 12, in today's dollars. A planning estimate,
   * not income; the copy that renders it must keep the hedge. */
  monthlyYield: number;
}

/** The watering-can status — journal-derived, no stored workflow state. */
export interface WateringStatus {
  /** ISO date of the latest orchard watering ever, or null if none. */
  lastWateredISO: string | null;
  wateredThisMonth: boolean;
  /** Sum poured this month (journal-driven — edits and deletes move it). */
  pouredThisMonth: number;
}

/**
 * Derive the watering status from the journal. Waterings are the only
 * holding-linked entries and are always saving-type (state.ts invariant;
 * journal.ts uses the same discriminator for its link filter). Goal
 * contributions carry goalId instead, so they never count here.
 */
export function deriveWatering(transactions: Transaction[], now: Date = new Date()): WateringStatus {
  const mk = monthKey(now);
  let lastWateredISO: string | null = null;
  let pouredThisMonth = 0;
  let wateredThisMonth = false;
  for (const t of transactions) {
    if (t.type !== "saving" || !t.holdingId) continue;
    // ISO dates compare lexicographically, so max(date) needs no parsing —
    // and no reliance on journal order (edits can re-date entries).
    if (lastWateredISO === null || t.date > lastWateredISO) lastWateredISO = t.date;
    if (t.date.startsWith(mk)) {
      wateredThisMonth = true;
      pouredThisMonth += t.amount;
    }
  }
  return { lastWateredISO, wateredThisMonth, pouredThisMonth };
}

/* ---- global rate assumptions — adjust here, nowhere else ----
 * (Input defaults like ret 7% / wr 4% live in DEFAULT_INVEST in types.ts.) */

/** Expected-return input clamp, %/yr. */
const RET_CLAMP = { min: 0, max: 15 };
/** Withdrawal-rate input clamp, %/yr. */
const WR_CLAMP = { min: 2, max: 10 };
/** Half-width of the slower/kinder market band, in percentage points (±2%). */
const BAND_SPREAD = 2;
/** Annual % rate → monthly growth rate. Every compounding step goes through this. */
const monthlyRate = (annualPct: number): number => annualPct / 100 / 12;

/**
 * Derive all FIRE numbers from the invest settings.
 * `monthlyExpenses` is the spending-pace fallback computed in stats.ts —
 * it is only used when invest.retireSpend is 0.
 */
export function deriveFire(invest: Invest | undefined, monthlyExpenses: number, now: Date = new Date()): FireDerived {
  const inv = invest || DEFAULT_INVEST;
  const portfolio = (inv.holdings || []).reduce((a, h) => a + (Number(h.value) || 0), 0);
  const customSpend = Math.max(0, Number(inv.retireSpend) || 0);
  const fiMonthlySpend = customSpend > 0 ? customSpend : monthlyExpenses;
  const spendBasis: "custom" | "auto" = customSpend > 0 ? "custom" : "auto";
  const annualExpenses = fiMonthlySpend * 12;
  const wr = Math.min(WR_CLAMP.max, Math.max(WR_CLAMP.min, Number(inv.wr) || 4));
  // annualExpenses × (100 / wr): at the default 4% withdrawal rate this is ×25.
  const fireNumber = annualExpenses > 0 ? annualExpenses * (100 / wr) : 0;
  const ret = Math.min(RET_CLAMP.max, Math.max(RET_CLAMP.min, Number(inv.ret) || 0));
  const contrib = Math.max(0, Number(inv.monthly) || 0);
  // Age derives from birthYear so it never goes stale (v0.14.0). The 0
  // sentinel ("not set", like the barrel's target 0) falls back to age 30 —
  // the same default the old stored-age field had.
  const birthYear = Number(inv.birthYear) || 0;
  const age = Math.min(100, Math.max(14, birthYear > 0 ? now.getFullYear() - birthYear : 30));
  const retireAge = Math.min(100, Math.max(age, Number(inv.retireAge) || 65));
  const retLo = Math.max(RET_CLAMP.min, ret - BAND_SPREAD);
  const retHi = Math.min(RET_CLAMP.max, ret + BAND_SPREAD);

  // Month-by-month simulation: grow at the monthly rate, THEN add the
  // contribution (end-of-month timing — reference behavior). Capped at
  // 720 months = 60 years; beyond that FI is reported as null.
  const yearsFor = (annualRet: number): number | null => {
    if (fireNumber <= 0) return null;
    const rr = monthlyRate(annualRet);
    let v = portfolio;
    if (v >= fireNumber) return 0;
    for (let mm = 1; mm <= 720; mm++) {
      v = v * (1 + rr) + contrib;
      if (v >= fireNumber) return Math.ceil(mm / 12);
    }
    return null;
  };
  const yearsToFI = yearsFor(ret);
  const yearsToFIEarly = yearsFor(retHi); // kinder markets → earlier
  const yearsToFILate = yearsFor(retLo);  // slower markets → later

  // Chart horizon: reach a bit past the latest plausible FI year, 10–45y.
  const horizonBasis = yearsToFILate !== null ? yearsToFILate : yearsToFI !== null ? yearsToFI : 36;
  const horizon = Math.min(45, Math.max(horizonBasis + 4, 10));
  const seriesFor = (annualRet: number): number[] => {
    const rr = monthlyRate(annualRet);
    const out = [Math.round(portfolio)];
    let v = portfolio;
    for (let yy = 1; yy <= horizon; yy++) {
      for (let mm = 0; mm < 12; mm++) v = v * (1 + rr) + contrib;
      out.push(Math.round(v));
    }
    return out;
  };
  const baseSeries = seriesFor(ret);
  const loSeries = seriesFor(retLo);
  const hiSeries = seriesFor(retHi);
  const curve: CurvePoint[] = baseSeries.map((v, i) => ({
    age: age + i,
    value: v,
    band: [loSeries[i], hiSeries[i]],
  }));

  // Coast FIRE: today's portfolio compounding alone to the FIRE number by
  // retireAge. Monthly compounding, the same model as yearsFor/seriesFor, so
  // the coast badge and the projection chart agree at the boundary (the
  // reference compounded this one annually).
  const yearsToRetire = retireAge - age;
  const coastGrowth = Math.pow(1 + monthlyRate(ret), 12 * yearsToRetire);
  const coastNumber = fireNumber > 0 ? fireNumber / coastGrowth : 0;
  const coastReached = fireNumber > 0 && portfolio * coastGrowth >= fireNumber;

  return {
    portfolio, annualExpenses, fiMonthlySpend, spendBasis, fireNumber,
    yearsToFI, yearsToFIEarly, yearsToFILate, retLo, retHi,
    curve, coastNumber, coastReached,
    progress: fireNumber > 0 ? Math.min(1, portfolio / fireNumber) : 0,
    monthly: contrib, ret, age, retireAge, wr,
    // Clamped wr, so the yield agrees with the ×(100/wr) freedom-number copy.
    monthlyYield: portfolio * wr / 100 / 12,
  };
}
