import { afterEach, describe, expect, it, vi } from "vitest";
import { fmt, fmtK, monthKey, msUntilNextDay, shortDate, toLocalISO, todayISO } from "./format";

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

describe("msUntilNextDay — when the garden's 'today' turns over", () => {
  // The result must land EXACTLY on the first instant of the next local
  // day, whatever the clock and timezone: one millisecond earlier is still
  // today, the landing point is tomorrow. (That instant is usually 00:00 —
  // but not where a DST jump skips midnight itself; see Santiago below.)
  const landsOnNextMidnight = (now: Date) => {
    const at = now.getTime() + msUntilNextDay(now);
    const tomorrow = toLocalISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    expect(todayISO(new Date(at - 1))).toBe(todayISO(now));
    expect(todayISO(new Date(at))).toBe(tomorrow);
  };

  it("counts down to the next local midnight", () => {
    const evening = new Date(2026, 9, 17, 23, 59, 30);
    expect(msUntilNextDay(evening)).toBe(30_000);
    expect(new Date(evening.getTime() + msUntilNextDay(evening)).getHours()).toBe(0);
    landsOnNextMidnight(evening);
  });

  it("counts a whole day from exactly midnight (never 0 — that would loop)", () => {
    const midnight = new Date(2026, 9, 17, 0, 0, 0, 0);
    expect(msUntilNextDay(midnight)).toBe(new Date(2026, 9, 18).getTime() - midnight.getTime());
    expect(msUntilNextDay(midnight)).toBeGreaterThan(0);
  });

  it("rolls over month and year ends", () => {
    landsOnNextMidnight(new Date(2026, 9, 31, 18, 0)); // Oct 31 → Nov 1
    landsOnNextMidnight(new Date(2026, 11, 31, 12, 0)); // Dec 31 → Jan 1
    landsOnNextMidnight(new Date(2028, 1, 28, 9, 0)); // Feb 28 → 29 (leap year)
  });

  describe("daylight-saving days (real zones)", () => {
    // vi.stubEnv sets process.env.TZ for these tests only (like
    // unittest.mock.patch.dict(os.environ)); Node re-reads TZ on change.
    afterEach(() => { vi.unstubAllEnvs(); });

    it("spring-forward day is 23 hours long (New York, Mar 8 2026)", () => {
      vi.stubEnv("TZ", "America/New_York");
      const dayStart = new Date(2026, 2, 8, 0, 0);
      expect(msUntilNextDay(dayStart)).toBe(23 * 3_600_000);
      landsOnNextMidnight(new Date(2026, 2, 8, 12, 0));
    });

    it("fall-back day is 25 hours long (London, Oct 25 2026)", () => {
      vi.stubEnv("TZ", "Europe/London");
      const dayStart = new Date(2026, 9, 25, 0, 0);
      expect(msUntilNextDay(dayStart)).toBe(25 * 3_600_000);
      landsOnNextMidnight(new Date(2026, 9, 25, 12, 0));
    });

    it("a zone whose clocks skip midnight itself still lands on the next day (Santiago, Sep 6 2026)", () => {
      // Chile springs forward AT midnight: 00:00 Sep 6 doesn't exist, the
      // day starts at 01:00. The next day still turns over at its midnight.
      vi.stubEnv("TZ", "America/Santiago");
      const lateSat = new Date(2026, 8, 5, 22, 0);
      landsOnNextMidnight(lateSat);
      expect(new Date(lateSat.getTime() + msUntilNextDay(lateSat)).getHours()).toBe(1); // the skipped hour
      expect(msUntilNextDay(lateSat)).toBe(2 * 3_600_000); // 22:00 → 01:00 is two real hours
      landsOnNextMidnight(new Date(2026, 8, 6, 12, 0));
    });
  });
});
