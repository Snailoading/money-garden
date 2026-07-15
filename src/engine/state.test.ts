import { describe, expect, it } from "vitest";
import type { State, Transaction } from "./types";
import { CATEGORIES, DEFAULT_INVEST } from "./types";
import { bumpStreak, deserialize, emptyState, insertGoal, migrate, removeTransaction, sampleState, serialize, updateCommitment, updateGoal, updateTransaction } from "./state";
import { derive } from "./stats";
import { todayISO } from "./format";

describe("emptyState", () => {
  it("seeds default budgets for every category and nothing else", () => {
    const s = emptyState();
    expect(Object.keys(s.budgets)).toHaveLength(CATEGORIES.length);
    expect(s.budgets.housing).toBe(1400);
    expect(s.transactions).toEqual([]);
    expect(s.invest).toEqual(DEFAULT_INVEST);
    expect(s.invest).not.toBe(DEFAULT_INVEST); // must be a copy, not the shared object
    expect(s.streak).toEqual({ count: 0, lastDate: null });
  });
});

describe("sampleState", () => {
  it("clamps sample transaction dates to today within the current month", () => {
    const now = new Date(2026, 5, 4, 12); // June 4 — most sample days are later
    const s = sampleState(now);
    const maxDate = "2026-06-04"; // local calendar
    for (const t of s.transactions) {
      expect(t.date <= maxDate).toBe(true); // ISO strings compare chronologically
    }
    expect(s.streak.lastDate).toBe(todayISO(now));
  });

  it("generates unique ids", () => {
    const s = sampleState(new Date(2026, 5, 15, 12));
    const ids = [...s.transactions, ...s.goals, ...s.commitments, ...s.invest.holdings].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("migrate", () => {
  it("fills missing invest keys from defaults without clobbering saved ones", () => {
    const migrated = migrate({ income: 100, invest: { monthly: 250 } });
    expect(migrated.invest.monthly).toBe(250);
    expect(migrated.invest.ret).toBe(7);
    expect(migrated.invest.retireSpend).toBe(0);
  });

  it("defaults commitments to [] for pre-commitments saves", () => {
    expect(migrate({ income: 100 }).commitments).toEqual([]);
  });

  it("never drops unknown fields (forward compatibility)", () => {
    const migrated = migrate({ income: 1, futureFeature: { a: 1 }, invest: { monthly: 5, futureKnob: true } });
    expect((migrated as unknown as Record<string, unknown>).futureFeature).toEqual({ a: 1 });
    expect((migrated.invest as unknown as Record<string, unknown>).futureKnob).toBe(true);
  });
});

describe("serialize / deserialize", () => {
  it("round-trips a full state including unknown fields", () => {
    const s = { ...sampleState(new Date(2026, 5, 15, 12)), extra: "keep me" };
    const back = deserialize(serialize(s as unknown as Parameters<typeof serialize>[0]));
    expect(back).toEqual(s);
  });

  it("throws on invalid JSON so callers can fall back to a fresh state", () => {
    expect(() => deserialize("not json")).toThrow();
  });
});

describe("updateTransaction / removeTransaction", () => {
  const goal = { id: "g1", name: "Japan trip", plant: "tulip", target: 1000, saved: 400, isEmergency: false };
  const linked: Transaction = { id: "t1", type: "saving", amount: 400, category: "other", note: "→ Japan trip", date: "2026-07-01", goalId: "g1" };
  const plain: Transaction = { id: "t2", type: "expense", amount: 50, category: "dining", note: "Lunch", date: "2026-07-02" };
  const base = (): State => ({ ...emptyState(), goals: [{ ...goal }], transactions: [{ ...linked }, { ...plain }], streak: { count: 3, lastDate: "2026-07-01" } });

  it("merges a patch into the matching entry, keeping the id and others untouched", () => {
    const s = updateTransaction(base(), "t2", { amount: 65, note: "Team lunch", category: "fun" });
    const t = s.transactions.find((x) => x.id === "t2")!;
    expect(t).toMatchObject({ id: "t2", amount: 65, note: "Team lunch", category: "fun", type: "expense" });
    expect(s.transactions.find((x) => x.id === "t1")).toEqual(linked);
  });

  it("is a no-op for an unknown id and never touches the streak", () => {
    const before = base();
    expect(updateTransaction(before, "nope", { amount: 1 })).toBe(before);
    expect(updateTransaction(before, "t2", { amount: 60 }).streak).toEqual(before.streak);
    expect(removeTransaction(before, "nope")).toBe(before);
  });

  it("waters the linked goal when a linked amount is edited up", () => {
    const s = updateTransaction(base(), "t1", { amount: 500 });
    expect(s.goals[0].saved).toBe(500); // 400 + (500 − 400)
  });

  it("drains the linked goal when edited down, clamped at 0", () => {
    expect(updateTransaction(base(), "t1", { amount: 300 }).goals[0].saved).toBe(300);
    expect(updateTransaction(base(), "t1", { amount: 0 }).goals[0].saved).toBe(0);
    const overdrain = updateTransaction({ ...base(), goals: [{ ...goal, saved: 100 }] }, "t1", { amount: 0 });
    expect(overdrain.goals[0].saved).toBe(0); // 100 − 400 floors at 0
  });

  it("lets a linked edit overflow the goal's target (overflow is truthful)", () => {
    const s = updateTransaction(base(), "t1", { amount: 2000 });
    expect(s.goals[0].saved).toBe(2000); // 400 + 1600 — no cap since v0.7.0
  });

  it("removing a linked entry drains the goal by its amount", () => {
    const s = removeTransaction(base(), "t1");
    expect(s.transactions.map((t) => t.id)).toEqual(["t2"]);
    expect(s.goals[0].saved).toBe(0); // 400 − 400
  });

  it("non-amount edits on a linked entry never touch the goal", () => {
    const s = updateTransaction(base(), "t1", { note: "→ Japan!", date: "2026-06-15" });
    expect(s.goals[0].saved).toBe(400);
  });

  it("legacy entries (no goalId) and dangling goalIds are goal no-ops", () => {
    const legacy = updateTransaction(base(), "t2", { amount: 999 });
    expect(legacy.goals[0].saved).toBe(400);
    const dangling: State = { ...base(), goals: [] };
    expect(updateTransaction(dangling, "t1", { amount: 500 }).goals).toEqual([]);
    expect(removeTransaction(dangling, "t1").goals).toEqual([]);
  });
});

describe("goal draws (linked expense entries)", () => {
  const goal = { id: "g1", name: "Rain barrel", plant: "sunflower", target: 6000, saved: 2000, isEmergency: true };
  const draw: Transaction = { id: "d1", type: "expense", amount: 500, category: "housing", note: "Rent from the barrel", date: "2026-07-08", goalId: "g1" };
  const base = (): State => ({ ...emptyState(), goals: [{ ...goal }], transactions: [{ ...draw }] });

  it("deleting a draw re-waters the goal (mirror of watering deletion)", () => {
    const s = removeTransaction(base(), "d1");
    expect(s.goals[0].saved).toBe(2500); // 2000 + 500 back
  });

  it("editing a draw's amount moves the goal the opposite way to watering", () => {
    expect(updateTransaction(base(), "d1", { amount: 800 }).goals[0].saved).toBe(1700); // drew 300 more
    expect(updateTransaction(base(), "d1", { amount: 200 }).goals[0].saved).toBe(2300); // drew 300 less
  });

  it("floors at zero as a defensive backstop (the UI caps draws first)", () => {
    expect(updateTransaction(base(), "d1", { amount: 5000 }).goals[0].saved).toBe(0);
  });
});

describe("orchard waterings (holding-linked entries)", () => {
  const holdings = [
    { id: "h1", name: "Global index fund ETF", value: 10000 },
    { id: "h2", name: "Retirement account", value: 5000 },
  ];
  const watering: Transaction = { id: "w1", type: "saving", amount: 500, category: "other", note: "→ Orchard: Global index fund ETF", date: "2026-07-10", holdingId: "h1" };
  const base = (): State => ({
    ...emptyState(),
    invest: { ...emptyState().invest, holdings: holdings.map((h) => ({ ...h })) },
    transactions: [{ ...watering }],
  });

  it("deleting a watering drains its holding by the amount; others untouched", () => {
    const s = removeTransaction(base(), "w1");
    expect(s.transactions).toEqual([]);
    expect(s.invest.holdings.find((h) => h.id === "h1")!.value).toBe(9500); // 10000 − 500
    expect(s.invest.holdings.find((h) => h.id === "h2")!.value).toBe(5000);
  });

  it("editing the amount moves the holding by the delta, both directions", () => {
    expect(updateTransaction(base(), "w1", { amount: 800 }).invest.holdings[0].value).toBe(10300); // +300
    expect(updateTransaction(base(), "w1", { amount: 200 }).invest.holdings[0].value).toBe(9700); // −300
  });

  it("floors at 0 after a downward manual revaluation (revaluations win)", () => {
    const revalued: State = { ...base(), invest: { ...base().invest, holdings: [{ ...holdings[0], value: 300 }, { ...holdings[1] }] } };
    expect(removeTransaction(revalued, "w1").invest.holdings[0].value).toBe(0); // 300 − 500 floors
  });

  it("non-amount edits never touch the holding", () => {
    const s = updateTransaction(base(), "w1", { note: "→ the big tree", date: "2026-07-11" });
    expect(s.invest.holdings[0].value).toBe(10000);
  });

  it("dangling holdingIds (tree felled) and legacy unlinked entries are no-ops", () => {
    const felled: State = { ...base(), invest: { ...base().invest, holdings: [] } };
    expect(removeTransaction(felled, "w1").invest.holdings).toEqual([]);
    expect(updateTransaction(felled, "w1", { amount: 900 }).invest.holdings).toEqual([]);
    const legacy: State = { ...base(), transactions: [{ ...watering, holdingId: undefined }] };
    expect(removeTransaction(legacy, "w1").invest.holdings[0].value).toBe(10000);
  });

  it("the Freedom Tree follows: derive() after a reversal sees the reduced portfolio", () => {
    const now = new Date(2026, 6, 15, 12);
    const before = derive(base(), now);
    const after = derive(removeTransaction(base(), "w1"), now);
    // deriveFire sums invest.holdings — progress and Coast both track the drain.
    expect(before.fire.portfolio).toBe(15000);
    expect(after.fire.portfolio).toBe(14500);
    expect(after.fire.progress).toBeLessThan(before.fire.progress);
  });
});

describe("updateGoal / insertGoal", () => {
  const g = (id: string, isEmergency = false) => ({ id, name: `Goal ${id}`, plant: "tulip", target: 1000, saved: 100, isEmergency });
  const base = (): State => ({ ...emptyState(), goals: [g("a", true), g("b"), g("c")] });

  it("merges a patch, keeping id and balance", () => {
    const s = updateGoal(base(), "b", { name: "Renamed", target: 2500, plant: "poppy" });
    expect(s.goals[1]).toMatchObject({ id: "b", name: "Renamed", target: 2500, plant: "poppy", saved: 100 });
  });

  it("moves the lifebuoy: flagging one goal unflags the others", () => {
    const s = updateGoal(base(), "b", { isEmergency: true });
    expect(s.goals.map((x) => x.isEmergency)).toEqual([false, true, false]);
  });

  it("unflagging does not touch other goals", () => {
    const s = updateGoal(base(), "a", { isEmergency: false });
    expect(s.goals.map((x) => x.isEmergency)).toEqual([false, false, false]);
  });

  it("is a no-op for unknown ids", () => {
    const before = base();
    expect(updateGoal(before, "nope", { name: "x" })).toBe(before);
  });

  it("insertGoal honors exclusivity for a flagged newcomer, not otherwise", () => {
    const flagged = insertGoal(base(), { ...g("d", true) });
    expect(flagged.goals.map((x) => x.isEmergency)).toEqual([false, false, false, true]);
    const plain = insertGoal(base(), { ...g("e") });
    expect(plain.goals.map((x) => x.isEmergency)).toEqual([true, false, false, false]);
  });
});

describe("commitment-linked payments", () => {
  const inst = { id: "c1", kind: "inst" as const, name: "Tax bill", amount: 240, cadence: "monthly" as const, payDay: 20, payMonth: 1, totalPayments: 6, paidCount: 3, category: "other" };
  const payment: Transaction = { id: "p1", type: "expense", amount: 240, category: "other", note: "Installment: Tax bill", date: "2026-07-20", commitmentId: "c1" };
  const base = (): State => ({ ...emptyState(), commitments: [{ ...inst }], transactions: [{ ...payment }] });

  it("deleting a linked installment payment un-counts it", () => {
    const s = removeTransaction(base(), "p1");
    expect(s.commitments[0].paidCount).toBe(2);
  });

  it("floors paidCount at 0 and ignores legacy/unlinked deletions", () => {
    const zero: State = { ...base(), commitments: [{ ...inst, paidCount: 0 }] };
    expect(removeTransaction(zero, "p1").commitments[0].paidCount).toBe(0);
    const legacy: State = { ...base(), transactions: [{ ...payment, commitmentId: undefined }] };
    expect(removeTransaction(legacy, "p1").commitments[0].paidCount).toBe(3);
  });

  it("does not touch subscriptions on deletion (nothing stored to revert)", () => {
    const sub = { ...inst, id: "c2", kind: "sub" as const, totalPayments: undefined, paidCount: undefined, endDate: "" };
    const s: State = { ...emptyState(), commitments: [sub], transactions: [{ ...payment, commitmentId: "c2" }] };
    expect(removeTransaction(s, "p1").commitments[0]).toEqual(sub);
  });
});

describe("updateCommitment", () => {
  const sub = { id: "c1", kind: "sub" as const, name: "Gym", amount: 35, cadence: "monthly" as const, payDay: 1, payMonth: 1, endDate: "", category: "subs" };
  const base = (): State => ({ ...emptyState(), commitments: [{ ...sub }] });

  it("merges a patch, keeping the id", () => {
    const s = updateCommitment(base(), "c1", { amount: 42, payDay: 15, name: "Gym (new plan)" });
    expect(s.commitments[0]).toMatchObject({ id: "c1", amount: 42, payDay: 15, name: "Gym (new plan)", kind: "sub" });
  });

  it("is a no-op for unknown ids and leaves other commitments alone", () => {
    const before = base();
    expect(updateCommitment(before, "nope", { amount: 1 })).toBe(before);
    const two: State = { ...before, commitments: [{ ...sub }, { ...sub, id: "c2" }] };
    expect(updateCommitment(two, "c1", { amount: 42 }).commitments[1].amount).toBe(35);
  });
});

describe("bumpStreak", () => {
  const now = new Date(2026, 5, 15, 12);
  const today = todayISO(now); // "2026-06-15", local calendar
  const yesterday = "2026-06-14";

  it("is a no-op when already logged today", () => {
    const streak = { count: 4, lastDate: today };
    expect(bumpStreak(streak, now)).toBe(streak);
  });

  it("increments a consecutive-day streak", () => {
    expect(bumpStreak({ count: 4, lastDate: yesterday }, now)).toEqual({ count: 5, lastDate: today });
  });

  it("resets to 1 after a gap or on the first ever log", () => {
    expect(bumpStreak({ count: 9, lastDate: "2026-06-01" }, now)).toEqual({ count: 1, lastDate: today });
    expect(bumpStreak({ count: 0, lastDate: null }, now)).toEqual({ count: 1, lastDate: today });
  });
});
