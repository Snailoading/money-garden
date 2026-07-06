import { describe, expect, it } from "vitest";
import type { Commitment } from "./types";
import { clampDay, commitmentEnded, daysUntil, deriveCommitments, nextDueDate } from "./commitments";

// Commitment date math is entirely local-time, so fixed local dates are
// deterministic in any timezone. Noon avoids any midnight edge.
const june15 = new Date(2026, 5, 15, 12);

const sub = (over: Partial<Commitment> = {}): Commitment => ({
  id: "s1", kind: "sub", name: "Streaming", amount: 12, cadence: "monthly",
  payDay: 12, payMonth: 1, endDate: "", category: "subs", ...over,
});
const inst = (over: Partial<Commitment> = {}): Commitment => ({
  id: "i1", kind: "inst", name: "Tax bill", amount: 240, cadence: "monthly",
  payDay: 20, payMonth: 1, totalPayments: 6, paidCount: 2, category: "other", ...over,
});

describe("clampDay", () => {
  it("clamps day 31 to short months", () => {
    expect(clampDay(2026, 1, 31)).toBe(28); // Feb 2026 (not a leap year)
    expect(clampDay(2024, 1, 31)).toBe(29); // Feb 2024 (leap year)
    expect(clampDay(2026, 3, 31)).toBe(30); // April
    expect(clampDay(2026, 0, 31)).toBe(31); // January keeps 31
  });

  it("defaults invalid days to 1 and floors at 1", () => {
    expect(clampDay(2026, 5, undefined)).toBe(1);
    expect(clampDay(2026, 5, 0)).toBe(1);
    expect(clampDay(2026, 5, -3)).toBe(1);
  });
});

describe("nextDueDate — monthly", () => {
  it("stays in the current month when the pay day is still ahead", () => {
    const due = nextDueDate(sub({ payDay: 20 }), june15);
    expect([due.getFullYear(), due.getMonth(), due.getDate()]).toEqual([2026, 5, 20]);
  });

  it("keeps a charge due today as today (strict < comparison)", () => {
    const due = nextDueDate(sub({ payDay: 15 }), june15);
    expect(due.getDate()).toBe(15);
    expect(daysUntil(due, june15)).toBe(0);
  });

  it("rolls to next month once the day has passed", () => {
    const due = nextDueDate(sub({ payDay: 10 }), june15);
    expect([due.getMonth(), due.getDate()]).toEqual([6, 10]); // July 10
  });

  it("rolls December into January of the next year", () => {
    const due = nextDueDate(sub({ payDay: 5 }), new Date(2026, 11, 20, 12));
    expect([due.getFullYear(), due.getMonth(), due.getDate()]).toEqual([2027, 0, 5]);
  });

  it("clamps pay day 31 in short months, including after rollover", () => {
    // In February, day 31 bills on the 28th (2026).
    const feb = nextDueDate(sub({ payDay: 31 }), new Date(2026, 1, 10, 12));
    expect([feb.getMonth(), feb.getDate()]).toEqual([1, 28]);
    // On Apr 30 the clamped day-31 charge is due *today*, not rolled to May.
    const apr = nextDueDate(sub({ payDay: 31 }), new Date(2026, 3, 30, 23));
    expect([apr.getMonth(), apr.getDate()]).toEqual([3, 30]);
    // But on May 1 it has passed → next due is May 31, where 31 exists again.
    const may = nextDueDate(sub({ payDay: 31 }), new Date(2026, 4, 1, 12));
    expect([may.getMonth(), may.getDate()]).toEqual([4, 31]);
    // Jan 31 → not passed on Jan 15.
    const jan = nextDueDate(sub({ payDay: 31 }), new Date(2026, 0, 15, 12));
    expect([jan.getMonth(), jan.getDate()]).toEqual([0, 31]);
  });
});

