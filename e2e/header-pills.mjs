// The header's three pills — theme toggle, weather, streak — share one
// height and round corners, the theme toggle is a square, and the streak
// card centers its content (v0.18.4). Checked at desktop, phone and a
// narrow phone, in both themes — for a fresh garden (the short "New
// garden" pill, v0.18.6) and with sample data (the real weather, whose
// longer blurb wraps on narrow phones). On phones (< 480px, v0.18.7) the
// theme toggle isn't a pill: it's a 32px square at the end of the month
// line, centred on it and lined up with the pills' right edge, and the
// weather and streak pills share the row.
import { chromium } from "playwright";
import { spawn, execSync } from "node:child_process";
import { SP, DIST, shot } from "./paths.mjs";
const PORT = 8150; const BASE = `http://127.0.0.1:${PORT}/`;
try { execSync(`lsof -tnP -iTCP:${PORT} -sTCP:LISTEN | xargs kill`, { stdio: "ignore" }); } catch {}
const server = spawn("python3", [`${SP}/server.py`, DIST, String(PORT)], { stdio: "ignore" });
const out = []; const check = (n, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`);
let browser;
try {
  let pid = null;
  for (let i = 0; i < 50 && pid === null; i++) { try { pid = Number(await (await fetch(BASE + "__pid")).text()); } catch { await new Promise((r) => setTimeout(r, 100)); } }
  if (pid !== server.pid) throw new Error("orphan server");
  browser = await chromium.launch();
  for (const [width, theme] of [[1280, "day"], [390, "night"], [320, "day"]]) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: "block" });
    await ctx.addInitScript((theme) => {
      localStorage.setItem("money-garden:theme", theme); localStorage.setItem("money-garden:install-hint", "muted");
    }, theme);
    const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(e.message)); page.setDefaultTimeout(5000);
    await page.goto(BASE); await page.getByText("Money Garden", { exact: true }).waitFor();
    for (const garden of ["fresh", "sample"]) {
      if (garden === "sample") {
        await page.getByRole("button", { name: "Plant sample data", exact: true }).click();
        await page.getByText("Sent to goals", { exact: true }).waitFor();
      }
      await page.evaluate(() => document.fonts.ready); // measure with the real fonts
      const tag = `H${width}-${theme}-${garden}`;
      const phone = width < 480;
      // For each pill: its box, its corner radius, and the box of its
      // content (the text/emoji inside, measured with a Range). On phones
      // the toggle has left the row, so the pills are weather and streak.
      const pills = await page.evaluate((phone) => {
        const els = [
          ...(phone ? [] : [document.querySelector('button[aria-label^="Switch theme"]')]),
          document.querySelector('[title^="Garden health"]'),
          document.querySelector('[title^="Days in a row"]'),
        ];
        return els.map((el) => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const range = document.createRange(); range.selectNodeContents(el);
          const c = range.getBoundingClientRect();
          return { top: r.top, right: r.right, width: r.width, height: r.height, mid: r.top + r.height / 2, contentMid: c.top + c.height / 2,
            radius: getComputedStyle(el).borderTopLeftRadius };
        });
      }, phone);
      check(`${tag} all ${pills.length} pills found`, pills.every(Boolean));
      if (pills.every(Boolean)) {
        const hs = pills.map((p) => p.height.toFixed(1));
        check(`${tag} same height`, Math.max(...pills.map((p) => p.height)) - Math.min(...pills.map((p) => p.height)) < 0.5, hs.join(" / "));
        check(`${tag} same top`, Math.max(...pills.map((p) => p.top)) - Math.min(...pills.map((p) => p.top)) < 0.5);
        check(`${tag} same corner radius`, new Set(pills.map((p) => p.radius)).size === 1, pills.map((p) => p.radius).join(" / "));
        // Square wherever the row has its usual two-line height (always on
        // desktop; on phones the toggle isn't in the row at all).
        const t = pills[0];
        if (!phone) check(`${tag} theme toggle is square`, Math.abs(t.width - t.height) < 0.5, `${t.width.toFixed(1)}×${t.height.toFixed(1)}`);
        // No check for the toggle's centering: browsers center a <button>'s
        // content by themselves, so it could never fail. The streak card's
        // can — at 320px it's off by ~7px without its flex centering.
        const streak = pills[pills.length - 1];
        const off = streak.contentMid - streak.mid;
        check(`${tag} streak content centered`, Math.abs(off) <= 1.5, `off by ${off.toFixed(1)}px`);
        if (phone) {
          // The toggle on the month line: a 32px square, centred on the
          // month label, its right edge on the pills' right edge.
          const tg = await page.evaluate(() => {
            const b = document.querySelector('button[aria-label^="Switch theme"]').getBoundingClientRect();
            const prev = document.querySelector('button[aria-label="Previous month"]');
            const label = prev.nextElementSibling.getBoundingClientRect();
            return { inLine: prev.parentElement.contains(document.querySelector('button[aria-label^="Switch theme"]')),
              w: b.width, h: b.height, right: b.right, mid: b.top + b.height / 2, labelMid: label.top + label.height / 2,
              lineH: prev.parentElement.getBoundingClientRect().height };
          });
          check(`${tag} toggle: 32px square at the end of the month line`, tg.inLine && tg.w === 32 && tg.h === 32
            && Math.abs(tg.mid - tg.labelMid) <= 0.5 && Math.abs(tg.right - streak.right) <= 0.5,
            `${tg.w}×${tg.h}, centre ${tg.mid.toFixed(1)} vs label ${tg.labelMid.toFixed(1)}, right ${tg.right.toFixed(1)} vs pills ${streak.right.toFixed(1)}`);
          // Its −7px block margins keep the month line 18px tall (as without
          // it), so the title below doesn't drop.
          check(`${tag} month line stays 18px tall with the toggle in it`, tg.lineH === 18, `${tg.lineH}px`);
        }
      }
      // The page must still fit the phone — no sideways scroll.
      check(`${tag} no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      check(`${tag} no page errors`, errs.length === 0, errs.join(" | "));
      await shot(page, `header-pills-${width}-${theme}-${garden}`, { clip: { x: 0, y: 0, width, height: 220 } });
    }
    await ctx.close();
  }
  await browser.close();
} catch (e) { out.push("ERROR " + (e.stack || e).toString().split("\n").slice(0, 3).join(" | ")); } finally {
  await browser?.close().catch(() => {}); server.kill(); console.log(out.join("\n"));
  // Non-zero exit when any check failed (or none ran) — useful run alone, too.
  process.exitCode = out.length && out.every((l) => l.startsWith("PASS")) ? 0 : 1;
}
