// Charts are drawn at their real width (v0.18.8). They used to be drawn at a
// fixed 560–640 units and squeezed into the box, so on a 390px phone the
// text was ~5px and the plot filled under half its box, while on desktop the
// wide charts stopped ~260px short. For each chart at 320 / 390 / 1280px:
// the drawing fills its box exactly; every label renders ≥ 10px on screen;
// the x-axis labels don't touch; the y-axis labels sit on round gridlines on
// one straight scale whose zero is the plot's floor; and a hover tooltip,
// swept across the plot, stays inside the chart. Also: a full 30/31-day month
// at 320px; resizing wider and narrower redraws at the new width; and with
// motion on, the entry wipe plays once but a resize doesn't replay it.
import { chromium } from "playwright";
import { spawn, execSync } from "node:child_process";
import { SP, DIST, shot } from "./paths.mjs";
const PORT = 8159; const BASE = `http://127.0.0.1:${PORT}/`;
try { execSync(`lsof -tnP -iTCP:${PORT} -sTCP:LISTEN | xargs kill`, { stdio: "ignore" }); } catch {}
const server = spawn("python3", [`${SP}/server.py`, DIST, String(PORT)], { stdio: "ignore" });
const out = []; const check = (n, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`);

// [key, tab, aria-label prefix, bottom margin pb — the plot's floor is H − pb]
const CHARTS = [
  ["pace", "Overview", "Cumulative spending", 22],
  ["projection", "Orchard", "Portfolio projection", 24],
];

/** "$2.5k" → 2500, "−$1k" → −1000, "30%" → 30. */
const parse = (s) => {
  const neg = s.startsWith("−");
  const m = s.replace("−", "").match(/^\$?([\d.]+)([kM]?)%?$/);
  if (!m) return NaN;
  const v = Number(m[1]) * (m[2] === "k" ? 1e3 : m[2] === "M" ? 1e6 : 1);
  return neg ? -v : v;
};
/** A round gridline step: 1, 2, 2.5 or 5 × a power of ten. */
const isRoundStep = (s) => {
  if (!(s > 0)) return false;
  const pow = Math.pow(10, Math.floor(Math.log10(s)));
  return [1, 2, 2.5, 5].some((f) => Math.abs(s / pow - f) < 1e-9);
};

/** Everything measurable about one chart, in screen px. */
const measure = (page, label) => page.evaluate((label) => {
  const svg = document.querySelector(`svg[aria-label^="${label}"]`);
  if (!svg) return null;
  const box = svg.getBoundingClientRect(); const vb = svg.viewBox.baseVal;
  const texts = [...svg.querySelectorAll("text")];
  // Each text's own screen transform — it includes any scale() on a parent
  // group (the old tooltips had one), so this is the size actually seen.
  const sizes = texts.map((t) => ({ text: t.textContent, px: Number(t.getAttribute("font-size")) * t.getScreenCTM().a }));
  const H = vb.height;
  // x-axis labels: centred text on the bottom line (y = H − 6).
  const xs = texts.filter((t) => t.getAttribute("text-anchor") === "middle" && Math.abs(Number(t.getAttribute("y")) - (H - 6)) < 0.01)
    .map((t) => { const r = t.getBoundingClientRect(); return { text: t.textContent, l: r.left, r: r.right }; })
    .sort((a, b) => a.l - b.l);
  // y-axis labels: right-anchored text left of the plot, with the gridline at y − 4.
  const lines = [...svg.querySelectorAll("line")].map((l) => Number(l.getAttribute("y1")));
  const ys = texts.filter((t) => t.getAttribute("text-anchor") === "end" && Number(t.getAttribute("x")) < 60)
    .map((t) => { const y = Number(t.getAttribute("y")); return { text: t.textContent.trim(), y, line: lines.some((ly) => Math.abs(ly - (y - 4)) < 0.01) }; });
  return { box: { l: box.left, r: box.right, t: box.top, b: box.bottom, w: box.width, h: box.height }, vb: { w: vb.width, h: vb.height }, sizes, xs, ys };
}, label);

/** The tooltip box (the rounded rect) in screen px with its smallest text
 * size, or null. */
const tip = (page, label) => page.evaluate((label) => {
  const r = document.querySelector(`svg[aria-label^="${label}"] rect[rx="9"]`);
  if (!r) return null;
  const px = [...r.parentNode.querySelectorAll("text")].map((t) => Number(t.getAttribute("font-size")) * t.getScreenCTM().a);
  const b = r.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, px: Math.min(...px) };
}, label);

let browser;
try {
  let pid = null;
  for (let i = 0; i < 50 && pid === null; i++) { try { pid = Number(await (await fetch(BASE + "__pid")).text()); } catch { await new Promise((r) => setTimeout(r, 100)); } }
  if (pid !== server.pid) throw new Error("orphan server");
  browser = await chromium.launch();

  for (const W of [320, 390, 1280]) {
    const ctx = await browser.newContext({ viewport: { width: W, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
    await ctx.addInitScript(() => {
      localStorage.setItem("money-garden:theme", "day"); localStorage.setItem("money-garden:install-hint", "muted");
    });
    const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(e.message)); page.setDefaultTimeout(5000);
    await page.goto(BASE); await page.getByText("Money Garden", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Plant sample data", exact: true }).click();
    await page.getByText("Sent to goals", { exact: true }).waitFor();

    for (const [key, tab, label, pb] of CHARTS) {
      await page.getByRole("button", { name: new RegExp(tab) }).first().click();
      const svg = page.locator(`svg[aria-label^="${label}"]`);
      await svg.waitFor(); await svg.scrollIntoViewIfNeeded();
      const m = await measure(page, label);
      const tag = `${W}px ${key}`;

      check(`${tag}: drawn at the box's real size`, Math.abs(m.vb.w - m.box.w) < 0.5 && Math.abs(m.vb.h - m.box.h) < 0.5,
        `viewBox ${m.vb.w.toFixed(1)}×${m.vb.h.toFixed(1)}, box ${m.box.w.toFixed(1)}×${m.box.h.toFixed(1)}`);
      const small = m.sizes.filter((s) => s.px < 10 - 1e-6);
      check(`${tag}: every label ≥ 10px on screen`, m.sizes.length > 0 && small.length === 0,
        small.length ? small.map((s) => `"${s.text}" ${s.px.toFixed(1)}px`).join(", ") : `${Math.min(...m.sizes.map((s) => s.px)).toFixed(1)}px smallest`);

      const gaps = m.xs.slice(1).map((x, i) => x.l - m.xs[i].r);
      check(`${tag}: x labels don't touch, all inside the chart`,
        m.xs.length >= 2 && gaps.every((g) => g >= 4) && m.xs[0].l >= m.box.l - 0.5 && m.xs[m.xs.length - 1].r <= m.box.r + 0.5,
        `${m.xs.map((x) => x.text).join(" ")} · smallest gap ${Math.min(...gaps).toFixed(1)}px`);

      // y labels: each on its own gridline, round, evenly stepped, one scale.
      const pts = m.ys.map((p) => ({ ...p, v: parse(p.text) })).sort((a, b) => a.v - b.v);
      const shown = pts.map((p) => p.text).join(" ");
      const steps = pts.slice(1).map((p, i) => p.v - pts[i].v);
      const scales = pts.slice(1).map((p, i) => (pts[i].y - p.y) / (p.v - pts[i].v));
      // Follow the scale down to $0: a label sits 4px below its line, so zero's
      // label would be at the plot's floor + 4. (An axis labelled one step
      // off would still be even and linear — this catches it.)
      const zeroAt = pts.length ? pts[0].y + pts[0].v * scales[0] : NaN;
      check(`${tag}: y labels on round, even gridlines (one scale, zero at the floor)`,
        pts.length >= 2 && pts.every((p) => p.line && Number.isFinite(p.v))
          && isRoundStep(steps[0]) && pts.every((p) => Math.abs(p.v / steps[0] - Math.round(p.v / steps[0])) < 1e-9)
          && steps.every((s) => Math.abs(s - steps[0]) < 1e-9 * steps[0])
          && scales.every((s) => Math.abs(s - scales[0]) < 1e-6 * Math.abs(scales[0]))
          && Math.abs(zeroAt - (m.vb.h - pb + 4)) < 0.5,
        `${shown} · zero at ${zeroAt.toFixed(1)}, floor ${(m.vb.h - pb).toFixed(1)}`);

      // Tooltip sweep: 5% steps across the box; it must stay inside.
      let outside = [];
      for (let f = 0.02; f <= 0.98; f += 0.04) {
        await page.mouse.move(m.box.l + m.box.w * f, m.box.t + m.box.h * 0.5);
        const t = await tip(page, label);
        if (!t) { outside.push(`${Math.round(f * 100)}%: no tooltip`); continue; }
        if (t.l < m.box.l - 0.5 || t.r > m.box.r + 0.5 || t.t < m.box.t - 0.5 || t.b > m.box.b + 0.5) outside.push(`${Math.round(f * 100)}%`);
        if (t.px < 10 - 1e-6) outside.push(`${Math.round(f * 100)}%: text ${t.px.toFixed(1)}px`);
      }
      await page.mouse.move(2, 2);
      check(`${tag}: tooltip stays inside the chart, text ≥ 10px`, outside.length === 0, outside.join(", "));
      await shot(svg, `chart-width-${W}-${key}`);
    }

    if (W === 320) {
      // A whole month in the narrowest pace chart (sample data's last month
      // has every day): 30/31 days thin out without touching, and the
      // month's last day is still named.
      await page.getByRole("button", { name: /Overview/ }).first().click();
      await page.getByRole("button", { name: "Previous month", exact: true }).click();
      const label = "Cumulative spending";
      await page.locator(`svg[aria-label^="${label}"]`).scrollIntoViewIfNeeded();
      const m = await measure(page, label);
      const gaps = m.xs.slice(1).map((x, i) => x.l - m.xs[i].r);
      const days = new Date(new Date().getFullYear(), new Date().getMonth(), 0).getDate();
      check("320px pace, a full past month: days thinned, apart, last day named",
        m.xs.length >= 4 && gaps.every((g) => g >= 4) && m.xs[m.xs.length - 1].text === String(days) && m.xs[m.xs.length - 1].r <= m.box.r + 0.5,
        `${m.xs.map((x) => x.text).join(" ")} · smallest gap ${Math.min(...gaps).toFixed(1)}px`);
      await page.getByText("↩ today", { exact: true }).click();
    }

    if (W === 390) {
      // Rotate/resize: the drawing follows its box (ResizeObserver), wider and narrower.
      await page.getByRole("button", { name: /Orchard/ }).first().click();
      const label = "Portfolio projection";
      for (const [vw, ok] of [[1100, (w) => w > 500], [320, (w) => w < 300]]) {
        await page.setViewportSize({ width: vw, height: 900 });
        await page.waitForFunction(([label, vw]) => {
          const s = document.querySelector(`svg[aria-label^="${label}"]`);
          const w = s?.getBoundingClientRect().width;
          return s && Math.abs(s.viewBox.baseVal.width - w) < 0.5 && (vw > 500 ? w > 500 : w < 300);
        }, [label, vw]).catch(() => {}); // a chart that never follows fails the check below
        const m = await measure(page, label);
        check(`resize → ${vw}px: the chart redraws at its new width`, Math.abs(m.vb.w - m.box.w) < 0.5 && ok(m.box.w), `${m.vb.w.toFixed(1)} / ${m.box.w.toFixed(1)}`);
      }
    }

    check(`${W}px: no page errors`, errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  // Motion on (no reduced-motion): the entry wipe still plays, but once it
  // has, a resize snaps — the wipe must not replay (it did when the clip's
  // width first followed the chart's width).
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block" });
    await ctx.addInitScript(() => {
      localStorage.setItem("money-garden:theme", "day"); localStorage.setItem("money-garden:install-hint", "muted");
    });
    const page = await ctx.newPage(); page.setDefaultTimeout(5000);
    await page.goto(BASE); await page.getByText("Money Garden", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Plant sample data", exact: true }).click();
    await page.getByRole("button", { name: /Orchard/ }).first().click();
    const label = "Portfolio projection";
    /** The entry clip's current width (mid-transition values included) and the chart's. */
    const clip = () => page.evaluate((label) => {
      const s = document.querySelector(`svg[aria-label^="${label}"]`);
      return { clip: parseFloat(getComputedStyle(s.querySelector("clipPath rect")).width), w: s.viewBox.baseVal.width };
    }, label);
    await page.locator(`svg[aria-label^="${label}"]`).waitFor();
    await page.waitForTimeout(150);
    const early = await clip();
    await page.waitForTimeout(1500);
    const settled = await clip();
    check("motion on: the entry wipe plays, then shows the whole chart",
      early.clip < early.w - 20 && Math.abs(settled.clip - settled.w) < 0.5, `at 150ms ${early.clip.toFixed(0)} of ${early.w.toFixed(0)}, settled ${settled.clip.toFixed(0)}`);
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.waitForFunction((label) => {
      const s = document.querySelector(`svg[aria-label^="${label}"]`);
      return s && s.viewBox.baseVal.width > 500;
    }, label).catch(() => {});
    await page.waitForTimeout(100);
    const after = await clip();
    check("motion on: a resize doesn't replay the wipe", after.w > 500 && Math.abs(after.clip - after.w) < 0.5, `100ms after: clip ${after.clip.toFixed(0)} of ${after.w.toFixed(0)}`);
    await ctx.close();
  }
  await browser.close();
} catch (e) { out.push("ERROR " + (e.stack || e).toString().split("\n").slice(0, 3).join(" | ")); } finally {
  await browser?.close().catch(() => {}); server.kill(); console.log(out.join("\n"));
  // Non-zero exit when any check failed (or none ran) — useful run alone, too.
  process.exitCode = out.length && out.every((l) => l.startsWith("PASS")) ? 0 : 1;
}
