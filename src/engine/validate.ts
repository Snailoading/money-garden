/*
 * The gate inspector — checks a (migrated) State for damage that would
 * crash the app or quietly corrupt its money math, BEFORE it's adopted.
 * Pure — no React, no DOM. Depends only on types.ts.
 *
 * Used at both doors data comes in through: loading the saved garden
 * (state.ts loadSaved) and importing a backup (backup.ts parseBackup).
 * Like a pydantic model in strict mode, it only ever REPORTS — it never
 * repairs, coerces, or strips anything (CLAUDE.md: never silently drop
 * unknown fields), so the caller decides what a problem means.
 *
 * The bar is "would break the garden", never "looks unusual" — and above
 * all, anything this app (or the reference app before it) could ever have
 * written must pass, or a working garden would be locked out on load.
 * That's why these all pass:
 * - unknown extra fields, unknown categories, odd plant names, empty notes;
 * - any date STRING, even "" (clearing a date box saves "") — only a
 *   missing/non-string date crashes;
 * - null where a number belongs: typing 1e400 into a number box yields
 *   Infinity, which JSON stores as null, and the engine reads it as 0;
 * - the Orchard's "" sentinel while a number box is cleared.
 * What fails is what the app never writes and can't survive: missing
 * collections, non-object entries, numbers stored as text (JS `+` glues
 * "100" + "50" into "10050"), unknown entry types, a damaged streak.
 */

import type { State } from "./types";

const TX_TYPES = new Set(["expense", "income", "saving"]);
const COMMITMENT_KINDS = new Set(["sub", "inst"]);
/** Invest fields the Orchard edits through numField(): a number, or "" while cleared. */
const INVEST_SCALARS = ["monthly", "ret", "birthYear", "retireAge", "wr", "retireSpend"] as const;

// Small type guards — the TS spelling of Python's isinstance() checks.
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";
/** A stored money value: a finite number, or null (JSON's spelling of a
 * non-finite number the app accepted — see the header). Never text. */
const isMoney = (v: unknown): boolean => isNum(v) || v === null;
/** Money that can't go below zero (amounts, balances, values) — no writer
 * ever stores a negative one; budgets and income can be negative. */
const isNonNegMoney = (v: unknown): boolean => v === null || (isNum(v) && v >= 0);
/** Shows a bad value in a message without dumping a whole object into it. */
const show = (v: unknown): string => {
  const s = JSON.stringify(v);
  return s === undefined ? String(v) : s.length > 24 ? s.slice(0, 21) + "…" : s;
};

/**
 * Every problem found, in plain words ("transaction #3 has no date").
 * An empty array means the state is safe to adopt. Positions are 1-based,
 * the way a person would count entries in the file.
 */
