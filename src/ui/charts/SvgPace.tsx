/*
 * Spending-pace chart: cumulative spend (filled line) vs an even-pace dashed
 * line. Dependency-free SVG with a pointer tooltip and a clip-rect entry
 * animation. Colors via style props so the palette's var() references resolve.
 */
import { useRef } from "react";
import type { DailyPoint } from "../../engine/stats";
import { fmt } from "../../engine/format";
import { C } from "../theme";
import { useNearest, useReveal, useSvgScale } from "../hooks";

export function SvgPace({ data }: { data: DailyPoint[] }) {
  const W = 560, H = 190, pl = 46, pr = 10, pt = 8, pb = 22;
  const on = useReveal();
  const { ref, hi, locate, clear } = useNearest(W, pl, pr, data ? data.length : 0);
  const k = useSvgScale(ref, W); // counter-scale the tooltip on narrow phones
  // Stable per-instance clipPath id so two charts on one page don't collide.
  const cid = useRef("c" + Math.random().toString(36).slice(2, 9)).current;
  if (!data || data.length < 2) return null;
  const maxY = Math.max(1, ...data.map((p) => Math.max(p.spent || 0, p.pace || 0))) * 1.08;
  const x = (i: number) => pl + (i / (data.length - 1)) * (W - pl - pr);
  const y = (v: number) => pt + (1 - v / maxY) * (H - pt - pb);
  const path = (k: "spent" | "pace") =>
    data.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + "," + y(p[k] || 0).toFixed(1)).join(" ");
  const area = path("spent") + " L" + x(data.length - 1).toFixed(1) + "," + y(0).toFixed(1) + " L" + x(0).toFixed(1) + "," + y(0).toFixed(1) + " Z";
  const ticks = [1 / 3, 2 / 3, 1].map((t) => t * maxY);
  const xStep = Math.max(1, Math.ceil(data.length / 6));
  return (
    <svg ref={ref} viewBox={"0 0 " + W + " " + H} preserveAspectRatio="xMidYMid meet"
      onPointerMove={locate} onPointerDown={locate} onPointerLeave={clear}
      style={{ width: "100%", height: "100%", display: "block", touchAction: "pan-y" }} role="img"
      aria-label={"Cumulative spending vs even pace" + (() => {
        const dd = data.filter((p) => p.drawn);
        return dd.length ? `; spent from goals on day${dd.length > 1 ? "s" : ""} ${dd.map((p) => p.day).join(", ")}` : "";
      })()}>
      <defs><clipPath id={cid}><rect x="0" y="0" height={H} width={on ? W : 0} style={{ transition: "width .9s ease" }} /></clipPath></defs>
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} strokeDasharray="3 5" style={{ stroke: C.border }} />
          <text x={pl - 6} y={y(v) + 4} textAnchor="end" fontSize="11" className="mg-num" style={{ fill: C.inkSoft }}>{v >= 1000 ? "$" + (v / 1000).toFixed(1) + "k" : "$" + Math.round(v)}</text>
        </g>
      ))}
      {data.map((p, i) => ((i % xStep === 0 || i === data.length - 1) &&
        <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" className="mg-num" style={{ fill: C.inkSoft }}>{p.day}</text>
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
        // The box+text scale by k (constant on-screen size); the guide line
        // and data dots stay in chart geometry. bw*k / bh*k is the box's
        // footprint in viewBox units — flip and clamp against that.
        const ax = x(hi);
        let bx = ax + 10; if (bx + bw * k > W - pr) bx = ax - 10 - bw * k;
        const by = Math.max(pt, Math.min(y(Math.max(p.spent || 0, p.pace || 0)) - bh * k / 2, H - pb - bh * k));
        return (
          <g style={{ pointerEvents: "none" }}>
            <line x1={ax} x2={ax} y1={pt} y2={H - pb} style={{ stroke: C.border }} />
            <circle cx={ax} cy={y(p.spent || 0)} r="4" style={{ fill: C.leafDark }} />
            <circle cx={ax} cy={y(p.pace || 0)} r="3.5" strokeWidth="1.5" style={{ fill: C.card, stroke: C.inkSoft }} />
            <g transform={`translate(${bx} ${by}) scale(${k})`}>
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
