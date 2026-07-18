import { describe, expect, it } from "vitest";
import type { Commitment, State, Transaction } from "./types";
import { emptyState } from "./state";
import { monthKey } from "./format";
import { derive } from "./stats";
import { buildAdvice, type Tip } from "./advice";

// Same fixed clock as stats.test.ts: June 15, 2026, local noon (monthFrac 0.5).
const now = new Date(2026, 5, 15, 12);
const mk = monthKey(now);

let seq = 0;
const tx = (type: Transaction["type"], amount: number, category = "other"): Transaction => ({
  id: `t${seq++}`, type, amount, category, note: "", date: `${mk}-10`,
});
const state = (over: Partial<State> = {}): State => ({ ...emptyState(), ...over });
const tipsFor = (s: State): Tip[] => buildAdvice(s, derive(s, now), now);
const find = (tips: Tip[], fragment: string): Tip | undefined =>
  tips.find((t) => t.title.includes(fragment));

describe("rule 1 — emergency fund", () => {
  it("leads with setting up the rain barrel while its target is unset", () => {
    // A fresh state carries the permanent barrel at target 0 (v0.12.0).
    const tip = find(tipsFor(state()), "Set up your rain barrel");
    expect(tip).toBeDefined();
    expect(tip!.priority).toBe(1);
    expect(tip!.body).toContain("3–6 months");
  });

  it("switches from the setup tip to coverage once the barrel has a target", () => {
    const s = state({
      goals: [{ id: "g", name: "Emergency fund", plant: "sunflower", target: 9000, saved: 0, isEmergency: true }],
    });
    const tips = tipsFor(s);
    expect(find(tips, "Set up your rain barrel")).toBeUndefined();
    expect(find(tips, "Emergency fund covers about 0.0 months")).toBeDefined();
  });

  it("reports partial coverage under 3 months at priority 1", () => {
    const s = state({
      budgets: {},
      goals: [{ id: "g", name: "Rain barrel", plant: "sunflower", target: 6000, saved: 1000, isEmergency: true }],
      transactions: [tx("expense", 600, "groceries")], // monthlyExpenses 1200 → 0.83 months
    });
    const tip = find(tipsFor(s), "Emergency fund covers about 0.8 months");
    expect(tip).toBeDefined();
    expect(tip!.priority).toBe(1);
  });

  it("falls back to the budget for the away-amount when nothing is spent yet (bug fix)", () => {
    // Reference bug: with no expenses logged this month the "away" figure was
    // built only from spend, so it always read $0.00 whatever the balance.
    const s = state({
      goals: [{ id: "g", name: "Rain barrel", plant: "sunflower", target: 6000, saved: 1000, isEmergency: true }],
    });
    const tip = find(tipsFor(s), "Emergency fund covers about 0.3 months");
    expect(tip).toBeDefined();
    // Default budgets total 3020 → 3 months = 9060, minus 1000 saved = 8060.
    expect(tip!.body).toContain("You're $8,060 away from the 3-month mark");
  });

  it("floors the month fraction in the plant-first range (bug fix)", () => {
    // June 1: monthFrac = 1/30, floored to 0.05 → $100 spent projects to
    // $2,000/month, so the 3–6 month range is $6,000–$12,000 (the reference's
    // unfloored formula would have said $9,000–$18,000).
    const earlyJune = new Date(2026, 5, 1, 12);
    const s = state({ budgets: {}, transactions: [tx("expense", 100, "groceries")] });
    const tips = buildAdvice(s, derive(s, earlyJune), earlyJune);
    const tip = find(tips, "Set up your rain barrel");
    expect(tip).toBeDefined();
    expect(tip!.body).toContain("roughly $6,000–$12,000");
  });

  it("celebrates a healthy fund at priority 3", () => {
    // No spend → monthlyExpenses falls back to the default budgets (3020);
    // 10000 saved ≈ 3.3 months ≥ 3.
    const s = state({
      goals: [{ id: "g", name: "Rain barrel", plant: "sunflower", target: 6000, saved: 10000, isEmergency: true }],
    });
    const tip = find(tipsFor(s), "Your emergency fund is healthy");
    expect(tip).toBeDefined();
    expect(tip!.priority).toBe(3);
  });
});

describe("rule 2 — savings rate", () => {
  const withSaving = (saving: number) =>
    state({ transactions: [tx("income", 2000), tx("saving", saving)] });

  it("flags a rate under 10% at priority 1", () => {
    const tip = find(tipsFor(withSaving(100)), "Savings rate is 5% so far this month");
    expect(tip).toBeDefined();
    expect(tip!.priority).toBe(1);
    expect(tip!.body).toContain("pay yourself first");
  });

  it("encourages 10–19% at priority 2", () => {
    const tip = find(tipsFor(withSaving(300)), "Saving 15% — solid, with room to grow");
    expect(tip).toBeDefined();
    expect(tip!.priority).toBe(2);
  });

  it("celebrates ≥20% at priority 3", () => {
    const tip = find(tipsFor(withSaving(500)), "Saving 25% of income — excellent");
    expect(tip).toBeDefined();
    expect(tip!.priority).toBe(3);
  });

  it("asks for income when none is set or logged", () => {
    const tip = find(tipsFor(state()), "Set your monthly income");
    expect(tip).toBeDefined();
    expect(tip!.priority).toBe(2);
  });
});

