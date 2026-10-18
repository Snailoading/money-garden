import { describe, expect, it } from "vitest";
import type { State, Transaction } from "./types";
import { CATEGORIES, DEFAULT_INVEST } from "./types";
import { bumpStreak, canRemoveTransaction, deleteGoal, deserialize, emptyState, ensureEmergencyGoal, insertGoal, isFreshGarden, linkedAmountBounds, loadSaved, migrate, removeTransaction, sampleState, serialize, setupEmergencyFund, updateCommitment, updateGoal, updateTransaction } from "./state";
import { derive } from "./stats";
import { todayISO } from "./format";

describe("emptyState", () => {
  it("seeds default budgets, the unfunded rain barrel, and nothing else", () => {
    const s = emptyState();
    expect(Object.keys(s.budgets)).toHaveLength(CATEGORIES.length);
    expect(s.budgets.housing).toBe(1400);
    expect(s.transactions).toEqual([]);
    // v0.12.0: the barrel is permanent — even a fresh garden has it, in its
    // target-0 "not set up yet" state.
    expect(s.goals).toHaveLength(1);
    expect(s.goals[0]).toMatchObject({ name: "Emergency fund", plant: "sunflower", target: 0, saved: 0, isEmergency: true });
    expect(s.invest).toEqual(DEFAULT_INVEST);
    expect(s.invest).not.toBe(DEFAULT_INVEST); // must be a copy, not the shared object
    expect(s.streak).toEqual({ count: 0, lastDate: null });
  });
});

