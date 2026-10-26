// "Today" turns over at midnight while the app stays open (v0.18.1).
// Playwright's fake clock (page.clock) crosses Oct 31 → Nov 1 in seconds:
// runFor() fires due timers (the midnight timer path); setSystemTime()
// jumps WITHOUT firing timers (a phone asleep at midnight), so only the
// wake-up checks — or the once-a-minute safety net — can notice.
import { chromium } from "playwright";
import { spawn, execSync } from "node:child_process";
import { SP, DIST, shot } from "./paths.mjs";
const PORT = 8142; const BASE = `http://127.0.0.1:${PORT}/`;
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
  const open = async (startsAt) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", timezoneId: "Asia/Kuala_Lumpur" });
    await ctx.addInitScript(() => {
      localStorage.setItem("money-garden:theme", "day"); localStorage.setItem("money-garden:install-hint", "muted");
    });
    const page = await ctx.newPage(); page.on("pageerror", (e) => errors.push(e.message));
    page.setDefaultTimeout(5000);
    await page.clock.install({ time: new Date(startsAt) });
    await page.goto(BASE); await page.getByText("Money Garden", { exact: true }).waitFor();
    return { ctx, page };
  };
  const tab = (page, n) => page.getByRole("button", { name: new RegExp(n) }).first().click();
  const header = (page) => page.locator("header").innerText();
  const logDate = (page) => page.locator('input[type="date"]').first();
  // The Stat row whose label is exactly "Spent" → its figure (label span's parent div).
  const spent = (page) => page.getByText("Spent", { exact: true }).locator("xpath=..").locator("b.mg-num").innerText();
  // Seasons axis labels run together in textContent ("OctNov"), so no \b.
  const seasonsText = (page) => page.locator("main svg").evaluateAll((els) => els.map((e) => e.textContent).join(" "));

  // M1 — the midnight timer: app open across Oct 31 → Nov 1, NO save in
  // between (a save would refresh everything anyway and hide the bug).
  { const { ctx, page } = await open("2026-10-31T23:59:30+08:00");
    await page.getByRole("button", { name: "Plant sample data", exact: true }).click();
    await page.waitForTimeout(100);
    check("M1 before midnight: header says October", /October 2026/i.test(await header(page)));
    const octSpent = await spent(page);
    check("M1b Overview: October's spending shows", octSpent !== "$0.00", octSpent);
    await page.clock.runFor(60_000); // 23:59:30 → 00:00:30 (+ the 1s margin) — timers fire
    await page.waitForTimeout(100);
    check("M2 after midnight: header says November (no save needed)", /November 2026/i.test(await header(page)));
    check("M2b Overview: November's spending starts at $0 (memo refreshed)", (await spent(page)) === "$0.00", await spent(page));
    check("M2c Overview pace runs through Nov 30", await page.getByText(/a day through Nov 30/).isVisible());
    await shot(page, "midnight-overview");
    await ctx.close(); }

  // M1L — the Log tab open across midnight: its untouched date follows,
  // and the morning's first entry lands in November.
  { const { ctx, page } = await open("2026-10-31T23:59:30+08:00");
    await tab(page, "Log");
    check("M1L Log's new-entry date defaults to Oct 31", (await logDate(page).inputValue()) === "2026-10-31");
    await page.clock.runFor(60_000); await page.waitForTimeout(100);
    check("M2L Log's untouched date moved to Nov 1", (await logDate(page).inputValue()) === "2026-11-01");
    check("M2Lb …and its max allows Nov 1", (await logDate(page).getAttribute("max")) === "2026-11-01");
    await page.getByPlaceholder("0.00").fill("5");
    await page.getByPlaceholder("Ramen with Sam").fill("First coffee of November");
    await page.getByRole("button", { name: "Add expense", exact: true }).click(); await page.waitForTimeout(100);
    const saved = JSON.parse(await page.evaluate(() => localStorage.getItem("money-garden:state-v1")));
    check("M2Lc the morning's first entry is dated Nov 1", saved.transactions.find((t) => t.note === "First coffee of November")?.date === "2026-11-01");
    await ctx.close(); }

  // M1S — the Seasons tab open across midnight: a November bar appears.
  { const { ctx, page } = await open("2026-10-31T23:59:30+08:00");
    await page.getByRole("button", { name: "Plant sample data", exact: true }).click(); await page.waitForTimeout(100);
    await tab(page, "Seasons");
    check("M1S Seasons before midnight has no Nov bar", !/Nov/.test(await seasonsText(page)));
    await page.clock.runFor(60_000); await page.waitForTimeout(100);
    check("M2S Seasons after midnight has a Nov bar (no save, tab never left)", /Nov/.test(await seasonsText(page)));
    await ctx.close(); }

  // M3 — a date the user picked is never moved.
  { const { ctx, page } = await open("2026-10-31T23:59:30+08:00");
    await tab(page, "Log");
    await logDate(page).fill("2026-10-15");
    await page.clock.runFor(60_000); await page.waitForTimeout(100);
    check("M3 a backdated pick (Oct 15) survives midnight", (await logDate(page).inputValue()) === "2026-10-15");
    await ctx.close(); }

  // M4 — asleep at midnight: the clock jumps without firing any timer;
  // the wake-up (visibilitychange) check catches it.
  { const { ctx, page } = await open("2026-10-31T22:00:00+08:00");
    await tab(page, "Log");
    await page.clock.setSystemTime(new Date("2026-11-01T07:30:00+08:00"));
    await page.waitForTimeout(100);
    check("M4 (control) a clock jump alone fires nothing yet", /October 2026/i.test(await header(page)));
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.waitForTimeout(100);
    check("M4b waking the tab brings it to November", /November 2026/i.test(await header(page)));
    check("M4c …and the Log date to Nov 1", (await logDate(page).inputValue()) === "2026-11-01");
    await ctx.close(); }

  // M5 — window focus is a wake-up too (desktop: switching back to the window).
  { const { ctx, page } = await open("2026-10-31T22:00:00+08:00");
    await page.clock.setSystemTime(new Date("2026-11-01T07:30:00+08:00"));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForTimeout(100);
    check("M5 focusing the window brings it to November", /November 2026/i.test(await header(page)));
    await ctx.close(); }

  // M7 — asleep at midnight with NO wake-up event at all (a laptop whose
  // focused window never blurred): the minutely check catches it. The jump
  // doesn't move the midnight timer's due time, so only the interval fires.
  { const { ctx, page } = await open("2026-10-31T22:00:00+08:00");
    await page.clock.setSystemTime(new Date("2026-11-01T07:30:00+08:00"));
    await page.waitForTimeout(100);
    check("M7 (control) still October right after the jump", /October 2026/i.test(await header(page)));
    await page.clock.runFor(61_000); await page.waitForTimeout(100);
    check("M7b within a minute, November — no event needed", /November 2026/i.test(await header(page)));
    await ctx.close(); }

  check("M6 no page errors", errors.length === 0, errors.join(" | "));
  await browser.close();
} catch (e) { out.push("ERROR " + (e.stack || e).toString().split("\n").slice(0, 3).join(" | ")); } finally {
  await browser?.close().catch(() => {}); server.kill(); console.log(out.join("\n"));
  // Non-zero exit when any check failed (or none ran) — useful run alone, too.
  process.exitCode = out.length && out.every((l) => l.startsWith("PASS")) ? 0 : 1;
}
