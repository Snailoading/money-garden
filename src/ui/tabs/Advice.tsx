/*
 * ADVICE — the gardener's notes, rendered from the engine's rule output.
 * The general-education disclaimer must stay visible wherever tips appear.
 */
import { useMemo } from "react";
import type { State } from "../../engine/types";
import type { Derived } from "../../engine/stats";
import { buildAdvice, PRIORITY_LABELS, type Priority } from "../../engine/advice";
import { C } from "../theme";
import { CardTitle } from "../bits";

const prioStyle: Record<Priority, { bg: string; label: string; color: string }> = {
  1: { bg: C.tintTomato, label: PRIORITY_LABELS[1], color: C.tomato },
  2: { bg: C.tintAmber, label: PRIORITY_LABELS[2], color: C.amber },
  3: { bg: C.tintLeaf, label: PRIORITY_LABELS[3], color: C.leafDark },
};

export function Advice({ state, d }: { state: State; d: Derived }) {
  const tips = useMemo(() => buildAdvice(state, d), [state, d]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section className="mg-card" style={{ padding: 20 }}>
        <CardTitle>The gardener's notes 🪴</CardTitle>
        <p style={{ margin: 0, fontSize: 13.5, color: C.inkSoft }}>
          Plain-spoken guidance generated from your actual numbers — classic rules of thumb (emergency fund, 20% savings, 50/30/20, the 4% rule) applied to this month and the long game. General education, not personalized financial advice.
        </p>
      </section>
      {tips.map((t, i) => {
        const p = prioStyle[t.priority];
        return (
          <section key={i} className="mg-card" style={{ padding: 18, display: "flex", gap: 14, alignItems: "flex-start", animation: `mg-pop .3s ease ${i * 0.05}s both` }}>
            <div style={{ fontSize: 26, lineHeight: 1 }}>{t.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
                <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 17, margin: 0 }}>{t.title}</h3>
                <span style={{ fontSize: 11, fontWeight: 700, background: p.bg, color: p.color, padding: "3px 10px", borderRadius: 999 }}>{p.label}</span>
              </div>
              <p style={{ margin: 0, fontSize: 14, color: C.inkSoft, lineHeight: 1.55 }}>{t.body}</p>
            </div>
          </section>
        );
      })}
    </div>
  );
}
