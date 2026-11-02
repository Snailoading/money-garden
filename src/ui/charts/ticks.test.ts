import { describe, expect, it } from "vitest";
import { niceAxis, niceStep, stepsUpTo, tickMoney } from "./ticks";

describe("niceStep", () => {
  it("picks the nearest of 1, 2, 2.5, 5 × a power of ten", () => {
    expect(niceStep(1033)).toBe(1000);
    expect(niceStep(1700)).toBe(2000);
    expect(niceStep(2600)).toBe(2500);
    expect(niceStep(4000)).toBe(5000);
    expect(niceStep(8000)).toBe(10000);
    expect(niceStep(160)).toBe(200);
  });

  it("never goes below the minimum step (no $0.50 gridlines)", () => {
    expect(niceStep(0.36)).toBe(1);
    expect(niceStep(0)).toBe(1);
    expect(niceStep(NaN)).toBe(1);
    expect(niceStep(4, 10)).toBe(10);
  });
});

describe("niceAxis", () => {
  it("puts every gridline on a round value and reaches the data", () => {
    // The audit's case: a $4,900 max used to draw lines at $1.6k/$3.3k/$4.9k
    // labelled "$2k/$3k/$5k".
    const a = niceAxis(4900);
    expect(a).toEqual({ top: 6000, ticks: [2000, 4000, 6000] });
    expect(niceAxis(3000).ticks).toEqual([1000, 2000, 3000]);
    expect(niceAxis(7000).ticks).toEqual([2500, 5000, 7500]);
  });

  it("keeps the savings-rate axis at 10/20/30% for its 30% floor", () => {
    expect(niceAxis(30, 3, 10)).toEqual({ top: 30, ticks: [10, 20, 30] });
  });

  it("handles a tiny or empty axis without a zero-height top", () => {
    expect(niceAxis(1.08)).toEqual({ top: 2, ticks: [1, 2] });
    expect(niceAxis(0)).toEqual({ top: 1, ticks: [1] });
  });
});

describe("stepsUpTo", () => {
  it("counts by index, so float steps land exactly", () => {
    expect(stepsUpTo(2500, 7500)).toEqual([2500, 5000, 7500]);
    expect(stepsUpTo(1000, 999)).toEqual([]);
  });
});

describe("tickMoney", () => {
  it("states each round gridline value exactly", () => {
    expect(tickMoney(500)).toBe("$500");
    expect(tickMoney(1000)).toBe("$1k");
    expect(tickMoney(2500)).toBe("$2.5k");
    expect(tickMoney(7500)).toBe("$7.5k");
    expect(tickMoney(250000)).toBe("$250k");
    expect(tickMoney(2.5e6)).toBe("$2.5M");
  });

  it("keeps a 2.5-step's odd lines exact ($1.25k, $12.5 — not $1.3k, $13)", () => {
    // A ~$950 month: ×1.08 headroom → step 250, five lines up to $1,250.
    expect(niceAxis(950 * 1.08).ticks.map(tickMoney)).toEqual(["$250", "$500", "$750", "$1k", "$1.25k"]);
    expect(tickMoney(2.5)).toBe("$2.5");
    expect(tickMoney(12.5)).toBe("$12.5");
    expect(tickMoney(1.25e6)).toBe("$1.25M");
  });

  it("uses a real minus sign below zero", () => {
    expect(tickMoney(-1000)).toBe("−$1k");
  });

  it("never misstates a gridline: every label reads back as its exact value", () => {
    // "$1.25k" → 1250 — the inverse of tickMoney, for the sweep below.
    const readBack = (s: string) => {
      const m = s.match(/^(−?)\$([\d.]+)([kM]?)$/)!;
      return (m[1] ? -1 : 1) * Number(m[2]) * (m[3] === "k" ? 1e3 : m[3] === "M" ? 1e6 : 1);
    };
    // Maxima from $0.50 to ~$50M on a geometric sweep (×1.003 per step).
    for (let max = 0.5; max < 5e7; max *= 1.003) {
      const { ticks } = niceAxis(max);
      const labels = ticks.map(tickMoney);
      for (const [i, t] of ticks.entries()) expect(readBack(labels[i])).toBeCloseTo(t, 6);
      expect(new Set(labels).size).toBe(labels.length); // no duplicate labels
    }
  });
});
