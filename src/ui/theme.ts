/*
 * The garden's palette and shared control style, verbatim from the reference.
 * UI-only — engine code must not import this.
 */
import type { CSSProperties } from "react";

export const C = {
  bg: "#EEF4E9",
  ink: "#1C352A",
  inkSoft: "#4A6355",
  leaf: "#3E9B5F",
  leafDark: "#2C7546",
  marigold: "#F0B429",
  tomato: "#DE5D42",
  soil: "#8A6F52",
  card: "#FFFFFF",
  border: "#D8E5D0",
  mist: "#F7FAF4",
} as const;

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
