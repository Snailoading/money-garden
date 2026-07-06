/*
 * SEASONS — the garden's almanac: month-over-month history, up to the
 * latest 12 months. Tapping a month in the harvest ledger walks into it
 * (month navigation via goToMonth).
 */
import type { TrendPoint } from "../../engine/trends";
import { C } from "../theme";
import { CardTitle } from "../bits";
import { SeasonsBars, SeasonsRate, SeasonsSplit } from "../charts/SvgSeasons";

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

export function Seasons({ trends, goToMonth }: {
  trends: TrendPoint[];
  goToMonth: (ym: string) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
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
