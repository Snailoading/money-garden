import { describe, expect, it } from "vitest";
import type { State } from "./types";
import { emptyState, sampleState } from "./state";
import { describeProblems, findStateProblems } from "./validate";

const june15 = new Date(2026, 5, 15, 12);

/** A known-good garden with one of each entry kind, to damage one field at a time. */
const good = (): State => ({
  ...emptyState(),
  income: 4200,
  transactions: [
    { id: "t1", type: "expense", amount: 42, category: "dining", note: "Ramen", date: "2026-06-05" },
    { id: "t2", type: "saving", amount: 100, category: "other", note: "→ Trip", date: "2026-06-06", goalId: "g1" },
  ],
  goals: [
    { id: "b", name: "Emergency fund", plant: "sunflower", target: 6000, saved: 900, isEmergency: true },
    { id: "g1", name: "Trip", plant: "tulip", target: 2000, saved: 100, isEmergency: false },
  ],
  invest: { ...emptyState().invest, holdings: [{ id: "h1", name: "Index fund", value: 5000 }] },
  commitments: [
    { id: "c1", kind: "sub", name: "Streaming", amount: 15.99, cadence: "monthly", payDay: 12, payMonth: 1, endDate: "", category: "subs" },
  ],
});

/** Damage a deep copy of good() with `mutate`, then inspect it. */
const problemsAfter = (mutate: (s: Record<string, any>) => void): string[] => { // eslint-disable-line @typescript-eslint/no-explicit-any
  const s = structuredClone(good()) as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  mutate(s);
  return findStateProblems(s as unknown as State);
};

describe("findStateProblems — shapes the app itself writes all pass", () => {
  it("passes a fresh garden, the sample garden, and the fixture", () => {
    expect(findStateProblems(emptyState())).toEqual([]);
    expect(findStateProblems(sampleState(june15))).toEqual([]);
    expect(findStateProblems(good())).toEqual([]);
  });

  it("passes the Orchard's empty-string sentinel for a cleared number box", () => {
    // numField() in Orchard.tsx stores "" while an input is emptied.
    expect(problemsAfter((s) => { s.invest.monthly = ""; s.invest.birthYear = ""; s.invest.wr = ""; })).toEqual([]);
  });

  it("never objects to unknown or future fields (it reports, never strips)", () => {
    expect(problemsAfter((s) => {
      s.futureFeature = { debts: [1] };
      s.transactions[0].tripId = "osaka";
      s.goals[1].colour = "pink";
    })).toEqual([]);
  });

  it("allows absent optional links, unknown categories, and empty notes", () => {
    expect(problemsAfter((s) => {
      s.transactions[0].goalId = undefined;      // in-memory undefined (sampleState does this)
      s.transactions[0].category = "legacy-cat"; // categories retired long ago still load
      s.transactions[0].note = "";
    })).toEqual([]);
  });

  it("allows any date string — clearing a date box saves \"\", and that garden loads today", () => {
    expect(problemsAfter((s) => { s.transactions[0].date = ""; })).toEqual([]);
    expect(problemsAfter((s) => { s.transactions[0].date = "20261-10-15"; })).toEqual([]); // 5-digit years are typeable
    expect(problemsAfter((s) => { s.transactions[0].date = "June 5th"; })).toEqual([]);
  });

  it("allows null wherever a number belongs (1e400 → Infinity → saved by JSON as null)", () => {
    expect(problemsAfter((s) => {
      s.income = null;
      s.budgets.dining = null;
      s.transactions[0].amount = null;
      s.goals[1].target = null;
      s.goals[1].saved = null;
      s.invest.holdings[0].value = null;
      s.invest.monthly = null;
      s.commitments[0].amount = null;
    })).toEqual([]);
  });

  it("allows zero amounts and negative budgets/income (both reachable through the UI)", () => {
    // A $0 commitment logs a $0 payment; budget and income inputs store Number(v).
    expect(problemsAfter((s) => {
      s.transactions[0].amount = 0;
      s.budgets.dining = -5;
      s.income = -1;
    })).toEqual([]);
  });
});

