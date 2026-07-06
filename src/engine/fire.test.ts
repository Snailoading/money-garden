import { describe, expect, it } from "vitest";
import type { Invest } from "./types";
import { deriveFire } from "./fire";

const invest = (over: Partial<Invest> = {}): Invest => ({
  holdings: [], monthly: 0, ret: 7, age: 30, retireAge: 65, wr: 4, retireSpend: 0, ...over,
});
const holdings = (...values: number[]) =>
  values.map((value, i) => ({ id: `h${i}`, name: `Holding ${i}`, value }));

describe("FIRE number", () => {
  it("is annual spending × (100 / withdrawal rate) — ×25 at the default 4%", () => {
    const f = deriveFire(invest({ retireSpend: 1000 }), 0);
    expect(f.annualExpenses).toBe(12000);
    expect(f.fireNumber).toBe(300000);
  });

  it("uses retireSpend when set, spending pace otherwise", () => {
    expect(deriveFire(invest({ retireSpend: 2000 }), 999).fiMonthlySpend).toBe(2000);
    expect(deriveFire(invest({ retireSpend: 2000 }), 999).spendBasis).toBe("custom");
    expect(deriveFire(invest(), 1500).fiMonthlySpend).toBe(1500);
    expect(deriveFire(invest(), 1500).spendBasis).toBe("auto");
  });

  it("clamps the withdrawal rate to [2, 10] and defaults 0 to 4", () => {
    expect(deriveFire(invest({ retireSpend: 1000, wr: 1 }), 0).fireNumber).toBe(600000);  // wr → 2 → ×50
    expect(deriveFire(invest({ retireSpend: 1000, wr: 20 }), 0).fireNumber).toBe(120000); // wr → 10 → ×10
    // Reference quirk: `Number(wr) || 4` turns wr=0 into the default 4, not the clamp floor 2.
    expect(deriveFire(invest({ retireSpend: 1000, wr: 0 }), 0).fireNumber).toBe(300000);
  });

  it("is 0 when there is no spending at all", () => {
    const f = deriveFire(invest(), 0);
    expect(f.fireNumber).toBe(0);
    expect(f.yearsToFI).toBeNull();
    expect(f.progress).toBe(0);
    expect(f.coastNumber).toBe(0);
    expect(f.coastReached).toBe(false);
  });
});

describe("input clamps", () => {
  it("clamps return to [0, 15] and the band to the same range", () => {
    const high = deriveFire(invest({ ret: 20 }), 1000);
    expect(high.ret).toBe(15);
    expect(high.retLo).toBe(13);
    expect(high.retHi).toBe(15); // capped
    const low = deriveFire(invest({ ret: 1 }), 1000);
    expect(low.retLo).toBe(0); // floored
    expect(low.retHi).toBe(3);
  });

  it("clamps age to [14, 100] and retireAge to [age, 100]", () => {
    const f = deriveFire(invest({ age: 5, retireAge: 3 }), 1000);
    expect(f.age).toBe(14);
    expect(f.retireAge).toBe(14);
  });
});

describe("years to FI (month-by-month simulation)", () => {
  it("returns 0 when the portfolio already exceeds the FIRE number", () => {
    const f = deriveFire(invest({ retireSpend: 1000, holdings: holdings(350000) }), 0);
    expect(f.yearsToFI).toBe(0);
    expect(f.progress).toBe(1);
  });

  it("counts contribution-only months exactly at 0% return", () => {
    // $300k target at $1,000/month with zero growth = 300 months = 25 years.
    const f = deriveFire(invest({ retireSpend: 1000, ret: 0, monthly: 1000 }), 0);
    expect(f.yearsToFI).toBe(25);
  });

  it("rounds partial years up (ceil)", () => {
    // $1,500 target at $100/month, 0% → 15 months → 2 years.
    const f = deriveFire(invest({ retireSpend: 5, ret: 0, monthly: 100 }), 0);
    expect(f.yearsToFI).toBe(2);
  });

  it("returns null past the 720-month (60-year) cap", () => {
    const f = deriveFire(invest({ retireSpend: 1000, ret: 0, monthly: 0, holdings: holdings(100) }), 0);
    expect(f.yearsToFI).toBeNull();
    expect(f.yearsToFIEarly).toBeNull();
    expect(f.yearsToFILate).toBeNull();
  });

  it("orders the ±2% band: kinder markets arrive earlier, slower later", () => {
    const f = deriveFire(invest({ retireSpend: 1000, ret: 7, monthly: 500, holdings: holdings(10000) }), 0);
    expect(f.yearsToFI).not.toBeNull();
    expect(f.yearsToFIEarly!).toBeLessThanOrEqual(f.yearsToFI!);
    expect(f.yearsToFILate!).toBeGreaterThanOrEqual(f.yearsToFI!);
  });
});

