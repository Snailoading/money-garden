import { describe, expect, it } from "vitest";
import type { State, Transaction } from "./types";
import { emptyState } from "./state";
import { monthKey } from "./format";
import { derive, weatherFor } from "./stats";

// June 15, 2026 at local noon: monthFrac = 15/30 = 0.5 exactly, and the
// UTC-based monthKey stays in June for every real-world timezone offset.
const now = new Date(2026, 5, 15, 12);
const mk = monthKey(now); // "2026-06" (or the same month seen from UTC)

let txSeq = 0;
const tx = (type: Transaction["type"], amount: number, category = "other", day = 10): Transaction => ({
  id: `t${txSeq++}`, type, amount, category, note: "", date: `${mk}-${String(day).padStart(2, "0")}`,
});

const state = (over: Partial<State> = {}): State => ({ ...emptyState(), ...over });

describe("monthly totals", () => {
  it("derives an empty state without crashing", () => {
    const d = derive(state(), now);
    expect(d.spent).toBe(0);
    expect(d.income).toBe(0);
    expect(d.savingsRate).toBe(0);
    expect(d.left).toBe(0);
    expect(d.emergency).toBeUndefined();
    expect(d.emergencyMonths).toBe(0);
  });

  it("only counts transactions from the current month (string-prefix filter)", () => {
    const old: Transaction = { id: "old", type: "expense", amount: 500, category: "fun", note: "", date: "2025-06-10" };
    const d = derive(state({ transactions: [old, tx("expense", 100, "fun")] }), now);
    expect(d.spent).toBe(100);
    expect(d.monthTx).toHaveLength(1);
  });

  it("splits spent / earned / saved by type and computes what's left", () => {
    const d = derive(
      state({ transactions: [tx("income", 2000), tx("expense", 600, "groceries"), tx("saving", 300)] }),
      now,
    );
    expect(d.spent).toBe(600);
    expect(d.earned).toBe(2000);
    expect(d.savedThisMonth).toBe(300);
    expect(d.left).toBe(1100);
    expect(d.savingsRate).toBeCloseTo(0.15);
  });

  it("lets logged income REPLACE stated income, not add to it (reference behavior, flagged)", () => {
    const d = derive(state({ income: 5000, transactions: [tx("income", 1000)] }), now);
    expect(d.income).toBe(1000); // the 5000 is ignored entirely this month
    const noTx = derive(state({ income: 5000 }), now);
    expect(noTx.income).toBe(5000);
  });

  it("computes savingsRate as 0 with zero income even when saving", () => {
    const d = derive(state({ transactions: [tx("saving", 300)] }), now);
    expect(d.savingsRate).toBe(0);
    expect(d.left).toBe(-300);
  });
});

describe("categories, budgets, needs/wants", () => {
  it("buckets expenses per category, tolerating unknown categories", () => {
    const d = derive(
      state({ transactions: [tx("expense", 40, "dining"), tx("expense", 60, "dining"), tx("expense", 5, "mystery")] }),
      now,
    );
    expect(d.byCat.dining).toBe(100);
    expect(d.byCat.mystery).toBe(5); // old data with a removed category still counts
    expect(d.byCat.housing).toBe(0);
  });

  it("flags overruns only for categories with a budget set", () => {
    const s = state({
      budgets: { groceries: 100, fun: 0 },
      transactions: [tx("expense", 150, "groceries"), tx("expense", 999, "fun")],
    });
    const d = derive(s, now);
    expect(d.overruns.map((c) => c.id)).toEqual(["groceries"]); // fun has no budget → not an overrun
    expect(d.totalBudget).toBe(100);
  });

  it("splits needs vs wants by the category tags", () => {
    const d = derive(
      state({ transactions: [tx("expense", 700, "housing"), tx("expense", 80, "health"), tx("expense", 120, "dining")] }),
      now,
    );
    expect(d.needs).toBe(780);
    expect(d.wants).toBe(120);
  });
});

