/*
 * Seasons charts — dependency-free SVG like the rest of the garden:
 *   SeasonsBars     — earned vs spent per month, saved as a marigold line
 *   SeasonsRate     — savings rate per month vs the 20% benchmark
 *   SeasonsSplit    — needs vs wants stacked per month
 *   SeasonsLeftover — money left unplanted per month, diverging around zero
 * Shared band geometry + tooltip pattern (edge-flip, clamp). Hover maps the
 * pointer to a month band (bars aren't evenly spread points, so this uses a
 * band-based locate instead of useNearest).
 */
import { useRef, useState } from "react";
import type { PointerEvent } from "react";
import type { TrendPoint } from "../../engine/trends";
import { fmt } from "../../engine/format";
import { C } from "../theme";
import { svgX, useReveal, useSvgScale } from "../hooks";
import { niceAxis, niceStep, stepsUpTo, tickMoney } from "./ticks";

const W = 640, H = 220, pl = 50, pr = 14, pt = 14, pb = 24;

function useBandHover(n: number) {
  const ref = useRef<SVGSVGElement>(null);
  const [hi, setHi] = useState<number | null>(null);
  const locate = (e: PointerEvent<SVGSVGElement>) => {
    const el = ref.current;
    if (!el || n === 0) return;
    const fx = svgX(el, e, W);
    const band = (W - pl - pr) / n;
    setHi(Math.max(0, Math.min(n - 1, Math.floor((fx - pl) / band))));
  };
  return { ref, hi, locate, clear: () => setHi(null) };
}

const cxOf = (i: number, n: number) => pl + ((W - pl - pr) / n) * (i + 0.5);

/** `maxY` and `ticks` come from niceAxis — gridlines on round values. */
function Frame({ maxY, ticks, fmtTick, children }: { maxY: number; ticks: number[]; fmtTick: (v: number) => string; children: React.ReactNode }) {
  const y = (v: number) => pt + (1 - v / maxY) * (H - pt - pb);
  return (
    <>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} strokeDasharray="3 5" style={{ stroke: C.border }} />
          <text x={pl - 6} y={y(t) + 4} textAnchor="end" fontSize="11" className="mg-num" style={{ fill: C.inkSoft }}>{fmtTick(t)}</text>
        </g>
      ))}
      <line x1={pl} x2={W - pr} y1={y(0)} y2={y(0)} style={{ stroke: C.border }} />
      {children}
    </>
  );
}

function MonthLabels({ trends }: { trends: TrendPoint[] }) {
  return (
    <>
      {trends.map((p, i) => (
        <text key={p.ym} x={cxOf(i, trends.length)} y={H - 6} textAnchor="middle" fontSize="10" className="mg-num" style={{ fill: C.inkSoft }}>{p.label}</text>
      ))}
    </>
  );
}

function Tooltip({ x, rows, title, k }: { x: number; rows: [string, string, string][]; title: string; k: number }) {
  const bw = 150, bh = 24 + rows.length * 16;
  // Box+text scale by k (constant on-screen size on phones); the guide line
  // stays in chart geometry. Flip against the scaled width bw*k.
  let bx = x + 10;
  if (bx + bw * k > W - pr) bx = x - bw * k - 10;
  const by = pt + 4;
  return (
    <g style={{ pointerEvents: "none" }}>
      <line x1={x} x2={x} y1={pt} y2={H - pb} style={{ stroke: C.border }} />
      <g transform={`translate(${bx} ${by}) scale(${k})`}>
        <rect x={0} y={0} width={bw} height={bh} rx="9" strokeWidth="1.5" style={{ fill: C.card, stroke: C.border }} />
        <text x={10} y={17} fontSize="11" fontWeight="700" style={{ fill: C.ink }}>{title}</text>
        {rows.map(([label, value, color], i) => (
          <text key={label} x={10} y={33 + i * 16} fontSize="11" className="mg-num" style={{ fill: color }}>{label} {value}</text>
        ))}
      </g>
    </g>
  );
}

