/*
 * Small shared UI pieces: Stat, CardTitle, Empty, Field, PlantMini.
 */
import type { CSSProperties, ReactNode } from "react";
import { C } from "./theme";
import { Plant } from "./art/Plant";

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
