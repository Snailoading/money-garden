import { describe, expect, it } from "vitest";
import type { State, Transaction } from "./types";
import { emptyState, removeTransaction, sampleState } from "./state";
import { addCommitment, addHolding, drawFromGoal, logEntry, markNoSpendDay, payCommitment, removeCommitment, removeHolding, revalueHolding, setBudget, setIncome, updateInvest, waterGoal, waterHolding } from "./actions";

const NOW = new Date(2026, 5, 15, 12); // June 15, 2026 — local noon
const TODAY = "2026-06-15";

/**
 * The reversibility contract (CLAUDE.md: linked journal entries must stay
 * exactly reversible): an action that adds ONE journal entry, undone by
 * deleting that entry, must leave the garden exactly as it was — every
 * goal balance, holding value, commitment, and the rest of the journal.
 * The streak is the one deliberate exception: it records that you tended
 * the garden today, which deleting an entry doesn't un-happen.
 */
const expectReversible = (before: State, after: State) => {
  const added = after.transactions.filter((t) => !before.transactions.some((b) => b.id === t.id));
  expect(added).toHaveLength(1);
  const undone = removeTransaction(after, added[0].id);
  expect({ ...undone, streak: before.streak }).toEqual(before);
};

describe("logEntry — the Log's add (moved from App.tsx, behavior unchanged)", () => {
  const entry: Omit<Transaction, "id"> = { type: "expense", amount: 42, category: "dining", note: "Ramen", date: TODAY };

  it("prepends the entry with a fresh id, keeping every field", () => {
    const s = sampleState(NOW);
    const r = logEntry(s, entry, NOW);
    expect(r.state.transactions).toHaveLength(s.transactions.length + 1);
    const [added] = r.state.transactions;
    expect(added).toMatchObject(entry);
    expect(typeof added.id).toBe("string");
    expect(s.transactions.some((t) => t.id === added.id)).toBe(false);
    expect(r.state.transactions.slice(1)).toEqual(s.transactions); // older entries untouched, same order
  });

  it("never mutates the input state", () => {
    const s = sampleState(NOW);
    const snapshot = structuredClone(s);
    logEntry(s, entry, NOW);
    expect(s).toEqual(snapshot);
  });

  it("advances the streak for today and reports growth", () => {
    const s: State = { ...emptyState(), streak: { count: 4, lastDate: "2026-06-14" } };
    const r = logEntry(s, entry, NOW);
    expect(r.state.streak).toEqual({ count: 5, lastDate: TODAY });
    expect(r.events).toEqual([{ kind: "streakGrew", count: 5 }]);
  });

  it("reports the first-ever log as growth to 1 (the UI chooses not to toast a 1-day streak)", () => {
    const r = logEntry(emptyState(), entry, NOW);
    expect(r.state.streak).toEqual({ count: 1, lastDate: TODAY });
    expect(r.events).toEqual([{ kind: "streakGrew", count: 1 }]);
  });

  it("reports no growth when today was already tended", () => {
    const s: State = { ...emptyState(), streak: { count: 4, lastDate: TODAY } };
    const r = logEntry(s, entry, NOW);
    expect(r.state.streak).toEqual({ count: 4, lastDate: TODAY });
    expect(r.events).toEqual([]);
  });

  it("is exactly reversible by deleting the entry", () => {
    const s = sampleState(NOW);
    expectReversible(s, logEntry(s, entry, NOW).state);
  });
});

describe("markNoSpendDay — tending without an entry (moved from App.tsx)", () => {
  it("advances the streak without touching the journal", () => {
    const s: State = { ...emptyState(), streak: { count: 2, lastDate: "2026-06-14" } };
    const r = markNoSpendDay(s, NOW);
    expect(r.state.streak).toEqual({ count: 3, lastDate: TODAY });
    expect(r.state.transactions).toBe(s.transactions);
    expect(r.events).toEqual([{ kind: "streakGrew", count: 3 }]);
  });

  it("after a gap, restarts the streak at 1 — a change, but not growth", () => {
    const s: State = { ...emptyState(), streak: { count: 9, lastDate: "2026-06-01" } };
    const r = markNoSpendDay(s, NOW);
    expect(r.state.streak).toEqual({ count: 1, lastDate: TODAY });
    expect(r.state).not.toBe(s);
    expect(r.events).toEqual([]);
  });

  it("is a same-reference no-op when today is already tended", () => {
    const s: State = { ...emptyState(), streak: { count: 2, lastDate: TODAY } };
    const r = markNoSpendDay(s, NOW);
    expect(r.state).toBe(s); // the UI reads "unchanged" as "already tended"
    expect(r.events).toEqual([]);
  });
});