/** Earned vs spent bars with the saved line — "the harvest ledger". */
export function SeasonsBars({ trends, onPick }: { trends: TrendPoint[]; onPick?: (ym: string) => void }) {
  const on = useReveal();
  const { ref, hi, locate, clear } = useBandHover(trends.length);
  const k = useSvgScale(ref, W);
  const cid = useRef("c" + Math.random().toString(36).slice(2, 9)).current;
  if (trends.length === 0) return null;
  const n = trends.length;
  const band = (W - pl - pr) / n;
  const { top: maxY, ticks } = niceAxis(Math.max(1, ...trends.map((p) => Math.max(p.earned, p.spent, p.saved))) * 1.08);
  const y = (v: number) => pt + (1 - v / maxY) * (H - pt - pb);
  const bw = Math.min(16, band * 0.3);
  const harvests = trends.filter((p) => p.drawn > 0);
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
      onPointerMove={locate} onPointerDown={locate} onPointerLeave={clear}
      style={{ width: "100%", height: "100%", display: "block", touchAction: "pan-y" }} role="img"
      aria-label={"Earned vs spent per month" + (harvests.length ? `; spent from goals in ${harvests.map((p) => p.label).join(", ")}` : "")}>
      <defs><clipPath id={cid}><rect x="0" y="0" height={H} width={on ? W : 0} style={{ transition: "width .9s ease" }} /></clipPath></defs>
      <Frame maxY={maxY} ticks={ticks} fmtTick={tickMoney}>
        <MonthLabels trends={trends} />
        <g clipPath={`url(#${cid})`}>
          {trends.map((p, i) => {
            const cx = cxOf(i, n);
            return (
              <g key={p.ym} opacity={p.partial ? 0.55 : 1}>
                <rect x={cx - bw - 1} y={y(p.earned)} width={bw} height={Math.max(0, y(0) - y(p.earned))} rx="2" style={{ fill: C.leafDark }} />
                <rect x={cx + 1} y={y(p.spent)} width={bw} height={Math.max(0, y(0) - y(p.spent))} rx="2" style={{ fill: C.tomato }} />
              </g>
            );
          })}
          {n > 1 && (
            <polyline points={trends.map((p, i) => `${cxOf(i, n).toFixed(1)},${y(p.saved).toFixed(1)}`).join(" ")}
              strokeWidth="2" strokeLinejoin="round" style={{ fill: "none", stroke: C.marigold }} />
          )}
          {trends.map((p, i) => (
            <circle key={p.ym} cx={cxOf(i, n)} cy={y(p.saved)} r="3" strokeWidth="1" style={{ fill: C.marigold, stroke: C.card }} />
          ))}
        </g>
        {/* 🌸 harvest-month markers — cross-basis annotation at the foot of the
            month, never a bar series (drawn is goal money, not this month's
            budget; a big harvest would rescale the axis). Outside the entry
            clip like SvgPace, and before the pick targets so taps still land. */}
        {trends.map((p, i) => (p.drawn > 0 ? (
          <text key={"d" + p.ym} x={cxOf(i, n)} y={H - pb - 5} textAnchor="middle" fontSize="12">🌸</text>
        ) : null))}
        {/* invisible pick targets — tapping a month walks into it */}
        {onPick && trends.map((p, i) => (
          <rect key={p.ym} x={pl + band * i} y={pt} width={band} height={H - pt - pb} fill="transparent"
            style={{ cursor: "pointer" }} onClick={() => onPick(p.ym)} />
        ))}
        {hi != null && (
          <Tooltip k={k} x={cxOf(hi, n)} title={trends[hi].label + (trends[hi].partial ? " (so far)" : "")}
            rows={[
              ["Earned", fmt(trends[hi].earned), C.leafDark],
              ["Spent", fmt(trends[hi].spent), C.tomato],
              ["Saved", fmt(trends[hi].saved), C.amber],
              // Conditional spread — like Python's *([row] if drawn else []).
              ...(trends[hi].drawn > 0
                ? [["🌸 Drawn", fmt(trends[hi].drawn), C.tomato] as [string, string, string]]
                : []),
            ]} />
        )}
      </Frame>
    </svg>
  );
}

/**
 * Money left unplanted per month (income − spent − saved), diverging around
 * a zero baseline: leaf above (surplus), tomato below (the month outgrew its
 * income). Months with nothing logged are gaps, not bars — left is null
 * there, and a zero-height bar would still claim "exactly break-even".
 * Its own frame: the shared Frame assumes a 0-based axis.
 */