export function findStateProblems(state: State): string[] {
  const problems: string[] = [];
  const add = (msg: string) => { problems.push(msg); };
  // Read through `unknown` on purpose: the declared types describe what the
  // data SHOULD be, and this function's whole job is to doubt that.
  const s = state as unknown as Record<string, unknown>;

  if (!isMoney(s.income)) add(`the monthly income isn't a number (${show(s.income)})`);

  if (!isObj(s.budgets)) {
    add(`the budgets are damaged (${show(s.budgets)})`);
  } else {
    for (const [cat, v] of Object.entries(s.budgets)) {
      if (!isMoney(v)) add(`the "${cat}" budget isn't a number (${show(v)})`);
    }
  }

  if (!Array.isArray(s.transactions)) {
    add('"transactions" isn\'t a list');
  } else {
    s.transactions.forEach((t: unknown, i) => {
      const at = `transaction #${i + 1}`;
      if (!isObj(t)) return add(`${at} is empty or not an entry (${show(t)})`);
      if (!isStr(t.id)) add(`${at} has no id`);
      if (!isStr(t.type) || !TX_TYPES.has(t.type)) add(`${at} has an unknown type (${show(t.type)})`);
      if (!isNonNegMoney(t.amount)) add(`${at} has an amount that isn't a valid number (${show(t.amount)})`);
      if (!isStr(t.date)) add(`${at} has no date (${show(t.date)})`);
      if (!isStr(t.category)) add(`${at} has no category`);
      if (!isStr(t.note)) add(`${at} has no note text (${show(t.note)})`);
      for (const link of ["goalId", "commitmentId", "holdingId"] as const) {
        if (t[link] !== undefined && !isStr(t[link])) add(`${at} has a broken ${link} link`);
      }
    });
  }

  if (!Array.isArray(s.goals)) {
    add('"goals" isn\'t a list');
  } else {
    s.goals.forEach((g: unknown, i) => {
      const at = `goal #${i + 1}`;
      if (!isObj(g)) return add(`${at} is empty or not a goal (${show(g)})`);
      if (!isStr(g.id)) add(`${at} has no id`);
      if (!isStr(g.name)) add(`${at} has no name`);
      if (!isNonNegMoney(g.target)) add(`${at} has a target that isn't a number (${show(g.target)})`);
      if (!isNonNegMoney(g.saved)) add(`${at} has a balance that isn't a number (${show(g.saved)})`);
    });
  }

  if (!isObj(s.invest)) {
    add("the orchard settings are missing");
  } else {
    const inv = s.invest;
    for (const key of INVEST_SCALARS) {
      if (!isMoney(inv[key]) && inv[key] !== "") add(`the orchard's "${key}" setting isn't a number (${show(inv[key])})`);
    }
    if (!Array.isArray(inv.holdings)) {
      add("the orchard's holdings aren't a list");
    } else {
      inv.holdings.forEach((h: unknown, i) => {
        const at = `holding #${i + 1}`;
        if (!isObj(h)) return add(`${at} is empty or not a holding (${show(h)})`);
        if (!isStr(h.id)) add(`${at} has no id`);
        if (!isStr(h.name)) add(`${at} has no name`);
        if (!isNonNegMoney(h.value)) add(`${at} has a value that isn't a number (${show(h.value)})`);
      });
    }
  }

  if (!Array.isArray(s.commitments)) {
    add('"commitments" isn\'t a list');
  } else {
    s.commitments.forEach((c: unknown, i) => {
      const at = `commitment #${i + 1}`;
      if (!isObj(c)) return add(`${at} is empty or not a commitment (${show(c)})`);
      if (!isStr(c.id)) add(`${at} has no id`);
      if (!isStr(c.name)) add(`${at} has no name`);
      if (!isStr(c.kind) || !COMMITMENT_KINDS.has(c.kind)) add(`${at} has an unknown kind (${show(c.kind)})`);
      if (!isNonNegMoney(c.amount)) add(`${at} has an amount that isn't a number (${show(c.amount)})`);
      // Counts and pay days: old saves hold "", null, or nothing here, and
      // all of that is fine. Only a NUMBER that isn't finite is damage. The
      // app never writes one (JSON.stringify turns Infinity into null), so
      // this catches a bad change in memory before it's saved — and, like
      // the amount rule, a HAND-EDITED file holding 1e400 (JSON.parse reads
      // it back as Infinity), which then opens Recovery instead of loading.
      for (const key of ["totalPayments", "paidCount", "payDay", "payMonth"] as const) {
        if (typeof c[key] === "number" && !Number.isFinite(c[key])) {
          add(`${at} has a count or pay day that isn't a finite number (${key})`);
        }
      }
    });
  }

  // Only ever written by bumpStreak, so strictly a finite count.
  if (!isObj(s.streak) || !isNum(s.streak.count) || !(s.streak.lastDate === null || isStr(s.streak.lastDate))) {
    add(`the logging streak is damaged (${show(s.streak)})`);
  }

  return problems;
}

/** "transaction #3 has no date" or "… (and 4 more problems)". */
export function describeProblems(problems: string[]): string {
  if (problems.length <= 1) return problems[0] ?? "";
  const more = problems.length - 1;
  return `${problems[0]} (and ${more} more problem${more === 1 ? "" : "s"})`;
}
