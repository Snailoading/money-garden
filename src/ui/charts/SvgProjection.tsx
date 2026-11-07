/*
 * FIRE projection: expected compounding line, the ±2% market band drawn as a
 * closed polygon (out along the kind edge, back along the slow edge), and a
 * dashed freedom-number line. Colors via style props so the palette's var()
 * references resolve.
 */
import { useRef } from "react";
import type { CurvePoint } from "../../engine/fire";
import { fmt, fmtK } from "../../engine/format";
import { C } from "../theme";
import { useChartSize, useNearest } from "../hooks";
import { RevealClip } from "./RevealClip";
import { tipLeft, xLabelIndexes } from "./layout";
import { niceAxis, tickMoney } from "./ticks";

export function SvgProjection({ curve, fireNumber, retLo, retHi }: { curve: CurvePoint[]; fireNumber: number; retLo: number; retHi: number }) {
  const pl = 50, pr = 14, pt = 14, pb = 24;
  const { ref, el, W, H } = useChartSize(640, 235); // real px — 1 unit = 1px
  const { hi, locate, clear } = useNearest(el, W, pl, pr, curve ? curve.length : 0);
  const cid = useRef("c" + Math.random().toString(36).slice(2, 9)).current;
  if (!curve || curve.length < 2) return null;
  // Gridlines on round values — each label is exactly its line. `|| 0`
  // turns a NaN max into an empty axis (niceAxis then tops out at 1).
  const { top: maxY, ticks } = niceAxis(Math.max(fireNumber || 0, ...curve.map((p) => p.band[1])) * 1.06 || 0, 4);
  const x = (i: number) => pl + (i / (curve.length - 1)) * (W - pl - pr);
  const y = (v: number) => pt + (1 - v / maxY) * (H - pt - pb);
  const line = curve.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + "," + y(p.value).toFixed(1)).join(" ");
  const band = curve.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + "," + y(p.band[1]).toFixed(1)).join(" ")
    + " " + [...curve].reverse().map((p, i) => "L" + x(curve.length - 1 - i).toFixed(1) + "," + y(p.band[0]).toFixed(1)).join(" ") + " Z";
  const xLabels = xLabelIndexes(curve.length, W - pl - pr);
  return (
    <svg ref={ref} viewBox={"0 0 " + W + " " + H} preserveAspectRatio="xMidYMid meet"
      onPointerMove={locate} onPointerDown={locate} onPointerLeave={clear}
      style={{ width: "100%", height: "100%", display: "block", touchAction: "pan-y" }} role="img" aria-label="Portfolio projection">
      <RevealClip id={cid} W={W} H={H} seconds={1.1} />
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} strokeDasharray="3 4" style={{ stroke: C.border }} />
          <text x={pl - 6} y={y(v) + 4} textAnchor="end" fontSize="11" className="mg-num" style={{ fill: C.inkSoft }}>{tickMoney(v)}</text>
        </g>
      ))}
      {xLabels.map((i) => (
        <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" className="mg-num" style={{ fill: C.inkSoft }}>{curve[i].age}</text>
      ))}
      <g clipPath={"url(#" + cid + ")"}>
        <path d={band} opacity="0.14" style={{ fill: C.leaf }} />
        <path d={line} strokeWidth="2.5" strokeLinejoin="round" style={{ fill: "none", stroke: C.leafDark }} />
      </g>
      {/* The two in-plot labels get a card-coloured halo: paintOrder="stroke"
          paints the 4px outline first and the letters over it, so a gridline
          or the band running behind them stops at the words' edge. */}
      {fireNumber > 0 && fireNumber < maxY && (
        <g>
          <line x1={pl} x2={W - pr} y1={y(fireNumber)} y2={y(fireNumber)} strokeWidth="1.8" strokeDasharray="7 5" style={{ stroke: C.tomato }} />
          <text x={W - pr} y={y(fireNumber) - 6} textAnchor="end" fontSize="11.5" fontWeight="700" strokeWidth="4" strokeLinejoin="round" paintOrder="stroke" style={{ fill: C.tomato, stroke: C.card }}>Freedom {fmtK(fireNumber)}</text>
        </g>
      )}
      <text x={pl} y={pt + 2} fontSize="10.5" strokeWidth="4" strokeLinejoin="round" paintOrder="stroke" style={{ fill: C.inkSoft, stroke: C.card }}>band: {retLo}–{retHi}%/yr</text>
      {hi != null && (() => {
        const p = curve[hi]; const bw = 158, bh = 58;
        const ax = x(hi);
        const bx = tipLeft(ax, bw, 2, W - pr);
        const by = Math.max(pt, Math.min(y(p.value) - bh / 2, H - pb - bh));
        return (
          <g style={{ pointerEvents: "none" }}>
            <line x1={ax} x2={ax} y1={pt} y2={H - pb} style={{ stroke: C.border }} />
            <circle cx={ax} cy={y(p.value)} r="4.5" style={{ fill: C.leafDark }} />
            <g transform={`translate(${bx} ${by})`}>
              <rect x={0} y={0} width={bw} height={bh} rx="9" strokeWidth="1.5" style={{ fill: C.card, stroke: C.border }} />
              <text x={10} y={17} fontSize="11" fontWeight="700" style={{ fill: C.ink }}>Age {p.age}</text>
              <text x={10} y={33} fontSize="11" className="mg-num" style={{ fill: C.leafDark }}>Expected {fmt(p.value)}</text>
              <text x={10} y={49} fontSize="11" className="mg-num" style={{ fill: C.inkSoft }}>Range {fmtK(p.band[0])} – {fmtK(p.band[1])}</text>
            </g>
          </g>
        );
      })()}
    </svg>
  );
}
