/*
 * ADVICE — the gardener's notes, rendered from the engine's rule output.
 * The general-education disclaimer must stay visible wherever tips appear.
 */
import { useMemo } from "react";
import type { State } from "../../engine/types";
import type { Derived } from "../../engine/stats";
import { buildAdvice, PRIORITY_LABELS, type Priority } from "../../engine/advice";
import { C, isIOS, isTouchDevice } from "../theme";
import { CardTitle } from "../bits";

const prioStyle: Record<Priority, { bg: string; label: string; color: string }> = {
  1: { bg: C.tintTomato, label: PRIORITY_LABELS[1], color: C.tomato },
  2: { bg: C.tintAmber, label: PRIORITY_LABELS[2], color: C.amber },
  3: { bg: C.tintLeaf, label: PRIORITY_LABELS[3], color: C.leafDark },
};

export function Advice({ state, d, showInstallTip, onMuteInstallTip }: {
  state: State;
  d: Derived;
  /** App-meta, not engine advice: shown until installed or muted with its ✕. */
  showInstallTip: boolean;
  onMuteInstallTip: () => void;
}) {
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

      {/* App-meta note, not engine advice: a standing install reminder in case
          the one-time overlay was closed hastily. Its ✕ mutes it for good, and
          installed (standalone) launches never see it. */}
      {showInstallTip && (
        <section className="mg-card" style={{ padding: 18, display: "flex", gap: 14, alignItems: "flex-start" }}>
          <div style={{ fontSize: 26, lineHeight: 1 }}>{isIOS() || isTouchDevice() ? "📲" : "🖥️"}</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
              <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 17, margin: 0 }}>Pot the garden — install it as an app</h3>
              <span style={{ fontSize: 11, fontWeight: 700, background: prioStyle[2].bg, color: prioStyle[2].color, padding: "3px 10px", borderRadius: 999 }}>{prioStyle[2].label}</span>
            </div>
            <p style={{ margin: 0, fontSize: 14, color: C.inkSoft, lineHeight: 1.55 }}>
              {isIOS()
                ? <>In Safari, tap <b style={{ color: C.ink }}>Share</b> → <b style={{ color: C.ink }}>Add to Home Screen</b>. Beyond the full-screen app, it protects your garden from Safari's periodic storage cleanup.</>
                : isTouchDevice()
                  ? <>Open your browser menu and choose <b style={{ color: C.ink }}>Add to Home screen</b> / <b style={{ color: C.ink }}>Install app</b> — a full-screen, offline app one tap from your home screen.</>
                  : <>Use the <b style={{ color: C.ink }}>install icon in the address bar</b> (Chrome/Edge) or <b style={{ color: C.ink }}>File → Add to Dock</b> (Safari) to give the garden a window of its own. Browser doesn't offer it? Dismiss this and carry on.</>}
            </p>
          </div>
          <button className="mg-btn" onClick={onMuteInstallTip} title="Don't show this again" aria-label="Don't show this again"
            style={{ border: "none", background: "transparent", color: C.inkSoft, cursor: "pointer", fontSize: 15, padding: 4 }}>✕</button>
        </section>
      )}
    </div>
  );
}
