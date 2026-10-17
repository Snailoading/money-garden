/*
 * Shared chart hooks, verbatim from the reference.
 */
import { useEffect, useRef, useState } from "react";
import type { PointerEvent, RefObject } from "react";
import { msUntilNextDay, todayISO } from "../engine/format";

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
 * Two-step confirm for destructive taps (CLAUDE.md: nothing destroys data
 * without an explicit two-step confirm). `arm(id)` swaps that item's ✕ for
 * a "Delete?" control; it quietly disarms after `ms`, and only one item is
 * armed at a time. Returns a plain object — like a small Python class
 * instance whose attributes the component reads.
 */
export function useArmed(ms = 4000) {
  const [armedId, setArmedId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // No stray disarm firing after the component is gone.
  useEffect(() => () => clearTimeout(timer.current), []);
  const arm = (id: string) => {
    setArmedId(id);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setArmedId(null), ms);
  };
  const disarm = () => {
    clearTimeout(timer.current);
    setArmedId(null);
  };
  return { armedId, arm, disarm };
}

/**
 * Today's local date (YYYY-MM-DD), kept current while the app stays open.
 * Memos that depend on the clock add it as a key — like a Python
 * lru_cache keyed on the date — so "today" numbers (daily pace, due dates,
 * the header month) turn over at midnight instead of on the next save.
 *
 * Checks at the next local midnight (a timer, rescheduled each day),
 * whenever the tab is shown or focused, and once a minute: a sleeping phone
 * or a throttled background tab can miss the timer entirely, and waking up
 * is exactly when a stale "today" would be seen. The value only changes
 * when the DATE does, so these checks don't re-render anything on the same day.
 */
export function useToday(): string {
  const [today, setToday] = useState(() => todayISO());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      // Same string → React skips the re-render (setState bails out on an
      // unchanged value, like an `if new != old` guard).
      setToday(todayISO());
      clearTimeout(timer);
      // +1s past midnight: timers can fire a hair early; a too-early check
      // just finds the same date and schedules again.
      timer = setTimeout(check, msUntilNextDay(new Date()) + 1000);
    };
    const onWake = () => { if (document.visibilityState === "visible") check(); };
    check();
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    // Safety net: a laptop that sleeps through midnight with this window
    // focused gets neither event, and timers don't count time asleep — so
    // also look once a minute. Free on an unchanged day (setState bails out).
    const minutely = setInterval(check, 60_000);
    return () => {
      clearInterval(minutely);
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, []);
  return today;
}

/**
 * A form's date field that defaults to today — and keeps following today
 * for as long as the user hasn't picked a date of their own. A Log tab left
 * open overnight would otherwise stamp the morning's first entry with
 * yesterday's date. A different date the user chose (backdating a receipt)
 * is never moved; re-picking today's date looks the same as the untouched
 * default, so that one follows too. Returns the same [value, setter] pair
 * as useState.
 */
export function useDateDefault(today: string) {
  const [date, setDate] = useState(today);
  // The "today" the field last followed. A ref, not state: remembering it
  // must not itself cause a render (like a plain attribute on self).
  const followed = useRef(today);
  useEffect(() => {
    // Still showing the old default → move to the new day; anything else
    // was picked by the user and stays. (Function form: read the CURRENT
    // field value, not the one from the render that scheduled this.)
    setDate((d) => (d === followed.current ? today : d));
    followed.current = today;
  }, [today]);
  return [date, setDate] as const;
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