/** A garden with the barrel plus a Trip goal at `saved` of 500. */
const withTrip = (saved: number): State => ({
  ...emptyState(),
  goals: [
    { id: "barrel", name: "Emergency fund", plant: "sunflower", target: 0, saved: 0, isEmergency: true },
    { id: "trip", name: "Trip", plant: "tulip", target: 500, saved, isEmergency: false },
  ],
  streak: { count: 4, lastDate: "2026-06-14" },
});
const trip = (s: State) => s.goals.find((g) => g.id === "trip")!;

describe("waterGoal — moved from App.tsx, behavior unchanged", () => {
  it("adds the amount to the goal and logs a linked saving entry", () => {
    const s = withTrip(100);
    const r = waterGoal(s, "trip", 60, NOW);
    expect(trip(r.state).saved).toBe(160);
    expect(r.state.goals[0]).toBe(s.goals[0]); // the barrel is untouched (same object)
    const [tx] = r.state.transactions;
    expect(tx).toMatchObject({ type: "saving", amount: 60, category: "other", note: "→ Trip", date: TODAY, goalId: "trip" });
    expect(r.state.streak).toEqual({ count: 5, lastDate: TODAY });
  });

  it("reports a bloom only when this watering crosses the target", () => {
    expect(waterGoal(withTrip(450), "trip", 60, NOW).events).toContainEqual({ kind: "bloomed", goalName: "Trip" }); // 450 → 510
    expect(waterGoal(withTrip(450), "trip", 50, NOW).events).toContainEqual({ kind: "bloomed", goalName: "Trip" }); // exactly 500
    expect(waterGoal(withTrip(100), "trip", 50, NOW).events.some((e) => e.kind === "bloomed")).toBe(false); // 150, not there
    expect(waterGoal(withTrip(510), "trip", 60, NOW).events.some((e) => e.kind === "bloomed")).toBe(false); // already bloomed
  });

  it("lets a goal overflow its target (v0.7.0: truthful, and keeps the entry reversible)", () => {
    expect(trip(waterGoal(withTrip(510), "trip", 60, NOW).state).saved).toBe(570);
  });

  it("never 'blooms' the un-set-up barrel (target 0)", () => {
    const r = waterGoal(withTrip(0), "barrel", 50, NOW);
    expect(r.state.goals[0].saved).toBe(50);
    expect(r.events.some((e) => e.kind === "bloomed")).toBe(false);
  });

  it("is exactly reversible by deleting its entry", () => {
    const s = withTrip(450);
    expectReversible(s, waterGoal(s, "trip", 60, NOW).state);
  });
});

describe("drawFromGoal — moved from App.tsx, behavior unchanged", () => {
  it("drains the goal and logs a linked expense with the default note", () => {
    const s = withTrip(510);
    const r = drawFromGoal(s, "trip", 100, "fun", "   ", NOW);
    expect(trip(r.state).saved).toBe(410);
    expect(r.state.transactions[0]).toMatchObject({ type: "expense", amount: 100, category: "fun", note: 'From "Trip"', date: TODAY, goalId: "trip" });
    expect(r.state.streak).toEqual({ count: 5, lastDate: TODAY });
  });

  it("keeps a custom note, trimmed", () => {
    expect(drawFromGoal(withTrip(510), "trip", 100, "fun", "  Concert  ", NOW).state.transactions[0].note).toBe("Concert");
  });

  it("can draw the whole balance, down to exactly 0", () => {
    expect(trip(drawFromGoal(withTrip(510), "trip", 510, "fun", "", NOW).state).saved).toBe(0);
  });

  it("is a same-reference no-op beyond the balance, for non-positive amounts, or an unknown goal", () => {
    const s = withTrip(510);
    for (const amount of [510.01, 0, -5, NaN]) {
      expect(drawFromGoal(s, "trip", amount, "fun", "", NOW).state).toBe(s);
    }
    expect(drawFromGoal(s, "no-such-goal", 10, "fun", "", NOW).state).toBe(s);
  });

  it("is exactly reversible by deleting its entry", () => {
    const s = withTrip(510);
    expectReversible(s, drawFromGoal(s, "trip", 100, "fun", "", NOW).state);
  });
});

describe("water → draw → undo both (newest first) — the full linked story", () => {
  it("returns every balance to where it started", () => {
    const start = withTrip(450);
    const watered = waterGoal(start, "trip", 60, NOW).state;            // 510
    const drawn = drawFromGoal(watered, "trip", 100, "fun", "", NOW).state; // 410
    const [drawTx, waterTx] = drawn.transactions;
    const undone = removeTransaction(removeTransaction(drawn, drawTx.id), waterTx.id);
    expect(trip(undone).saved).toBe(450);
    expect({ ...undone, streak: start.streak }).toEqual(start);
  });
});

/** A garden with one holding (Index fund, $1,000). */
const withOrchard = (): State => ({
  ...emptyState(),
  invest: { ...emptyState().invest, holdings: [{ id: "h1", name: "Index fund", value: 1000 }] },
  streak: { count: 4, lastDate: "2026-06-14" },
});

