import { describe, expect, it } from "vitest";
import type { State, Transaction } from "./types";
import { emptyState, removeTransaction, sampleState } from "./state";
import { drawFromGoal, logEntry, markNoSpendDay, waterGoal } from "./actions";

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
