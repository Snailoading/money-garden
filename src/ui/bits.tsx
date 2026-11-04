/*
 * Small shared UI pieces: Stat, CardTitle, Empty, Field, PlantMini, PencilIcon, XIcon.
 */
import type { CSSProperties, ReactNode } from "react";
import { C } from "./theme";
import { Plant } from "./art/Plant";

/**
 * The edit pencil on ✏️ buttons — a drawn icon, not the emoji: emoji art
 * differs per device, and Apple's sits ~2px left and low in its box, which a
 * visible hover tile exposes. Strokes in the button's own text colour
 * (`currentColor`), like the ✕ beside it, and matches it (measured): a 16px
 * box like XIcon (even, so it lands on whole pixels in a 32px square), a
 * 27-unit viewBox so its ink is ~11.5px like the ✕'s 11 (a diagonal reads
 * smaller than a cross of the same box), stroke scaled ×27/24 to the ✕'s
 * thickness, and the origin at (−1.5, −2.5) to centre the rendered ink
 * (within 0.15px). `inline` sits it in running text (the shed's help line),
 * where it's a word, so screen readers hear "pencil"; on a button it's
 * hidden (the button's own label says "Edit …").
 */
export function PencilIcon({ size = 16, inline = false }: { size?: number; inline?: boolean }) {
  return (
    // Spreading an object of attributes — like passing **kwargs in Python.
    <svg width={size} height={size} viewBox="-1.5 -2.5 27 27" {...(inline ? { role: "img", "aria-label": "pencil" } : { "aria-hidden": true })}
      style={{ display: inline ? "inline-block" : "block", verticalAlign: inline ? "-2px" : undefined, fill: "none", stroke: "currentColor", strokeWidth: 2.475, strokeLinecap: "round", strokeLinejoin: "round" }}>
      <path d="M16.5 3.5a2.4 2.4 0 0 1 3.4 3.4L8 18.8l-4.5 1.2 1.2-4.5z" />
      <path d="M14.5 5.5l3.4 3.4" />
    </svg>
  );
}

/**
 * The ✕ on remove/close buttons — drawn for the same reason as the pencil:
 * the ✕ character isn't in DM Sans, so each device substitutes its own font's
 * (Apple's sat ~0.9px high). Same stroke as PencilIcon so the pair matches;
 * 16px (even) so it lands on whole pixels in a 32px square, and ~11px of ink
 * like the old character. `inline`: as PencilIcon (heard as "cross").
 */
export function XIcon({ size = 16, inline = false }: { size?: number; inline?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...(inline ? { role: "img", "aria-label": "cross" } : { "aria-hidden": true })}
      style={{ display: inline ? "inline-block" : "block", verticalAlign: inline ? "-2px" : undefined, fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" }}>
      <path d="M5 5l14 14M19 5L5 19" />
    </svg>
  );
}

export function Stat({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string | null }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 14, borderBottom: `1px dashed ${C.border}`, paddingBottom: 6 }}>
      <span style={{ fontSize: 13, color: C.inkSoft }}>{label}</span>
      <span style={{ textAlign: "right" }}>
        <b className="mg-num" style={{ color, fontSize: 16 }}>{value}</b>
        {sub && <div style={{ fontSize: 11, color: C.inkSoft }}>{sub}</div>}
      </span>
    </div>
  );
}

export function CardTitle({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 20, margin: "0 0 10px", ...style }}>{children}</h2>;
}

export function Empty({ text, cta, onClick }: { text: string; cta?: string; onClick?: () => void }) {
  return (
    <div style={{ padding: "26px 10px", textAlign: "center", color: C.inkSoft, fontSize: 14 }}>
      <div style={{ marginBottom: 10 }}>{text}</div>
      {cta && (
        <button className="mg-btn" onClick={onClick} style={{ background: C.ink, color: C.inkContrast, border: "none", borderRadius: 10, padding: "8px 16px", fontWeight: 700, cursor: "pointer" }}>
          {cta}
        </button>
      )}
    </div>
  );
}

export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 700, color: C.inkSoft }}>
      {label}
      {children}
    </label>
  );
}

export function PlantMini({ progress, bloom }: { progress: number; bloom: string }) {
  return <Plant progress={progress} bloom={bloom} size={100} celebrate={progress >= 1} />;
}
