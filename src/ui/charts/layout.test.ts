import { describe, expect, it } from "vitest";
import { monthLabelStep, monthLabels, tipLeft, xLabelIndexes } from "./layout";

describe("xLabelIndexes", () => {
  it("matches the old every-6th rule when there's room (31 days, desktop)", () => {
    // The pace chart's plot on a 560px card: 504px for 31 days.
    expect(xLabelIndexes(31, 504)).toEqual([0, 6, 12, 18, 24, 30]);
  });

  it("drops a label that would crowd the last one", () => {
    // Day 8 of the month in a 100px plot: 0, 3, 6 — but 6 sits 14px from 7.
    expect(xLabelIndexes(8, 100)).toEqual([0, 3, 7]);
    // The projection's ages 35…66 at 1280px: "65" no longer touches "66".
    expect(xLabelIndexes(32, 834)).toEqual([0, 6, 12, 18, 24, 31]);
  });

  it("handles one or no points", () => {
    expect(xLabelIndexes(0, 300)).toEqual([]);
    expect(xLabelIndexes(1, 300)).toEqual([0]);
  });

  it("never draws labels closer than 40px, always names the last point, at most 7", () => {
    for (let n = 2; n <= 400; n++) {
      for (let plotW = 60; plotW <= 1000; plotW += 7) {
        const idx = xLabelIndexes(n, plotW);
        const gap = plotW / (n - 1);
        expect(idx[idx.length - 1]).toBe(n - 1);
        expect(idx.length).toBeLessThanOrEqual(7);
        for (let j = 1; j < idx.length; j++) expect((idx[j] - idx[j - 1]) * gap).toBeGreaterThanOrEqual(40 - 1e-9);
      }
    }
  });
});

describe("monthLabelStep", () => {
  it("labels every month on desktop, every 2nd at 390px, every 3rd at 320px", () => {
    expect(monthLabelStep(12, 834)).toBe(1); // 1280px window
    expect(monthLabelStep(12, 244)).toBe(2); // 390px phone
    expect(monthLabelStep(12, 174)).toBe(3); // 320px phone
    expect(monthLabelStep(4, 174)).toBe(1); // a young garden fits anywhere
    expect(monthLabelStep(0, 174)).toBe(1);
  });
});

/** Months as the engine labels them: year on the first and on each January. */
const window12 = (startYear: number, startMonth: number) => {
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return Array.from({ length: 12 }, (_, i) => {
    const m0 = (startMonth - 1 + i) % 12;
    const y = startYear + Math.floor((startMonth - 1 + i) / 12);
    const ym = `${y}-${String(m0 + 1).padStart(2, "0")}`;
    return { ym, label: i === 0 || m0 === 0 ? `${names[m0]} ’${String(y).slice(2)}` : names[m0] };
  });
};

describe("monthLabels", () => {
  it("keeps the engine's labels when every month fits", () => {
    const w = window12(2025, 12);
    expect(monthLabels(w, 1)).toEqual(w.map((p) => p.label));
  });

  it("thins from the newest month back, the first one shown carrying its year", () => {
    // Dec ’25 … Nov ’26 at every 2nd month (the 390px board).
    expect(monthLabels(window12(2025, 12), 2)).toEqual([
      null, "Jan ’26", null, "Mar", null, "May", null, "Jul", null, "Sep", null, "Nov",
    ]);
  });

  it("puts the year on the first month shown after a skipped January", () => {
    // Jun ’25 … May ’26 at every 3rd: Aug ’25, Nov, Feb ’26, May.
    expect(monthLabels(window12(2025, 6), 3)).toEqual([
      null, null, "Aug ’25", null, null, "Nov", null, null, "Feb ’26", null, null, "May",
    ]);
  });
});

describe("tipLeft", () => {
  it("sits right of the anchor when it fits, else flips left", () => {
    expect(tipLeft(100, 150, 2, 400)).toBe(110);
    expect(tipLeft(300, 150, 2, 400)).toBe(140);
  });

  it("stays inside the chart when it fits on neither side (narrow phone)", () => {
    // A 244px chart, anchor near the middle: right overflows, left goes < 2.
    expect(tipLeft(120, 168, 2, 230)).toBe(2);
    for (let ax = 0; ax <= 230; ax++) {
      const bx = tipLeft(ax, 168, 2, 230);
      expect(bx).toBeGreaterThanOrEqual(2);
      expect(bx + 168).toBeLessThanOrEqual(230);
    }
  });
});
