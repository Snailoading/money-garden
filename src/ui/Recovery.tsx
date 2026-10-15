/*
 * RECOVERY — shown instead of the garden when something IS saved on this
 * device but can't be read safely (engine loadSaved → "unreadable").
 *
 * The old behavior replaced an unreadable save with an empty garden on the
 * spot, destroying the only copy. Now nothing is written until the user
 * chooses, and the choice that overwrites ("Start fresh") is two-step and
 * first tucks a copy of the raw data away under its own timestamped
 * UNREADABLE_KEY_PREFIX key.
 */
import { useEffect, useRef, useState } from "react";
import { todayISO } from "../engine/format";
import { downloadText } from "./download";
import { C } from "./theme";

export function Recovery({ raw, reason, onStartFresh }: {
  /** The saved string exactly as stored — never modified here. */
  raw: string;
  /** Plain-words cause from the engine, e.g. "transaction #3 has no valid date". */
  reason: string;
  /** Keep a copy, then replace the save with a fresh garden. Resolves false
   * if no copy could be kept and the user hasn't downloaded one either. */
  onStartFresh: (downloaded: boolean) => Promise<boolean>;
}) {
  const [downloaded, setDownloaded] = useState(false);
  const [armed, setArmed] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const armTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Cancel a pending disarm when the screen goes away (after Start fresh).
  useEffect(() => () => clearTimeout(armTimer.current), []);

  const download = () => {
    downloadText(`money-garden-unreadable-${todayISO()}.json`, raw);
    setDownloaded(true);
    setBlocked(false);
  };

  // Two-step, same idiom as the shed's Start fresh: arm → 4s window → confirm.
  const arm = () => {
    setArmed(true);
    clearTimeout(armTimer.current);
    armTimer.current = setTimeout(() => setArmed(false), 4000);
  };
  const confirm = async () => {
    setArmed(false);
    const ok = await onStartFresh(downloaded);
    if (!ok) setBlocked(true);
  };

  const btn = { borderRadius: 12, padding: "10px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer" } as const;
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: "'DM Sans', system-ui, sans-serif", display: "grid", placeItems: "center", padding: 20 }}>
      <section className="mg-card" role="alert" style={{ maxWidth: 500, padding: "26px 24px", display: "grid", gap: 12 }}>
        <div style={{ fontSize: 38, lineHeight: 1 }}>🥀</div>
        <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 21 }}>We couldn't read your saved garden</div>
        <p style={{ margin: 0, fontSize: 14, color: C.inkSoft, lineHeight: 1.6 }}>
          <b style={{ color: C.ink }}>Your data is still saved on this device, exactly as it was</b> — Money Garden hasn't changed or erased it, and won't unless you choose to below.
        </p>
        <p style={{ margin: 0, fontSize: 13.5, color: C.inkSoft, lineHeight: 1.6, wordBreak: "break-word" }}>
          What went wrong: {reason}.
        </p>
        <p style={{ margin: 0, fontSize: 13.5, color: C.inkSoft, lineHeight: 1.6 }}>
          First, download the saved data so it's safe. If you have a backup file, you can then start fresh and use <b style={{ color: C.ink }}>⬆️ Import backup</b> in the shed at the bottom of the page.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="mg-btn" onClick={download}
            style={{ ...btn, background: C.leaf, color: C.inkContrast, border: "none" }}>
            ⬇️ Download the saved data
          </button>
          {armed ? (
            <button className="mg-btn" onClick={() => void confirm()}
              style={{ ...btn, background: C.tomato, color: C.inkContrast, border: `1.5px solid ${C.tomato}` }}>
              Really start fresh?
            </button>
          ) : (
            <button className="mg-btn" onClick={arm}
              style={{ ...btn, background: "transparent", color: C.inkSoft, border: `1.5px solid ${C.border}` }}>
              Start fresh…
            </button>
          )}
        </div>
        {downloaded && <div role="status" style={{ fontSize: 13, color: C.leafDark }}>Downloaded — keep that file somewhere safe.</div>}
        {blocked && (
          <div role="status" style={{ fontSize: 13, color: C.tomato, fontWeight: 600 }}>
            Couldn't keep a copy on this device — download the saved data first, then start fresh.
          </div>
        )}
        <div style={{ fontSize: 12, color: C.inkSoft }}>
          Starting fresh also tucks a copy of the unreadable data away on this device (if there's room), just in case.
        </div>
      </section>
    </div>
  );
}
