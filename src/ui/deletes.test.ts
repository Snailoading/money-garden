/*
 * Guard: nothing deletes on a single tap (CLAUDE.md: never destroy user
 * data without an explicit two-step confirm). Every two-step in the app
 * ends the same way — the confirming button deletes AND clears the armed
 * state (`disarm()` or `setConfirm…(null)`). A one-tap ✕ wired straight to
 * a delete has nothing armed to clear, so this flags it. A source scan,
 * like inputs.test.ts: it can't prove intent, but it catches the exact
 * regression that shipped before (commitments and holdings, until v0.17.5).
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const uiDir = fileURLToPath(new URL(".", import.meta.url));
const tsxFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? tsxFiles(join(dir, e.name)) : e.name.endsWith(".tsx") ? [join(dir, e.name)] : [],
  );

/** The body of every `onClick={…}` — brace-matched, so nested blocks stay whole. */
const onClickBodies = (src: string): string[] => {
  const bodies: string[] = [];
  let from = 0;
  for (;;) {
    const start = src.indexOf("onClick={", from);
    if (start === -1) return bodies;
    let depth = 0, i = start + "onClick=".length;
    for (; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) break;
    }
    bodies.push(src.slice(start, i + 1));
    from = i + 1;
  }
};

const DESTRUCTIVE = /\b(delete|remove)[A-Z]\w*\(/;
const CLEARS_ARMED = /\bdisarm\(\)|\bsetConfirm\w*\(null\)/;

describe("destructive taps are two-step", () => {
  it("the scanner itself flags a one-tap delete and passes a confirm button", () => {
    const [oneTap, confirm] = onClickBodies(
      `<button onClick={() => deleteHolding(h.id)}>✕</button>
       <button onClick={() => { disarm(); deleteHolding(h.id); }}>Delete?</button>`,
    );
    expect(DESTRUCTIVE.test(oneTap) && !CLEARS_ARMED.test(oneTap)).toBe(true);
    expect(CLEARS_ARMED.test(confirm)).toBe(true);
  });

  for (const path of tsxFiles(uiDir)) {
    const file = relative(uiDir, path);
    it(`${file}: every onClick that deletes is the confirm step of a two-step`, () => {
      const offenders = onClickBodies(readFileSync(path, "utf8"))
        .filter((body) => DESTRUCTIVE.test(body) && !CLEARS_ARMED.test(body));
      expect(offenders, `one-tap delete in ${file}`).toEqual([]);
    });
  }
});
