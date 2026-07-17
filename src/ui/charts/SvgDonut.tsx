/*
 * Category donut: arcs built by hand with SVG arc commands, per-slice hover
 * (dim the rest, scale the hovered slice) and a scale/rotate entry animation.
 * Colors via style props so the palette's var() references resolve. The
 * slice palette is theme-aware (CHART_PALETTE in theme.ts — ten --cat-N
 * variables with day and night values in global.css).
 */
import { useState } from "react";
import { fmt } from "../../engine/format";
import { C } from "../theme";
import { useReveal } from "../hooks";

export interface DonutDatum {
  name: string;
  emoji: string;
  value: number;
}

export function SvgDonut({ data, palette }: { data: DonutDatum[]; palette: readonly string[] }) {
  const on = useReveal();
  const [hi, setHi] = useState<number | null>(null);
  const total = data.reduce((a, x) => a + x.value, 0) || 1;
  const R = 80, r = 48, cx = 85, cy = 85, PAD = 0.03;
  const center = hi != null ? data[hi] : null;
  const CenterLabel = () => (
    <g style={{ pointerEvents: "none" }}>
      <text x={cx} y={cy - 11} textAnchor="middle" fontSize="10.5" style={{ fill: C.inkSoft }}>{center ? (center.name.length > 15 ? center.name.slice(0, 14) + "…" : center.name) : "This month"}</text>
      <text x={cx} y={cy + 7} textAnchor="middle" fontSize="15" fontWeight="700" className="mg-num" style={{ fill: C.ink }}>{fmt(center ? center.value : total)}</text>
      <text x={cx} y={cy + 23} textAnchor="middle" fontSize="10.5" className="mg-num" style={{ fill: C.inkSoft }}>{center ? Math.round((center.value / total) * 100) + "%" : "total spend"}</text>
    </g>
  );
  const revealStyle = { transform: on ? "scale(1) rotate(0deg)" : "scale(.85) rotate(-8deg)", opacity: on ? 1 : 0, transition: "transform .55s cubic-bezier(.2,.8,.3,1), opacity .4s ease", transformOrigin: "center", transformBox: "view-box" } as const;
  if (data.length === 1) {
    // A single category can't be drawn as an arc pair — use a full ring.
    return (
      <svg viewBox="0 0 170 170" style={{ width: "100%", height: "100%" }} role="img" aria-label="Spending by category">
        <g style={revealStyle}>
          <circle cx={cx} cy={cy} r={(R + r) / 2} strokeWidth={R - r} style={{ fill: "none", stroke: palette[0] }}
            onPointerEnter={() => setHi(0)} onPointerLeave={() => setHi(null)} onPointerDown={() => setHi(0)} />
        </g>
        <CenterLabel />
      </svg>
    );
  }
  let a0 = -Math.PI / 2;
  const segs = data.map((x, i) => {
    const sweep = (x.value / total) * Math.PI * 2;
    const s = { s: a0 + PAD / 2, e: a0 + Math.max(PAD, sweep) - PAD / 2, color: palette[i % palette.length] };
    a0 += sweep; return s;
  });
  const pt2 = (a: number, rad: number) => (cx + rad * Math.cos(a)).toFixed(2) + " " + (cy + rad * Math.sin(a)).toFixed(2);
  return (
    <svg viewBox="0 0 170 170" style={{ width: "100%", height: "100%" }} role="img" aria-label="Spending by category">
      <g style={revealStyle}>
        {segs.map((g, i) => {
          const large = g.e - g.s > Math.PI ? 1 : 0;
          const d = "M " + pt2(g.s, R) + " A " + R + " " + R + " 0 " + large + " 1 " + pt2(g.e, R) +
                    " L " + pt2(g.e, r) + " A " + r + " " + r + " 0 " + large + " 0 " + pt2(g.s, r) + " Z";
          return (
            <path key={i} d={d}
              onPointerEnter={() => setHi(i)} onPointerLeave={() => setHi(null)} onPointerDown={() => setHi(i)}
              style={{ fill: g.color, cursor: "pointer", opacity: hi == null || hi === i ? 1 : 0.45, transform: hi === i ? "scale(1.045)" : "scale(1)", transformOrigin: "center", transformBox: "view-box", transition: "transform .15s ease, opacity .15s ease" }} />
          );
        })}
      </g>
      <CenterLabel />
    </svg>
  );
}
