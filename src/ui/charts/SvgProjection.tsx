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
import { useNearest, useReveal } from "../hooks";

export function SvgProjection({ curve, fireNumber, retLo, retHi }: { curve: CurvePoint[]; fireNumber: number; retLo: number; retHi: number }) {
  const W = 640, H = 235, pl = 50, pr = 14, pt = 14, pb = 24;
  const on = useReveal();
  const { ref, hi, locate, clear } = useNearest(W, pl, pr, curve ? curve.length : 0);
  const cid = useRef("c" + Math.random().toString(36).slice(2, 9)).current;
  if (!curve || curve.length < 2) return null;
  const maxY = Math.max(fireNumber || 0, ...curve.map((p) => p.band[1])) * 1.06 || 1;
  const x = (i: number) => pl + (i / (curve.length - 1)) * (W - pl - pr);
  const y = (v: number) => pt + (1 - v / maxY) * (H - pt - pb);
  const line = curve.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + "," + y(p.value).toFixed(1)).join(" ");
  const band = curve.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + "," + y(p.band[1]).toFixed(1)).join(" ")
    + " " + [...curve].reverse().map((p, i) => "L" + x(curve.length - 1 - i).toFixed(1) + "," + y(p.band[0]).toFixed(1)).join(" ") + " Z";
  const ticks = [0.25, 0.5, 0.75, 1].map((t) => t * maxY);
  const xStep = Math.max(1, Math.ceil((curve.length - 1) / 6));
  return (
    <svg ref={ref} viewBox={"0 0 " + W + " " + H} preserveAspectRatio="xMidYMid meet"
      onPointerMove={locate} onPointerDown={locate} onPointerLeave={clear}
      style={{ width: "100%", height: "100%", display: "block", touchAction: "pan-y" }} role="img" aria-label="Portfolio projection">
      <defs><clipPath id={cid}><rect x="0" y="0" height={H} width={on ? W : 0} style={{ transition: "width 1.1s ease" }} /></clipPath></defs>
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} strokeDasharray="3 4" style={{ stroke: C.border }} />
          <text x={pl - 6} y={y(v) + 4} textAnchor="end" fontSize="11" className="mg-num" style={{ fill: C.inkSoft }}>{fmtK(v)}</text>
        </g>
      ))}
      {curve.map((p, i) => ((i % xStep === 0 || i === curve.length - 1) &&
        <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" className="mg-num" style={{ fill: C.inkSoft }}>{p.age}</text>
      ))}
      <g clipPath={"url(#" + cid + ")"}>
        <path d={band} opacity="0.14" style={{ fill: C.leaf }} />
        <path d={line} strokeWidth="2.5" strokeLinejoin="round" style={{ fill: "none", stroke: C.leafDark }} />
      </g>
      {fireNumber > 0 && fireNumber < maxY && (
        <g>
          <line x1={pl} x2={W - pr} y1={y(fireNumber)} y2={y(fireNumber)} strokeWidth="1.8" strokeDasharray="7 5" style={{ stroke: C.tomato }} />
          <text x={W - pr} y={y(fireNumber) - 6} textAnchor="end" fontSize="11.5" fontWeight="700" style={{ fill: C.tomato }}>Freedom {fmtK(fireNumber)}</text>
        </g>
      )}
      <text x={pl} y={pt + 2} fontSize="10.5" style={{ fill: C.inkSoft }}>band: {retLo}–{retHi}%/yr</text>
      {hi != null && (() => {
        const p = curve[hi]; const bw = 158, bh = 58;
        let tx = x(hi) + 10; if (tx + bw > W - pr) tx = x(hi) - bw - 10;
        const ty = Math.max(pt, Math.min(y(p.value) - bh / 2, H - pb - bh));
        return (
          <g style={{ pointerEvents: "none" }}>
            <line x1={x(hi)} x2={x(hi)} y1={pt} y2={H - pb} style={{ stroke: C.border }} />
            <circle cx={x(hi)} cy={y(p.value)} r="4.5" style={{ fill: C.leafDark }} />
            <rect x={tx} y={ty} width={bw} height={bh} rx="9" strokeWidth="1.5" style={{ fill: C.card, stroke: C.border }} />
            <text x={tx + 10} y={ty + 17} fontSize="11" fontWeight="700" style={{ fill: C.ink }}>Age {p.age}</text>
            <text x={tx + 10} y={ty + 33} fontSize="11" className="mg-num" style={{ fill: C.leafDark }}>Expected {fmt(p.value)}</text>
            <text x={tx + 10} y={ty + 49} fontSize="11" className="mg-num" style={{ fill: C.inkSoft }}>Range {fmtK(p.band[0])} – {fmtK(p.band[1])}</text>
          </g>
        );
      })()}
    </svg>
  );
}
