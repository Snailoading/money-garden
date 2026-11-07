/*
 * Chart layout at real pixel width. Charts draw at their container's true
 * size (useChartSize), so on a phone the plot is ~200px wide, not 640 — and
 * things sized for 640 (axis labels, tooltips) must adapt instead of
 * shrinking along with everything else.
 */

/** Which x positions get a label: every `step`-th from the first, plus the
 * last — at most about `most` labels, and never closer than `minGap` px
 * (two-digit days/ages at 11px need ~16px of ink, so 40 leaves air). A
 * labelled point that would crowd the last one is dropped. */
export function xLabelIndexes(n: number, plotW: number, most = 6, minGap = 40): number[] {
  if (n < 1) return [];
  if (n === 1) return [0];
  const gap = plotW / (n - 1); // px between neighbouring points
  const step = Math.max(1, Math.ceil(n / most), Math.ceil(minGap / gap));
  const out: number[] = [];
  for (let i = 0; i < n - 1; i += step) out.push(i);
  if (out.length && (n - 1 - out[out.length - 1]) * gap < minGap) out.pop();
  out.push(n - 1);
  return out;
}

/** Month bars: label every `step`-th month counted back from the newest
 * (the current month is always named), so labels sit ≥ `minGap` px apart —
 * "Aug ’26" at 10px is ~36px wide. */
export function monthLabelStep(n: number, plotW: number, minGap = 40): number {
  if (n < 1) return 1;
  return Math.max(1, Math.ceil(minGap / (plotW / n)));
}

/** Tooltip box left edge: right of the anchor, flipped left when it would
 * overflow, then clamped inside [lo, hi − width] — on a narrow phone a box
 * near the middle fits on neither side, and it must stay in the chart. */
export function tipLeft(ax: number, width: number, lo: number, hi: number): number {
  let bx = ax + 10;
  if (bx + width > hi) bx = ax - 10 - width;
  return Math.max(lo, Math.min(bx, hi - width));
}

/** The month labels to draw (null = unlabelled) when only every `step`-th
 * month fits. Every month shown keeps the engine's label when all fit
 * (`step` 1). Thinned, a label carries its year ("Jan ’27") when it's the
 * first one drawn or the year changed since the previous one drawn — a
 * skipped January must not take the only year cue with it. */
export function monthLabels(points: { ym: string; label: string }[], step: number): (string | null)[] {
  if (step <= 1) return points.map((p) => p.label);
  const n = points.length;
  let prevYear: string | null = null;
  return points.map((p, i) => {
    if ((n - 1 - i) % step !== 0) return null;
    const year = p.ym.slice(2, 4);
    const month = p.label.split(" ")[0];
    const text = year !== prevYear ? `${month} ’${year}` : month;
    prevYear = year;
    return text;
  });
}