describe("ensureEmergencyGoal (the rain-barrel invariant)", () => {
  const g = (id: string, isEmergency = false) => ({ id, name: `Goal ${id}`, plant: "tulip", target: 1000, saved: 100, isEmergency });

  it("injects an unfunded barrel first when none exists", () => {
    const goals = ensureEmergencyGoal([g("a"), g("b")]);
    expect(goals).toHaveLength(3);
    expect(goals[0]).toMatchObject({ name: "Emergency fund", target: 0, saved: 0, isEmergency: true });
    expect(goals.slice(1).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("moves an existing barrel first, keeping the others' relative order and ids", () => {
    const barrel = g("e", true);
    const goals = ensureEmergencyGoal([g("a"), barrel, g("b")]);
    expect(goals.map((x) => x.id)).toEqual(["e", "a", "b"]);
    expect(goals[0]).toBe(barrel); // untouched, not cloned
  });

  it("resolves duplicates: first flagged wins, the rest unflag", () => {
    const goals = ensureEmergencyGoal([g("a"), g("b", true), g("c", true)]);
    expect(goals.map((x) => [x.id, x.isEmergency])).toEqual([["b", true], ["a", false], ["c", false]]);
  });

  it("returns the same reference for already-canonical input (id-stable migrate)", () => {
    const canonical = [g("e", true), g("a")];
    expect(ensureEmergencyGoal(canonical)).toBe(canonical);
  });

  it("injects with a stable id, so repeated loads of an unsaved old state agree", () => {
    const raw = JSON.stringify({ income: 100, goals: [] });
    expect(deserialize(raw)).toEqual(deserialize(raw)); // ids included
    expect(deserialize(raw).goals[0].id).toBe("the-rain-barrel");
  });

  it("falls back to a random id if the sentinel id is already taken", () => {
    const squatter = { id: "the-rain-barrel", name: "Odd import", plant: "tulip", target: 100, saved: 0, isEmergency: false };
    const goals = ensureEmergencyGoal([squatter]);
    expect(goals[0].isEmergency).toBe(true);
    expect(goals[0].id).not.toBe("the-rain-barrel");
    expect(new Set(goals.map((x) => x.id)).size).toBe(2);
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

  it("converts a legacy stored age to birthYear and removes the age key", () => {
    const NOW = new Date(2026, 5, 15);
    const migrated = migrate({ income: 1, invest: { age: 40 } }, NOW);
    expect(migrated.invest.birthYear).toBe(1986);
    expect("age" in migrated.invest).toBe(false);
  });

  it("lets an existing birthYear win over a lingering legacy age", () => {
    const NOW = new Date(2026, 5, 15);
    const migrated = migrate({ invest: { age: 40, birthYear: 1990 } }, NOW);
    expect(migrated.invest.birthYear).toBe(1990);
    expect("age" in migrated.invest).toBe(false);
  });

  it("clamps an absurd legacy age before converting; no age → sentinel 0", () => {
    const NOW = new Date(2026, 5, 15);
    expect(migrate({ invest: { age: 900 } }, NOW).invest.birthYear).toBe(1926);  // clamped to 100
    expect(migrate({ invest: { age: 3 } }, NOW).invest.birthYear).toBe(2012);    // clamped to 14
    expect(migrate({ invest: { monthly: 5 } }, NOW).invest.birthYear).toBe(0);   // never had one
  });

  it("injects the rain barrel into a pre-0.12 save without one", () => {
    const old = { income: 100, goals: [{ id: "j", name: "Japan trip", plant: "tulip", target: 2800, saved: 640, isEmergency: false }] };
    const migrated = migrate(old);
    expect(migrated.goals).toHaveLength(2);
    expect(migrated.goals[0]).toMatchObject({ name: "Emergency fund", target: 0, isEmergency: true });
    expect(migrated.goals[1].id).toBe("j");
  });

  it("keeps an existing emergency goal untouched and id-stable (via deserialize)", () => {
    const s = { ...emptyState(), goals: [{ id: "mine", name: "Rainy day", plant: "poppy", target: 9000, saved: 1200, isEmergency: true }] };
    const back = deserialize(serialize(s));
    expect(back).toEqual(s);
    expect(back.goals[0].id).toBe("mine");
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

describe("updateGoal / insertGoal / deleteGoal", () => {
  const g = (id: string, isEmergency = false) => ({ id, name: `Goal ${id}`, plant: "tulip", target: 1000, saved: 100, isEmergency });
  const base = (): State => ({ ...emptyState(), goals: [g("a", true), g("b"), g("c")] });

  it("merges a patch, keeping id and balance", () => {
    const s = updateGoal(base(), "b", { name: "Renamed", target: 2500, plant: "poppy" });
    expect(s.goals[1]).toMatchObject({ id: "b", name: "Renamed", target: 2500, plant: "poppy", saved: 100 });
  });

  it("strips isEmergency from patches — the flag is structural, not editable", () => {
    // `as never` sneaks the field past the types, mimicking a stale caller.
    const flagged = updateGoal(base(), "b", { isEmergency: true } as never);
    expect(flagged.goals.map((x) => x.isEmergency)).toEqual([true, false, false]);
    const unflagged = updateGoal(base(), "a", { isEmergency: false } as never);
    expect(unflagged.goals.map((x) => x.isEmergency)).toEqual([true, false, false]);
  });

  it("strips saved from patches — balances stay journal-driven", () => {
    const s = updateGoal(base(), "b", { name: "Renamed", saved: 999999 } as never);
    expect(s.goals[1]).toMatchObject({ name: "Renamed", saved: 100 });
  });

  it("refuses a non-positive target on the barrel (setup-state re-entry)", () => {
    // Re-entering target 0 would let setupEmergencyFund clobber a
    // journal-driven balance; other patch fields still apply.
    const s = updateGoal(base(), "a", { name: "Barrel", target: 0 });
    expect(s.goals[0]).toMatchObject({ name: "Barrel", target: 1000 });
    // Normal goals aren't guarded by this rule (UI requires > 0 anyway).
    expect(updateGoal(base(), "b", { target: 0 }).goals[1].target).toBe(0);
  });

  it("is a no-op for unknown ids", () => {
    const before = base();
    expect(updateGoal(before, "nope", { name: "x" })).toBe(before);
  });

  it("insertGoal forces isEmergency off and keeps a provided opening balance", () => {
    const s = insertGoal(base(), { ...g("d", true), saved: 250 });
    expect(s.goals.map((x) => x.isEmergency)).toEqual([true, false, false, false]);
    expect(s.goals[3]).toMatchObject({ id: "d", saved: 250 });
  });

  it("deleteGoal removes a normal goal but never the barrel", () => {
    const s = deleteGoal(base(), "b");
    expect(s.goals.map((x) => x.id)).toEqual(["a", "c"]);
    const before = base();
    expect(deleteGoal(before, "a")).toBe(before); // the barrel is permanent
    expect(deleteGoal(before, "nope")).toBe(before);
  });
});

describe("setupEmergencyFund", () => {
  const barrel = { id: "e", name: "Emergency fund", plant: "sunflower", target: 0, saved: 0, isEmergency: true };
  const other = { id: "j", name: "Japan trip", plant: "tulip", target: 2800, saved: 640, isEmergency: false };
  const base = (): State => ({ ...emptyState(), goals: [{ ...barrel }, { ...other }], streak: { count: 3, lastDate: "2026-07-01" } });

  it("sets the target and an opening balance while in setup state", () => {
    const s = setupEmergencyFund(base(), 9000, 1200);
    expect(s.goals[0]).toMatchObject({ id: "e", target: 9000, saved: 1200 });
    expect(s.goals[1]).toEqual(other);
  });

  it("defaults the opening balance to 0 and floors junk values", () => {
    expect(setupEmergencyFund(base(), 9000).goals[0].saved).toBe(0);
    expect(setupEmergencyFund(base(), 9000, -50).goals[0].saved).toBe(0);
    expect(setupEmergencyFund(base(), 9000, NaN).goals[0].saved).toBe(0);
  });

  it("rejects a non-positive target and refuses to re-run once set up", () => {
    const before = base();
    expect(setupEmergencyFund(before, 0, 100)).toBe(before);
    expect(setupEmergencyFund(before, -5)).toBe(before);
    const done = setupEmergencyFund(before, 9000, 1200);
    expect(setupEmergencyFund(done, 500, 999999)).toBe(done); // balance is journal-driven now
  });

  it("creates no transaction and never touches the streak (setup isn't logging)", () => {
    const s = setupEmergencyFund(base(), 9000, 1200);
    expect(s.transactions).toEqual([]);
    expect(s.streak).toEqual({ count: 3, lastDate: "2026-07-01" });
  });
});

describe("opening balances stay out of the monthly books (budget basis)", () => {
  it("derive() sees no saving flow from setup or a planted opening balance", () => {
    const now = new Date(2026, 6, 15, 12);
    let s: State = { ...emptyState(), income: 4000 };
    s = setupEmergencyFund(s, 9000, 2000);
    s = insertGoal(s, { id: "j", name: "Japan trip", plant: "tulip", target: 2800, saved: 250, isEmergency: false });
    const d = derive(s, now);
    expect(d.savedThisMonth).toBe(0);
    expect(d.savingsRate).toBe(0);
    expect(d.left).toBe(4000); // income − 0 spent − 0 saved: opening money never charges Left
    expect(d.emergencyMonths).toBeGreaterThan(0); // but coverage sees it immediately
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

  it("keeps the streak across month and year boundaries (calendar-day math)", () => {
    const at = (y: number, m: number, d: number) => new Date(y, m, d, 12);
    expect(bumpStreak({ count: 3, lastDate: "2026-05-31" }, at(2026, 5, 1))).toEqual({ count: 4, lastDate: "2026-06-01" });
    expect(bumpStreak({ count: 3, lastDate: "2026-12-31" }, at(2027, 0, 1))).toEqual({ count: 4, lastDate: "2027-01-01" });
    expect(bumpStreak({ count: 3, lastDate: "2026-02-28" }, at(2026, 2, 1))).toEqual({ count: 4, lastDate: "2026-03-01" });
  });

  it("knows leap years: Feb 28 → Feb 29 continues; Feb 28 → Mar 1 skipped a day", () => {
    const at = (y: number, m: number, d: number) => new Date(y, m, d, 12);
    expect(bumpStreak({ count: 3, lastDate: "2028-02-28" }, at(2028, 1, 29))).toEqual({ count: 4, lastDate: "2028-02-29" });
    expect(bumpStreak({ count: 3, lastDate: "2028-02-28" }, at(2028, 2, 1))).toEqual({ count: 1, lastDate: "2028-03-01" });
  });
});

describe("loadSaved — only a truly empty save may become a fresh garden", () => {
  const NOW = new Date(2026, 5, 15, 12);

  it("treats nothing saved as fresh", () => {
    expect(loadSaved(null, NOW)).toEqual({ kind: "fresh" });
    expect(loadSaved(undefined, NOW)).toEqual({ kind: "fresh" });
    expect(loadSaved("", NOW)).toEqual({ kind: "fresh" });
  });

  it("loads a normal save exactly", () => {
    const s = sampleState(NOW);
    expect(loadSaved(serialize(s), NOW)).toEqual({ kind: "ok", state: s });
  });

  it("still runs migrations on load (pre-0.12 barrel, legacy age)", () => {
    const old = { income: 0, budgets: {}, transactions: [], goals: [], invest: { age: 40 }, streak: { count: 0, lastDate: null } };
    const r = loadSaved(JSON.stringify(old), NOW);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.state.goals[0]).toMatchObject({ isEmergency: true, target: 0 });
    expect(r.state.invest.birthYear).toBe(1986); // 2026 − 40
  });

  it("fills missing top-level fields and keeps unknown ones, like backup import", () => {
    const r = loadSaved(JSON.stringify({ budgets: { housing: 500 }, futureFeature: { x: 1 } }), NOW);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.state.transactions).toEqual([]);
    expect(r.state.streak).toEqual({ count: 0, lastDate: null });
    expect(r.state.budgets).toEqual({ housing: 500 }); // the saved map wins whole, not merged
    expect((r.state as unknown as { futureFeature: unknown }).futureFeature).toEqual({ x: 1 });
  });

  it("reports invalid JSON as unreadable — never as fresh", () => {
    const r = loadSaved('{"income": 42, "transa', NOW);
    expect(r.kind).toBe("unreadable");
    if (r.kind !== "unreadable") return;
    expect(r.reason).toContain("isn't valid JSON");
  });

  it("reports valid JSON that isn't a garden object as unreadable", () => {
    for (const raw of ["null", "42", "true", '"text"', "[1,2]"]) {
      expect(loadSaved(raw, NOW).kind).toBe("unreadable");
    }
    const r = loadSaved("[1,2]", NOW);
    if (r.kind === "unreadable") expect(r.reason).toContain("a list");
  });

  it("names a non-list collection plainly (goals as an object made the old load path throw → overwrite)", () => {
    expect(loadSaved('{"goals": {}}', NOW)).toEqual({ kind: "unreadable", reason: '"goals" isn\'t a list' });
    expect(loadSaved('{"transactions": "oops"}', NOW)).toEqual({ kind: "unreadable", reason: '"transactions" isn\'t a list' });
  });

  it("reports anything else migrate can't start on as unreadable, without throwing", () => {
    // A null goal: ensureEmergencyGoal reads g.isEmergency on it and throws.
    const r = loadSaved('{"goals": [null]}', NOW);
    expect(r.kind).toBe("unreadable");
    if (r.kind !== "unreadable") return;
    expect(r.reason).toContain("couldn't be upgraded");
  });

  it("still reads a null goals/commitments as 'none', as migrate always has", () => {
    const r = loadSaved('{"goals": null, "commitments": null}', NOW);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.state.commitments).toEqual([]);
    expect(r.state.goals[0]).toMatchObject({ isEmergency: true, target: 0 }); // barrel injected
  });

  it("reports entry-level damage as unreadable, naming the problem", () => {
    const s = { ...emptyState(), transactions: [{ id: "a", type: "expense", amount: "100", category: "dining", note: "", date: "2026-06-01" }] };
    const r = loadSaved(JSON.stringify(s), NOW);
    expect(r).toEqual({ kind: "unreadable", reason: 'transaction #1 has an amount that isn\'t a valid number ("100")' });
  });

  it("never throws, whatever is in storage", () => {
    for (const raw of ["{", "}", "undefined", '{"transactions":[null]}', '{"streak":null}', '{"invest":"x"}', "{}"]) {
      expect(() => loadSaved(raw, NOW)).not.toThrow();
    }
  });
});

describe("linkedAmountBounds / canRemoveTransaction — exact reversibility", () => {
  const goal = (saved: number) => ({ id: "g1", name: "Trip", plant: "tulip", target: 500, saved, isEmergency: false });
  const water: Transaction = { id: "w", type: "saving", amount: 100, category: "other", note: "→ Trip", date: "2026-10-01", goalId: "g1" };
  const draw: Transaction = { id: "d", type: "expense", amount: 70, category: "fun", note: "Tickets", date: "2026-10-02", goalId: "g1" };
  // Watered 100 then drew 70 → the goal holds 30.
  const afterBoth = (): State => ({ ...emptyState(), goals: [goal(30)], transactions: [draw, water] });

  it("blocks removing a watering whose money was since drawn (the phantom-balance bug)", () => {
    const s = afterBoth();
    expect(linkedAmountBounds(s, water)).toEqual({ min: 70, max: Infinity }); // can shrink by 30 at most
    expect(canRemoveTransaction(s, water)).toBe(false);
  });

  it("allows undoing the draw first; then the watering is removable, ending at exactly 0", () => {
    let s = afterBoth();
    expect(linkedAmountBounds(s, draw)).toEqual({ min: 0, max: 100 }); // 70 + 30 still held
    expect(canRemoveTransaction(s, draw)).toBe(true);
    s = removeTransaction(s, "d");
    expect(s.goals[0].saved).toBe(100); // 30 + 70 re-watered
    expect(canRemoveTransaction(s, water)).toBe(true);
    s = removeTransaction(s, "w");
    expect(s.goals[0].saved).toBe(0); // empty journal ↔ empty goal — no phantom
    expect(s.transactions).toEqual([]);
  });

  it("caps a draw's growth at what the goal still holds", () => {
    const s: State = { ...emptyState(), goals: [goal(2000)], transactions: [{ ...draw, amount: 500 }] };
    expect(linkedAmountBounds(s, s.transactions[0])).toEqual({ min: 0, max: 2500 });
  });

  it("leaves unlinked entries, holding waterings, and dangling links unconstrained", () => {
    const s = afterBoth();
    const plain: Transaction = { id: "p", type: "expense", amount: 5, category: "fun", note: "", date: "2026-10-03" };
    const orchard: Transaction = { id: "o", type: "saving", amount: 400, category: "other", note: "", date: "2026-10-03", holdingId: "h1" };
    const dangling: Transaction = { ...water, goalId: "deleted-goal" };
    for (const t of [plain, orchard, dangling]) {
      expect(linkedAmountBounds(s, t)).toEqual({ min: 0, max: Infinity });
      expect(canRemoveTransaction(s, t)).toBe(true);
    }
  });

  it("ignores sub-cent float drift but still blocks a real one-cent shortfall", () => {
    const w = (amount: number): Transaction => ({ ...water, amount });
    const withSaved = (saved: number): State => ({ ...emptyState(), goals: [goal(saved)] });
    expect(canRemoveTransaction(withSaved(0.1 + 0.2), w(0.3))).toBe(true);           // saved 0.30000000000000004
    expect(canRemoveTransaction(withSaved(0.19999999999999998), w(0.2))).toBe(true); // 2e-17 short: drift, not money
    expect(canRemoveTransaction(withSaved(0.19), w(0.2))).toBe(false);               // a real cent is gone
    expect(linkedAmountBounds(withSaved(0.19), w(0.2)).min).toBe(0.01);
  });
});

describe("loadSaved — gardens that work today must never be locked out (verifier round 1)", () => {
  const NOW = new Date(2026, 5, 15, 12);

  it("loads a save holding an empty date and 1e400-turned-null numbers", () => {
    // Clearing the Log's date box saves date ""; typing 1e400 into a number
    // box stores Infinity, which JSON writes as null. Both load fine today.
    const s = sampleState(NOW);
    const raw = serialize(s)
      .replace(`"date":"${s.transactions[0].date}"`, '"date":""')
      .replace('"income":4200', '"income":null')
      .replace(/"dining":\d+/, '"dining":null');
    const r = loadSaved(raw, NOW);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.state.transactions[0].date).toBe("");
    expect(r.state.income).toBeNull();
    expect(derive(r.state, NOW).spent).toBeGreaterThan(0); // and the engine still reads it
  });

  it("treats a whitespace-only save as unreadable, not fresh (the safe direction)", () => {
    expect(loadSaved("   ", NOW).kind).toBe("unreadable");
  });
});

describe("linkedAmountBounds — non-expense goal links count as waterings", () => {
  it("bounds an income entry carrying a goalId like a watering (linkSign treats it +1)", () => {
    const s: State = { ...emptyState(), goals: [{ id: "g1", name: "Trip", plant: "tulip", target: 500, saved: 60, isEmergency: false }] };
    const odd: Transaction = { id: "i", type: "income", amount: 100, category: "other", note: "", date: "2026-10-01", goalId: "g1" };
    expect(linkedAmountBounds(s, odd)).toEqual({ min: 40, max: Infinity }); // 100 − 60
  });
});

describe("isFreshGarden — 'nothing entered yet', the only garden one-tap sample planting may replace", () => {
  const NOW = new Date(2026, 5, 15, 12);
  /** A fresh garden with exactly one thing entered. */
  const touched = (mutate: (s: State) => void): State => {
    const s = structuredClone(emptyState());
    mutate(s);
    return s;
  };

  it("is true for a brand-new garden (incl. a pre-0.12 empty save that just gained its barrel)", () => {
    expect(isFreshGarden(emptyState())).toBe(true);
    const old = loadSaved(JSON.stringify({ ...emptyState(), goals: [] }), NOW);
    expect(old.kind === "ok" && isFreshGarden(old.state)).toBe(true);
  });

  it("was already false for entries and goals (the old check)", () => {
    expect(isFreshGarden(touched((s) => { s.transactions.push({ id: "t", type: "expense", amount: 5, category: "fun", note: "", date: "2026-06-01" }); }))).toBe(false);
    expect(isFreshGarden(touched((s) => { s.goals.push({ id: "g", name: "Trip", plant: "tulip", target: 100, saved: 0, isEmergency: false }); }))).toBe(false);
    expect(isFreshGarden(touched((s) => { s.goals[0].target = 6000; }))).toBe(false); // barrel set up
    expect(isFreshGarden(touched((s) => { s.goals[0].saved = 50; }))).toBe(false);
  });

  it("is false once ANY setup exists — the data the old check ignored", () => {
    expect(isFreshGarden(touched((s) => { s.income = 4200; }))).toBe(false);
    expect(isFreshGarden(touched((s) => { s.budgets.dining = 300; }))).toBe(false);
    expect(isFreshGarden(touched((s) => { delete s.budgets.dining; }))).toBe(false);
    expect(isFreshGarden(touched((s) => { s.budgets.pets = 40; }))).toBe(false);
    expect(isFreshGarden(touched((s) => {
      s.commitments.push({ id: "c", kind: "sub", name: "Gym", amount: 35, cadence: "monthly", payDay: 1, payMonth: 1, endDate: "", category: "subs" });
    }))).toBe(false);
    expect(isFreshGarden(touched((s) => { s.invest.holdings.push({ id: "h", name: "Index fund", value: 14200 }); }))).toBe(false);
    expect(isFreshGarden(touched((s) => { s.invest.monthly = 400; }))).toBe(false);
    expect(isFreshGarden(touched((s) => { s.invest.birthYear = 1995; }))).toBe(false);
    expect(isFreshGarden(touched((s) => { s.invest.wr = 3.5; }))).toBe(false);
    expect(isFreshGarden(touched((s) => { s.invest.ret = "" as unknown as number; }))).toBe(false); // cleared box = touched
    expect(isFreshGarden(touched((s) => { s.streak = { count: 1, lastDate: "2026-06-15" }; }))).toBe(false); // a no-spend day
  });

  it("is false for data a newer version wrote (unknown top-level fields) and for the sample garden", () => {
    expect(isFreshGarden({ ...emptyState(), debts: [] } as unknown as State)).toBe(false);
    expect(isFreshGarden(sampleState(NOW))).toBe(false);
  });
});

describe("isFreshGarden — unknown fields nested inside known ones (verifier nit)", () => {
  it("is false when a newer version's field hides inside invest, the barrel, or the streak", () => {
    const withInvest = { ...emptyState(), invest: { ...emptyState().invest, inflation: 2.5 } } as unknown as State;
    const barrel = { ...emptyState().goals[0], colour: "blue" };
    const withGoalField = { ...emptyState(), goals: [barrel] } as unknown as State;
    const withStreakField = { ...emptyState(), streak: { count: 0, lastDate: null, best: 12 } } as unknown as State;
    expect(isFreshGarden(withInvest)).toBe(false);
    expect(isFreshGarden(withGoalField)).toBe(false);
    expect(isFreshGarden(withStreakField)).toBe(false);
  });
});