describe("nextDueDate — annual", () => {
  it("uses payMonth within the current year when still ahead", () => {
    const due = nextDueDate(sub({ cadence: "annual", payMonth: 9, payDay: 15 }), june15);
    expect([due.getFullYear(), due.getMonth(), due.getDate()]).toEqual([2026, 8, 15]);
  });

  it("rolls across the year boundary once the date has passed", () => {
    const due = nextDueDate(sub({ cadence: "annual", payMonth: 1, payDay: 15 }), new Date(2026, 11, 20, 12));
    expect([due.getFullYear(), due.getMonth(), due.getDate()]).toEqual([2027, 0, 15]);
  });

  it("clamps day 31 in February for annual cadence", () => {
    const due = nextDueDate(sub({ cadence: "annual", payMonth: 2, payDay: 31 }), new Date(2026, 0, 10, 12));
    expect([due.getFullYear(), due.getMonth(), due.getDate()]).toEqual([2026, 1, 28]);
  });

  it("defaults a missing payMonth to January", () => {
    const due = nextDueDate(sub({ cadence: "annual", payMonth: 0, payDay: 10 }), june15);
    expect([due.getFullYear(), due.getMonth(), due.getDate()]).toEqual([2027, 0, 10]);
  });
});

describe("commitmentEnded", () => {
  it("ends an installment when all payments are made", () => {
    expect(commitmentEnded(inst({ totalPayments: 6, paidCount: 6 }), june15)).toBe(true);
    expect(commitmentEnded(inst({ totalPayments: 6, paidCount: 5 }), june15)).toBe(false);
    // Reference: missing totalPayments defaults to 1.
    expect(commitmentEnded(inst({ totalPayments: undefined, paidCount: 1 }), june15)).toBe(true);
    expect(commitmentEnded(inst({ totalPayments: undefined, paidCount: 0 }), june15)).toBe(false);
  });

  it("keeps open-ended subscriptions alive", () => {
    expect(commitmentEnded(sub({ endDate: "" }), june15)).toBe(false);
  });

  it("ends a subscription only after the next due date passes endDate (end of day)", () => {
    // Next due July 12; endDate July 12 still counts (parsed as 23:59:59).
    expect(commitmentEnded(sub({ payDay: 12, endDate: "2026-07-12" }), june15)).toBe(false);
    expect(commitmentEnded(sub({ payDay: 12, endDate: "2026-07-11" }), june15)).toBe(true);
  });
});

describe("daysUntil", () => {
  it("counts whole days from local midnight", () => {
    expect(daysUntil(new Date(2026, 5, 18), june15)).toBe(3);
    expect(daysUntil(new Date(2026, 5, 15), june15)).toBe(0);
    expect(daysUntil(new Date(2026, 5, 14), june15)).toBe(-1);
  });
});

describe("deriveCommitments", () => {
  it("filters ended commitments out of active", () => {
    const done = inst({ id: "done", totalPayments: 2, paidCount: 2 });
    const d = deriveCommitments([sub(), done], june15);
    expect(d.all).toHaveLength(2);
    expect(d.active.map((c) => c.id)).toEqual(["s1"]);
  });

  it("normalizes annual subscriptions to a monthly drain", () => {
    const d = deriveCommitments(
      [sub({ id: "m", amount: 10 }), sub({ id: "a", amount: 120, cadence: "annual", payMonth: 11 })],
      june15,
    );
    expect(d.subsMonthly).toBeCloseTo(20); // 10 + 120/12
  });

  it("normalizes annual installments to a monthly drain, like subscriptions", () => {
    // The UI only creates monthly installments; this guards hand-edited or
    // imported data (the reference counted annual ones at full face value).
    const d = deriveCommitments(
      [inst({ id: "m", amount: 240 }), inst({ id: "a", amount: 1200, cadence: "annual", payMonth: 11 })],
      june15,
    );
    expect(d.instMonthly).toBe(340); // 240 + 1200/12
  });

  it("lists dueSoon (≤14 days) sorted soonest first", () => {
    const d = deriveCommitments(
      [
        sub({ id: "far", payDay: 14 }),   // due July 14 → 29 days, excluded
        sub({ id: "soon", payDay: 20 }),  // due June 20 → 5 days
        sub({ id: "today", payDay: 15 }), // due today → 0 days
      ],
      june15,
    );
    expect(d.dueSoon.map((x) => x.c.id)).toEqual(["today", "soon"]);
    expect(d.dueSoon.map((x) => x.days)).toEqual([0, 5]);
  });
});
