/*
 * Seasons charts — dependency-free SVG like the rest of the garden:
 *   SeasonsBars  — earned vs spent per month, saved as a marigold line
 *   SeasonsRate  — savings rate per month vs the 20% benchmark
 *   SeasonsSplit — needs vs wants stacked per month
 * Shared band geometry + tooltip pattern (edge-flip, clamp). Hover maps the
 * pointer to a month band (bars aren't evenly spread points, so this uses a
 * band-based locate instead of useNearest).
 */
import { useRef, useState } from "react";
import type { PointerEvent } from "react";
import type { TrendPoint } from "../../engine/trends";
import { fmt, fmtK } from "../../engine/format";
import { C } from "../theme";
import { useReveal } from "../hooks";

const W = 640, H = 220, pl = 50, pr = 14, pt = 14, pb = 24;

function useBandHover(n: number) {
  const ref = useRef<SVGSVGElement>(null);
  const [hi, setHi] = useState<number | null>(null);
  const locate = (e: PointerEvent<SVGSVGElement>) => {
    const el = ref.current;
    if (!el || n === 0) return;
    const r = el.getBoundingClientRect();
    const fx = ((e.clientX - r.left) / r.width) * W;
    const band = (W - pl - pr) / n;
    setHi(Math.max(0, Math.min(n - 1, Math.floor((fx - pl) / band))));
  };
  return { ref, hi, locate, clear: () => setHi(null) };
}

const cxOf = (i: number, n: number) => pl + ((W - pl - pr) / n) * (i + 0.5);

function Frame({ maxY, fmtTick, children }: { maxY: number; fmtTick: (v: number) => string; children: React.ReactNode }) {
  const y = (v: number) => pt + (1 - v / maxY) * (H - pt - pb);
  return (
    <>
      {[1 / 3, 2 / 3, 1].map((t, i) => (
        <g key={i}>
          <line x1={pl} x2={W - pr} y1={y(t * maxY)} y2={y(t * maxY)} stroke={C.border} strokeDasharray="3 5" />
          <text x={pl - 6} y={y(t * maxY) + 4} textAnchor="end" fontSize="11" fill={C.inkSoft} className="mg-num">{fmtTick(t * maxY)}</text>
        </g>
      ))}
      <line x1={pl} x2={W - pr} y1={y(0)} y2={y(0)} stroke={C.border} />
      {children}
    </>
  );
}

function MonthLabels({ trends }: { trends: TrendPoint[] }) {
  return (
    <>
      {trends.map((p, i) => (
        <text key={p.ym} x={cxOf(i, trends.length)} y={H - 6} textAnchor="middle" fontSize="10" fill={C.inkSoft} className="mg-num">{p.label}</text>
      ))}
    </>
  );
}

function Tooltip({ x, rows, title }: { x: number; rows: [string, string, string][]; title: string }) {
  const bw = 150, bh = 24 + rows.length * 16;
  let tx = x + 10;
  if (tx + bw > W - pr) tx = x - bw - 10;
  const ty = pt + 4;
  return (
    <g style={{ pointerEvents: "none" }}>
      <line x1={x} x2={x} y1={pt} y2={H - pb} stroke={C.border} />
      <rect x={tx} y={ty} width={bw} height={bh} rx="9" fill={C.card} stroke={C.border} strokeWidth="1.5" />
      <text x={tx + 10} y={ty + 17} fontSize="11" fontWeight="700" fill={C.ink}>{title}</text>
      {rows.map(([label, value, color], i) => (
        <text key={label} x={tx + 10} y={ty + 33 + i * 16} fontSize="11" fill={color} className="mg-num">{label} {value}</text>
      ))}
    </g>
  );
}

/** Earned vs spent bars with the saved line — "the harvest ledger". */
export function SeasonsBars({ trends, onPick }: { trends: TrendPoint[]; onPick?: (ym: string) => void }) {
  const on = useReveal();
  const { ref, hi, locate, clear } = useBandHover(trends.length);
  const cid = useRef("c" + Math.random().toString(36).slice(2, 9)).current;
  if (trends.length === 0) return null;
  const n = trends.length;
  const band = (W - pl - pr) / n;
  const maxY = Math.max(1, ...trends.map((p) => Math.max(p.earned, p.spent, p.saved))) * 1.08;
  const y = (v: number) => pt + (1 - v / maxY) * (H - pt - pb);
  const bw = Math.min(16, band * 0.3);
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
      onPointerMove={locate} onPointerDown={locate} onPointerLeave={clear}
      style={{ width: "100%", height: "100%", display: "block", touchAction: "pan-y" }} role="img" aria-label="Earned vs spent per month">
      <defs><clipPath id={cid}><rect x="0" y="0" height={H} width={on ? W : 0} style={{ transition: "width .9s ease" }} /></clipPath></defs>
      <Frame maxY={maxY} fmtTick={fmtK}>
        <MonthLabels trends={trends} />
        <g clipPath={`url(#${cid})`}>
          {trends.map((p, i) => {
            const cx = cxOf(i, n);
            return (
              <g key={p.ym} opacity={p.partial ? 0.55 : 1}>
                <rect x={cx - bw - 1} y={y(p.earned)} width={bw} height={Math.max(0, y(0) - y(p.earned))} rx="2" fill={C.leafDark} />
                <rect x={cx + 1} y={y(p.spent)} width={bw} height={Math.max(0, y(0) - y(p.spent))} rx="2" fill={C.tomato} />
              </g>
            );
          })}
          {n > 1 && (
            <polyline points={trends.map((p, i) => `${cxOf(i, n).toFixed(1)},${y(p.saved).toFixed(1)}`).join(" ")}
              fill="none" stroke={C.marigold} strokeWidth="2" strokeLinejoin="round" />
          )}
          {trends.map((p, i) => (
            <circle key={p.ym} cx={cxOf(i, n)} cy={y(p.saved)} r="3" fill={C.marigold} stroke={C.card} strokeWidth="1" />
          ))}
        </g>
        {/* invisible pick targets — tapping a month walks into it */}
        {onPick && trends.map((p, i) => (
          <rect key={p.ym} x={pl + band * i} y={pt} width={band} height={H - pt - pb} fill="transparent"
            style={{ cursor: "pointer" }} onClick={() => onPick(p.ym)} />
        ))}
        {hi != null && (
          <Tooltip x={cxOf(hi, n)} title={trends[hi].label + (trends[hi].partial ? " (so far)" : "")}
            rows={[
              ["Earned", fmt(trends[hi].earned), C.leafDark],
              ["Spent", fmt(trends[hi].spent), C.tomato],
              ["Saved", fmt(trends[hi].saved), "#9A7418"],
            ]} />
        )}
      </Frame>
    </svg>
  );
}

