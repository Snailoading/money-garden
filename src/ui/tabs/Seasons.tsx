/*
 * SEASONS — the garden's almanac: month-over-month history in a 12-month
 * window, pageable a year at a time once there's more history than fits.
 * Tapping a month in the harvest ledger walks into it (goToMonth).
 */
import { useMemo, useState } from "react";
import type { State } from "../../engine/types";
import { monthRange, monthlyTrends } from "../../engine/trends";
import { MONTH_NAMES } from "../../engine/format";
import { C } from "../theme";
import { CardTitle } from "../bits";
import { SeasonsBars, SeasonsRate, SeasonsSplit } from "../charts/SvgSeasons";

const WINDOW = 12;

/** "Aug ’25" for a YYYY-MM key. */
const shortYm = (ym: string) => `${MONTH_NAMES[Number(ym.slice(5, 7)) - 1]} ’${ym.slice(2, 4)}`;

function Legend({ items }: { items: [string, string][] }) {
  return (
    <span style={{ display: "inline-flex", gap: 12, flexWrap: "wrap" }}>
      {items.map(([label, color]) => (
        <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: color, display: "inline-block" }} />{label}
        </span>
      ))}
    </span>
  );
}

export function Seasons({ state, goToMonth }: {
  state: State;
  goToMonth: (ym: string) => void;
}) {
  const [offset, setOffset] = useState(0);
  const rangeLen = useMemo(() => monthRange(state).length, [state]);
  const trends = useMemo(() => monthlyTrends(state, new Date(), WINDOW, offset), [state, offset]);
  const canOlder = offset < rangeLen - WINDOW;
  const canNewer = offset > 0;
  const pagerBtn = (enabled: boolean) => ({
    background: "transparent", border: `1.5px solid ${enabled ? C.border : "transparent"}`,
    borderRadius: 999, padding: "4px 12px", fontWeight: 700, fontSize: 12,
    color: C.inkSoft, cursor: enabled ? "pointer" : "default", opacity: enabled ? 1 : 0.35,
  } as const);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {rangeLen > WINDOW && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <button className="mg-btn" style={pagerBtn(canOlder)} disabled={!canOlder}
            onClick={() => canOlder && setOffset(Math.min(offset + WINDOW, rangeLen - WINDOW))}>
            ‹ older
          </button>
          <span className="mg-num" style={{ fontSize: 13, fontWeight: 700, color: C.inkSoft }}>
            {shortYm(trends[0].ym)} – {shortYm(trends[trends.length - 1].ym)}
          </span>
          <button className="mg-btn" style={pagerBtn(canNewer)} disabled={!canNewer}
            onClick={() => canNewer && setOffset(Math.max(0, offset - WINDOW))}>
            newer ›
          </button>
        </div>
      )}
      {trends.length < 2 && (
        <section className="mg-card" style={{ padding: 20 }}>
          <CardTitle>The almanac is young 🌱</CardTitle>
          <p style={{ margin: 0, fontSize: 13.5, color: C.inkSoft }}>
            Trends need a little history to tell a story — these charts fill in as the seasons turn. Keep logging and come back next month.
          </p>
        </section>
      )}

      <section className="mg-card" style={{ padding: 20 }}>
        <CardTitle>The harvest ledger</CardTitle>
        <p style={{ margin: "0 0 8px", fontSize: 13, color: C.inkSoft, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <span>What came in and went out, month by month. Tap a month to wander through it.</span>
          <Legend items={[["earned", C.leafDark], ["spent", C.tomato], ["sent to goals", C.marigold]]} />
        </p>
        <div style={{ height: 220 }}>
          <SeasonsBars trends={trends} onPick={goToMonth} />
        </div>
      </section>

      <section className="mg-card" style={{ padding: 20 }}>
        <CardTitle>Savings rate</CardTitle>
        <p style={{ margin: "0 0 8px", fontSize: 13, color: C.inkSoft }}>
          The slice of income you kept each month — the dashed line is the classic 20% rule of thumb.
        </p>
        <div style={{ height: 220 }}>
          <SeasonsRate trends={trends} />
        </div>
      </section>

      <section className="mg-card" style={{ padding: 20 }}>
        <CardTitle>Needs &amp; wants</CardTitle>
        <p style={{ margin: "0 0 8px", fontSize: 13, color: C.inkSoft, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <span>Essentials vs fun, month by month — your 50/30/20 shape over time.</span>
          <Legend items={[["needs", C.leafDark], ["wants", C.marigold]]} />
        </p>
        <div style={{ height: 220 }}>
          <SeasonsSplit trends={trends} />
        </div>
      </section>
    </div>
  );
}
