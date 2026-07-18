import { describe, expect, it } from "vitest";
import type { State, Transaction } from "./types";
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
    // 10 current-month + 2×10 prior-month sample transactions.
    expect(result.preview.counts).toEqual({ transactions: 30, goals: 3, commitments: 4, holdings: 2 });
  });

  it("carries transaction links (goalId/commitmentId/holdingId) through the round trip", () => {
    const s: State = {
      ...emptyState(),
      invest: { ...emptyState().invest, holdings: [{ id: "h1", name: "Index fund", value: 9500 }] },
      transactions: [
        { id: "w1", type: "saving", amount: 500, category: "other", note: "→ Orchard: Index fund", date: "2026-06-10", holdingId: "h1" },
        { id: "g1", type: "saving", amount: 100, category: "other", note: "→ Japan trip", date: "2026-06-11", goalId: "goal1" },
      ],
    };
    const result = parseBackup(buildBackup(s, june15).json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.state.transactions[0].holdingId).toBe("h1");
    expect(result.preview.state.transactions[1].goalId).toBe("goal1");
    // And a pre-holdingId backup imports fine: missing link = unlinked entry.
    const oldTx = { ...s.transactions[0] } as Partial<Transaction>;
    delete oldTx.holdingId;
    const oldResult = parseBackup(JSON.stringify({ ...s, transactions: [oldTx] }));
    expect(oldResult.ok).toBe(true);
    if (!oldResult.ok) return;
    expect(oldResult.preview.state.transactions[0].holdingId).toBeUndefined();
  });

  it("accepts a bare state dump (hand-copied localStorage value)", () => {
    const s = sampleState(june15);
    const result = parseBackup(JSON.stringify(s));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.state).toEqual(s);
    expect(result.preview.exportedAt).toBeNull();
  });

  it("migrates old backups: fills missing invest keys, commitments, and the barrel", () => {
    // A pre-commitments era dump: no commitments, partial invest, no barrel.
    const old = { income: 100, budgets: { housing: 500 }, transactions: [], goals: [], invest: { monthly: 250 }, streak: { count: 0, lastDate: null } };
    const result = parseBackup(JSON.stringify(old));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.state.commitments).toEqual([]);
    expect(result.preview.state.invest.monthly).toBe(250);
    expect(result.preview.state.invest.ret).toBe(7); // default filled in
    // v0.12.0: barrel-less imports gain the unfunded barrel — but the
    // preview count reports the FILE's goals (0 here), not the injection.
    expect(result.preview.state.goals).toHaveLength(1);
    expect(result.preview.state.goals[0]).toMatchObject({ name: "Emergency fund", target: 0, isEmergency: true });
    expect(result.preview.counts.goals).toBe(0);
  });

  it("fills missing top-level fields so a partial dump can't crash the app", () => {
    const result = parseBackup(JSON.stringify({ budgets: { housing: 500 } }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.state.transactions).toEqual([]);
    expect(result.preview.state.streak).toEqual({ count: 0, lastDate: null });
    expect(result.preview.state.budgets.housing).toBe(500);
    expect(result.preview.state.goals[0]).toMatchObject({ isEmergency: true, target: 0 });
  });

  it("resolves a corrupt backup with two flagged goals: first wins, barrel first", () => {
    const twoFlags = {
      budgets: {},
      goals: [
        { id: "x", name: "Cash", plant: "tulip", target: 100, saved: 0, isEmergency: false },
        { id: "y", name: "Cushion", plant: "poppy", target: 5000, saved: 900, isEmergency: true },
        { id: "z", name: "Backup cushion", plant: "bluebell", target: 2000, saved: 10, isEmergency: true },
      ],
    };
    const result = parseBackup(JSON.stringify(twoFlags));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.state.goals.map((g) => [g.id, g.isEmergency])).toEqual([["y", true], ["x", false], ["z", false]]);
    expect(result.preview.counts.goals).toBe(3); // file count — no injection happened
  });

  it("previews the file's goal count, not the post-migration one", () => {
    // One regular goal, no emergency fund: after import the barrel makes it
    // two, but the preview answers "what does this file contain?" → 1.
    const oneGoal = {
      budgets: {},
      goals: [{ id: "j", name: "Japan trip", plant: "tulip", target: 2800, saved: 640, isEmergency: false }],
    };
    const result = parseBackup(JSON.stringify(oneGoal));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.counts.goals).toBe(1);
    expect(result.preview.state.goals).toHaveLength(2); // barrel + Japan trip
    expect(result.preview.state.goals[0]).toMatchObject({ isEmergency: true, target: 0 });
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