export function SeasonsLeftover({ trends }: { trends: TrendPoint[] }) {
  const on = useReveal();
  const { ref, hi, locate, clear } = useBandHover(trends.length);
  const k = useSvgScale(ref, W);
  const cid = useRef("c" + Math.random().toString(36).slice(2, 9)).current;
  if (trends.length === 0) return null;
  const n = trends.length;
  const band = (W - pl - pr) / n;
  const lefts = trends.map((p) => p.left).filter((v): v is number => v !== null);
  const hasSurplus = lefts.some((v) => v > 0);
  const surplus = Math.max(1, ...lefts) * 1.08;
  const deficit = -Math.min(0, ...lefts) * 1.08;
  // One round step for both sides, sized so the taller side gets about two
  // gridlines; each side then extends to its next whole step.
  const step = niceStep(Math.max(hasSurplus ? surplus : 0, deficit) / 2);
  // An all-deficit window keeps the old 1.08 sliver above zero and draws no
  // positive gridlines (they'd be "$1" ticks hugging the zero line).
  const maxV = hasSurplus ? Math.ceil(surplus / step - 1e-9) * step : surplus;
  const minV = deficit > 0 ? -Math.ceil(deficit / step - 1e-9) * step : 0;
  const y = (v: number) => pt + ((maxV - v) / (maxV - minV)) * (H - pt - pb);
  const bw = Math.min(26, band * 0.55);
  const ticks = [
    ...(hasSurplus ? stepsUpTo(step, maxV) : []),
    ...stepsUpTo(step, -minV).map((t) => -t),
  ];
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
      onPointerMove={locate} onPointerDown={locate} onPointerLeave={clear}
      style={{ width: "100%", height: "100%", display: "block", touchAction: "pan-y" }} role="img"
      aria-label="Money left over per month; months below the line outgrew their income">
      <defs><clipPath id={cid}><rect x="0" y="0" height={H} width={on ? W : 0} style={{ transition: "width .9s ease" }} /></clipPath></defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} strokeDasharray="3 5" style={{ stroke: C.border }} />
          <text x={pl - 6} y={y(t) + 4} textAnchor="end" fontSize="11" className="mg-num" style={{ fill: C.inkSoft }}>{tickMoney(t)}</text>
        </g>
      ))}
      {/* the zero baseline is the story's pivot — solid, labeled */}
      <line x1={pl} x2={W - pr} y1={y(0)} y2={y(0)} strokeWidth="1.5" style={{ stroke: C.border }} />
      <text x={pl - 6} y={y(0) + 4} textAnchor="end" fontSize="11" className="mg-num" style={{ fill: C.inkSoft }}>$0</text>
      <MonthLabels trends={trends} />
      <g clipPath={`url(#${cid})`}>
        {trends.map((p, i) => {
          if (p.left === null) return null; // nothing logged — a gap
          const cx = cxOf(i, n);
          const top = Math.min(y(p.left), y(0));
          return (
            <rect key={p.ym} x={cx - bw / 2} y={top} width={bw} rx="2"
              height={Math.max(1, Math.abs(y(0) - y(p.left)))} opacity={p.partial ? 0.55 : 1}
              style={{ fill: p.left >= 0 ? C.leaf : C.tomato }} />
          );
        })}
      </g>
      {hi != null && (
        <Tooltip k={k} x={cxOf(hi, n)} title={trends[hi].label + (trends[hi].partial ? " (so far)" : "")}
          rows={
            trends[hi].left === null
              ? trends[hi].drawn > 0
                // A draws-only month: the gap is honest (draws spend a goal's
                // pool, not this month's income) but "nothing logged" isn't.
                ? [
                    ["Only goal draws logged", "", C.inkSoft] as [string, string, string],
                    ["🌸 Drawn", fmt(trends[hi].drawn), C.tomato] as [string, string, string],
                  ]
                : [["Nothing logged", "", C.inkSoft]]
              : [
                  [trends[hi].left! >= 0 ? "Left over" : "Overspent by", fmt(Math.abs(trends[hi].left!)), trends[hi].left! >= 0 ? C.leafDark : C.tomato],
                  // No income logged that month — the figure rests on the
                  // stated monthly income, so say so (honest-copy rule).
                  ...(trends[hi].earned === 0 && trends[hi].income > 0
                    ? [["· from stated income", "", C.inkSoft] as [string, string, string]]
                    : []),
                ]
          } />
      )}
    </svg>
  );
}

