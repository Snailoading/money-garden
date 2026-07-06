/*
 * Formatting + small shared helpers, ported verbatim from the reference file.
 * Pure — no React, no DOM.
 *
 * Functions that need "now" take it as a parameter with a default of
 * `new Date()` so tests can inject a fixed clock (like passing `now=` into a
 * Python function instead of calling datetime.now() inside it).
 */

/** Compact axis labels: $1.2M / $14k / $980. */
export const fmtK = (v: unknown): string => {
  const n = Number(v) || 0;
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return "$" + Math.round(n / 1e3) + "k";
  return "$" + Math.round(n);
};

/** Currency formatting; whole dollars once |n| ≥ 1000, cents below that. */
export const fmt = (n: number, opts: Intl.NumberFormatOptions = {}): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2,
    ...opts,
  }).format(n);

/** Random-enough id for local, single-user data (not a UUID on purpose — reference behavior). */
export const uid = (): string =>
  Math.random().toString(36).slice(2, 9) + Date.now().toString(36);

/**
 * Today as YYYY-MM-DD. NOTE: uses toISOString(), i.e. the **UTC** date —
 * near midnight in non-UTC timezones this can differ from the local date.
 * Reference behavior, preserved deliberately (see CLAUDE.md: port, don't fix).
 */
export const todayISO = (now: Date = new Date()): string =>
  now.toISOString().slice(0, 10);

/** Current month as YYYY-MM (UTC, same caveat as todayISO). */
export const monthKey = (d: Date = new Date()): string =>
  d.toISOString().slice(0, 7);

export const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** "Sep 15" — local calendar, unlike todayISO/monthKey (reference quirk, preserved). */
export const shortDate = (dt: Date): string =>
  `${MONTH_NAMES[dt.getMonth()]} ${dt.getDate()}`;
