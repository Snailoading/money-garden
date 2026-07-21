/*
 * Guards for the theming system's silent-failure modes: a CSS variable
 * missing from one theme block, or a C token referencing an undefined
 * variable, renders as transparent/inherit with no error anywhere.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { C, resolveTheme } from "./theme";

const css = readFileSync(fileURLToPath(new URL("./global.css", import.meta.url)), "utf8");
const varsIn = (block: string) => new Set([...block.matchAll(/--[\w-]+(?=\s*:)/g)].map((m) => m[0]));
const dayBlock = css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? "";
const nightBlock = css.match(/\[data-theme="night"\]\s*\{([^}]*)\}/)?.[1] ?? "";

describe("palette variable parity", () => {
  it("defines the identical variable set for day and night", () => {
    expect([...varsIn(nightBlock)].sort()).toEqual([...varsIn(dayBlock)].sort());
    expect(varsIn(dayBlock).size).toBeGreaterThan(20); // both blocks found and real
  });

  it("backs every C token with a defined variable", () => {
    const defined = varsIn(dayBlock);
    for (const [token, value] of Object.entries(C)) {
      const name = value.match(/^var\((--[\w-]+)\)$/)?.[1];
      expect(name, `C.${token} should be a var() reference`).toBeTruthy();
      expect(defined.has(name!), `C.${token} → ${name} missing from :root`).toBe(true);
    }
  });
});

describe("splash palette parity", () => {
  // The index.html splash hardcodes --bg/--ink-soft (it paints before
  // global.css exists) — this is the guard that keeps those copies from
  // drifting when the palette is tuned.
  const html = readFileSync(fileURLToPath(new URL("../../index.html", import.meta.url)), "utf8");
  const cssValue = (block: string, name: string) =>
    block.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();

  it("day splash colors match :root --bg/--ink-soft", () => {
    const splashDay = html.match(/#splash\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(cssValue(splashDay, "background")).toBe(cssValue(dayBlock, "--bg"));
    expect(cssValue(splashDay, "color")).toBe(cssValue(dayBlock, "--ink-soft"));
  });

  it("night splash colors match the night --bg/--ink-soft", () => {
    const splashNight = html.match(/\[data-theme="night"\]\s*#splash\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(cssValue(splashNight, "background")).toBe(cssValue(nightBlock, "--bg"));
    expect(cssValue(splashNight, "color")).toBe(cssValue(nightBlock, "--ink-soft"));
  });
});

describe("resolveTheme", () => {
  it("honors fixed modes regardless of the hour", () => {
    expect(resolveTheme("day", new Date(2026, 6, 7, 23))).toBe("day");
    expect(resolveTheme("night", new Date(2026, 6, 7, 12))).toBe("night");
  });

  it("follows the clock in auto: day 07:00–18:59, night otherwise", () => {
    expect(resolveTheme("auto", new Date(2026, 6, 7, 6, 59))).toBe("night");
    expect(resolveTheme("auto", new Date(2026, 6, 7, 7, 0))).toBe("day");
    expect(resolveTheme("auto", new Date(2026, 6, 7, 18, 59))).toBe("day");
    expect(resolveTheme("auto", new Date(2026, 6, 7, 19, 0))).toBe("night");
    expect(resolveTheme("auto", new Date(2026, 6, 7, 0, 30))).toBe("night");
  });
});
