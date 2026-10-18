import { describe, expect, it } from "vitest";
import type { Commitment, Transaction } from "./types";
import { clampDay, commitmentEnded, daysUntil, deriveCommitments, monthlyCost, nextDueDate, nextDueWithPayments } from "./commitments";

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

describe("nextDueWithPayments", () => {
  const pay = (id: string, date: string): Transaction =>
    ({ id: `p-${date}`, type: "expense", amount: 12, category: "subs", note: "", date, commitmentId: id });

  it("advances a monthly due date once its payment is logged", () => {
    const c = sub({ payDay: 20 }); // due June 20 as of June 15
    const due = nextDueWithPayments(c, [pay("s1", "2026-06-18")], june15);
    expect([due.getMonth(), due.getDate()]).toEqual([6, 20]); // July 20
  });

  it("counts a payment made a few days early, even across a month boundary", () => {
    const c = sub({ payDay: 2 });
    const nowLateJune = new Date(2026, 5, 25, 12); // due July 2
    const due = nextDueWithPayments(c, [pay("s1", "2026-06-28")], nowLateJune);
    expect([due.getMonth(), due.getDate()]).toEqual([7, 2]); // August 2
  });

  it("ignores unlinked payments, other commitments' payments, and stale ones", () => {
    const c = sub({ payDay: 20 });
    const unlinked: Transaction = { id: "x", type: "expense", amount: 12, category: "subs", note: "", date: "2026-06-18" };
    expect(nextDueWithPayments(c, [unlinked], june15).getMonth()).toBe(5); // still June
    expect(nextDueWithPayments(c, [pay("other", "2026-06-18")], june15).getMonth()).toBe(5);
    expect(nextDueWithPayments(c, [pay("s1", "2026-05-20")], june15).getMonth()).toBe(5); // last cycle's
  });

  it("a past cycle's payment never covers a later cycle (June's payment, seen in mid-July)", () => {
    const c = sub({ payDay: 12 });
    const paidJune = pay("s1", "2026-06-12");
    // On June 15 the June payment has been made → July 12.
    expect(nextDueWithPayments(c, [paidJune], june15).getMonth()).toBe(6);
    // A month later, that old payment must not also cover July.
    const july15 = new Date(2026, 6, 15, 12);
    expect(nextDueWithPayments(c, [paidJune], july15).getMonth()).toBe(7); // Aug (July unpaid, rolled naturally)
  });

  it("monthly window: up to 14 days early counts; 15 days early was last cycle's", () => {
    // Due June 20 (as of June 15). Window = (due − 15, due]: June 6 … June 20.
    const c = sub({ payDay: 20 });
    const at = (date: string) => { const d = nextDueWithPayments(c, [pay("s1", date)], june15); return [d.getMonth(), d.getDate()]; };
    expect(at("2026-06-06")).toEqual([6, 20]); // 14 days early → paid → July 20
    expect(at("2026-06-05")).toEqual([5, 20]); // 15 days early → not this cycle → June 20
    expect(at("2026-06-20")).toEqual([6, 20]); // on the due date itself → paid
  });

  it("one payment advances exactly one cycle, then lets go (never double-advances)", () => {
    const c = sub({ payDay: 20 });
    const paid = [pay("s1", "2026-06-18")];
    // Control: without the payment, June 15 shows June 20 — so the payment matters here.
    expect(nextDueWithPayments(c, [], june15).getMonth()).toBe(5);
    // June 15, paid June 18 → July 20 (one cycle, not two).
    const june = nextDueWithPayments(c, paid, june15);
    expect([june.getMonth(), june.getDate()]).toEqual([6, 20]);
    // After June 20 passes, the date stays July 20 — the June payment
    // must not also count for July (that would show August 20).
    for (const day of [new Date(2026, 5, 21, 12), new Date(2026, 6, 15, 12)]) {
      const d = nextDueWithPayments(c, paid, day);
      expect([d.getMonth(), d.getDate()]).toEqual([6, 20]);
    }
  });

  it("advances an annual renewal a full year when paid (31-day window)", () => {
    const c = sub({ cadence: "annual", payMonth: 7, payDay: 1 }); // due July 1, 2026
    const due = nextDueWithPayments(c, [pay("s1", "2026-06-20")], june15);
    expect([due.getFullYear(), due.getMonth(), due.getDate()]).toEqual([2027, 6, 1]);
  });

  it("annual window: up to 30 days early counts; 31 days early doesn't", () => {
    // Due July 1, 2026 (as of June 15). Window = (due − 31, due]: June 1 … July 1.
    const c = sub({ cadence: "annual", payMonth: 7, payDay: 1 });
    const year = (date: string) => nextDueWithPayments(c, [pay("s1", date)], june15).getFullYear();
    expect(year("2026-06-01")).toBe(2027); // 30 days early → paid
    expect(year("2026-05-31")).toBe(2026); // 31 days early → not this renewal
  });

  it("clamps the advanced date in short months (day 31 → Feb 28)", () => {
    const c = sub({ payDay: 31 });
    const nowJan = new Date(2026, 0, 15, 12); // due Jan 31
    const due = nextDueWithPayments(c, [pay("s1", "2026-01-30")], nowJan);
    expect([due.getMonth(), due.getDate()]).toEqual([1, 28]); // Feb 28
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

describe("nextDueDate — fortnight", () => {
  const fort = (over: Partial<Commitment> = {}) =>
    sub({ cadence: "fortnight", anchorDate: "2026-06-05", payDay: 5, ...over });

  it("steps 14 days from the anchor to the first date ≥ today", () => {
    const due = nextDueDate(fort(), june15); // anchor Jun 5 → Jun 19
    expect([due.getMonth(), due.getDate()]).toEqual([5, 19]);
    expect(daysUntil(due, june15)).toBe(4);
  });

  it("keeps a payment due today as today (anchor exactly N cycles back)", () => {
    const due = nextDueDate(fort({ anchorDate: "2026-06-01" }), june15); // 14 days ago
    expect([due.getMonth(), due.getDate()]).toEqual([5, 15]);
    expect(daysUntil(due, june15)).toBe(0);
  });

  it("a future anchor is itself the next due date", () => {
    const due = nextDueDate(fort({ anchorDate: "2026-06-20" }), june15);
    expect([due.getMonth(), due.getDate()]).toEqual([5, 20]);
  });

  it("preserves the anchor's weekday across long spans and year boundaries", () => {
    const due = nextDueDate(fort({ anchorDate: "2025-01-03" }), june15); // a Friday, ~17 months back
    expect(due.getDay()).toBe(5); // still a Friday
    expect(daysUntil(due, june15)).toBeGreaterThanOrEqual(0);
    expect(daysUntil(due, june15)).toBeLessThan(14);
  });

  it("falls back to today when the anchor is missing (defensive)", () => {
    const due = nextDueDate(fort({ anchorDate: undefined }), june15);
    expect(daysUntil(due, june15)).toBe(0);
  });
});

describe("nextDueWithPayments — fortnight", () => {
  const pay = (date: string): Transaction =>
    ({ id: `p-${date}`, type: "expense", amount: 12, category: "subs", note: "", date, commitmentId: "s1" });
  const fort = (over: Partial<Commitment> = {}) =>
    sub({ cadence: "fortnight", anchorDate: "2026-06-05", payDay: 5, ...over });

  it("advances exactly one 14-day cycle when paid within the 7-day window", () => {
    // due Jun 19; window (due − 8, due] = (Jun 11, Jun 19], i.e. Jun 12 … Jun 19
    const due = nextDueWithPayments(fort(), [pay("2026-06-13")], june15);
    expect([due.getMonth(), due.getDate()]).toEqual([6, 3]); // Jul 3
  });

  it("a payment on the due date itself counts", () => {
    const due = nextDueWithPayments(fort(), [pay("2026-06-19")], june15);
    expect([due.getMonth(), due.getDate()]).toEqual([6, 3]);
  });

  it("counts a payment exactly 7 days early (the window's first day)", () => {
    const due = nextDueWithPayments(fort(), [pay("2026-06-12")], june15);
    expect([due.getMonth(), due.getDate()]).toEqual([6, 3]); // Jul 3
  });

  it("ignores a payment older than half a cycle — that was last fortnight's", () => {
    const due = nextDueWithPayments(fort(), [pay("2026-06-11")], june15);
    expect([due.getMonth(), due.getDate()]).toEqual([5, 19]); // still Jun 19
  });

  it("never double-advances into the cycle after next", () => {
    const paid = pay("2026-06-18");
    // Jun 15: this cycle paid → Jul 3.
    expect(nextDueWithPayments(fort(), [paid], june15).getDate()).toBe(3);
    // Jul 1 (next cycle window): the old payment must not cover Jul 3 too.
    const jul1 = new Date(2026, 6, 1, 12);
    expect(nextDueWithPayments(fort(), [paid], jul1).getDate()).toBe(3); // Jul 3, unpaid
    expect(nextDueWithPayments(fort(), [paid], jul1).getMonth()).toBe(6);
  });
});

describe("deriveCommitments — fortnight", () => {
  it("normalizes fortnightly subs at 26 payments a year (×26 ÷ 12)", () => {
    const d = deriveCommitments(
      [sub({ id: "m", amount: 10 }), sub({ id: "f", amount: 30, cadence: "fortnight", anchorDate: "2026-06-05" })],
      june15,
    );
    expect(d.subsMonthly).toBeCloseTo(10 + 65); // 30 × 26/12 = 65, not 60
  });

  it("shows fortnightly vines in dueSoon only within half a cycle (≤7 days)", () => {
    const d = deriveCommitments(
      [
        sub({ id: "near", cadence: "fortnight", anchorDate: "2026-06-05" }), // due Jun 19 → 4 days
        sub({ id: "far", cadence: "fortnight", anchorDate: "2026-06-13" }),  // due Jun 27 → 12 days: excluded
        sub({ id: "mo", payDay: 27 }),                                       // monthly, 12 days: included
      ],
      june15,
    );
    expect(d.dueSoon.map((x) => x.c.id)).toEqual(["near", "mo"]);
  });

  it("ends a fortnightly sub when the next due date passes endDate", () => {
    const c = sub({ id: "f", cadence: "fortnight", anchorDate: "2026-06-05", endDate: "2026-06-18" });
    expect(commitmentEnded(c, june15)).toBe(true); // next due Jun 19 > Jun 18
    const c2 = sub({ id: "f2", cadence: "fortnight", anchorDate: "2026-06-05", endDate: "2026-06-19" });
    expect(commitmentEnded(c2, june15)).toBe(false); // the final billing day still counts
  });
});

describe("verifier round — boundary and defensive fixes", () => {
  const pay = (date: string): Transaction =>
    ({ id: `p-${date}`, type: "expense", amount: 12, category: "subs", note: "", date, commitmentId: "s1" });
  const fort = (over: Partial<Commitment> = {}) =>
    sub({ cadence: "fortnight", anchorDate: "2026-06-05", payDay: 5, ...over });

  it("a payment logged the day the strip first invites it (due−7) counts", () => {
    // due Jun 19; on Jun 12 the vine enters dueSoon (7d) — the strip is the
    // invitation to hit the row's Log-payment button, and that payment must
    // advance the date, or a second tap double-logs. Window is strip + 1
    // day, mirroring monthly's 15 vs 14.
    const jun12 = new Date(2026, 5, 12, 12);
    const d = deriveCommitments([fort()], jun12);
    expect(d.dueSoon.map((x) => x.c.id)).toEqual(["s1"]); // invited today
    const due = nextDueWithPayments(fort(), [pay("2026-06-12")], jun12);
    expect([due.getMonth(), due.getDate()]).toEqual([6, 3]); // advanced to Jul 3
  });

  it("an unparseable anchor degrades to today, never NaN", () => {
    const due = nextDueDate(fort({ anchorDate: "garbage" }), june15);
    expect(isNaN(due.getTime())).toBe(false);
    expect(daysUntil(due, june15)).toBe(0);
  });

  it("normalizes fortnightly installments too (defensive, via monthlyCost)", () => {
    const d = deriveCommitments([inst({ cadence: "fortnight", anchorDate: "2026-06-05", amount: 60 })], june15);
    expect(d.instMonthly).toBeCloseTo(130); // 60 × 26/12
  });
});

describe("monthlyCost — every cadence normalized to one month", () => {
  it("monthly is the amount, annual a twelfth, fortnightly 26 payments a year ÷ 12", () => {
    expect(monthlyCost(sub({ amount: 12 }))).toBe(12);
    expect(monthlyCost(sub({ amount: 120, cadence: "annual" }))).toBe(10);
    expect(monthlyCost(sub({ amount: 30, cadence: "fortnight", anchorDate: "2026-06-05" }))).toBe(65); // 30 × 26 ÷ 12
    expect(monthlyCost(inst({ amount: 240 }))).toBe(240);
  });

  it("treats a missing or junk amount as 0 (imports are deliberately loose)", () => {
    expect(monthlyCost(sub({ amount: NaN }))).toBe(0);
    expect(monthlyCost(sub({ amount: "" as unknown as number }))).toBe(0);
    expect(monthlyCost(sub({ amount: undefined as unknown as number, cadence: "annual" }))).toBe(0);
  });
});