describe("rule 3 — budget overruns", () => {
  it("raises a priority-1 tip per overrun with want/need-specific guidance", () => {
    const s = state({
      budgets: { groceries: 100, dining: 50 },
      transactions: [tx("expense", 150, "groceries"), tx("expense", 90, "dining")],
    });
    const tips = tipsFor(s);
    const need = find(tips, "Groceries is over budget by $50.00");
    const want = find(tips, "Dining out is over budget by $40.00");
    expect(need!.priority).toBe(1);
    expect(need!.body).toContain("structural savings");
    expect(want!.body).toContain("easiest place to prune");
  });
});

describe("rule 4 — 50/30/20 shape", () => {
  it("warns when needs exceed 50% of income", () => {
    const s = state({ budgets: {}, transactions: [tx("income", 2000), tx("expense", 1100, "housing")] });
    const tip = find(tipsFor(s), "Needs are eating 55% of income");
    expect(tip).toBeDefined();
    expect(tip!.priority).toBe(2);
  });

  it("warns when wants exceed 30% of income", () => {
    const s = state({
      budgets: {},
      transactions: [tx("income", 2000), tx("expense", 500, "housing"), tx("expense", 700, "dining")],
    });
    const tip = find(tipsFor(s), "Wants are at 35% of income");
    expect(tip).toBeDefined();
    expect(tip!.priority).toBe(2);
  });

  it("celebrates a balanced shape at priority 3", () => {
    const s = state({
      budgets: {},
      transactions: [tx("income", 2000), tx("expense", 800, "housing"), tx("expense", 400, "dining")],
    });
    const tip = find(tipsFor(s), "Your 50/30/20 shape looks balanced");
    expect(tip).toBeDefined();
    expect(tip!.priority).toBe(3);
    expect(tip!.body).toContain("Needs ~40%, wants ~20%");
  });
});

describe("rule 5 — subscription audit", () => {
  it("suggests an audit when subs cross 3% of income", () => {
    const s = state({ budgets: {}, transactions: [tx("income", 2000), tx("expense", 100, "subs")] });
    const tip = find(tipsFor(s), "Subscription audit time");
    expect(tip).toBeDefined();
    expect(tip!.priority).toBe(2);
  });

  it("stays quiet at or below 3%", () => {
    const s = state({ budgets: {}, transactions: [tx("income", 2000), tx("expense", 60, "subs")] });
    expect(find(tipsFor(s), "Subscription audit time")).toBeUndefined();
  });
});

describe("rule 6 — goal pacing", () => {
  it("shows the six-month watering pace for unmet non-emergency goals", () => {
    const s = state({
      goals: [
        { id: "a", name: "Trip", plant: "tulip", target: 1000, saved: 400, isEmergency: false },
        { id: "b", name: "Done", plant: "poppy", target: 500, saved: 500, isEmergency: false },
      ],
    });
    const tips = tipsFor(s);
    const tip = find(tips, '"Trip" needs $600.00 more');
    expect(tip).toBeDefined();
    expect(tip!.priority).toBe(3);
    expect(tip!.body).toContain("$100.00/month");
    expect(find(tips, '"Done"')).toBeUndefined(); // completed goals are skipped
  });
});

describe("rule 7 — spending pace", () => {
  it("warns at priority 1 when running >15% ahead of the calendar", () => {
    const s = state({ budgets: { groceries: 1000 }, transactions: [tx("expense", 700, "groceries")] });
    const tip = find(tipsFor(s), "Spending is running ahead of the calendar");
    expect(tip).toBeDefined();
    expect(tip!.priority).toBe(1);
    expect(tip!.body).toContain("70% of the month's budget");
  });

  it("celebrates being under pace after 40% of the month", () => {
    const s = state({ budgets: { groceries: 1000 }, transactions: [tx("expense", 300, "groceries")] });
    const tip = find(tipsFor(s), "You're under pace — nicely done");
    expect(tip).toBeDefined();
    expect(tip!.priority).toBe(3);
  });
});

describe("rule 8 — logging streak", () => {
  it("celebrates a 3+ day streak", () => {
    const s = state({ streak: { count: 5, lastDate: null } });
    const tip = find(tipsFor(s), "5-day logging streak");
    expect(tip).toBeDefined();
    expect(tip!.priority).toBe(3);
  });

  it("stays quiet below 3 days", () => {
    const s = state({ streak: { count: 2, lastDate: null } });
    expect(find(tipsFor(s), "logging streak")).toBeUndefined();
  });
});

