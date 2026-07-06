import { describe, expect, it } from "vitest";
import type { State } from "./types";
import { buildBackup, parseBackup, SCHEMA_VERSION } from "./backup";
import { emptyState, sampleState } from "./state";

const june15 = new Date(2026, 5, 15, 12);

describe("buildBackup", () => {
  it("names the file with the local date", () => {
    expect(buildBackup(emptyState(), june15).filename).toBe("money-garden-backup-2026-06-15.json");
  });

  it("wraps the exact state in a versioned envelope, pretty-printed", () => {
    const s = sampleState(june15);
    const { json } = buildBackup(s, june15);
    const envelope = JSON.parse(json);
    expect(envelope.app).toBe("money-garden");
    expect(envelope.schema).toBe(SCHEMA_VERSION);
    expect(envelope.exportedAt).toBe("2026-06-15");
    expect(envelope.state).toEqual(s);
    expect(json).toContain("\n  "); // human-readable, not minified
  });
});

describe("parseBackup — round trip", () => {
  it("restores a backup exactly, including unknown/future fields", () => {
    const s = { ...sampleState(june15), futureFeature: { debts: [1, 2] } } as unknown as State;
    const result = parseBackup(buildBackup(s, june15).json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.state).toEqual(s);
    expect(result.preview.exportedAt).toBe("2026-06-15");
    expect(result.preview.counts).toEqual({ transactions: 10, goals: 3, commitments: 4, holdings: 2 });
  });

  it("accepts a bare state dump (hand-copied localStorage value)", () => {
    const s = sampleState(june15);
    const result = parseBackup(JSON.stringify(s));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.state).toEqual(s);
    expect(result.preview.exportedAt).toBeNull();
  });

  it("migrates old backups: fills missing invest keys and commitments", () => {
    // A pre-commitments era dump: no commitments, partial invest.
    const old = { income: 100, budgets: { housing: 500 }, transactions: [], goals: [], invest: { monthly: 250 }, streak: { count: 0, lastDate: null } };
    const result = parseBackup(JSON.stringify(old));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.state.commitments).toEqual([]);
    expect(result.preview.state.invest.monthly).toBe(250);
    expect(result.preview.state.invest.ret).toBe(7); // default filled in
  });

  it("fills missing top-level fields so a partial dump can't crash the app", () => {
    const result = parseBackup(JSON.stringify({ budgets: { housing: 500 } }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.state.transactions).toEqual([]);
    expect(result.preview.state.streak).toEqual({ count: 0, lastDate: null });
    expect(result.preview.state.budgets.housing).toBe(500);
  });
});

describe("parseBackup — rejection paths", () => {
  const expectError = (raw: string, fragment: string) => {
    const result = parseBackup(raw);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain(fragment);
  };

  it("rejects invalid JSON", () => {
    expectError("definitely not json {", "isn't valid JSON");
    expectError(buildBackup(emptyState(), june15).json.slice(0, 40), "isn't valid JSON"); // truncated file
  });

  it("rejects JSON that isn't a backup at all", () => {
    expectError('{"hello": "world"}', "doesn't look like a Money Garden backup");
    expectError('[1, 2, 3]', "doesn't look like a Money Garden backup");
    expectError('"just a string"', "doesn't look like a Money Garden backup");
  });

  it("rejects backups from a newer schema version", () => {
    const future = { app: "money-garden", schema: SCHEMA_VERSION + 1, exportedAt: "2030-01-01", state: emptyState() };
    expectError(JSON.stringify(future), "newer version");
  });

  it("rejects an envelope whose state is missing or empty of garden data", () => {
    expectError(JSON.stringify({ app: "money-garden", schema: 1, state: null }), "no garden data");
    expectError(JSON.stringify({ app: "money-garden", schema: 1, state: { foo: 1 } }), "no garden data");
  });

  it("rejects structurally damaged states", () => {
    expectError(JSON.stringify({ transactions: "oops", budgets: {} }), '"transactions" isn\'t a list');
    expectError(
      JSON.stringify({ app: "money-garden", schema: 1, state: { budgets: {}, goals: 42 } }),
      '"goals" isn\'t a list',
    );
  });
});
