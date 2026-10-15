/*
 * The safety net — if anything throws while drawing the page, show a calm
 * screen with a way to rescue the saved data, instead of a blank page.
 *
 * This is the one class component in the app: React only offers crash-
 * catching for rendering as class lifecycle methods (there is no hook
 * equivalent). Think of it as a try/except wrapped around everything
 * React draws — `getDerivedStateFromError` is the except branch.
 *
 * It never writes to storage. Downloading reads the saved string as-is, so
 * it works even when the garden inside is what's broken. (The file is a
 * bare state dump — importable later if the data itself is sound, e.g.
 * when the crash was a bug in the page rather than in the data.)
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { STORAGE_KEY } from "../engine/types";
import { todayISO } from "../engine/format";
import { store } from "./store";
import { downloadText } from "./download";
import { C } from "./theme";

interface Props {
  children: ReactNode;
}

interface BoundaryState {
  error: Error | null;
  /** Feedback line under the buttons after a download attempt. */
  note: string | null;
}

export class ErrorBoundary extends Component<Props, BoundaryState> {
  state: BoundaryState = { error: null, note: null };

  static getDerivedStateFromError(error: Error): Partial<BoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // A crash on the very first render means App's mount effect (which
    // takes the static index.html splash down) never ran — and the splash
    // sits above everything, so it would hide this screen.
    document.getElementById("splash")?.remove();
    // Local console only — no analytics, no network (CLAUDE.md).
    console.error("Money Garden hit an error while drawing the page:", error, info.componentStack);
  }

  // Arrow-function class field: `this` stays bound when passed as onClick
  // (like a Python bound method; a plain method would lose `this`).
  private downloadSaved = async () => {
    const res = await store.get(STORAGE_KEY);
    if (!res?.value) {
      this.setState({ note: "There's no saved garden on this device to download." });
      return;
    }
    downloadText(`money-garden-rescue-${todayISO()}.json`, res.value);
    this.setState({ note: "Downloaded — keep that file somewhere safe." });
  };

  render() {
    const { error, note } = this.state;
    if (!error) return this.props.children;
    const btn = { borderRadius: 12, padding: "10px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer" } as const;
    return (
      <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: "'DM Sans', system-ui, sans-serif", display: "grid", placeItems: "center", padding: 20 }}>
        <section className="mg-card" role="alert" style={{ maxWidth: 460, padding: "26px 24px", display: "grid", gap: 12 }}>
          <div style={{ fontSize: 38, lineHeight: 1 }}>🥀</div>
          <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 21 }}>Something in the garden broke</div>
          <p style={{ margin: 0, fontSize: 14, color: C.inkSoft, lineHeight: 1.6 }}>
            The page hit an error while drawing. <b style={{ color: C.ink }}>Your saved data hasn't been changed.</b> Reloading often fixes it — if it keeps happening, download your data first so it's safe.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="mg-btn" onClick={() => location.reload()}
              style={{ ...btn, background: C.leaf, color: C.inkContrast, border: "none" }}>
              Reload
            </button>
            <button className="mg-btn" onClick={() => void this.downloadSaved()}
              style={{ ...btn, background: "transparent", color: C.ink, border: `1.5px solid ${C.border}` }}>
              ⬇️ Download your saved data
            </button>
          </div>
          {note && <div role="status" style={{ fontSize: 13, color: C.inkSoft }}>{note}</div>}
          <div style={{ fontSize: 12, color: C.inkSoft, wordBreak: "break-word" }}>Details: {error.message}</div>
        </section>
      </div>
    );
  }
}
