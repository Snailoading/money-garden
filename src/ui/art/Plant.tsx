/*
 * PLANT — a goal's five growth stages rendered in SVG, verbatim from the
 * reference: seed → sprout → leaves → bud → full bloom, advancing at
 * 12% / 40% / 70% / 100% funded.
 */
import { C } from "../theme";

export function Plant({ progress, bloom, size = 110, celebrate }: { progress: number; bloom: string; size?: number; celebrate?: boolean }) {
  const stage = progress >= 1 ? 4 : progress >= 0.7 ? 3 : progress >= 0.4 ? 2 : progress >= 0.12 ? 1 : 0;
  const stem = C.leafDark;
  const sway = celebrate ? "mg-sway 1.6s ease-in-out infinite" : "none";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow: "visible" }}>
      {/* soil mound */}
      <ellipse cx="50" cy="92" rx="26" ry="7" fill={C.soil} opacity="0.85" />
      <ellipse cx="50" cy="90.5" rx="26" ry="6.5" fill="#A08560" opacity="0.5" />
      <g style={{ transformOrigin: "50px 90px", animation: sway }}>
        {stage === 0 && (
          <g>
            <ellipse cx="50" cy="88" rx="4.5" ry="6" fill="#C9A36B" transform="rotate(18 50 88)" />
            <path d="M48 84 q2 -3 4 0" stroke="#8A6F52" strokeWidth="1.4" fill="none" />
          </g>
        )}
        {stage >= 1 && (
          <path d={`M50 90 C 50 ${90 - 12 * stage} 50 ${90 - 14 * stage} 50 ${90 - 16 * stage}`}
            stroke={stem} strokeWidth="3" fill="none" strokeLinecap="round" />
        )}
        {stage >= 1 && (
          <path d="M50 80 q-10 -4 -13 -12 q11 1 13 8 z" fill={C.leaf} />
        )}
        {stage >= 2 && (
          <path d="M50 70 q10 -4 13 -12 q-11 1 -13 8 z" fill={C.leaf} />
        )}
        {stage >= 3 && (
          <path d="M50 58 q-9 -3 -11 -10 q9 1 11 6 z" fill={C.leaf} opacity="0.9" />
        )}
        {stage === 3 && (
          <circle cx="50" cy={90 - 16 * 3 - 4} r="6" fill={bloom} opacity="0.55" stroke={stem} strokeWidth="1.5" />
        )}
        {stage === 4 && (
          <g>
            {[0, 60, 120, 180, 240, 300].map((a) => (
              <ellipse key={a} cx="50" cy="16" rx="6" ry="10"
                transform={`rotate(${a} 50 26)`} fill={bloom} opacity="0.95" />
            ))}
            <circle cx="50" cy="26" r="6.5" fill="#7A4E2A" />
            <circle cx="48.5" cy="24.5" r="2" fill="#9A6B3F" />
          </g>
        )}
      </g>
    </svg>
  );
}
