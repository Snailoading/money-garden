import { describe, expect, it } from "vitest";
import { fmt, fmtK, monthKey, shortDate, toLocalISO, todayISO } from "./format";

describe("local calendar dates (timezone fix)", () => {
  it("stamps just-after-midnight with the local date, not UTC's", () => {
    // Under the reference's toISOString() convention, 00:30 on July 1 in a
    // UTC+8 timezone was stamped "2026-06-30" — the wrong day AND month.
    const justPastMidnight = new Date(2026, 6, 1, 0, 30);
    expect(todayISO(justPastMidnight)).toBe("2026-07-01");
    expect(monthKey(justPastMidnight)).toBe("2026-07");
  });

  it("stamps just-before-midnight with the same local date", () => {
    const lateNight = new Date(2026, 6, 1, 23, 59);
    expect(todayISO(lateNight)).toBe("2026-07-01");
  });

  it("zero-pads months and days", () => {
    expect(toLocalISO(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toLocalISO(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});

describe("display formatting", () => {
  it("shows cents under $1,000 and whole dollars above", () => {
    expect(fmt(12.5)).toBe("$12.50");
    expect(fmt(999.99)).toBe("$999.99");
    expect(fmt(8060)).toBe("$8,060");
  });

  it("compacts axis labels", () => {
    expect(fmtK(980)).toBe("$980");
    expect(fmtK(14200)).toBe("$14k");
    expect(fmtK(1_250_000)).toBe("$1.3M");
  });

  it("renders short local dates", () => {
    expect(shortDate(new Date(2026, 8, 15))).toBe("Sep 15");
  });
});