/** Savings rate per month against the classic 20% benchmark. */
export function SeasonsRate({ trends }: { trends: TrendPoint[] }) {
  const on = useReveal();
  const { ref, hi, locate, clear } = useBandHover(trends.length);
  const k = useSvgScale(ref, W);
  const cid = useRef("c" + Math.random().toString(36).slice(2, 9)).current;
  if (trends.length === 0) return null;
  const n = trends.length;
  const rates = trends.map((p) => p.savingsRate * 100);
  const { top: maxY, ticks } = niceAxis(Math.max(30, ...rates.map((r) => r * 1.15)), 3, 10);
  const y = (v: number) => pt + (1 - v / maxY) * (H - pt - pb);
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
      onPointerMove={locate} onPointerDown={locate} onPointerLeave={clear}
      style={{ width: "100%", height: "100%", display: "block", touchAction: "pan-y" }} role="img" aria-label="Savings rate per month">
      <defs><clipPath id={cid}><rect x="0" y="0" height={H} width={on ? W : 0} style={{ transition: "width .9s ease" }} /></clipPath></defs>
      <Frame maxY={maxY} ticks={ticks} fmtTick={(v) => Math.round(v) + "%"}>
        <MonthLabels trends={trends} />
        <g>
          <line x1={pl} x2={W - pr} y1={y(20)} y2={y(20)} strokeWidth="1.8" strokeDasharray="7 5" style={{ stroke: C.marigold }} />
          <text x={W - pr} y={y(20) - 6} textAnchor="end" fontSize="10.5" fontWeight="700" style={{ fill: C.amber }}>20% benchmark</text>
        </g>
        <g clipPath={`url(#${cid})`}>
          {n > 1 && (
            <polyline points={trends.map((p, i) => `${cxOf(i, n).toFixed(1)},${y(p.savingsRate * 100).toFixed(1)}`).join(" ")}
              strokeWidth="2.5" strokeLinejoin="round" style={{ fill: "none", stroke: C.leafDark }} />
          )}
          {trends.map((p, i) => (
            <circle key={p.ym} cx={cxOf(i, n)} cy={y(p.savingsRate * 100)} r="3.5" strokeWidth="1" opacity={p.partial ? 0.55 : 1} style={{ fill: C.leafDark, stroke: C.card }} />
          ))}
        </g>
        {hi != null && (
          <Tooltip k={k} x={cxOf(hi, n)} title={trends[hi].label + (trends[hi].partial ? " (so far)" : "")}
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
  const k = useSvgScale(ref, W);
  const cid = useRef("c" + Math.random().toString(36).slice(2, 9)).current;
  if (trends.length === 0) return null;
  const n = trends.length;
  const band = (W - pl - pr) / n;
  const { top: maxY, ticks } = niceAxis(Math.max(1, ...trends.map((p) => p.needs + p.wants)) * 1.08);
  const y = (v: number) => pt + (1 - v / maxY) * (H - pt - pb);
  const bw = Math.min(26, band * 0.55);
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
      onPointerMove={locate} onPointerDown={locate} onPointerLeave={clear}
      style={{ width: "100%", height: "100%", display: "block", touchAction: "pan-y" }} role="img" aria-label="Needs vs wants per month">
      <defs><clipPath id={cid}><rect x="0" y="0" height={H} width={on ? W : 0} style={{ transition: "width .9s ease" }} /></clipPath></defs>
      <Frame maxY={maxY} ticks={ticks} fmtTick={tickMoney}>
        <MonthLabels trends={trends} />
        <g clipPath={`url(#${cid})`}>
          {trends.map((p, i) => {
            const cx = cxOf(i, n);
            const needsTop = y(p.needs);
            const wantsTop = y(p.needs + p.wants);
            return (
              <g key={p.ym} opacity={p.partial ? 0.55 : 1}>
                <rect x={cx - bw / 2} y={needsTop} width={bw} height={Math.max(0, y(0) - needsTop)} rx="2" style={{ fill: C.leafDark }} />
                <rect x={cx - bw / 2} y={wantsTop} width={bw} height={Math.max(0, needsTop - wantsTop)} rx="2" style={{ fill: C.marigold }} />
              </g>
            );
          })}
        </g>
        {hi != null && (
          <Tooltip k={k} x={cxOf(hi, n)} title={trends[hi].label + (trends[hi].partial ? " (so far)" : "")}
            rows={[
              ["Needs", fmt(trends[hi].needs), C.leafDark],
              ["Wants", fmt(trends[hi].wants), C.amber],
            ]} />
        )}
      </Frame>
    </svg>
  );
}
