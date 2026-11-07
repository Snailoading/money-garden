/*
 * Gridlines on round numbers. The Seasons charts used to draw lines at ⅓, ⅔
 * and the top of the data and then round each label to whole thousands, so
 * a line at $1,630 read "$2k". Here the LINES move to round values instead
 * (1, 2, 2.5 or 5 × a power of ten — what spreadsheet charts do), and each
 * label states exactly where its line sits.
 */

/** A round gridline step close to `rough`: 1, 2, 2.5 or 5 × a power of ten,
 * never below `minStep` (dollar axes use 1 — no "$0.50" gridlines). */
export function niceStep(rough: number, minStep = 1): number {
  // `!(a > b)` rather than `a <= b`: any comparison with NaN is false (as in
  // Python), so this also sends NaN and 0 to the minimum step.
  if (!(rough > minStep)) return minStep;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const f = rough / pow; // 1 ≤ f < 10
  const nice = f < 1.5 ? 1 : f < 2.25 ? 2 : f < 3.5 ? 2.5 : f < 7.5 ? 5 : 10;
  return Math.max(minStep, nice * pow);
}

/** Multiples of `step` from `step` up to `limit` (inclusive). Counted by
 * index, not by repeated adding, so float error can't creep in. */
export function stepsUpTo(step: number, limit: number): number[] {
  const out: number[] = [];
  for (let i = 1; i * step <= limit + step * 1e-9; i++) out.push(i * step);
  return out;
}

/** A 0-based axis that reaches at least `max`, split into about `count`
 * round steps: the axis top plus its gridline values (zero excluded). */
export function niceAxis(max: number, count = 3, minStep = 1): { top: number; ticks: number[] } {
  const step = niceStep(max / count, minStep);
  // The − 1e-9 keeps a max that is exactly a whole step on that line (float
  // division can land a hair above it and add a needless extra step).
  const top = Math.max(1, Math.ceil(max / step - 1e-9)) * step;
  return { top, ticks: stepsUpTo(step, top) };
}

/** Gridline money label: dollars under $1k, then $k / $M, with at most two
 * decimals and no trailing zeros. Two are enough for any niceAxis value
 * (count 3 for Seasons/pace, 4 for the projection): every gridline is a
 * whole multiple of 1, 2, 2.5 or 5 × a power of ten, so at worst it ends in
 * .25 or .75 of a unit ($1.25k, $12.5). ticks.test sweeps both counts. */
export function tickMoney(v: number): string {
  if (v < 0) return "−" + tickMoney(-v); // a real minus sign, not a hyphen
  const short = (x: number) => String(Math.round(x * 100) / 100);
  if (v >= 1e6) return "$" + short(v / 1e6) + "M";
  if (v >= 1e3) return "$" + short(v / 1e3) + "k";
  return "$" + short(v);
}
