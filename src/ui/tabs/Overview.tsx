/*
 * OVERVIEW — the month at a glance: left-to-spend hero, horizon strip with
 * mini goal plants, spending-pace chart, category donut.
 */
import type { State } from "../../engine/types";
import { CATEGORIES, PLANT_KINDS } from "../../engine/types";
import type { Derived, MonthView } from "../../engine/stats";
import { fmt, monthLabel } from "../../engine/format";
import { C } from "../theme";
import { CardTitle, Empty, PlantMini, Stat } from "../bits";
import { SvgPace } from "../charts/SvgPace";
import { SvgDonut } from "../charts/SvgDonut";

export function Overview({ state, d, view, setIncome, goTo }: {
  state: State;
  d: Derived;
  /** A browsed past month; null/undefined = today. */
  view?: MonthView | null;
  setIncome: (v: string) => void;
  goTo: (tab: string) => void;
}) {
  const src = view ?? d; // MonthView's fields deliberately mirror Derived's
  const isPast = Boolean(view);
  const donut = CATEGORIES.map((c) => ({ name: c.label, emoji: c.emoji, value: Math.round(src.byCat[c.id]) }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
  const palette = ["#3E9B5F", "#F0B429", "#5B7FD4", "#DE5D42", "#9A7BD0", "#E56A9A", "#2C7546", "#8A6F52", "#6BB98A", "#C9A36B"];
  const leftPerDay = src.left / Math.max(1, src.daysInMonth - new Date().getDate() + 1);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* hero */}
      <section className="mg-card" style={{ padding: "26px 26px 0", overflow: "hidden", position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 18 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.inkSoft, textTransform: "uppercase", letterSpacing: ".1em" }}>
              {isPast ? `Left over in ${monthLabel(view!.ym)}` : "Left to spend this month"}
            </div>
            <div className="mg-num" style={{ fontFamily: "'Fraunces', serif", fontWeight: 900, fontSize: "clamp(44px, 8vw, 72px)", lineHeight: 1, color: src.left >= 0 ? C.ink : C.tomato, margin: "6px 0 4px" }}>
              {fmt(src.left)}
            </div>
            <div style={{ color: C.inkSoft, fontSize: 14 }}>
              {isPast
                ? (src.left >= 0
                  ? <>The month closed with this much unspent — well tended. 🌱</>
                  : <>Spending outgrew income that month. 🌧️</>)
                : (src.left >= 0
                  ? <>≈ <b className="mg-num">{fmt(Math.max(0, leftPerDay))}</b> a day through {new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</>
                  : <>You're past this month's income — time to prune. 🌧️</>)}
            </div>
          </div>
          <div style={{ display: "grid", gap: 8, alignContent: "start", minWidth: 220 }}>
            <Stat label="Earned" value={fmt(src.income)} color={C.leafDark} />
            <Stat label="Spent" value={fmt(src.spent)} color={C.tomato} />
            <Stat label="Sent to goals" value={fmt(src.savedThisMonth)} color={C.marigold} sub={src.income > 0 ? `${Math.round(src.savingsRate * 100)}% savings rate` : null} />
            {!isPast && (
              <label style={{ fontSize: 12, color: C.inkSoft, display: "flex", alignItems: "center", gap: 8 }}>
                Monthly income
                <input className="mg-num" type="number" min="0" value={state.income || ""} placeholder="4200"
                  onChange={(e) => setIncome(e.target.value)}
                  style={{ width: 100, padding: "6px 8px", border: `1.5px solid ${C.border}`, borderRadius: 8, background: C.mist }} />
              </label>
            )}
          </div>
        </div>
        {/* horizon strip */}
        <svg viewBox="0 0 980 70" preserveAspectRatio="none" style={{ display: "block", width: "calc(100% + 52px)", margin: "14px -26px 0", height: 58 }}>
          <path d="M0 45 Q 160 20 320 40 T 640 38 T 980 42 L 980 70 L 0 70 Z" fill={C.leaf} opacity="0.22" />
          <path d="M0 55 Q 200 35 420 52 T 980 50 L 980 70 L 0 70 Z" fill={C.leafDark} opacity="0.3" />
          {state.goals.slice(0, 5).map((g, i) => (
            <g key={g.id} transform={`translate(${90 + i * 190}, 8) scale(0.55)`}>
              <PlantMini progress={g.saved / g.target} bloom={PLANT_KINDS.find((p) => p.id === g.plant)?.bloom || C.marigold} />
            </g>
          ))}
        </svg>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        {/* spending pace */}
        <section className="mg-card" style={{ padding: 20 }}>
          <CardTitle>Spending pace</CardTitle>
          <p style={{ margin: "0 0 8px", fontSize: 13, color: C.inkSoft }}>
            {isPast ? "That month's" : "Your"} cumulative spend vs. an even-pace line for a <b className="mg-num">{fmt(src.totalBudget)}</b> monthly budget.
          </p>
          <div style={{ height: 190 }}>
            <SvgPace data={src.daily} />
          </div>
        </section>

        {/* category donut */}
        <section className="mg-card" style={{ padding: 20 }}>
          <CardTitle>Where it went</CardTitle>
          {donut.length === 0 ? (
            isPast
              ? <Empty text="No expenses were logged that month." />
              : <Empty text="No expenses yet this month — the pie is unbaked. 🥧" cta="Log one" onClick={() => goTo("log")} />
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ width: 170, height: 170 }}>
                <SvgDonut data={donut} palette={palette} />
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 13, display: "grid", gap: 5, flex: 1, minWidth: 150 }}>
                {donut.slice(0, 5).map((x, i) => (
                  <li key={x.name} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <span><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, background: palette[i % palette.length], marginRight: 7 }} />{x.emoji} {x.name}</span>
                    <b className="mg-num">{fmt(x.value)}</b>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
