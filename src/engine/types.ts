/*
 * Domain types + constants for Money Garden.
 * Pure data — no React, no DOM. Everything here mirrors the persisted state
 * shape of reference/money-garden.html exactly (key "money-garden:state-v1").
 *
 * Python analogy: these interfaces are like frozen dataclasses used purely as
 * type hints — TypeScript erases them at runtime; only the const arrays below
 * exist in the built JS.
 */

export type CategoryId =
  | "housing"
  | "groceries"
  | "utilities"
  | "transport"
  | "health"
  | "dining"
  | "fun"
  | "shopping"
  | "subs"
  | "other";

export interface Category {
  id: CategoryId;
  label: string;
  emoji: string;
  /** need/want tag drives the 50/30/20 advice split. */
  kind: "need" | "want";
  /** Default monthly budget seeded into new states. */
  budget: number;
}

export type TransactionType = "expense" | "income" | "saving";

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  /** A CategoryId in practice, but old saved data must never be rejected. */
  category: string;
  note: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  /**
   * Set on goal-watering entries (since v0.5.0) so edits/deletes can adjust
   * the goal's balance. Absent on older entries and non-goal transactions —
   * those are never retro-linked by note text.
   */
  goalId?: string;
  /**
   * Set on commitment-payment entries (since v0.7.0): the next-due date is
   * derived from these (so deleting the payment reverts it), and deleting an
   * installment payment decrements its paidCount. Absent on older entries.
   */
  commitmentId?: string;
  /**
   * Set on orchard-watering entries (since v0.9.1) so edits/deletes can
   * adjust the holding's value. Absent on older entries — those are never
   * retro-linked by note text.
   */
  holdingId?: string;
}

export interface Goal {
  id: string;
  name: string;
  /** PlantKind id (cosmetic). */
  plant: string;
  target: number;
  saved: number;
  isEmergency: boolean;
}

export interface Holding {
  id: string;
  name: string;
  value: number;
}

export interface Invest {
  holdings: Holding[];
  /** Recurring monthly contribution (DCA). */
  monthly: number;
  /** Expected annual real return, percent (7 = 7%). */
  ret: number;
  /** Birth year (e.g. 1995) — age is DERIVED at computation time as
   * currentYear − birthYear, so it never goes stale. 0 = "not set"
   * sentinel → age defaults to 30 (replaces the stored `age` field;
   * migrate() converts old saves). */
  birthYear: number;
  retireAge: number;
  /** Withdrawal rate, percent (4 = the 4% rule). */
  wr: number;
  /** Planned retirement spending per month, today's dollars. 0 = use spending pace. */
  retireSpend: number;
}

export type CommitmentKind = "sub" | "inst";
export type Cadence = "monthly" | "annual";

export interface Commitment {
  id: string;
  kind: CommitmentKind;
  name: string;
  amount: number;
  cadence: Cadence;
  /** Day of month the payment lands, 1–31 (clamped to short months). */
  payDay: number;
  /** Month of year for annual cadence, 1–12. */
  payMonth: number;
  /** Subscriptions only: ISO date after which the vine is ended. "" = open-ended. */
  endDate?: string;
  /** Installments only. */
  totalPayments?: number;
  paidCount?: number;
  /** Category the payment is logged under. */
  category: string;
}

export interface Streak {
  count: number;
  /** ISO date of the last logging action, or null before the first one. */
  lastDate: string | null;
}

export interface State {
  /** Stated monthly income — overridden by logged income transactions (see stats.ts). */
  income: number;
  /** Map of category id → monthly budget. Like a plain dict[str, float]. */
  budgets: Record<string, number>;
  transactions: Transaction[];
  goals: Goal[];
  invest: Invest;
  commitments: Commitment[];
  streak: Streak;
}

export const CATEGORIES: Category[] = [
  { id: "housing",   label: "Housing",       emoji: "🏠", kind: "need", budget: 1400 },
  { id: "groceries", label: "Groceries",     emoji: "🥕", kind: "need", budget: 450 },
  { id: "utilities", label: "Utilities",     emoji: "💡", kind: "need", budget: 180 },
  { id: "transport", label: "Transport",     emoji: "🚌", kind: "need", budget: 160 },
  { id: "health",    label: "Health",        emoji: "🩺", kind: "need", budget: 120 },
  { id: "dining",    label: "Dining out",    emoji: "🍜", kind: "want", budget: 220 },
  { id: "fun",       label: "Fun & hobbies", emoji: "🎨", kind: "want", budget: 150 },
  { id: "shopping",  label: "Shopping",      emoji: "🛍️", kind: "want", budget: 180 },
  { id: "subs",      label: "Subscriptions", emoji: "📺", kind: "want", budget: 60 },
  { id: "other",     label: "Other",         emoji: "🌀", kind: "want", budget: 100 },
];

export interface PlantKind {
  id: string;
  label: string;
  /** Bloom color, used by the Plant SVG art. */
  bloom: string;
}

export const PLANT_KINDS: PlantKind[] = [
  { id: "sunflower", label: "Sunflower", bloom: "#F0B429" },
  { id: "tulip",     label: "Tulip",     bloom: "#E56A9A" },
  { id: "bluebell",  label: "Bluebell",  bloom: "#5B7FD4" },
  { id: "poppy",     label: "Poppy",     bloom: "#DE5D42" },
  { id: "lavender",  label: "Lavender",  bloom: "#9A7BD0" },
];

export const STORAGE_KEY = "money-garden:state-v1";

export const DEFAULT_INVEST: Invest = {
  holdings: [], monthly: 0, ret: 7, birthYear: 0, retireAge: 65, wr: 4, retireSpend: 0,
};
