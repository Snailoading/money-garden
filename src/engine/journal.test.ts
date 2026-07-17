import { describe, expect, it } from "vitest";
import type { Transaction } from "./types";
import { filterTransactions, isFilterActive, matchesFilter, SAVING_LABEL } from "./journal";

// Sample builder, same idiom as commitments.test.ts: defaults spread-overridden.
const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: "t1",
  type: "expense",
  amount: 10,
  category: "groceries",
  note: "",
  date: "2026-06-15",
  ...over,
});

const ledger = [
  tx({ id: "a", note: "Ramen with Sam", category: "dining", date: "2026-06-03" }),
  tx({ id: "b", category: "groceries", date: "2026-06-10" }), // empty note
  tx({ id: "c", type: "income", category: "other", note: "Paycheck", amount: 3200, date: "2026-06-01" }),
  tx({ id: "d", type: "saving", category: "other", goalId: "g1", amount: 150, date: "2026-06-20" }),
  tx({ id: "e", category: "petcare", note: "", date: "2026-06-28" }), // legacy category id
  tx({ id: "f", type: "saving", category: "other", holdingId: "h1", amount: 400, date: "2026-06-21" }), // orchard investment
  tx({ id: "g", category: "shopping", goalId: "g2", amount: 900, date: "2026-06-22" }), // draw (spent from goal)
  tx({ id: "h", type: "saving", category: "other", amount: 50, date: "2026-06-23" }), // legacy unlinked saving
];

const ids = (txs: Transaction[]) => txs.map((t) => t.id);

describe("filterTransactions", () => {
  it("empty filter returns all rows, order preserved, input unmutated", () => {
    const input = [...ledger];
    const out = filterTransactions(input, {});
    expect(ids(out)).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
    expect(input).toEqual(ledger);
  });

  it("text matches note substring case-insensitively", () => {
    expect(ids(filterTransactions(ledger, { text: "RAMEN" }))).toEqual(["a"]);
    expect(ids(filterTransactions(ledger, { text: "paycheck" }))).toEqual(["c"]);
  });

  it("text matches the category's human label, not just the note", () => {
    // "grocer" finds the empty-note groceries row; "out" finds "Dining out".
    expect(ids(filterTransactions(ledger, { text: "grocer" }))).toEqual(["b"]);
    expect(ids(filterTransactions(ledger, { text: "dining out" }))).toEqual(["a"]);
  });

  it("text is trimmed; whitespace-only text is a no-op", () => {
    expect(ids(filterTransactions(ledger, { text: "  ramen  " }))).toEqual(["a"]);
    expect(ids(filterTransactions(ledger, { text: "   " }))).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
  });

  it("unknown legacy category id still text-matches by its raw value", () => {
    expect(ids(filterTransactions(ledger, { text: "petcare" }))).toEqual(["e"]);
  });

  it(`saving rows match "${SAVING_LABEL}" (the empty-note display fallback); others don't`, () => {
    expect(ids(filterTransactions(ledger, { text: "goal contribution" }))).toEqual(["d", "f", "h"]);
    expect(ids(filterTransactions(ledger, { text: "CONTRIB" }))).toEqual(["d", "f", "h"]);
  });

  it("non-matching text returns empty", () => {
    expect(filterTransactions(ledger, { text: "unicorn" })).toEqual([]);
  });

  it("type filter selects exactly that type", () => {
    expect(ids(filterTransactions(ledger, { type: "expense" }))).toEqual(["a", "b", "e", "g"]);
    expect(ids(filterTransactions(ledger, { type: "income" }))).toEqual(["c"]);
    expect(ids(filterTransactions(ledger, { type: "saving" }))).toEqual(["d", "f", "h"]);
  });

  it("category is an exact match; conflicting type+category yields empty", () => {
    expect(ids(filterTransactions(ledger, { category: "dining" }))).toEqual(["a"]);
    // Income rows store category "other" — dumb AND, no special-casing.
    expect(filterTransactions(ledger, { type: "income", category: "groceries" })).toEqual([]);
  });

  it("date bounds are inclusive; from > to yields empty", () => {
    expect(ids(filterTransactions(ledger, { from: "2026-06-10" }))).toEqual(["b", "d", "e", "f", "g", "h"]);
    expect(ids(filterTransactions(ledger, { to: "2026-06-03" }))).toEqual(["a", "c"]);
    expect(ids(filterTransactions(ledger, { from: "2026-06-03", to: "2026-06-10" }))).toEqual(["a", "b"]);
    expect(filterTransactions(ledger, { from: "2026-06-20", to: "2026-06-01" })).toEqual([]);
  });

  it("all dimensions AND together", () => {
    expect(ids(filterTransactions(ledger, { text: "sam", type: "expense", category: "dining", from: "2026-06-01", to: "2026-06-05" }))).toEqual(["a"]);
    expect(filterTransactions(ledger, { text: "sam", type: "expense", from: "2026-06-04" })).toEqual([]);
  });

  it("link narrows by what the entry watered or drew from", () => {
    expect(ids(filterTransactions(ledger, { link: "goal" }))).toEqual(["d", "g"]);
    expect(ids(filterTransactions(ledger, { link: "holding" }))).toEqual(["f"]);
    // The story combos the Type dropdown offers:
    expect(ids(filterTransactions(ledger, { type: "expense", link: "goal" }))).toEqual(["g"]); // 🌸 spent from goals
    expect(ids(filterTransactions(ledger, { type: "saving", link: "goal" }))).toEqual(["d"]);  // 💧 sent to goals
    expect(ids(filterTransactions(ledger, { type: "saving", link: "holding" }))).toEqual(["f"]); // 🌳 orchard investments
  });
});

describe("matchesFilter", () => {
  it("is the single-row predicate behind filterTransactions", () => {
    expect(matchesFilter(ledger[0], { text: "ramen" })).toBe(true);
    expect(matchesFilter(ledger[1], { text: "ramen" })).toBe(false);
  });
});

describe("isFilterActive", () => {
  it("is false for empty and whitespace-only filters", () => {
    expect(isFilterActive({})).toBe(false);
    expect(isFilterActive({ text: "   " })).toBe(false);
  });

  it("is true when any single dimension is set", () => {
    expect(isFilterActive({ text: "a" })).toBe(true);
    expect(isFilterActive({ type: "expense" })).toBe(true);
    expect(isFilterActive({ category: "dining" })).toBe(true);
    expect(isFilterActive({ link: "goal" })).toBe(true);
    expect(isFilterActive({ from: "2026-06-01" })).toBe(true);
    expect(isFilterActive({ to: "2026-06-30" })).toBe(true);
  });
});