describe("rule 9 — the orchard", () => {
  const inv = emptyState().invest;

  it("nudges an empty orchard once the savings habit exists", () => {
    const s = state({ transactions: [tx("income", 2000), tx("saving", 300)] });
    const tip = find(tipsFor(s), "Nothing is planted in the orchard yet");
    expect(tip).toBeDefined();
    expect(tip!.priority).toBe(2);
  });

  it("flags a portfolio with no monthly contribution", () => {
    const s = state({ invest: { ...inv, holdings: [{ id: "h", name: "ETF", value: 10000 }], monthly: 0 } });
    const tip = find(tipsFor(s), "The orchard has no irrigation");
    expect(tip).toBeDefined();
    expect(tip!.priority).toBe(2);
  });

  it("announces FI when the portfolio reaches the freedom number", () => {
    const s = state({
      invest: { ...inv, retireSpend: 100, holdings: [{ id: "h", name: "ETF", value: 30000 }] },
    });
    const tip = find(tipsFor(s), "The tree can feed you now");
    expect(tip).toBeDefined();
    expect(tip!.priority).toBe(3);
  });

  it("gives the freedom window in bumpier markets", () => {
    const s = state({
      invest: { ...inv, retireSpend: 1000, monthly: 500, holdings: [{ id: "h", name: "ETF", value: 10000 }] },
    });
    const tip = find(tipsFor(s), "The freedom tree is 3% grown");
    expect(tip).toBeDefined();
    expect(tip!.body).toContain("call it a window of age");
    expect(tip!.body).toContain("5–9%"); // the ±2% band around 7%
  });

  it("celebrates Coast FIRE when compounding alone will get there", () => {
    const s = state({
      invest: { ...inv, retireSpend: 1000, holdings: [{ id: "h", name: "ETF", value: 30000 }] },
    });
    const tip = find(tipsFor(s), "Coast FIRE reached");
    expect(tip).toBeDefined();
    expect(tip!.priority).toBe(3);
    expect(tip!.body).toContain("by age 65");
  });

  it("quotes the simple-math table at a 30%+ savings rate", () => {
    const s = state({ transactions: [tx("income", 2000), tx("saving", 600)] });
    const tip = find(tipsFor(s), "The shockingly simple math of early retirement");
    expect(tip).toBeDefined();
    expect(tip!.body).toContain("roughly 28 years"); // 30% < 40% branch
  });
});

describe("rule 10 — vines & trellis", () => {
  const sub = (over: Partial<Commitment> = {}): Commitment => ({
    id: `c${seq++}`, kind: "sub", name: "Vine", amount: 10, cadence: "monthly",
    payDay: 3, payMonth: 1, endDate: "", category: "subs", ...over,
  });

  it("warns about annual renewals within 30 days at priority 1", () => {
    const s = state({
      commitments: [sub({ name: "Insurance", amount: 640, cadence: "annual", payMonth: 7, payDay: 1 })],
    });
    const tip = find(tipsFor(s), '"Insurance" renews in 16 days');
    expect(tip).toBeDefined();
    expect(tip!.priority).toBe(1);
    expect(tip!.body).toContain("Jul 1");
  });

  it("flags subscriptions that outgrow the subs budget", () => {
    // Default subs budget is 60; two vines totalling 100/month outgrow it.
    const s = state({ commitments: [sub({ amount: 50 }), sub({ amount: 50 })] });
    const tip = find(tipsFor(s), "Your vines outgrow their plot");
    expect(tip).toBeDefined();
    expect(tip!.priority).toBe(2);
  });

  it("names the thickest vine when subs pass 6% of income", () => {
    const s = state({
      transactions: [tx("income", 2000)],
      commitments: [sub({ name: "Big", amount: 150 }), sub({ name: "Small", amount: 50 })],
    });
    const tip = find(tipsFor(s), "The vines are drinking deeply");
    expect(tip).toBeDefined();
    expect(tip!.body).toContain('"Big" is the thickest vine');
  });

  it("celebrates installments with ≤2 payments left", () => {
    const s = state({
      commitments: [{
        id: "i", kind: "inst", name: "Tax bill", amount: 240, cadence: "monthly",
        payDay: 20, payMonth: 1, totalPayments: 6, paidCount: 4, category: "other",
      }],
    });
    const tip = find(tipsFor(s), '"Tax bill" is almost off the trellis');
    expect(tip).toBeDefined();
    expect(tip!.priority).toBe(3);
    expect(tip!.body).toContain("Only 2 payments");
  });
});

describe("ordering and edge cases", () => {
  it("produces exactly the emergency + income tips for a fresh empty state", () => {
    const tips = tipsFor(state());
    expect(tips.map((t) => [t.priority, t.title])).toEqual([
      [1, "Set up your rain barrel"],
      [2, "Set your monthly income"],
    ]);
  });

  it("sorts tips by priority, keeping source order within a priority", () => {
    const s = state({
      budgets: { groceries: 100 },
      transactions: [tx("income", 2000), tx("expense", 150, "groceries"), tx("saving", 500)],
      streak: { count: 4, lastDate: null },
    });
    const tips = tipsFor(s);
    const priorities = tips.map((t) => t.priority);
    expect([...priorities].sort((a, b) => a - b)).toEqual(priorities);
    expect(priorities[0]).toBe(1);
    expect(priorities[priorities.length - 1]).toBe(3);
  });
});