describe("pace and month fraction", () => {
  it("computes monthFrac from the local calendar", () => {
    const d = derive(state(), now);
    expect(d.daysInMonth).toBe(30);
    expect(d.monthFrac).toBe(0.5);
  });

  it("builds the daily cumulative-spend series against the even-pace line", () => {
    const s = state({
      budgets: { groceries: 300 },
      transactions: [tx("expense", 50, "groceries", 5), tx("expense", 25, "groceries", 10)],
    });
    const d = derive(s, now);
    expect(d.daily).toHaveLength(15); // one point per elapsed day
    expect(d.daily[14].spent).toBe(75); // cumulative by mid-month
    expect(d.daily[14].pace).toBe(Math.round((300 / 30) * 15));
    expect(d.daily[0].pace).toBe(10);
  });

  it("projects monthlyExpenses from the elapsed fraction (blows up early-month — reference behavior, flagged)", () => {
    const d = derive(state({ budgets: {}, transactions: [tx("expense", 600, "groceries")] }), now);
    expect(d.monthlyExpenses).toBe(1200); // 600 ÷ 0.5
    // No spend → falls back to totalBudget; no budget either → 1.
    expect(derive(state({ budgets: { groceries: 900 } }), now).monthlyExpenses).toBe(900);
    expect(derive(state({ budgets: {} }), now).monthlyExpenses).toBe(1);
  });

  it("measures emergency coverage in months of projected expenses", () => {
    const s = state({
      budgets: {},
      goals: [{ id: "g", name: "Rain barrel", plant: "sunflower", target: 6000, saved: 3000, isEmergency: true }],
      transactions: [tx("expense", 600, "groceries")],
    });
    const d = derive(s, now);
    expect(d.emergencyMonths).toBeCloseTo(2.5); // 3000 / 1200
  });
});

describe("health score (adherence 55 + savings 30 + streak 15)", () => {
  it("gives full adherence when spending is on pace", () => {
    const s = state({
      budgets: { groceries: 1000 },
      transactions: [tx("income", 2000), tx("expense", 500, "groceries"), tx("saving", 200)],
      streak: { count: 7, lastDate: null },
    });
    // paceRatio = 500/(1000×0.5) = 1 → adherence 1 → 55
    // savingsRate 10% → saveScore 0.5 → 15; streak 7 → 15. Total 85.
    const d = derive(s, now);
    expect(d.health).toBe(85);
    expect(weatherFor(d.health).word).toBe("Sunny");
  });

  it("zeroes adherence at double pace or worse", () => {
    const s = state({
      budgets: { groceries: 1000 },
      transactions: [tx("income", 2000), tx("expense", 1500, "groceries"), tx("saving", 200)],
      streak: { count: 7, lastDate: null },
    });
    // paceRatio 3 → adherence 0; health = 0 + 15 + 15 = 30.
    expect(derive(s, now).health).toBe(30);
  });

  it("caps the savings component at a 20% rate", () => {
    const s = state({ transactions: [tx("income", 1000), tx("saving", 500)] });
    // saveScore capped at 1 → 30; adherence 1 (no spend) → 55. Total 85.
    expect(derive(s, now).health).toBe(85);
  });

  it("grants full adherence when no budgets are set (reference behavior, flagged)", () => {
    const s = state({ budgets: {}, transactions: [tx("expense", 99999, "fun")] });
    // totalBudget 0 pins paceRatio to 1 → adherence 1 → 55 points despite the spend.
    expect(derive(s, now).health).toBe(55);
  });
});

describe("weather thresholds", () => {
  it("maps health bands to Sunny / Fair / Overcast / Stormy", () => {
    expect(weatherFor(80).word).toBe("Sunny");
    expect(weatherFor(79).word).toBe("Fair");
    expect(weatherFor(60).word).toBe("Fair");
    expect(weatherFor(59).word).toBe("Overcast");
    expect(weatherFor(40).word).toBe("Overcast");
    expect(weatherFor(39).word).toBe("Stormy");
    expect(weatherFor(0).word).toBe("Stormy");
  });
});

describe("composition", () => {
  it("nests the fire and commitments derivations", () => {
    const s = state({
      budgets: {},
      transactions: [tx("expense", 600, "groceries")],
      invest: { ...emptyState().invest, retireSpend: 1000 },
      commitments: [{ id: "c", kind: "sub", name: "News", amount: 10, cadence: "monthly", payDay: 20, payMonth: 1, endDate: "", category: "subs" }],
    });
    const d = derive(s, now);
    expect(d.fire.fireNumber).toBe(300000);
    expect(d.commit.active).toHaveLength(1);
    expect(d.commit.subsMonthly).toBe(10);
  });
});
