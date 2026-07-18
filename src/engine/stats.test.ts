import { describe, expect, it } from "vitest";
import type { State, Transaction } from "./types";
import { emptyState } from "./state";
import { monthKey } from "./format";
import { derive, deriveMonthView, weatherFor } from "./stats";

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
    // The barrel always exists (v0.12.0) — unfunded and un-set-up here.
    expect(d.emergency).toMatchObject({ isEmergency: true, target: 0, saved: 0 });
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

  it("budget basis, same-month: a draw never re-charges Left (the laptop case)", () => {
    const goal = { id: "g1", name: "New laptop", plant: "bluebell", target: 2000, saved: 0, isEmergency: false };
    const draw: Transaction = { ...tx("expense", 2000, "shopping", 12), goalId: "g1" };
    const d = derive(
      state({ goals: [goal], transactions: [tx("income", 4100, "other", 1), tx("saving", 2000, "other", 5), draw] }),
      now,
    );
    expect(d.spent).toBe(0);           // the laptop is goal-funded, not budget spending
    expect(d.drawn).toBe(2000);        // …but it's fully visible as the harvest
    expect(d.savedThisMonth).toBe(2000);
    expect(d.left).toBe(2100);         // 4100 − 0 − 2000: charged once, when saved
  });

  it("budget basis, cross-month: money saved in prior months buys without touching this month's Left", () => {
    const prior = (k: number, day: number) => {
      const m = new Date(now.getFullYear(), now.getMonth() - k, 1);
      return `${monthKey(m)}-${String(day).padStart(2, "0")}`;
    };
    const goal = { id: "g1", name: "New laptop", plant: "bluebell", target: 2000, saved: 0, isEmergency: false };
    const transactions: Transaction[] = [
      { id: "s1", type: "saving", amount: 1000, category: "other", note: "", date: prior(2, 10), goalId: "g1" },
      { id: "s2", type: "saving", amount: 1000, category: "other", note: "", date: prior(1, 10), goalId: "g1" },
      { ...tx("income", 4100, "other", 1) },
      { ...tx("expense", 2000, "shopping", 1), goalId: "g1" },
    ];
    const d = derive(state({ income: 4100, goals: [goal], transactions }), now);
    expect(d.left).toBe(4100);         // May pays nothing for a March+April laptop
    expect(d.spent).toBe(0);
    expect(d.drawn).toBe(2000);
    // The prior months carried the deduction, each in its own Left.
    const mar = deriveMonthView(state({ income: 4100, transactions }), prior(2, 10).slice(0, 7));
    expect(mar.left).toBe(3100);       // 4100 − 0 − 1000
  });

  it("draws stay out of byCat/needs/wants; plain expenses still count", () => {
    const draw: Transaction = { ...tx("expense", 800, "groceries", 8), goalId: "g1" };
    const d = derive(state({ transactions: [draw, tx("expense", 100, "groceries", 9)] }), now);
    expect(d.byCat.groceries).toBe(100);
    expect(d.needs).toBe(100);
    expect(d.drawn).toBe(800);
  });

  it("the daily pace line ignores draws; the 🌸 annotation lands on the right day", () => {
    const goal = { id: "g1", name: "Rain barrel", plant: "sunflower", target: 5000, saved: 3000, isEmergency: true };
    const draw: Transaction = { ...tx("expense", 500, "housing", 8), goalId: "g1" };
    const d = derive(state({ goals: [goal], transactions: [tx("expense", 100, "fun", 3), draw] }), now);
    const day8 = d.daily.find((p) => p.day === 8)!;
    expect(day8.spent).toBe(100);            // cumulative line: budget basis only
    expect(day8.drawn).toBe(500);
    expect(day8.drawNames).toEqual(["Rain barrel"]);
    expect(d.daily.find((p) => p.day === 3)!.drawn).toBeUndefined();
  });

  it("a dangling goalId still annotates the amount, with no name and no crash", () => {
    const draw: Transaction = { ...tx("expense", 500, "housing", 8), goalId: "gone" };
    const d = derive(state({ transactions: [draw] }), now);
    expect(d.daily.find((p) => p.day === 8)!.drawn).toBe(500);
    expect(d.daily.find((p) => p.day === 8)!.drawNames).toEqual([]);
  });

  it("typical monthly spending (FIRE/emergency sizing) excludes prior-month draws", () => {
    const prior = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const transactions: Transaction[] = [
      { id: "p1", type: "expense", amount: 900, category: "groceries", note: "", date: `${prior}-10` },
      { id: "p2", type: "expense", amount: 2000, category: "shopping", note: "", date: `${prior}-12`, goalId: "g1" },
    ];
    const d = derive(state({ transactions }), now);
    expect(d.monthlyExpenses).toBe(900);     // the harvest didn't inflate the average
  });

  it("the weather is draw-blind: identical health with and without a big draw", () => {
    const base = state({
      budgets: { groceries: 400 },
      transactions: [tx("income", 4000, "other", 1), tx("expense", 150, "groceries", 5), tx("saving", 400, "other", 6)],
      streak: { count: 3, lastDate: `${mk}-15` },
    });
    const withDraw = { ...base, transactions: [...base.transactions, { ...tx("expense", 2000, "shopping", 10), goalId: "g1" }] };
    expect(derive(withDraw, now).health).toBe(derive(base, now).health);
    expect(derive(withDraw, now).savingsRate).toBe(derive(base, now).savingsRate);
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

  it("estimates monthlyExpenses from the trailing average of completed months", () => {
    const s = state({
      budgets: {},
      transactions: [
        { id: "a1", type: "expense", amount: 2900, category: "housing", note: "", date: "2026-04-10" },
        { id: "a2", type: "expense", amount: 100, category: "fun", note: "", date: "2026-04-20" },
        { id: "m1", type: "expense", amount: 3100, category: "housing", note: "", date: "2026-05-10" },
        tx("expense", 50, "fun"), // current month — must NOT affect the average
      ],
    });
    // (3000 + 3100) / 2; March has nothing logged so it doesn't drag the mean.
    expect(derive(s, now).monthlyExpenses).toBe(3050);
  });

  it("ignores history older than 3 completed months", () => {
    const s = state({
      budgets: {},
      transactions: [
        { id: "old", type: "expense", amount: 9000, category: "housing", note: "", date: "2026-01-10" },
        { id: "m1", type: "expense", amount: 3000, category: "housing", note: "", date: "2026-05-10" },
      ],
    });
    expect(derive(s, now).monthlyExpenses).toBe(3000); // January (4 months back) excluded
  });

  it("blends actuals with the remaining budget when there is no history", () => {
    const s = state({
      budgets: { groceries: 3020 },
      transactions: [tx("expense", 1400, "groceries")],
    });
    // 1400 + (1 − 0.5) × 3020 — anchored to plan early, converging to actuals.
    expect(derive(s, now).monthlyExpenses).toBeCloseTo(2910);
  });

  it("falls back to a floored projection, then the budget, then 1", () => {
    // Spend but no budget → projection with the 0.05 monthFrac floor.
    const d = derive(state({ budgets: {}, transactions: [tx("expense", 600, "groceries")] }), now);
    expect(d.monthlyExpenses).toBe(1200); // 600 ÷ 0.5
    // No spend → the budget; no budget either → 1.
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

  it("softens the adherence penalty early in the month (confidence ramp)", () => {
    // Rent on the 1st: paceRatio ≈ 13.9 → raw adherence 0, but only 1/30 of
    // the month has passed, so the penalty is weighted by 0.0667 → 0.933.
    const earlyJune = new Date(2026, 5, 1, 12);
    const s = state({
      budgets: { housing: 3020 },
      transactions: [{ id: "r", type: "expense", amount: 1400, category: "housing", note: "", date: "2026-06-01" }],
    });
    expect(derive(s, earlyJune).health).toBe(51); // round(0.933 × 55)
    // Same overspend at mid-month carries full weight → adherence 0.
    const midJune = state({
      budgets: { housing: 1000 },
      transactions: [tx("expense", 1500, "housing")],
    });
    expect(derive(midJune, now).health).toBe(0); // paceRatio 3 → raw 0, weight 1
  });

  it("grants full adherence when no budgets are set (deliberate design choice)", () => {
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

describe("deriveMonthView", () => {
  it("renders a past month complete: full daily series and final totals", () => {
    const s = state({
      budgets: { groceries: 300 },
      transactions: [
        { id: "a", type: "income", amount: 2000, category: "other", note: "", date: "2026-04-01" },
        { id: "b", type: "expense", amount: 350, category: "groceries", note: "", date: "2026-04-10" },
        { id: "c", type: "saving", amount: 200, category: "other", note: "", date: "2026-04-20" },
      ],
    });
    const v = deriveMonthView(s, "2026-04");
    expect(v.daysInMonth).toBe(30);
    expect(v.daily).toHaveLength(30); // complete month, not clipped to "today"
    expect(v.daily[29].spent).toBe(350);
    expect(v.spent).toBe(350);
    expect(v.left).toBe(1450); // 2000 − 350 − 200
    expect(v.savingsRate).toBeCloseTo(0.1);
    expect(v.overruns.map((c) => c.id)).toEqual(["groceries"]); // 350 > 300
  });

  it("uses the stated income as fallback for months without a logged paycheck", () => {
    const s = state({ income: 1500, transactions: [{ id: "a", type: "expense", amount: 100, category: "fun", note: "", date: "2026-03-10" }] });
    const v = deriveMonthView(s, "2026-03");
    expect(v.income).toBe(1500);
    expect(v.left).toBe(1400);
  });

  it("matches derive()'s numbers for the current month", () => {
    const s = state({
      budgets: { groceries: 1000 },
      transactions: [tx("income", 2000), tx("expense", 600, "groceries"), tx("saving", 300)],
    });
    const d = derive(s, now);
    const v = deriveMonthView(s, mk);
    expect([v.spent, v.earned, v.income, v.savedThisMonth, v.left, v.savingsRate, v.needs, v.wants, v.totalBudget])
      .toEqual([d.spent, d.earned, d.income, d.savedThisMonth, d.left, d.savingsRate, d.needs, d.wants, d.totalBudget]);
    expect(v.byCat).toEqual(d.byCat);
    // Only difference by design: the view's daily series covers the full month.
    expect(v.daily).toHaveLength(v.daysInMonth);
    expect(d.daily).toHaveLength(15);
    expect(v.daily.slice(0, 15)).toEqual(d.daily);
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