describe("waterHolding — the Orchard's one-off watering (moved from App.tsx)", () => {
  it("adds to the holding and logs a linked saving entry", () => {
    const s = withOrchard();
    const r = waterHolding(s, "h1", 250, NOW);
    expect(r.state.invest.holdings[0].value).toBe(1250);
    expect(r.state.transactions[0]).toMatchObject({ type: "saving", amount: 250, category: "other", note: "→ Orchard: Index fund", date: TODAY, holdingId: "h1" });
    expect(r.state.streak).toEqual({ count: 5, lastDate: TODAY });
  });

  it("treats a junk stored value as 0 before adding (as before)", () => {
    const s = withOrchard();
    s.invest.holdings[0].value = "" as unknown as number; // a cleared box, stored as ""
    expect(waterHolding(s, "h1", 250, NOW).state.invest.holdings[0].value).toBe(250);
  });

  it("is a same-reference no-op for an unknown holding or a non-positive/NaN amount", () => {
    const s = withOrchard();
    expect(waterHolding(s, "nope", 250, NOW).state).toBe(s);
    for (const amount of [0, -1, NaN]) expect(waterHolding(s, "h1", amount, NOW).state).toBe(s);
  });

  it("is exactly reversible by deleting its entry", () => {
    const s = withOrchard();
    expectReversible(s, waterHolding(s, "h1", 250, NOW).state);
  });
});

describe("addHolding / revalueHolding / removeHolding — planting and tending trees", () => {
  it("plants a holding at the end with a fresh id, no journal entry", () => {
    const s = withOrchard();
    const r = addHolding(s, { name: "Bonds", value: 800 });
    expect(r.state.invest.holdings).toHaveLength(2);
    expect(r.state.invest.holdings[1]).toMatchObject({ name: "Bonds", value: 800 });
    expect(r.state.invest.holdings[1].id).not.toBe("h1");
    expect(r.state.transactions).toBe(s.transactions);
    expect(r.state.streak).toBe(s.streak); // planting isn't logging
  });

  it("revalues in place: a plain value edit, never below 0, junk → 0 (revaluations always win)", () => {
    const s = withOrchard();
    expect(revalueHolding(s, "h1", 1500).state.invest.holdings[0].value).toBe(1500);
    expect(revalueHolding(s, "h1", -20).state.invest.holdings[0].value).toBe(0);
    expect(revalueHolding(s, "h1", NaN).state.invest.holdings[0].value).toBe(0); // Number("abc") from the box
    expect(revalueHolding(s, "h1", 1500).state.transactions).toBe(s.transactions);
  });

  it("removes a holding; its journal entries stay (dangling links are no-ops)", () => {
    const watered = waterHolding(withOrchard(), "h1", 250, NOW).state;
    const r = removeHolding(watered, "h1");
    expect(r.state.invest.holdings).toEqual([]);
    expect(r.state.transactions).toBe(watered.transactions);
    // Deleting that entry later just removes the entry — nothing to drain.
    expect(removeTransaction(r.state, watered.transactions[0].id).invest.holdings).toEqual([]);
  });

  it("revalue/remove of an unknown holding hands back the same state", () => {
    const s = withOrchard();
    expect(revalueHolding(s, "nope", 5).state).toBe(s);
    expect(removeHolding(s, "nope").state).toBe(s);
  });
});

describe("updateInvest — the growing-conditions settings", () => {
  it("merges the patch, keeping holdings and every other setting", () => {
    const s = withOrchard();
    const r = updateInvest(s, { monthly: 400 });
    expect(r.state.invest).toEqual({ ...s.invest, monthly: 400 });
    expect(r.state.invest.holdings).toBe(s.invest.holdings);
  });

  it("keeps the Orchard's cleared-box sentinel as given (the engine coerces on read)", () => {
    const r = updateInvest(withOrchard(), { ret: "" as unknown as number });
    expect(r.state.invest.ret).toBe("");
  });
});

/** A garden with one vine (Gym, $35/mo) and one trellis plan (Tax, 2 of 6 paid). */
const withCommitments = (): State => ({
  ...emptyState(),
  commitments: [
    { id: "gym", kind: "sub", name: "Gym", amount: 35, cadence: "monthly", payDay: 1, payMonth: 1, endDate: "", category: "subs" },
    { id: "tax", kind: "inst", name: "Tax plan", amount: 240, cadence: "monthly", payDay: 20, payMonth: 1, totalPayments: 6, paidCount: 2, category: "other" },
  ],
  streak: { count: 4, lastDate: "2026-06-14" },
});