describe("projection curve", () => {
  it("compounds monthly with end-of-month contributions (annuity-immediate)", () => {
    // 12% annual → 1%/month. $100/month from $0 for 12 months:
    // 100 × ((1.01^12 − 1) / 0.01) = 1268.25 → rounded 1268.
    // (Beginning-of-month timing would give 1281 — this pins the reference's order.)
    const f = deriveFire(invest({ ret: 12, monthly: 100 }), 1000);
    expect(f.curve[1].value).toBe(1268);
  });

  it("compounds an untouched portfolio monthly, not annually", () => {
    // $10,000 at 1%/month for a year = 10000 × 1.01^12 = 11268.25 → 11268
    // (annual compounding would give exactly 11200).
    const f = deriveFire(invest({ ret: 12, monthly: 0, holdings: holdings(10000) }), 1000);
    expect(f.curve[1].value).toBe(11268);
  });

  it("starts at the portfolio value with ages attached", () => {
    const f = deriveFire(invest({ age: 29, holdings: holdings(14200, 9800) }), 1000);
    expect(f.portfolio).toBe(24000);
    expect(f.curve[0]).toMatchObject({ age: 29, value: 24000 });
    expect(f.curve[1].age).toBe(30);
  });

  it("bounds the horizon to [10, 45] years, +4 past the slow-market FI year", () => {
    // Unreachable target → basis 36 → horizon 40 → 41 points (year 0 included).
    const unreachable = deriveFire(invest({ retireSpend: 1000, ret: 0, monthly: 0, holdings: holdings(100) }), 0);
    expect(unreachable.curve).toHaveLength(41);
    // Already-FI → basis 0 → max(4, 10) = 10 → 11 points.
    const done = deriveFire(invest({ retireSpend: 1000, holdings: holdings(400000) }), 0);
    expect(done.curve).toHaveLength(11);
  });

  it("carries the [slow, kind] band on every point, bracketing the base value", () => {
    const f = deriveFire(invest({ retireSpend: 1000, ret: 7, monthly: 500, holdings: holdings(10000) }), 0);
    for (const p of f.curve.slice(1)) {
      expect(p.band[0]).toBeLessThanOrEqual(p.value);
      expect(p.band[1]).toBeGreaterThanOrEqual(p.value);
    }
  });
});

describe("Coast FIRE (annual compounding — reference behavior, flagged)", () => {
  it("discounts the FIRE number back to today at the annual rate", () => {
    const f = deriveFire(invest({ retireSpend: 1000, ret: 7, age: 30, retireAge: 65 }), 0);
    expect(f.coastNumber).toBeCloseTo(300000 / Math.pow(1.07, 35), 6);
  });

  it("flags coastReached when today's portfolio compounds past the target by retireAge", () => {
    const base = { retireSpend: 1000, ret: 7, age: 30, retireAge: 65 };
    // 30000 × 1.07^35 ≈ 320k ≥ 300k; 20000 × 1.07^35 ≈ 213k < 300k.
    expect(deriveFire(invest({ ...base, holdings: holdings(30000) }), 0).coastReached).toBe(true);
    expect(deriveFire(invest({ ...base, holdings: holdings(20000) }), 0).coastReached).toBe(false);
  });

  it("treats retiring at the current age as no compounding runway", () => {
    const f = deriveFire(invest({ retireSpend: 1000, age: 65, retireAge: 65, holdings: holdings(299999) }), 0);
    expect(f.coastNumber).toBe(300000);
    expect(f.coastReached).toBe(false);
  });
});

describe("holdings handling", () => {
  it("treats missing/invalid holding values as 0 and missing invest as defaults", () => {
    const f = deriveFire(
      invest({ holdings: [{ id: "x", name: "Bad", value: Number.NaN }, ...holdings(500)] }),
      1000,
    );
    expect(f.portfolio).toBe(500);
    const none = deriveFire(undefined, 1000);
    expect(none.portfolio).toBe(0);
    expect(none.ret).toBe(7);
  });
});
