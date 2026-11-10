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

// WCAG contrast from relative luminance — the same maths browsers' and
// auditors' contrast checkers use. 4.5:1 is the bar for normal-size text.
const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const lum = (hex: string) => {
  const [r, g, b] = hex.replace("#", "").match(/../g)!.map((h) => lin(parseInt(h, 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const value = (block: string, name: string) => block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];

describe("gold text contrast", () => {
  for (const [theme, block] of [["day", dayBlock], ["night", nightBlock]] as const) {
    for (const token of ["--amber", "--marigold-text"]) {
      it(`${theme}: ${token} is readable text on every surface it sits on`, () => {
        const gold = value(block, token)!;
        for (const surface of ["--card", "--mist", "--bg", "--tint-amber"]) {
          const ratio = contrast(gold, value(block, surface)!);
          expect(ratio, `${theme} ${token} on ${surface}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  }

  it("marigold really is too light for text on a day card (why these tokens exist)", () => {
    expect(contrast(value(dayBlock, "--marigold")!, value(dayBlock, "--card")!)).toBeLessThan(3);
  });

  it("night marigold text is marigold itself — the night garden looks as before", () => {
    expect(value(nightBlock, "--marigold-text")).toBe(value(nightBlock, "--marigold"));
  });
});

describe("phone tab bar label contrast", () => {
  // The bar is translucent: what's behind it shows through, so its labels'
  // contrast depends on the page. The bar's colour is a straight mix of the
  // card and whatever is behind it, so the worst possible backdrop is the
  // extreme the label can't stand out from: pure black by day (dark labels),
  // pure white at night (light labels). Passing over those proves the labels
  // read over ANY colour — chart, art, emoji, a filter's saturate/brightness
  // boost — no palette list to keep in sync. The styles (App's phone bar)
  // must layer exactly like mix(): card at --tabbar-glass over the page, the
  // pill at --tabbar-pill-mix over the bar, ink labels on top.
  // (Why every label is ink, the selected one too: a green label fails this.)
  const rgb = (hex: string) => hex.replace("#", "").match(/../g)!.map((h) => parseInt(h, 16));
  const toHex = (c: number[]) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  /** `share` of colour a over colour b — what color-mix(in srgb, a share, b) paints. */
  const mix = (a: string, b: string, share: number) => toHex(rgb(a).map((v, i) => v * share + rgb(b)[i] * (1 - share)));
  const raw = (block: string, name: string) => block.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();
  /** A colour variable as hex, following one var(--x) reference. */
  const colour = (block: string, name: string): string => {
    const v = raw(block, name)!;
    const ref = v.match(/^var\((--[\w-]+)\)$/)?.[1];
    return ref ? value(block, ref)! : v;
  };
  const percent = (block: string, name: string) => Number(raw(block, name)!.replace("%", "")) / 100;

  for (const [theme, block] of [["day", dayBlock], ["night", nightBlock]] as const) {
    it(`${theme}: tab labels stay readable whatever scrolls behind the bar`, () => {
      const pill = colour(block, "--tabbar-pill");
      expect(pill, "--tabbar-pill should resolve to a hex colour").toMatch(/^#[0-9a-fA-F]{6}$/);
      const ink = value(block, "--ink")!;
      // Both extremes, both themes — so the test stays right even if a
      // palette change ever flipped which end is the hard one.
      for (const worst of ["#000000", "#ffffff"]) {
        const bar = mix(value(block, "--card")!, worst, percent(block, "--tabbar-glass"));
        const plain = contrast(ink, bar);
        const selected = contrast(ink, mix(pill, bar, percent(block, "--tabbar-pill-mix")));
        // NaN (an unreadable percent) fails these too, so they can't pass vacuously.
        expect(plain, `${theme} label over ${worst}: ${plain.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
        expect(selected, `${theme} selected label over ${worst}: ${selected.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
      // A pressed tab's droplet is opaque — the pill colour at
      // --tabbar-press-mix, mixed into the card — so nothing behind shows through.
      const pressed = contrast(ink, mix(pill, value(block, "--card")!, percent(block, "--tabbar-press-mix")));
      expect(pressed, `${theme} pressed label: ${pressed.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    });
  }
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
