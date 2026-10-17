import { afterEach, describe, expect, it, vi } from "vitest";
import type { State, Transaction } from "./types";
import {
  BACKUP_DUE_DAYS, backupStatus, buildBackup, NO_BACKUP_META, noteBackupRestored, noteBackupSaved, noteGardenChange,
  parseBackup, parseBackupMeta, SCHEMA_VERSION, serializeBackupMeta,
} from "./backup";
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
    // 11 current-month (incl. the orchard watering) + 11 + 10 + 10 across
    // three prior sample months (the k=1 month carries the barrel draw).
    expect(result.preview.counts).toEqual({ transactions: 42, goals: 3, commitments: 5, holdings: 2 });
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

  it("converts a legacy invest.age backup to birthYear on import", () => {
    const NOW = new Date(2026, 5, 15);
    const old = { budgets: {}, invest: { monthly: 250, age: 40 } };
    const result = parseBackup(JSON.stringify(old), NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.state.invest.birthYear).toBe(1986);
    expect("age" in result.preview.state.invest).toBe(false);
    expect(result.preview.state.invest.monthly).toBe(250);
  });

  it("round-trips a birthYear state without resurrecting age", () => {
    const s = sampleState(june15);
    const result = parseBackup(buildBackup(s, june15).json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.state.invest.birthYear).toBe(s.invest.birthYear);
    expect("age" in result.preview.state.invest).toBe(false);
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

describe("parseBackup — entry-level damage is refused before anything is replaced", () => {
  const withTx = (tx: unknown) => JSON.stringify({ app: "money-garden", schema: 1, exportedAt: "2026-06-15", state: { ...emptyState(), transactions: [tx] } });
  const refuse = (raw: string, fragment: string) => {
    const result = parseBackup(raw, june15);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain(fragment);
    expect(result.error).toContain("Nothing was changed");
  };

  it("refuses numeric-string amounts (they'd glue together instead of adding)", () => {
    refuse(withTx({ id: "a", type: "expense", amount: "100", category: "dining", note: "x", date: "2026-06-01" }),
      'transaction #1 has an amount that isn\'t a valid number ("100")');
  });

  it("refuses null entries and entries with no date (both crashed every render)", () => {
    refuse(withTx(null), "transaction #1 is empty or not an entry");
    refuse(withTx({ id: "c", type: "expense", amount: 5, category: "x", note: "n" }), "transaction #1 has no date");
  });

  it("refuses a damaged streak", () => {
    refuse(JSON.stringify({ ...emptyState(), streak: null }), "the logging streak is damaged");
  });

  it("summarizes many problems instead of listing them all", () => {
    const bad = { ...emptyState(), income: "lots", streak: null };
    refuse(JSON.stringify(bad), "(and 1 more problem)");
  });

  it("still accepts the Orchard's cleared-box sentinel in a real export", () => {
    const s = sampleState(june15);
    const withBlank = { ...s, invest: { ...s.invest, monthly: "" as unknown as number } };
    const result = parseBackup(buildBackup(withBlank, june15).json, june15);
    expect(result.ok).toBe(true);
  });
});

describe("parseBackup — never throws (verifier round 2 / screenshot review)", () => {
  it("turns a file migrate can't start on into a message, not an exception", () => {
    // ensureEmergencyGoal reads g.isEmergency on each goal — a null goal throws.
    const raw = JSON.stringify({ budgets: {}, goals: [null] });
    expect(() => parseBackup(raw, june15)).not.toThrow();
    const result = parseBackup(raw, june15);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Nothing was changed");
  });
});

/*
 * The backup reminder's bookkeeping — kept under its
 * own key, never inside the garden: "when was a backup last saved" and
 * "since when has the garden held a change no backup covers".
 */
describe("backup reminder — bookkeeping", () => {
  const at = (iso: string) => new Date(iso);

  describe("parseBackupMeta never throws, and junk means 'nothing known'", () => {
    // it.each runs one test per row — like pytest.mark.parametrize.
    it.each([
      ["nothing saved", null],
      ["empty", ""],
      ["not JSON", "{oops"],
      ["a list", "[1,2]"],
      ["a number", "7"],
      ["null", "null"],
    ])("%s → no backup, nothing unsaved", (_label, raw) => {
      expect(parseBackupMeta(raw)).toEqual(NO_BACKUP_META);
    });

    it("reads a well-formed record", () => {
      const raw = JSON.stringify({ lastAt: "2026-10-01T09:00:00.000Z", unsavedSince: "2026-10-05T10:00:00.000Z" });
      expect(parseBackupMeta(raw)).toEqual({ lastAt: "2026-10-01T09:00:00.000Z", unsavedSince: "2026-10-05T10:00:00.000Z" });
    });

    it("drops a field that isn't a real date, keeping the other", () => {
      const raw = JSON.stringify({ lastAt: "yesterday-ish", unsavedSince: "2026-10-05T10:00:00.000Z" });
      expect(parseBackupMeta(raw)).toEqual({ lastAt: null, unsavedSince: "2026-10-05T10:00:00.000Z" });
      expect(parseBackupMeta(JSON.stringify({ lastAt: 12, unsavedSince: null }))).toEqual(NO_BACKUP_META);
    });

    it("keeps fields it doesn't know (a newer build's), through every update", () => {
      const raw = JSON.stringify({ lastAt: null, unsavedSince: null, snoozeUntil: "2026-12-01" });
      const m = parseBackupMeta(raw);
      expect(m.snoozeUntil).toBe("2026-12-01");
      const changed = noteGardenChange(m, false, at("2026-10-10T08:00:00Z"));
      const saved = noteBackupSaved(changed, at("2026-10-11T08:00:00Z"));
      const restored = noteBackupRestored(changed);
      for (const x of [changed, saved, restored]) {
        expect(JSON.parse(serializeBackupMeta(x)).snoozeUntil).toBe("2026-12-01");
      }
    });

    it("round-trips through serializeBackupMeta", () => {
      const m = noteGardenChange(noteBackupSaved(NO_BACKUP_META, at("2026-10-01T09:00:00Z")), false, at("2026-10-02T09:00:00Z"));
      expect(parseBackupMeta(serializeBackupMeta(m))).toEqual(m);
    });
  });

  describe("noteGardenChange — the 'unsaved since' clock", () => {
    it("starts the clock at the first change no backup covers", () => {
      const m = noteGardenChange(NO_BACKUP_META, false, at("2026-10-10T08:00:00.000Z"));
      expect(m.unsavedSince).toBe("2026-10-10T08:00:00.000Z");
    });

    it("keeps the OLDEST uncovered change — later changes don't restart it (same object back = nothing to write)", () => {
      const first = noteGardenChange(NO_BACKUP_META, false, at("2026-10-10T08:00:00Z"));
      const later = noteGardenChange(first, false, at("2026-10-20T08:00:00Z"));
      expect(later).toBe(first);
    });

    it("a fresh (empty) garden has nothing to lose: the clock stops", () => {
      const running = noteGardenChange(NO_BACKUP_META, false, at("2026-10-10T08:00:00Z"));
      expect(noteGardenChange(running, true, at("2026-10-12T08:00:00Z")).unsavedSince).toBeNull();
      // …and a garden that was already fresh with no clock is left alone.
      expect(noteGardenChange(NO_BACKUP_META, true, at("2026-10-12T08:00:00Z"))).toBe(NO_BACKUP_META);
    });

    it("after starting fresh, the next real change starts a NEW clock (not the erased garden's)", () => {
      const old = noteGardenChange(NO_BACKUP_META, false, at("2026-09-01T08:00:00Z"));
      const erased = noteGardenChange(old, true, at("2026-10-10T08:00:00Z"));
      const anew = noteGardenChange(erased, false, at("2026-10-11T08:00:00Z"));
      expect(anew.unsavedSince).toBe(new Date("2026-10-11T08:00:00Z").toISOString());
    });

    it("restarts a clock left 'in the future' by a device clock that was ahead", () => {
      const ahead = noteGardenChange(NO_BACKUP_META, false, at("2027-01-10T08:00:00Z")); // clock wrong
      const fixed = noteGardenChange(ahead, false, at("2026-10-12T08:00:00.000Z")); // clock corrected
      expect(fixed.unsavedSince).toBe("2026-10-12T08:00:00.000Z");
      // …so the reminder isn't silenced until January: 14 days on, it's due.
      expect(backupStatus(fixed, false, at("2026-10-27T08:00:00Z")).kind).toBe("due");
    });

    it("never touches lastAt", () => {
      const saved = noteBackupSaved(NO_BACKUP_META, at("2026-10-01T09:00:00Z"));
      expect(noteGardenChange(saved, false, at("2026-10-02T09:00:00Z")).lastAt).toBe(saved.lastAt);
    });
  });

  describe("noteBackupSaved / noteBackupRestored", () => {
    it("saving a backup records when, and covers every change so far", () => {
      const running = noteGardenChange(NO_BACKUP_META, false, at("2026-10-01T08:00:00Z"));
      const saved = noteBackupSaved(running, at("2026-10-20T18:30:00.000Z"));
      expect(saved).toEqual({ lastAt: "2026-10-20T18:30:00.000Z", unsavedSince: null });
    });

    it("restoring a backup covers the garden (it IS that file) but isn't a new backup", () => {
      const saved = noteBackupSaved(NO_BACKUP_META, at("2026-09-01T09:00:00Z"));
      const running = noteGardenChange(saved, false, at("2026-09-05T09:00:00Z"));
      const restored = noteBackupRestored(running);
      expect(restored.unsavedSince).toBeNull();
      expect(restored.lastAt).toBe(saved.lastAt); // the shed must not claim a backup was saved today
    });

    it("restoring with nothing uncovered is a no-op (same object back)", () => {
      expect(noteBackupRestored(NO_BACKUP_META)).toBe(NO_BACKUP_META);
    });
  });

  describe("backupStatus — what the shed says", () => {
    // Local-calendar times (no Z): day counting is by the user's calendar.
    const changedOn = (y: number, mo: number, d: number, h = 9) =>
      noteGardenChange(NO_BACKUP_META, false, new Date(y, mo, d, h));

    it("says nothing for a fresh garden — there's nothing to back up", () => {
      expect(backupStatus(changedOn(2026, 8, 1), true, new Date(2026, 9, 17))).toEqual({ kind: "hidden" });
    });

    it("'never' when no backup was ever saved and nothing is overdue", () => {
      expect(backupStatus(NO_BACKUP_META, false, new Date(2026, 9, 17))).toEqual({ kind: "never" });
      expect(backupStatus(changedOn(2026, 9, 10), false, new Date(2026, 9, 17))).toEqual({ kind: "never" });
    });

    it("'saved' with the date of the last backup while nothing is overdue", () => {
      const saved = noteBackupSaved(NO_BACKUP_META, new Date(2026, 9, 3, 20));
      const s = backupStatus(saved, false, new Date(2026, 9, 17));
      expect(s.kind).toBe("saved");
      expect(s.kind === "saved" && s.lastAt.getTime()).toBe(new Date(2026, 9, 3, 20).getTime());
    });

    it(`is due once the oldest uncovered change is ${BACKUP_DUE_DAYS} calendar days old — not a day sooner`, () => {
      const m = changedOn(2026, 9, 1, 23); // Oct 1, late evening
      expect(backupStatus(m, false, new Date(2026, 9, 14, 23, 59))).toEqual({ kind: "never" }); // 13 days
      expect(backupStatus(m, false, new Date(2026, 9, 15, 0, 1))).toEqual({ kind: "due", days: 14, lastAt: null }); // 14
    });

    it("counts calendar days, not 24-hour blocks (an early-morning check still counts the day)", () => {
      const m = changedOn(2026, 9, 1, 23); // Oct 1, 23:00
      expect(backupStatus(m, false, new Date(2026, 9, 20, 0, 30))).toEqual({ kind: "due", days: 19, lastAt: null });
    });

    it("carries the last backup's date when due", () => {
      const saved = noteBackupSaved(NO_BACKUP_META, new Date(2026, 8, 1, 9));
      const m = noteGardenChange(saved, false, new Date(2026, 8, 2, 9));
      const s = backupStatus(m, false, new Date(2026, 9, 17, 9));
      expect(s.kind).toBe("due");
      expect(s.kind === "due" && s.lastAt?.getTime()).toBe(new Date(2026, 8, 1, 9).getTime());
      expect(s.kind === "due" && s.days).toBe(45);
    });

    it("a clock set backwards (change 'in the future') is simply not due", () => {
      const m = changedOn(2026, 11, 25);
      expect(backupStatus(m, false, new Date(2026, 9, 17)).kind).toBe("never");
    });

    describe("across daylight saving (real zone)", () => {
      // vi.stubEnv sets process.env.TZ for one test, like pytest's
      // monkeypatch.setenv; unstubAllEnvs puts it back.
      afterEach(() => { vi.unstubAllEnvs(); });
      it("a 23-hour spring-forward day still counts as one day (New York, Mar 8 2026)", () => {
        vi.stubEnv("TZ", "America/New_York");
        const m = changedOn(2026, 1, 23, 12); // Feb 23 noon
        // Mar 9 is 14 calendar days later, but midnight-to-midnight spans
        // only 13d 23h (one day had 23 hours) — flooring ms/86400000 says 13.
        expect(backupStatus(m, false, new Date(2026, 2, 9, 0, 30))).toEqual({ kind: "due", days: 14, lastAt: null });
      });
    });
  });
});
