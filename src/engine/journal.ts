/*
 * JOURNAL — searching and filtering ledger entries.
 * Pure — no React, no DOM. Depends only on types.ts.
 *
 * The UI hands us one month of transactions (the ledger never shows more)
 * and a JournalFilter; we say which rows survive. All dimensions AND
 * together; an absent/empty dimension doesn't constrain.
 */
import type { Transaction, TransactionType } from "./types";
import { CATEGORIES } from "./types";

/**
 * What an empty-note saving row displays in the ledger. Lives here (not in
 * the UI) so text search can match what the eye sees — Log.tsx imports it
 * for display and matchesFilter checks it for saving-type rows.
 */
export const SAVING_LABEL = "Goal contribution";

/** All fields optional; absent/empty = that dimension doesn't constrain. */
export interface JournalFilter {
  /** Case-insensitive substring over note + category label; whitespace-only = off. */
  text?: string;
  type?: TransactionType;
  /** Category id, exact match. Only meaningful for expenses (income/saving store "other"). */
  category?: string;
  /** Inclusive YYYY-MM-DD lower bound — lexicographic compare is safe for ISO dates. */
  from?: string;
  /** Inclusive YYYY-MM-DD upper bound. */
  to?: string;
}

// Category id → lowercased human label, built once at module load
// (like a dict comprehension at the top of a Python module). Keyed by plain
// string because Transaction.category is a string (legacy ids allowed).
const CATEGORY_LABELS = new Map<string, string>(CATEGORIES.map((c) => [c.id, c.label.toLowerCase()]));

const SAVING_LABEL_LOWER = SAVING_LABEL.toLowerCase();

/**
 * True when the filter would actually narrow anything — the UI uses this to
 * decide whether to show the result count and Clear affordance.
 */
export const isFilterActive = (f: JournalFilter): boolean =>
  Boolean((f.text ?? "").trim() || f.type || f.category || f.from || f.to);

/** Does one transaction survive the filter? Exported so the UI can pin special rows. */
export const matchesFilter = (t: Transaction, f: JournalFilter): boolean => {
  if (f.type && t.type !== f.type) return false;
  if (f.category && t.category !== f.category) return false;
  if (f.from && t.date < f.from) return false;
  if (f.to && t.date > f.to) return false;

  const needle = (f.text ?? "").trim().toLowerCase();
  if (needle) {
    // Search what the ledger row shows: the note, the category's human label
    // (falling back to the raw id for legacy categories we no longer know),
    // and for saving rows the "Goal contribution" display fallback.
    const label = CATEGORY_LABELS.get(t.category) ?? t.category.toLowerCase();
    const matched =
      t.note.toLowerCase().includes(needle) ||
      label.includes(needle) ||
      (t.type === "saving" && SAVING_LABEL_LOWER.includes(needle));
    if (!matched) return false;
  }
  return true;
};

/** Filter a list of transactions; preserves order, never mutates. */
export const filterTransactions = (txs: Transaction[], f: JournalFilter): Transaction[] =>
  txs.filter((t) => matchesFilter(t, f));
