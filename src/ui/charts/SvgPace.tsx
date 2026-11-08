/*
 * Spending-pace chart: cumulative spend (filled line) vs an even-pace dashed
 * line. Dependency-free SVG with a pointer tooltip and a clip-rect entry
 * animation. Colors via style props so the palette's var() references resolve.
 */
import { useRef } from "react";
import type { DailyPoint } from "../../engine/stats";
import { fmt } from "../../engine/format";
import { C } from "../theme";
import { useChartSize, useNearest } from "../hooks";
import { RevealClip } from "./RevealClip";
import { niceAxis, tickMoney } from "./ticks";
import { tipLeft, xLabelIndexes } from "./layout";

export function SvgPace({ data }: { data: DailyPoint[] }) {
  const pl = 46, pr = 10, pt = 8, pb = 22;
  const { ref, el, W, H } = useChartSize(560, 190); // real px — 1 unit = 1px
  const { hi, locate, clear } = useNearest(el, W, pl, pr, data ? data.length : 0);
  // Stable per-instance clipPath id so two charts on one page don't collide.
  const cid = useRef("c" + Math.random().toString(36).slice(2, 9)).current;
  if (!data || data.length < 2) return null;
  // Gridlines on round values (like Seasons) — each label is exactly its line.
  const { top: maxY, ticks } = niceAxis(Math.max(1, ...data.map((p) => Math.max(p.spent || 0, p.pace || 0))) * 1.08);
  const x = (i: number) => pl + (i / (data.length - 1)) * (W - pl - pr);
  const y = (v: number) => pt + (1 - v / maxY) * (H - pt - pb);
  const path = (k: "spent" | "pace") =>
    data.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + "," + y(p[k] || 0).toFixed(1)).join(" ");
  const area = path("spent") + " L" + x(data.length - 1).toFixed(1) + "," + y(0).toFixed(1) + " L" + x(0).toFixed(1) + "," + y(0).toFixed(1) + " Z";
  const xLabels = xLabelIndexes(data.length, W - pl - pr);
  return (
    <svg ref={ref} viewBox={"0 0 " + W + " " + H} preserveAspectRatio="xMidYMid meet"
      onPointerMove={locate} onPointerDown={locate} onPointerLeave={clear}
      style={{ width: "100%", height: "100%", display: "block", touchAction: "pan-y" }} role="img"
      aria-label={"Cumulative spending vs even pace" + (() => {
        const dd = data.filter((p) => p.drawn);
        return dd.length ? `; spent from goals on day${dd.length > 1 ? "s" : ""} ${dd.map((p) => p.day).join(", ")}` : "";
      })()}>
      <RevealClip id={cid} W={W} H={H} seconds={0.9} />
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} strokeDasharray="3 5" style={{ stroke: C.border }} />
          <text x={pl - 6} y={y(v) + 4} textAnchor="end" fontSize="11" className="mg-num" style={{ fill: C.inkSoft }}>{tickMoney(v)}</text>
        </g>
      ))}
      {xLabels.map((i) => (
        <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" className="mg-num" style={{ fill: C.inkSoft }}>{data[i].day}</text>
      ))}
      <g clipPath={"url(#" + cid + ")"}>
        <path d={area} opacity="0.18" style={{ fill: C.leaf }} />
        <path d={path("pace")} strokeWidth="2" strokeDasharray="6 4" style={{ fill: "none", stroke: C.border }} />
        <path d={path("spent")} strokeWidth="2.5" strokeLinejoin="round" style={{ fill: "none", stroke: C.leafDark }} />
      </g>
      {/* 🌸 goal-draw day markers — an annotation on the date axis, never part
          of the cumulative line (it's budget-basis). Outside the entry clip. */}
      {data.map((p, i) => (p.drawn ? (
        <text key={"d" + i} x={x(i)} y={H - pb - 5} textAnchor="middle" fontSize="12">🌸</text>
      ) : null))}
      {hi != null && (() => {
        const p = data[hi]; const bw = p.drawn ? 168 : 132, bh = p.drawn ? 74 : 58;
        const ax = x(hi);
        const bx = tipLeft(ax, bw, 2, W - pr);
        const by = Math.max(pt, Math.min(y(Math.max(p.spent || 0, p.pace || 0)) - bh / 2, H - pb - bh));
        return (
          <g style={{ pointerEvents: "none" }}>
            <line x1={ax} x2={ax} y1={pt} y2={H - pb} style={{ stroke: C.border }} />
            <circle cx={ax} cy={y(p.spent || 0)} r="4" style={{ fill: C.leafDark }} />
            <circle cx={ax} cy={y(p.pace || 0)} r="3.5" strokeWidth="1.5" style={{ fill: C.card, stroke: C.inkSoft }} />
            <g transform={`translate(${bx} ${by})`}>
              <rect x={0} y={0} width={bw} height={bh} rx="9" strokeWidth="1.5" style={{ fill: C.card, stroke: C.border }} />
              <text x={10} y={17} fontSize="11" fontWeight="700" style={{ fill: C.ink }}>Day {p.day}</text>
              <text x={10} y={33} fontSize="11" className="mg-num" style={{ fill: C.leafDark }}>Spent {fmt(p.spent || 0)}</text>
              <text x={10} y={49} fontSize="11" className="mg-num" style={{ fill: C.inkSoft }}>Even pace {fmt(p.pace || 0)}</text>
              {p.drawn ? (
                <text x={10} y={65} fontSize="11" className="mg-num" style={{ fill: C.tomato }}>
                  {/* Long goal names are trimmed so the row stays inside the box. */}
                  🌸 {fmt(p.drawn)}{(() => {
                    const n = p.drawNames?.[0];
                    if (!n) return " from goals";
                    const trimmed = n.length > 14 ? n.slice(0, 13) + "…" : n;
                    return ` · ${trimmed}${p.drawNames!.length > 1 ? ` +${p.drawNames!.length - 1}` : ""}`;
                  })()}
                </text>
              ) : null}
            </g>
          </g>
        );
      })()}
    </svg>
  );
}
