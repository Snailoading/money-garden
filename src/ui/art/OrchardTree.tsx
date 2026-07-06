/*
 * ORCHARD TREE — the freedom tree. Trunk and canopy scale with FIRE progress;
 * fruit appears at Coast FIRE (3 cherries) and full FIRE (6, golden canopy).
 * Verbatim from the reference.
 */
import { C } from "../theme";

export function OrchardTree({ progress, coast, fired, size = 150 }: { progress: number; coast: boolean; fired: boolean; size?: number }) {
  const p = Math.max(0.08, Math.min(1, progress || 0));
  const trunkH = 18 + p * 34;
  const canopyR = 10 + p * 22;
  const topY = 88 - trunkH;
  const sway = fired ? "mg-sway 2.4s ease-in-out infinite" : "none";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow: "visible" }}>
      <ellipse cx="50" cy="92" rx="30" ry="7" fill={C.soil} opacity="0.85" />
      <ellipse cx="50" cy="90.5" rx="30" ry="6.5" fill="#A08560" opacity="0.5" />
      <g style={{ transformOrigin: "50px 90px", animation: sway }}>
        <path d={`M50 90 C 49 ${90 - trunkH * 0.5} 51 ${90 - trunkH * 0.7} 50 ${topY}`}
          stroke="#7A5C3E" strokeWidth={2.5 + p * 2.5} fill="none" strokeLinecap="round" />
        {p > 0.35 && <path d={`M50 ${topY + canopyR * 0.9} q-8 -3 -12 -9`} stroke="#7A5C3E" strokeWidth="2.5" fill="none" strokeLinecap="round" />}
        <circle cx={50 - canopyR * 0.55} cy={topY + canopyR * 0.25} r={canopyR * 0.75} fill={fired ? C.marigold : C.leaf} opacity="0.9" />
        <circle cx={50 + canopyR * 0.55} cy={topY + canopyR * 0.25} r={canopyR * 0.75} fill={fired ? "#E8A81C" : C.leafDark} opacity="0.85" />
        <circle cx="50" cy={topY - canopyR * 0.15} r={canopyR} fill={fired ? "#F6C64B" : "#57AB72"} />
        {(coast || fired) &&
          [...Array(fired ? 6 : 3)].map((_, i) => {
            const a = (i * 2 * Math.PI) / (fired ? 6 : 3) + 0.7;
            return <circle key={i} cx={50 + canopyR * 0.65 * Math.cos(a)} cy={topY - canopyR * 0.15 + canopyR * 0.55 * Math.sin(a)} r="2.8" fill={C.tomato} />;
          })}
      </g>
    </svg>
  );
}
