/*
 * Shared chart hooks, verbatim from the reference.
 */
import { useEffect, useRef, useState } from "react";
import type { PointerEvent, RefObject } from "react";

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
 * Reactive media-query match — re-renders when the query flips (resize,
 * rotation). Used for copy that adapts to the space available (e.g. the
 * search placeholder on very narrow phones).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    onChange(); // sync in case the query changed between render and effect
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
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
 * How many viewBox units map to one on-screen pixel — the inverse of the
 * preserveAspectRatio scale. A chart's fixed viewBox (W≈560–640) is squeezed
 * to fit its container, so on a narrow phone one CSS pixel spans ~1.6 viewBox
 * units and a 11-unit label renders at ~7px. Multiplying a tooltip's geometry
 * by this factor and never letting it drop below 1 counter-scales the tooltip
 * to a CONSTANT on-screen size on small screens, while leaving desktop
 * (where the chart is as wide as or wider than its viewBox) pixel-identical.
 * Like CSS's `max(1, …)` — the clamp is what keeps desktop untouched.
 */
export function useSvgScale(ref: RefObject<SVGSVGElement | null>, W: number): number {
  const [k, setK] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setK(Math.max(1, W / w));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, W]);
  return k;
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
