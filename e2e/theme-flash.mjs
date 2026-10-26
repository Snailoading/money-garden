// No flash of the wrong theme at startup (v0.18.1, v0.18.2). Records every
// data-theme change from the first script on (MutationObserver) plus the
// theme and title-bar colour at each animation frame (what could actually
// be painted), for users whose saved choice disagrees with the clock.
import { chromium } from "playwright";
import { spawn, execSync } from "node:child_process";
import { SP, DIST } from "./paths.mjs";
const PORT = 8146; const BASE = `http://127.0.0.1:${PORT}/`;
try { execSync(`lsof -tnP -iTCP:${PORT} -sTCP:LISTEN | xargs kill`, { stdio: "ignore" }); } catch {}
const server = spawn("python3", [`${SP}/server.py`, DIST, String(PORT)], { stdio: "ignore" });
const out = []; const check = (n, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`);
let browser;
try {
  let pid = null;
  for (let i = 0; i < 50 && pid === null; i++) { try { pid = Number(await (await fetch(BASE + "__pid")).text()); } catch { await new Promise((r) => setTimeout(r, 100)); } }
  if (pid !== server.pid) throw new Error(`orphan server on port (got ${pid}, spawned ${server.pid})`);
  browser = await chromium.launch();
  const errors = [];
  /** Open the app with `mode` saved ("blocked" = site data blocked), at local `time`; return what happened. */
  const run = async (mode, time, cpuSlowdown = 1) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", timezoneId: "Asia/Kuala_Lumpur" });
    await ctx.addInitScript(([m]) => {
      if (m === "blocked") {
        // Site data blocked: merely touching localStorage throws.
        Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("denied", "SecurityError"); } });
      } else {
        if (m) localStorage.setItem("money-garden:theme", m);
        localStorage.setItem("money-garden:install-hint", "muted");
      }
      window.__changes = []; window.__frames = []; window.__bars = [];
      // The init script runs before <html> exists — watch the whole document
      // (subtree) so the boot script's very first stamp is caught too.
      new MutationObserver((recs) => {
        for (const r of recs) if (r.target === document.documentElement) window.__changes.push(document.documentElement.dataset.theme ?? "(none)");
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-theme"] });
      const t0 = performance.now();
      const sample = () => {
        const t = document.documentElement.dataset.theme ?? "(none)";
        if (window.__frames.at(-1) !== t) window.__frames.push(t);
        const b = document.querySelector('meta[name="theme-color"]')?.getAttribute("content") ?? "(none)";
        if (window.__bars.at(-1) !== b) window.__bars.push(b);
        if (performance.now() - t0 < 1500) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }, [mode]);
    const page = await ctx.newPage(); page.on("pageerror", (e) => errors.push(e.message));
    page.setDefaultTimeout(5000);
    if (cpuSlowdown > 1) {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuSlowdown });
    }
    await page.clock.setFixedTime(new Date(time));
    await page.goto(BASE); await page.getByText("Money Garden", { exact: true }).waitFor();
    await page.waitForTimeout(1600);
    const r = await page.evaluate(() => ({ changes: window.__changes, frames: window.__frames, bars: window.__bars, final: document.documentElement.dataset.theme, meta: document.querySelector('meta[name="theme-color"]')?.getAttribute("content") }));
    await ctx.close();
    return r;
  };
  const noFlip = (r, want) => r.changes.every((t) => t === want) && r.frames.every((t) => t === want) && r.final === want;
  const show = (r) => `changes=${JSON.stringify(r.changes)} frames=${JSON.stringify(r.frames)} final=${r.final}`;

  const nightAt2pm = await run("night", "2026-11-01T14:00:00+08:00");
  check("F1 🌙 night user at 2pm: never shows day", noFlip(nightAt2pm, "night"), show(nightAt2pm));
  const dayAt10pm = await run("day", "2026-11-01T22:00:00+08:00");
  check("F2 ☀️ day user at 10pm: never shows night", noFlip(dayAt10pm, "day"), show(dayAt10pm));
  const slow = await run("night", "2026-11-01T14:00:00+08:00", 6);
  check("F3 🌙 night user at 2pm on a 6× slower CPU: never shows day", noFlip(slow, "night"), show(slow));
  // Controls: auto follows the clock; nothing saved behaves like auto.
  const autoAt2pm = await run("auto", "2026-11-01T14:00:00+08:00");
  check("F4 🌗 auto at 2pm: day, steady", noFlip(autoAt2pm, "day"), show(autoAt2pm));
  const autoAt10pm = await run(null, "2026-11-01T22:00:00+08:00");
  check("F5 nothing saved at 10pm: night, steady", noFlip(autoAt10pm, "night"), show(autoAt10pm));
  check("F6 PWA chrome colour follows the garden (night user)", nightAt2pm.meta && nightAt2pm.meta !== "#5A7D5A", nightAt2pm.meta);

  // F8: the toggle still works right after startup (day → night → auto).
  { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", timezoneId: "Asia/Kuala_Lumpur" });
    await ctx.addInitScript(() => { if (!localStorage.getItem("money-garden:theme")) localStorage.setItem("money-garden:theme", "day"); localStorage.setItem("money-garden:install-hint", "muted"); });
    const page = await ctx.newPage(); page.on("pageerror", (e) => errors.push(e.message)); page.setDefaultTimeout(5000);
    await page.clock.install({ time: new Date("2026-11-01T18:59:00+08:00") });
    await page.goto(BASE); await page.getByText("Money Garden", { exact: true }).waitFor();
    const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
    const btn = page.getByRole("button", { name: "Switch theme (day, night, or auto)" });
    check("F8 starts on the saved ☀️ day", (await theme()) === "day");
    await btn.click(); await page.waitForTimeout(50);
    check("F8b tap → 🌙 night", (await theme()) === "night");
    await btn.click(); await page.waitForTimeout(50);
    check("F8c tap → 🌗 auto (18:59 → day)", (await theme()) === "day");
    // F9: auto crosses dusk while open (the minutely re-check still runs).
    await page.clock.runFor(2 * 60_000); await page.waitForTimeout(50);
    check("F9 auto turns to night at 19:00 while open", (await theme()) === "night");
    check("F9b the choice persisted as auto", (await page.evaluate(() => localStorage.getItem("money-garden:theme"))) === "auto");
    await ctx.close(); }

  // The boot script's three former gaps (v0.18.2).
  const blocked = await run("blocked", "2026-11-01T22:00:00+08:00");
  check("F10 storage blocked at 10pm: night from the first frame (was day → night)", noFlip(blocked, "night"), show(blocked));
  const junk = await run("dusk", "2026-11-01T22:00:00+08:00");
  check("F11 junk saved value at 10pm: treated as auto → night, steady", noFlip(junk, "night"), show(junk));
  check("F12 night user: title bar is night colour from the first frame", JSON.stringify(nightAt2pm.bars) === '["#141F18"]', JSON.stringify(nightAt2pm.bars));
  check("F13 day user at 10pm: title bar day colour throughout", JSON.stringify(dayAt10pm.bars) === '["#5A7D5A"]', JSON.stringify(dayAt10pm.bars));
  check("F14 blocked storage at 10pm: title bar night throughout", JSON.stringify(blocked.bars) === '["#141F18"]', JSON.stringify(blocked.bars));

  check("F7 no page errors", errors.length === 0, errors.join(" | "));
  await browser.close();
} catch (e) { out.push("ERROR " + (e.stack || e).toString().split("\n").slice(0, 3).join(" | ")); } finally {
  await browser?.close().catch(() => {}); server.kill(); console.log(out.join("\n"));
  // Non-zero exit when any check failed (or none ran) — useful run alone, too.
  process.exitCode = out.length && out.every((l) => l.startsWith("PASS")) ? 0 : 1;
}