/** Savings rate per month against the classic 20% benchmark. */
export function SeasonsRate({ trends }: { trends: TrendPoint[] }) {
  const on = useReveal();
  const { ref, hi, locate, clear } = useBandHover(trends.length);
  const cid = useRef("c" + Math.random().toString(36).slice(2, 9)).current;
  if (trends.length === 0) return null;
  const n = trends.length;
  const rates = trends.map((p) => p.savingsRate * 100);
  const maxY = Math.max(30, ...rates.map((r) => r * 1.15));
  const y = (v: number) => pt + (1 - v / maxY) * (H - pt - pb);
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
      onPointerMove={locate} onPointerDown={locate} onPointerLeave={clear}
      style={{ width: "100%", height: "100%", display: "block", touchAction: "pan-y" }} role="img" aria-label="Savings rate per month">
      <defs><clipPath id={cid}><rect x="0" y="0" height={H} width={on ? W : 0} style={{ transition: "width .9s ease" }} /></clipPath></defs>
      <Frame maxY={maxY} fmtTick={(v) => Math.round(v) + "%"}>
        <MonthLabels trends={trends} />
        <g>
          <line x1={pl} x2={W - pr} y1={y(20)} y2={y(20)} stroke={C.marigold} strokeWidth="1.8" strokeDasharray="7 5" />
          <text x={W - pr} y={y(20) - 6} textAnchor="end" fontSize="10.5" fontWeight="700" fill="#9A7418">20% benchmark</text>
        </g>
        <g clipPath={`url(#${cid})`}>
          {n > 1 && (
            <polyline points={trends.map((p, i) => `${cxOf(i, n).toFixed(1)},${y(p.savingsRate * 100).toFixed(1)}`).join(" ")}
              fill="none" stroke={C.leafDark} strokeWidth="2.5" strokeLinejoin="round" />
          )}
          {trends.map((p, i) => (
            <circle key={p.ym} cx={cxOf(i, n)} cy={y(p.savingsRate * 100)} r="3.5" fill={C.leafDark} stroke={C.card} strokeWidth="1" opacity={p.partial ? 0.55 : 1} />
          ))}
        </g>
        {hi != null && (
          <Tooltip x={cxOf(hi, n)} title={trends[hi].label + (trends[hi].partial ? " (so far)" : "")}
            rows={[["Savings rate", Math.round(trends[hi].savingsRate * 100) + "%", C.leafDark]]} />
        )}
      </Frame>
    </svg>
  );
}

/** Needs vs wants, stacked per month — the 50/30/20 story over time. */
export function SeasonsSplit({ trends }: { trends: TrendPoint[] }) {
  const on = useReveal();
  const { ref, hi, locate, clear } = useBandHover(trends.length);
  const cid = useRef("c" + Math.random().toString(36).slice(2, 9)).current;
  if (trends.length === 0) return null;
  const n = trends.length;
  const band = (W - pl - pr) / n;
  const maxY = Math.max(1, ...trends.map((p) => p.needs + p.wants)) * 1.08;
  const y = (v: number) => pt + (1 - v / maxY) * (H - pt - pb);
  const bw = Math.min(26, band * 0.55);
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
      onPointerMove={locate} onPointerDown={locate} onPointerLeave={clear}
      style={{ width: "100%", height: "100%", display: "block", touchAction: "pan-y" }} role="img" aria-label="Needs vs wants per month">
      <defs><clipPath id={cid}><rect x="0" y="0" height={H} width={on ? W : 0} style={{ transition: "width .9s ease" }} /></clipPath></defs>
      <Frame maxY={maxY} fmtTick={fmtK}>
        <MonthLabels trends={trends} />
        <g clipPath={`url(#${cid})`}>
          {trends.map((p, i) => {
            const cx = cxOf(i, n);
            const needsTop = y(p.needs);
            const wantsTop = y(p.needs + p.wants);
            return (
              <g key={p.ym} opacity={p.partial ? 0.55 : 1}>
                <rect x={cx - bw / 2} y={needsTop} width={bw} height={Math.max(0, y(0) - needsTop)} fill={C.leafDark} rx="2" />
                <rect x={cx - bw / 2} y={wantsTop} width={bw} height={Math.max(0, needsTop - wantsTop)} fill={C.marigold} rx="2" />
              </g>
            );
          })}
        </g>
        {hi != null && (
          <Tooltip x={cxOf(hi, n)} title={trends[hi].label + (trends[hi].partial ? " (so far)" : "")}
            rows={[
              ["Needs", fmt(trends[hi].needs), C.leafDark],
              ["Wants", fmt(trends[hi].wants), "#9A7418"],
            ]} />
        )}
      </Frame>
    </svg>
  );
}
