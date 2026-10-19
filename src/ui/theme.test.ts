/*
 * Guards for the theming system's silent-failure modes: a CSS variable
 * missing from one theme block, or a C token referencing an undefined
 * variable, renders as transparent/inherit with no error anywhere.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { C, parseThemeMode, resolveTheme, THEME_COLOR, THEME_KEY } from "./theme";

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

/*
 * index.html's boot script paints the theme before the app exists, so it
 * re-implements resolveTheme in plain JS. Run the REAL script (extracted
 * from index.html) in a sandbox — like exec() with a prepared globals dict
 * in Python — and check it agrees with the app for every saved mode and
 * hour, including storage that's blocked or holds junk. A mismatch is a
 * visible flash at startup.
 */
describe("index.html boot script agrees with the app's theme", () => {
  const html = readFileSync(fileURLToPath(new URL("../../index.html", import.meta.url)), "utf8");
  const boot = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1])
    .find((s) => s.includes(THEME_KEY));

  /** Run the boot script with `stored` in localStorage ("blocked" = access throws) at local hour `h`. */
  const runBoot = (stored: string | null | "blocked", h: number) => {
    const meta = {
      content: "#5A7D5A",
      setAttribute(name: string, v: string) {
        if (name !== "content") throw new Error(`unexpected attribute ${name}`);
        this.content = v;
      },
    };
    const root = { dataset: {} as Record<string, string> };
    const fixed = new Date(2026, 9, 17, h, 30).getTime();
    // A Date whose no-argument form is the fixed moment (Date(…) with args is
    // untouched) — like patching datetime.now() in Python. The `as [number]`
    // only quiets TypeScript about spreading an arbitrary argument list.
    const FixedDate = class extends Date {
      constructor(...a: []) { super(...(a.length ? a : [fixed]) as [number]); }
    };
    const sandbox: Record<string, unknown> = {
      Date: FixedDate,
      document: { documentElement: root, querySelector: (q: string) => (q === 'meta[name="theme-color"]' ? meta : null) },
    };
    Object.defineProperty(sandbox, "localStorage", {
      get() {
        // Some browsers throw on mere access. (Inside Node's vm the script
        // sees it as a ReferenceError instead — handled the same way; the
        // browser suite covers the real SecurityError.)
        if (stored === "blocked") throw new Error("SecurityError");
        return { getItem: (k: string) => (k === THEME_KEY ? stored : null) };
      },
    });
    runInNewContext(boot!, sandbox);
    return { theme: root.dataset.theme, meta: meta.content };
  };

  it("finds the boot script", () => {
    expect(boot).toBeDefined();
  });

  const modes: (string | null | "blocked")[] = ["day", "night", "auto", null, "blocked", "dusk", ""];
  const hours = [0, 3, 6, 7, 12, 18, 19, 23];
  for (const stored of modes) {
    it(`saved ${JSON.stringify(stored)}: same theme and title-bar colour as the app, every hour`, () => {
      // What the app does (its own parser; blocked storage reads as nothing).
      const mode = parseThemeMode(stored === "blocked" ? null : stored);
      for (const h of hours) {
        const want = resolveTheme(mode, new Date(2026, 9, 17, h, 30));
        expect(runBoot(stored, h), `hour ${h}`).toEqual({ theme: want, meta: THEME_COLOR[want] });
      }
    });
  }
});
