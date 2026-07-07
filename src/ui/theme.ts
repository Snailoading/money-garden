/*
 * The garden's palette and shared control style.
 * Since the night garden (v0.6.0), C holds CSS-variable references — the
 * actual hexes live once in global.css (:root = day, [data-theme="night"]
 * = night), so switching themes is one attribute flip on <html>. C stays
 * the typed interface so a mistyped token is still a compile error.
 * UI-only — engine code must not import this.
 */
import type { CSSProperties } from "react";

export const C = {
  bg: "var(--bg)",
  ink: "var(--ink)",
  inkSoft: "var(--ink-soft)",
  leaf: "var(--leaf)",
  leafDark: "var(--leaf-dark)",
  marigold: "var(--marigold)",
  tomato: "var(--tomato)",
  soil: "var(--soil)",
  card: "var(--card)",
  border: "var(--border)",
  mist: "var(--mist)",
  /** Text on ink-colored fills (active tab, toast) — flips with the theme. */
  inkContrast: "var(--ink-contrast)",
  /** Darker amber for small text where marigold lacks contrast. */
  amber: "var(--amber)",
  /** Priority-pill and need/want chip tints. */
  tintTomato: "var(--tint-tomato)",
  tintAmber: "var(--tint-amber)",
  tintLeaf: "var(--tint-leaf)",
  chipNeed: "var(--chip-need)",
  chipWant: "var(--chip-want)",
  /** Garden art. */
  seed: "var(--seed)",
  soilLight: "var(--soil-light)",
  trunk: "var(--trunk)",
  canopy: "var(--canopy)",
  seedhead: "var(--seedhead)",
  seedheadHi: "var(--seedhead-hi)",
  goldHi: "var(--gold-hi)",
  goldMid: "var(--gold-mid)",
  shadow: "var(--shadow)",
} as const;

/** Theme mode: fixed day, fixed night, or follow the clock. */
export type ThemeMode = "day" | "night" | "auto";
/** Auto mode's night window: night from 19:00 through 06:59 local. */
export const NIGHT_STARTS = 19;
export const NIGHT_ENDS = 7;
export const THEME_KEY = "money-garden:theme";

export const resolveTheme = (mode: ThemeMode, now: Date = new Date()): "day" | "night" => {
  if (mode !== "auto") return mode;
  const h = now.getHours();
  return h < NIGHT_ENDS || h >= NIGHT_STARTS ? "night" : "day";
};

/** PWA chrome color per theme (the <meta name="theme-color">). */
export const THEME_COLOR = { day: "#5A7D5A", night: "#141F18" } as const;

/*
 * One style for every input/select/date field. The fixed 40px height matters:
 * browsers size selects and date inputs differently otherwise (this was a real
 * bug in an earlier version — keep the fix).
 */
export const inputStyle: CSSProperties = {
  width: "100%",
  height: 40,
  boxSizing: "border-box",
  padding: "9px 10px",
  border: `1.5px solid ${C.border}`,
  borderRadius: 10,
  background: C.mist,
  fontSize: 14,
  color: C.ink,
  fontFamily: "inherit",
  lineHeight: "normal",
};
