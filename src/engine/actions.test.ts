import { describe, expect, it } from "vitest";
import type { State, Transaction } from "./types";
import { emptyState, removeTransaction, sampleState } from "./state";
import { logEntry, markNoSpendDay } from "./actions";

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
