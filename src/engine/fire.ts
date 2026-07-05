/*
 * The Orchard — FIRE math: freedom number, Coast FIRE, and month-by-month
 * projections with the ±2% return band.
 * Ported verbatim from reference/money-garden.html lines 347–402.
 * Pure — no React, no DOM, no clock.
 *
 * Conventions (CLAUDE.md): everything is in today's dollars with real
 * (after-inflation) returns; projections simulate month by month, never with
 * closed-form annuity formulas; freedom dates are windows, not points.
 */

import type { Invest } from "./types";
import { DEFAULT_INVEST } from "./types";

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
  age: number;
  retireAge: number;
  wr: number;
}

/**
 * Derive all FIRE numbers from the invest settings.
 * `monthlyExpenses` is the spending-pace fallback computed in stats.ts —
 * it is only used when invest.retireSpend is 0.
 */
export function deriveFire(invest: Invest | undefined, monthlyExpenses: number): FireDerived {
  const inv = invest || DEFAULT_INVEST;
  const portfolio = (inv.holdings || []).reduce((a, h) => a + (Number(h.value) || 0), 0);
  const customSpend = Math.max(0, Number(inv.retireSpend) || 0);
  const fiMonthlySpend = customSpend > 0 ? customSpend : monthlyExpenses;
  const spendBasis: "custom" | "auto" = customSpend > 0 ? "custom" : "auto";
  const annualExpenses = fiMonthlySpend * 12;
  const wr = Math.min(10, Math.max(2, Number(inv.wr) || 4));
  // annualExpenses × (100 / wr): at the default 4% withdrawal rate this is ×25.
  const fireNumber = annualExpenses > 0 ? annualExpenses * (100 / wr) : 0;
  const ret = Math.min(15, Math.max(0, Number(inv.ret) || 0));
  const contrib = Math.max(0, Number(inv.monthly) || 0);
  const age = Math.min(100, Math.max(14, Number(inv.age) || 30));
  const retireAge = Math.min(100, Math.max(age, Number(inv.retireAge) || 65));
  const retLo = Math.max(0, ret - 2);
  const retHi = Math.min(15, ret + 2);

  // Month-by-month simulation: grow at the monthly rate, THEN add the
  // contribution (end-of-month timing — reference behavior). Capped at
  // 720 months = 60 years; beyond that FI is reported as null.
  const yearsFor = (annualRet: number): number | null => {
    if (fireNumber <= 0) return null;
    const rr = annualRet / 100 / 12;
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
    const rr = annualRet / 100 / 12;
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
  // retireAge. NOTE: this uses ANNUAL compounding while yearsFor/seriesFor
  // compound monthly — the two models disagree slightly at boundaries.
  // Reference behavior (lines 395–396), preserved and flagged.
  const yearsToRetire = retireAge - age;
  const coastNumber = fireNumber > 0 ? fireNumber / Math.pow(1 + ret / 100, yearsToRetire) : 0;
  const coastReached = fireNumber > 0 && portfolio * Math.pow(1 + ret / 100, yearsToRetire) >= fireNumber;

  return {
    portfolio, annualExpenses, fiMonthlySpend, spendBasis, fireNumber,
    yearsToFI, yearsToFIEarly, yearsToFILate, retLo, retHi,
    curve, coastNumber, coastReached,
    progress: fireNumber > 0 ? Math.min(1, portfolio / fireNumber) : 0,
    monthly: contrib, ret, age, retireAge, wr,
  };
}
