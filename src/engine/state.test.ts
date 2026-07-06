import { describe, expect, it } from "vitest";
import { CATEGORIES, DEFAULT_INVEST } from "./types";
import { bumpStreak, deserialize, emptyState, migrate, sampleState, serialize } from "./state";
import { todayISO } from "./format";

describe("emptyState", () => {
  it("seeds default budgets for every category and nothing else", () => {
    const s = emptyState();
    expect(Object.keys(s.budgets)).toHaveLength(CATEGORIES.length);
    expect(s.budgets.housing).toBe(1400);
    expect(s.transactions).toEqual([]);
    expect(s.invest).toEqual(DEFAULT_INVEST);
    expect(s.invest).not.toBe(DEFAULT_INVEST); // must be a copy, not the shared object
    expect(s.streak).toEqual({ count: 0, lastDate: null });
  });
});

describe("sampleState", () => {
  it("clamps sample transaction dates to today within the current month", () => {
    const now = new Date(2026, 5, 4, 12); // June 4 — most sample days are later
    const s = sampleState(now);
    const maxDate = "2026-06-04"; // local calendar
    for (const t of s.transactions) {
      expect(t.date <= maxDate).toBe(true); // ISO strings compare chronologically
    }
    expect(s.streak.lastDate).toBe(todayISO(now));
  });

  it("generates unique ids", () => {
    const s = sampleState(new Date(2026, 5, 15, 12));
    const ids = [...s.transactions, ...s.goals, ...s.commitments, ...s.invest.holdings].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("migrate", () => {
  it("fills missing invest keys from defaults without clobbering saved ones", () => {
    const migrated = migrate({ income: 100, invest: { monthly: 250 } });
    expect(migrated.invest.monthly).toBe(250);
    expect(migrated.invest.ret).toBe(7);
    expect(migrated.invest.retireSpend).toBe(0);
  });

  it("defaults commitments to [] for pre-commitments saves", () => {
    expect(migrate({ income: 100 }).commitments).toEqual([]);
  });

  it("never drops unknown fields (forward compatibility)", () => {
    const migrated = migrate({ income: 1, futureFeature: { a: 1 }, invest: { monthly: 5, futureKnob: true } });
    expect((migrated as unknown as Record<string, unknown>).futureFeature).toEqual({ a: 1 });
    expect((migrated.invest as unknown as Record<string, unknown>).futureKnob).toBe(true);
  });
});

describe("serialize / deserialize", () => {
  it("round-trips a full state including unknown fields", () => {
    const s = { ...sampleState(new Date(2026, 5, 15, 12)), extra: "keep me" };
    const back = deserialize(serialize(s as unknown as Parameters<typeof serialize>[0]));
    expect(back).toEqual(s);
  });

  it("throws on invalid JSON so callers can fall back to a fresh state", () => {
    expect(() => deserialize("not json")).toThrow();
  });
});

describe("bumpStreak", () => {
  const now = new Date(2026, 5, 15, 12);
  const today = todayISO(now); // "2026-06-15", local calendar
  const yesterday = "2026-06-14";

  it("is a no-op when already logged today", () => {
    const streak = { count: 4, lastDate: today };
    expect(bumpStreak(streak, now)).toBe(streak);
  });

  it("increments a consecutive-day streak", () => {
    expect(bumpStreak({ count: 4, lastDate: yesterday }, now)).toEqual({ count: 5, lastDate: today });
  });

  it("resets to 1 after a gap or on the first ever log", () => {
    expect(bumpStreak({ count: 9, lastDate: "2026-06-01" }, now)).toEqual({ count: 1, lastDate: today });
    expect(bumpStreak({ count: 0, lastDate: null }, now)).toEqual({ count: 1, lastDate: today });
  });
});
