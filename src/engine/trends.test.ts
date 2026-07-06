import { describe, expect, it } from "vitest";
import type { State, Transaction } from "./types";
import { emptyState } from "./state";
import { monthKey } from "./format";
import { monthRange, monthlyTrends } from "./trends";

const now = new Date(2026, 5, 15, 12); // June 15, 2026 — local noon
const currentYm = monthKey(now);

let seq = 0;
const tx = (ym: string, type: Transaction["type"], amount: number, category = "other"): Transaction => ({
  id: `t${seq++}`, type, amount, category, note: "", date: `${ym}-10`,
});
const state = (transactions: Transaction[], over: Partial<State> = {}): State =>
  ({ ...emptyState(), transactions, ...over });

describe("monthRange", () => {
  it("spans from the earliest transaction month through the current month", () => {
    const range = monthRange(state([tx("2026-02", "expense", 10)]), now);
    expect(range).toEqual(["2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]);
  });

  it("is just the current month for an empty garden", () => {
    expect(monthRange(state([]), now)).toEqual([currentYm]);
  });

  it("crosses year boundaries and ignores future-dated transactions", () => {
    const range = monthRange(state([tx("2025-11", "expense", 10), tx("2026-09", "expense", 10)]), now);
    expect(range[0]).toBe("2025-11");
    expect(range[range.length - 1]).toBe("2026-06");
    expect(range).toHaveLength(8); // Nov 25 … Jun 26
  });
});

describe("monthlyTrends", () => {
  it("returns a single partial point for an empty garden", () => {
    const points = monthlyTrends(state([]), now);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ ym: currentYm, partial: true, spent: 0, earned: 0, saved: 0 });
  });

  it("zero-fills gap months so the series stays continuous", () => {
    const points = monthlyTrends(state([tx("2026-02", "expense", 500), tx("2026-04", "expense", 300)]), now);
    expect(points.map((p) => p.ym)).toEqual(["2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]);
    expect(points[1].spent).toBe(0); // March: nothing logged
    expect(points[2].spent).toBe(300);
    expect(points.filter((p) => p.partial).map((p) => p.ym)).toEqual([currentYm]);
  });

  it("caps at the latest maxMonths while navigation stays uncapped", () => {
    const s = state([tx("2025-01", "expense", 10)]);
    expect(monthRange(s, now)).toHaveLength(18); // full range for navigation
    const points = monthlyTrends(s, now); // default 12
    expect(points).toHaveLength(12);
    expect(points[0].ym).toBe("2025-07");
    expect(points[points.length - 1].ym).toBe("2026-06");
    expect(monthlyTrends(s, now, 6)).toHaveLength(6); // widening/narrowing is a parameter
  });

  it("labels the first point and each January with the year", () => {
    const points = monthlyTrends(state([tx("2025-11", "expense", 10)]), now);
    expect(points.map((p) => p.label)).toEqual(["Nov ’25", "Dec", "Jan ’26", "Feb", "Mar", "Apr", "May", "Jun"]);
  });

  it("computes per-month savings rate with the stated-income fallback", () => {
    const s = state(
      [tx("2026-04", "income", 2000), tx("2026-04", "saving", 300), tx("2026-05", "saving", 100)],
      { income: 1000 },
    );
    const points = monthlyTrends(s, now);
    const april = points.find((p) => p.ym === "2026-04")!;
    const may = points.find((p) => p.ym === "2026-05")!;
    expect(april.savingsRate).toBeCloseTo(0.15); // logged income wins
    expect(may.savingsRate).toBeCloseTo(0.1);    // falls back to stated income
  });

  it("carries the needs/wants split per month", () => {
    const s = state([tx("2026-03", "expense", 700, "housing"), tx("2026-03", "expense", 200, "dining")]);
    const march = monthlyTrends(s, now).find((p) => p.ym === "2026-03")!;
    expect(march.needs).toBe(700);
    expect(march.wants).toBe(200);
  });
});
