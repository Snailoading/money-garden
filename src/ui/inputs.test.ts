/*
 * Guard: every numeric input declares its mobile keyboard. type="number"
 * alone does NOT raise the numeric keypad on phones — inputMode does
 * ("decimal" for money/percents, "numeric" for days/counts/years). A new
 * field added without one silently regresses to the full text keyboard,
 * which no reviewer would catch from the diff alone.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const uiDir = fileURLToPath(new URL(".", import.meta.url));
// All of src/ui, recursively — a numeric input added to App.tsx or a new
// subdirectory must not escape the guard just by living outside tabs/.
const tsxFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? tsxFiles(join(dir, e.name)) : e.name.endsWith(".tsx") ? [join(dir, e.name)] : [],
  );

describe("numeric inputs declare a mobile keyboard", () => {
  for (const path of tsxFiles(uiDir)) {
    const file = relative(uiDir, path);
    it(`${file}: every type="number" input carries inputMode`, () => {
      const src = readFileSync(path, "utf8");
      // Split on input openings: each chunk holds one tag (plus trailing
      // JSX, which can't contain the NEXT input's attributes).
      const offenders = src
        .split("<input")
        .slice(1)
        .filter((chunk) => chunk.includes('type="number"') && !chunk.includes("inputMode="));
      expect(offenders, `type="number" without inputMode in ${file}`).toEqual([]);
    });
  }
});
