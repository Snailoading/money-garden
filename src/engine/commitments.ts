/*
 * Vines & Trellis — recurring-commitment date math.
 * Ported verbatim from reference/money-garden.html lines 96–121 and 404–413.
 * Pure — no React, no DOM. All "today"-dependent functions accept an injected
 * `now` (defaulting to the real clock) so tests can pin the calendar.
 *
 * These functions work in local calendar time (new Date(y, m, d)) — since
 * the timezone fix, so does every date in the engine.
 */

import type { Commitment, Transaction } from "./types";
import { toLocalISO } from "./format";

/** Start of today, local time. */
const midnight = (now: Date): Date => {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Clamp a pay day into the given month: day 31 becomes Feb 28/29, Apr 30, etc.
 * `new Date(y, mIdx + 1, 0)` is JS for "last day of month mIdx" (day 0 of the
 * next month) — the idiom Python would spell as calendar.monthrange(y, m)[1].
 */
export const clampDay = (y: number, mIdx: number, day: number | undefined): number => {
  const dim = new Date(y, mIdx + 1, 0).getDate();
  return Math.min(Math.max(1, Number(day) || 1), dim);
};

/**
 * The next date this commitment bills, today included (strict `<` comparison,
 * so a charge due today stays today rather than rolling forward).
 */
export function nextDueDate(c: Commitment, nowInput: Date = new Date()): Date {
  const now = midnight(nowInput);
  let dt: Date;
  if (c.cadence === "fortnight") {
    // 14-day cycle counted from the anchor date (missing or unparseable
    // anchor → today, defensive: the form always sets one, but imports are
    // deliberately loose). Day count via Math.round is DST-safe (a
    // spring-forward day is 23h, not 24); the date constructor handles the
    // calendar walk.
    const parsed = c.anchorDate ? new Date(c.anchorDate + "T00:00:00") : now;
    const a = isNaN(parsed.getTime()) ? now : parsed;
    const diffDays = Math.round((now.getTime() - a.getTime()) / 86400000);
    // First cycle boundary ≥ today; a payment due today stays today, and a
    // future anchor is itself the next due date (ceil of a negative → 0).
    const cycles = Math.max(0, Math.ceil(diffDays / 14));
    dt = new Date(a.getFullYear(), a.getMonth(), a.getDate() + cycles * 14);
    return dt;
  }
  if (c.cadence === "annual") {
    const m = (Number(c.payMonth) || 1) - 1;
    dt = new Date(now.getFullYear(), m, clampDay(now.getFullYear(), m, c.payDay));
    if (dt < now) dt = new Date(now.getFullYear() + 1, m, clampDay(now.getFullYear() + 1, m, c.payDay));
  } else {
    dt = new Date(now.getFullYear(), now.getMonth(), clampDay(now.getFullYear(), now.getMonth(), c.payDay));
    // Month 12 auto-normalizes to January next year (JS Date rolls over for you).
    if (dt < now) dt = new Date(now.getFullYear(), now.getMonth() + 1, clampDay(now.getFullYear(), now.getMonth() + 1, c.payDay));
  }
  return dt;
}

/**
 * The next due date, accounting for logged payments: a linked payment
 * (tx.commitmentId) dated within the cycle window before the due date —
 * 15 days for monthly, 31 for annual, matching how far ahead the due-soon
 * strip invites "Log payment" — marks that cycle paid and advances the due
 * date one cycle. Fully derived, so deleting the payment reverts the date.
 */
export function nextDueWithPayments(
  c: Commitment,
  transactions: Transaction[],
  nowInput: Date = new Date(),
): Date {
  const due = nextDueDate(c, nowInput);
  // One day WIDER than the due-soon strip's invitation (15 vs monthly's 14,
  // 8 vs fortnight's 7): a payment logged the moment the strip appears must
  // land inside the window, or "Log payment" wouldn't advance the date and
  // a second tap would double-log. Still narrower than a cycle, so
  // consecutive windows never overlap.
  const windowDays = c.cadence === "annual" ? 31 : c.cadence === "fortnight" ? 8 : 15;
  const windowStart = toLocalISO(new Date(due.getFullYear(), due.getMonth(), due.getDate() - windowDays));
  const dueISO = toLocalISO(due);
  const paid = transactions.some(
    (t) => t.commitmentId === c.id && t.date > windowStart && t.date <= dueISO,
  );
  if (!paid) return due;
  if (c.cadence === "fortnight") {
    return new Date(due.getFullYear(), due.getMonth(), due.getDate() + 14);
  }
  if (c.cadence === "annual") {
    const m = (Number(c.payMonth) || 1) - 1;
    return new Date(due.getFullYear() + 1, m, clampDay(due.getFullYear() + 1, m, c.payDay));
  }
  const y = due.getFullYear(), mIdx = due.getMonth() + 1;
  return new Date(y, mIdx, clampDay(y, mIdx, c.payDay));
}

/** Installments end when all payments are made; subs when the next due date passes endDate. */
export function commitmentEnded(c: Commitment, now: Date = new Date(), transactions: Transaction[] = []): boolean {
  if (c.kind === "inst") return (c.paidCount || 0) >= (c.totalPayments || 1);
  if (!c.endDate) return false;
  // endDate parses as *local* end-of-day so the final billing day still counts.
  return nextDueWithPayments(c, transactions, now) > new Date(c.endDate + "T23:59:59");
}

/** Whole days from today (local midnight) to dt; 0 = due today. */
export const daysUntil = (dt: Date, now: Date = new Date()): number =>
  Math.round((dt.getTime() - midnight(now).getTime()) / 86400000);

export interface DueSoonEntry {
  c: Commitment;
  due: Date;
  days: number;
}

export interface CommitmentsDerived {
  all: Commitment[];
  active: Commitment[];
  /** Active subscriptions normalized to per-month (annual ÷ 12,
   * fortnightly × 26 ÷ 12 — 26 payments a year; a flat ×2 would
   * understate every fortnightly vine by ~8%). */
  subsMonthly: number;
  /** Active installments normalized to per-month (annual ÷ 12), like subsMonthly. */
  instMonthly: number;
  /** Anything billing within 14 days (7 for fortnightly — half its cycle;
   * a fortnightly vine is ALWAYS ≤14 days out and would pin itself to the
   * due-soon strip forever), soonest first. */
  dueSoon: DueSoonEntry[];
}

/** A commitment's cost normalized to per-month: annual ÷ 12, fortnightly
 * × 26 ÷ 12 (26 payments a year — a flat ×2 understates by ~8%). The ONE
 * place cadence→monthly math lives; advice ranks vines with it too. */
export const monthlyCost = (c: Commitment): number => {
  const amt = Number(c.amount) || 0;
  if (c.cadence === "annual") return amt / 12;
  if (c.cadence === "fortnight") return (amt * 26) / 12;
  return amt;
};

export function deriveCommitments(
  allCommitments: Commitment[],
  now: Date = new Date(),
  transactions: Transaction[] = [],
): CommitmentsDerived {
  const active = allCommitments.filter((c) => !commitmentEnded(c, now, transactions));
  const subsMonthly = active
    .filter((c) => c.kind === "sub")
    .reduce((a, c) => a + monthlyCost(c), 0);
  // The commitment form only creates monthly installments, so the non-monthly
  // branches are defensive — they matter for hand-edited or imported data.
  const instMonthly = active
    .filter((c) => c.kind === "inst")
    .reduce((a, c) => a + monthlyCost(c), 0);
  const dueSoon = active
    .map((c) => {
      const due = nextDueWithPayments(c, transactions, now);
      return { c, due, days: daysUntil(due, now) };
    })
    .filter((x) => x.days <= (x.c.cadence === "fortnight" ? 7 : 14))
    .sort((a, b) => a.days - b.days);
  return { all: allCommitments, active, subsMonthly, instMonthly, dueSoon };
}
