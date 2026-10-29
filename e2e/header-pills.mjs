// The header's three pills — theme toggle, weather, streak — share one
// height and round corners, the theme toggle is a square, and the streak
// card centers its content (v0.18.4). Checked at desktop, phone and a
// narrow phone, in both themes.
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
    await page.evaluate(() => document.fonts.ready); // measure with the real fonts
    const tag = `H${width}-${theme}`;
    // For each pill: its box, its corner radius, and the box of its
    // content (the text/emoji inside, measured with a Range).
    const pills = await page.evaluate(() => {
      const els = [
        document.querySelector('button[aria-label^="Switch theme"]'),
        document.querySelector('[title^="Garden health"]'),
        document.querySelector('[title^="Days in a row"]'),
      ];
      return els.map((el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const range = document.createRange(); range.selectNodeContents(el);
        const c = range.getBoundingClientRect();
        return { top: r.top, width: r.width, height: r.height, mid: r.top + r.height / 2, contentMid: c.top + c.height / 2,
          radius: getComputedStyle(el).borderTopLeftRadius };
      });
    });
    check(`${tag} all three pills found`, pills.every(Boolean));
    if (pills.every(Boolean)) {
      const hs = pills.map((p) => p.height.toFixed(1));
      check(`${tag} same height`, Math.max(...pills.map((p) => p.height)) - Math.min(...pills.map((p) => p.height)) < 0.5, hs.join(" / "));
      check(`${tag} same top`, Math.max(...pills.map((p) => p.top)) - Math.min(...pills.map((p) => p.top)) < 0.5);
      check(`${tag} same corner radius`, new Set(pills.map((p) => p.radius)).size === 1, pills.map((p) => p.radius).join(" / "));
      // Square wherever the row has its usual two-line height (always on
      // desktop). On phones a longer weather blurb wraps, the row grows,
      // and the toggle keeps its width — a tall pill, by design — so the
      // check goes by the measured height, not the screen width.
      const t = pills[0];
      if (width >= 1280 || t.height < 60) check(`${tag} theme toggle is square`, Math.abs(t.width - t.height) < 0.5, `${t.width.toFixed(1)}×${t.height.toFixed(1)}`);
      // No check for the toggle's centering: browsers center a <button>'s
      // content by themselves, so it could never fail. The streak card's
      // can — at 320px it's off by ~7px without its flex centering.
      const off = pills[2].contentMid - pills[2].mid;
      check(`${tag} streak content centered`, Math.abs(off) <= 1.5, `off by ${off.toFixed(1)}px`);
    }
    // The page must still fit the phone — no sideways scroll.
    check(`${tag} no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    check(`${tag} no page errors`, errs.length === 0, errs.join(" | "));
    await shot(page, `header-pills-${width}-${theme}`, { clip: { x: 0, y: 0, width, height: 220 } });
    await ctx.close();
  }
  await browser.close();
} catch (e) { out.push("ERROR " + (e.stack || e).toString().split("\n").slice(0, 3).join(" | ")); } finally {
  await browser?.close().catch(() => {}); server.kill(); console.log(out.join("\n"));
  // Non-zero exit when any check failed (or none ran) — useful run alone, too.
  process.exitCode = out.length && out.every((l) => l.startsWith("PASS")) ? 0 : 1;
}