describe("findStateProblems — damage that would break the garden", () => {
  it("catches a numeric string amount (the '100' + '50' = '10050' bug)", () => {
    expect(problemsAfter((s) => { s.transactions[0].amount = "100"; }))
      .toEqual(['transaction #1 has an amount that isn\'t a valid number ("100")']);
  });

  it("catches negative, NaN, and infinite amounts", () => {
    expect(problemsAfter((s) => { s.transactions[1].amount = -5; })).toHaveLength(1);
    expect(problemsAfter((s) => { s.transactions[1].amount = NaN; })).toHaveLength(1);
    expect(problemsAfter((s) => { s.transactions[1].amount = Infinity; })).toHaveLength(1);
  });

  it("numbers entries from 1, the way a person counts them", () => {
    expect(problemsAfter((s) => { s.transactions[1] = null; }))
      .toEqual(["transaction #2 is empty or not an entry (null)"]);
  });

  it("catches missing or non-string dates (the month filter calls .startsWith on them)", () => {
    expect(problemsAfter((s) => { delete s.transactions[0].date; }))
      .toEqual(["transaction #1 has no date (undefined)"]);
    expect(problemsAfter((s) => { s.transactions[0].date = 20260605; }))
      .toEqual(["transaction #1 has no date (20260605)"]);
    expect(problemsAfter((s) => { s.transactions[0].date = null; })).toHaveLength(1);
  });

  it("catches unknown types, missing ids/notes/categories, and non-string links", () => {
    expect(problemsAfter((s) => { s.transactions[0].type = "refund"; }))
      .toEqual(['transaction #1 has an unknown type ("refund")']);
    expect(problemsAfter((s) => { delete s.transactions[0].id; })).toEqual(["transaction #1 has no id"]);
    expect(problemsAfter((s) => { delete s.transactions[0].note; })).toEqual(["transaction #1 has no note text (undefined)"]);
    expect(problemsAfter((s) => { delete s.transactions[0].category; })).toEqual(["transaction #1 has no category"]);
    expect(problemsAfter((s) => { s.transactions[1].goalId = 7; })).toEqual(["transaction #2 has a broken goalId link"]);
  });

  it("catches damaged goals, holdings, and commitments", () => {
    expect(problemsAfter((s) => { s.goals[1].saved = "10"; }))
      .toEqual(['goal #2 has a balance that isn\'t a number ("10")']);
    expect(problemsAfter((s) => { s.goals[0].target = "6000"; })).toHaveLength(1);
    expect(problemsAfter((s) => { s.goals[1].saved = -1; })).toHaveLength(1); // balances never go negative
    expect(problemsAfter((s) => { s.invest.holdings[0].value = "x"; }))
      .toEqual(['holding #1 has a value that isn\'t a number ("x")']);
    expect(problemsAfter((s) => { s.invest.holdings = "oops"; }))
      .toEqual(["the orchard's holdings aren't a list"]);
    expect(problemsAfter((s) => { s.commitments[0].kind = "loan"; }))
      .toEqual(['commitment #1 has an unknown kind ("loan")']);
    expect(problemsAfter((s) => { s.commitments[0] = 3; }))
      .toEqual(["commitment #1 is empty or not a commitment (3)"]);
  });

  it("catches damaged top-level values", () => {
    expect(problemsAfter((s) => { s.income = "4200"; })).toEqual(['the monthly income isn\'t a number ("4200")']);
    expect(problemsAfter((s) => { s.budgets.dining = "abc"; })).toEqual(['the "dining" budget isn\'t a number ("abc")']);
    expect(problemsAfter((s) => { s.budgets = null; })).toEqual(["the budgets are damaged (null)"]);
    expect(problemsAfter((s) => { s.streak = null; })).toEqual(["the logging streak is damaged (null)"]);
    expect(problemsAfter((s) => { s.streak.lastDate = 5; })).toHaveLength(1);
    expect(problemsAfter((s) => { s.invest.ret = "seven"; })).toEqual(['the orchard\'s "ret" setting isn\'t a number ("seven")']);
    expect(problemsAfter((s) => { s.goals = {}; })).toEqual(['"goals" isn\'t a list']);
  });

  it("reports every problem, not just the first", () => {
    const problems = problemsAfter((s) => {
      s.transactions[0].amount = "1";
      delete s.transactions[1].date;
      s.streak = null;
    });
    expect(problems).toHaveLength(3);
  });

  it("keeps long bad values short in messages", () => {
    const [msg] = problemsAfter((s) => { s.transactions[0].amount = "x".repeat(200); });
    expect(msg.length).toBeLessThan(90);
    expect(msg).toContain("…");
  });
});

describe("describeProblems", () => {
  it("shows the first problem and counts the rest", () => {
    expect(describeProblems([])).toBe("");
    expect(describeProblems(["a"])).toBe("a");
    expect(describeProblems(["a", "b"])).toBe("a (and 1 more problem)");
    expect(describeProblems(["a", "b", "c"])).toBe("a (and 2 more problems)");
  });
});