describe("payCommitment — 'Log payment' on a vine or trellis plan (moved from App.tsx)", () => {
  it("logs a subscription payment as a linked expense, commitment unchanged", () => {
    const s = withCommitments();
    const r = payCommitment(s, "gym", NOW);
    expect(r.state.transactions[0]).toMatchObject({ type: "expense", amount: 35, category: "subs", note: "Subscription: Gym", date: TODAY, commitmentId: "gym" });
    expect(r.state.commitments).toEqual(s.commitments);
    expect(r.state.streak).toEqual({ count: 5, lastDate: TODAY });
  });

  it("logs an installment payment and counts it (2 → 3 of 6)", () => {
    const r = payCommitment(withCommitments(), "tax", NOW);
    expect(r.state.transactions[0]).toMatchObject({ amount: 240, category: "other", note: "Installment: Tax plan", commitmentId: "tax" });
    expect(r.state.commitments.find((c) => c.id === "tax")!.paidCount).toBe(3);
    expect(r.state.commitments.find((c) => c.id === "gym")).toEqual(withCommitments().commitments[0]);
  });

  it("falls back to category 'subs' and amount 0 for damaged commitments (as before)", () => {
    const s = withCommitments();
    s.commitments[0] = { ...s.commitments[0], category: "", amount: "x" as unknown as number };
    expect(payCommitment(s, "gym", NOW).state.transactions[0]).toMatchObject({ category: "subs", amount: 0 });
  });

  it("is a same-reference no-op for an unknown commitment", () => {
    const s = withCommitments();
    expect(payCommitment(s, "nope", NOW).state).toBe(s);
  });

  it("is exactly reversible by deleting its entry — incl. the installment count", () => {
    const s = withCommitments();
    expectReversible(s, payCommitment(s, "gym", NOW).state);
    expectReversible(s, payCommitment(s, "tax", NOW).state);
  });
});

describe("addCommitment / removeCommitment — planting and cutting vines", () => {
  it("adds a commitment at the end with a fresh id, no journal entry, no streak", () => {
    const s = withCommitments();
    const c = { kind: "sub" as const, name: "Music", amount: 9.99, cadence: "monthly" as const, payDay: 5, payMonth: 1, endDate: "", category: "subs" };
    const r = addCommitment(s, c);
    expect(r.state.commitments).toHaveLength(3);
    expect(r.state.commitments[2]).toMatchObject(c);
    expect(["gym", "tax"]).not.toContain(r.state.commitments[2].id);
    expect(r.state.transactions).toBe(s.transactions);
    expect(r.state.streak).toBe(s.streak);
  });

  it("removes a commitment; its logged payments stay in the journal (dangling links are no-ops)", () => {
    const paid = payCommitment(withCommitments(), "tax", NOW).state;
    const r = removeCommitment(paid, "tax");
    expect(r.state.commitments.map((c) => c.id)).toEqual(["gym"]);
    expect(r.state.transactions).toBe(paid.transactions);
    expect(removeTransaction(r.state, paid.transactions[0].id).commitments.map((c) => c.id)).toEqual(["gym"]);
  });

  it("removing an unknown commitment hands back the same state", () => {
    const s = withCommitments();
    expect(removeCommitment(s, "nope").state).toBe(s);
  });
});

describe("payCommitment — a legacy installment with no paidCount (verifier note)", () => {
  it("counts the payment as 1, and undoing it leaves 0 — the same 'none paid' every reader sees", () => {
    const s = withCommitments();
    const { paidCount: _dropped, ...legacy } = s.commitments[1];
    s.commitments[1] = legacy; // as an old import might hold it
    const paid = payCommitment(s, "tax", NOW).state;
    expect(paid.commitments[1].paidCount).toBe(1);
    const undone = removeTransaction(paid, paid.transactions[0].id);
    expect(undone.commitments[1].paidCount).toBe(0); // normalized, not undefined
  });
});

describe("setBudget / setIncome — plot sizes and stated income (moved from App.tsx)", () => {
  it("sets one plot, keeping every other", () => {
    const s = emptyState();
    const r = setBudget(s, "dining", 300);
    expect(r.state.budgets).toEqual({ ...s.budgets, dining: 300 });
    expect(r.state.transactions).toBe(s.transactions);
    expect(r.state.streak).toBe(s.streak); // editing plans isn't logging
  });

  it("turns a junk box (NaN) into 0, as Number(v) || 0 always did", () => {
    expect(setBudget(emptyState(), "dining", NaN).state.budgets.dining).toBe(0);
    expect(setIncome(emptyState(), NaN).state.income).toBe(0);
  });

  it("accepts a category the list no longer knows (legacy budgets stay editable)", () => {
    expect(setBudget(emptyState(), "pets", 40).state.budgets.pets).toBe(40);
  });

  it("sets the stated income, nothing else", () => {
    const s = emptyState();
    const r = setIncome(s, 4200);
    expect(r.state).toEqual({ ...s, income: 4200 });
  });
});
