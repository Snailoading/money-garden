/*
 * Spending-pace chart: cumulative spend (filled line) vs an even-pace dashed
 * line. Dependency-free SVG with a pointer tooltip and a clip-rect entry
 * animation. Colors via style props so the palette's var() references resolve.
 */
import { useRef } from "react";
import type { DailyPoint } from "../../engine/stats";
import { fmt } from "../../engine/format";
import { C } from "../theme";
import { useNearest, useReveal } from "../hooks";

export function SvgPace({ data }: { data: DailyPoint[] }) {
  const W = 560, H = 190, pl = 46, pr = 10, pt = 8, pb = 22;
  const on = useReveal();
  const { ref, hi, locate, clear } = useNearest(W, pl, pr, data ? data.length : 0);
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
      style={{ width: "100%", height: "100%", display: "block", touchAction: "pan-y" }} role="img" aria-label="Cumulative spending vs even pace">
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
      {hi != null && (() => {
        const p = data[hi]; const bw = 132, bh = 58;
        // Tooltip flips to the left of the cursor when it would overflow.
        let tx = x(hi) + 10; if (tx + bw > W - pr) tx = x(hi) - bw - 10;
        const ty = Math.max(pt, Math.min(y(Math.max(p.spent || 0, p.pace || 0)) - bh / 2, H - pb - bh));
        return (
          <g style={{ pointerEvents: "none" }}>
            <line x1={x(hi)} x2={x(hi)} y1={pt} y2={H - pb} style={{ stroke: C.border }} />
            <circle cx={x(hi)} cy={y(p.spent || 0)} r="4" style={{ fill: C.leafDark }} />
            <circle cx={x(hi)} cy={y(p.pace || 0)} r="3.5" strokeWidth="1.5" style={{ fill: C.card, stroke: C.inkSoft }} />
            <rect x={tx} y={ty} width={bw} height={bh} rx="9" strokeWidth="1.5" style={{ fill: C.card, stroke: C.border }} />
            <text x={tx + 10} y={ty + 17} fontSize="11" fontWeight="700" style={{ fill: C.ink }}>Day {p.day}</text>
            <text x={tx + 10} y={ty + 33} fontSize="11" className="mg-num" style={{ fill: C.leafDark }}>Spent {fmt(p.spent || 0)}</text>
            <text x={tx + 10} y={ty + 49} fontSize="11" className="mg-num" style={{ fill: C.inkSoft }}>Even pace {fmt(p.pace || 0)}</text>
          </g>
        );
      })()}
    </svg>
  );
}
