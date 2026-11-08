/*
 * The charts' entry wipe: a clip rect that grows from 0 to the chart's width
 * one frame after mount. Charts now draw at their real width (useChartSize),
 * so the rect's width follows W — and with the transition still on, a later
 * resize (rotating a phone, widening the window) would wipe the chart in all
 * over again. Once the first wipe has finished, the transition is dropped and
 * resizes snap. (Under prefers-reduced-motion the global rule removes the
 * transition altogether, so there's no wipe and nothing to finish.)
 */
import { useState } from "react";
import { useReveal } from "../hooks";

export function RevealClip({ id, W, H, seconds }: { id: string; W: number; H: number; seconds: number }) {
  const on = useReveal();
  const [done, setDone] = useState(false);
  return (
    <defs>
      <clipPath id={id}>
        <rect x="0" y="0" height={H} width={on ? W : 0}
          style={{ transition: done ? "none" : `width ${seconds}s ease` }}
          onTransitionEnd={() => setDone(true)} />
      </clipPath>
    </defs>
  );
}
