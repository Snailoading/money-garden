/*
 * Shared chart hooks, verbatim from the reference.
 */
import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";

/**
 * Entry-animation trigger: flips true one frame after mount so CSS
 * transitions (clip-rect widths, donut scale) animate from their start state.
 */
export function useReveal(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(t);
  }, []);
  return on;
}

/**
 * Map a pointer event into an SVG's viewBox x-coordinate. getScreenCTM
 * accounts for preserveAspectRatio letterboxing exactly — the element is
 * often wider than the drawing, which skewed the old proportional math.
 * Falls back to the proportional estimate if the CTM isn't available.
 */
export function svgX(el: SVGSVGElement, e: PointerEvent<SVGSVGElement>, W: number): number {
  const ctm = el.getScreenCTM();
  if (ctm) return new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse()).x;
  const r = el.getBoundingClientRect();
  return ((e.clientX - r.left) / r.width) * W;
}

/**
 * Tooltip hit-testing for line charts: maps the pointer's x position into
 * viewBox space and rounds to the nearest data index. Touch-friendly — no
 * per-point hover targets needed.
 */
export function useNearest(W: number, pl: number, pr: number, n: number) {
  const ref = useRef<SVGSVGElement>(null);
  const [hi, setHi] = useState<number | null>(null);
  const locate = (e: PointerEvent<SVGSVGElement>) => {
    const el = ref.current;
    if (!el || n < 2) return;
    const fx = svgX(el, e, W);
    setHi(Math.max(0, Math.min(n - 1, Math.round(((fx - pl) / (W - pl - pr)) * (n - 1)))));
  };
  return { ref, hi, locate, clear: () => setHi(null) };
}
