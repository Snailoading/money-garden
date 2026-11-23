// Where you land after a jump (v0.18.11). Overview's "🌸 Spent from goals"
// opens the Log filtered to goal draws with the LEDGER at the top of the
// screen — not the entry form, which on a phone left the filtered list below
// the fold — and already there on the first painted frame (no flash of the
// Log's top); an ordinary visit to the Log still opens at its top.
// Replacing the whole garden from the shed at the bottom of the page —
// restoring a backup, Replant sample data, Start fresh — shows the new
// garden from its top, also when the tab doesn't change.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { spawn, execSync } from "node:child_process";
import { SP, DIST, shot } from "./paths.mjs";
const PORT = 8161; const BASE = `http://127.0.0.1:${PORT}/`;
try { execSync(`lsof -tnP -iTCP:${PORT} -sTCP:LISTEN | xargs kill`, { stdio: "ignore" }); } catch {}
const server = spawn("python3", [`${SP}/server.py`, DIST, String(PORT)], { stdio: "ignore" });
const out = []; const check = (n, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`);

/** A phone (touch, the bottom tab bar) and two laptop widths. */
const SIZES = [
  { name: "390", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
  { name: "760", viewport: { width: 760, height: 900 } },
  { name: "1280", viewport: { width: 1280, height: 800 } },
];

/** A fresh context on the sample garden. */
async function sampleGarden(browser, size) {
  const { name, ...opts } = size;
  const ctx = await browser.newContext({ ...opts, serviceWorkers: "block", acceptDownloads: true });
  await ctx.addInitScript(() => localStorage.setItem("money-garden:install-hint", "muted"));
  const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(e.message)); page.setDefaultTimeout(5000);
  await page.goto(BASE); await page.getByText("Money Garden", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Plant sample data", exact: true }).click();
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem("money-garden:state-v1") || "{}").transactions || []).length > 5);
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page, errs };
}

/** …plus one goal draw dated today (sample data has none this month, and
 * the Overview's line only shows when something was drawn). */
async function sampleGardenWithDraw(browser, size) {
  const { ctx, page, errs } = await sampleGarden(browser, size);
  await page.evaluate(() => {
    const k = "money-garden:state-v1"; const st = JSON.parse(localStorage.getItem(k));
    const g = st.goals.find((g) => g.saved >= 60); g.saved -= 60; // a draw spends the goal's pool
    const d = new Date(); const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    st.transactions.unshift({ id: "e2e-draw", type: "expense", amount: 60, category: "shopping", note: "Drawn for e2e", date: iso, goalId: g.id });
    localStorage.setItem(k, JSON.stringify(st));
  });
  await page.reload(); await page.getByText("Money Garden", { exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page, errs };
}

/** The ledger card's top and the draw row's bottom, in viewport px, and
 * where the visible screen ends (above the phone tab bar, if there is one). */
const ledgerSpot = () => {
  const card = [...document.querySelectorAll("section.mg-card")].find((s) => /ledger/.test(s.querySelector("h2, h3, div")?.textContent ?? s.textContent));
  const row = [...card.querySelectorAll("*")].find((e) => e.children.length === 0 && e.textContent === "Drawn for e2e");
  const nav = document.querySelector("nav").getBoundingClientRect();
  const screenEnd = nav.top > innerHeight / 2 ? nav.top : innerHeight; // phone bar at the bottom, or the laptop row up top
  return { scrollY: Math.round(scrollY), cardTop: Math.round(card.getBoundingClientRect().top), rowBottom: row ? Math.round(row.getBoundingClientRect().bottom) : null, screenEnd: Math.round(screenEnd) };
};

let browser;
try {
  let pid = null;
  for (let i = 0; i < 50 && pid === null; i++) { try { pid = Number(await (await fetch(BASE + "__pid")).text()); } catch { await new Promise((r) => setTimeout(r, 100)); } }
  if (pid !== server.pid) throw new Error("orphan server");
  browser = await chromium.launch();

  // ---- 1. "Spent from goals" lands on the filtered ledger
  for (const size of SIZES) {
    const { ctx, page, errs } = await sampleGardenWithDraw(browser, size);
    try {
      const w = size.name;
      await page.evaluate(() => window.scrollTo(0, 300)); // from partway down the Overview
      // The scroll position on the frame after the click — before that
      // frame paints. React commits a click's update (and its effects) in
      // the click's task or the microtasks right after it — all before
      // this frame's rAF callbacks — so this is what the first painted Log
      // frame shows.
      await page.evaluate(() => {
        window.__firstFrameY = null;
        document.addEventListener("click", () => requestAnimationFrame(() => { window.__firstFrameY = scrollY; }), { capture: true, once: true });
      });
      await page.getByRole("button", { name: /Spent from goals/ }).click();
      await page.getByRole("combobox", { name: "Type" }).waitFor();
      await page.waitForTimeout(150);
      const s = await page.evaluate(ledgerSpot);
      const firstY = await page.evaluate(() => window.__firstFrameY);
      await shot(page, `landing-draws-${w}`);
      check(`${w}: the draws filter is on`, await page.getByRole("combobox", { name: "Type" }).inputValue() === "draw");
      check(`${w}: the ledger card lands at the top of the screen (0–20px)`, s.cardTop >= 0 && s.cardTop <= 20, JSON.stringify(s));
      check(`${w}: the drawn entry is on screen, above the tab bar`, s.rowBottom !== null && s.rowBottom <= s.screenEnd, JSON.stringify(s));
      check(`${w}: already there on the first frame (no flash of the Log's top)`, firstY !== null && Math.abs(firstY - s.scrollY) <= 1, `first frame ${firstY}, settled ${s.scrollY}`);

      // An ordinary visit to the Log afterwards opens at its top, unfiltered.
      await page.getByRole("button", { name: /Overview/ }).first().click();
      await page.evaluate(() => window.scrollTo(0, 300));
      await page.getByRole("button", { name: /Log/ }).first().click();
      await page.waitForTimeout(150);
      const plainY = await page.evaluate(() => scrollY);
      check(`${w}: a plain tap on Log still opens at its top`, plainY === 0, `scrollY ${plainY}`);
      check(`${w}: …with no filter open`, await page.getByRole("combobox", { name: "Type" }).count() === 0);
      check(`${w}: no page errors`, errs.length === 0, errs.join(" | "));
    } finally { await ctx.close(); }
  }

  // ---- 2. Replacing the whole garden from the shed shows it from the top
  /** Scroll to the very bottom (the shed), do it, then where are we? */
  const fromShed = async (page, act) => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const before = await page.evaluate(() => Math.round(scrollY));
    await act();
    await page.waitForTimeout(200);
    // maxY: the new page must still be able to scroll, or "at the top" would
    // pass by itself (a page shorter than the screen can't be anywhere else).
    const after = await page.evaluate(() => ({ y: Math.round(scrollY), maxY: document.documentElement.scrollHeight - innerHeight, tab: document.querySelector('nav [aria-current="page"]')?.textContent }));
    return { before, ...after };
  };
  for (const size of SIZES.filter((s) => s.name !== "760")) {
    const { ctx, page, errs } = await sampleGarden(browser, size);
    try {
      const w = size.name;
      const btn = (name) => page.getByRole("button", { name, exact: true });
      const replant = () => fromShed(page, async () => { await btn("Replant sample data…").click(); await btn("Really replace everything with sample data?").click(); });

      let r = await replant();
      check(`${w}: Replant on the Overview lands at the top`, r.before > 100 && r.maxY > 100 && r.y === 0 && /Overview/.test(r.tab), JSON.stringify(r));

      await page.getByRole("button", { name: /Garden/ }).first().click();
      r = await replant();
      check(`${w}: Replant on the Garden tab lands at its top, still on Garden`, r.before > 100 && r.maxY > 100 && r.y === 0 && /Garden/.test(r.tab), JSON.stringify(r));
      await page.getByRole("button", { name: /Overview/ }).first().click();

      const [dl] = await Promise.all([page.waitForEvent("download"), btn("⬇️ Save backup").click()]);
      const backup = readFileSync(await dl.path());
      r = await fromShed(page, async () => {
        await page.locator('input[type="file"]').setInputFiles({ name: "b.json", mimeType: "application/json", buffer: backup });
        await btn("Replace my garden").waitFor();
        await btn("Replace my garden").click();
        await page.getByText("Garden restored").waitFor();
      });
      check(`${w}: restoring a backup on the Overview lands at the top`, r.before > 100 && r.maxY > 100 && r.y === 0 && /Overview/.test(r.tab), JSON.stringify(r));

      r = await fromShed(page, async () => { await btn("Start fresh…").click(); await btn("Really erase everything?").click(); await page.getByText("Fresh soil — everything cleared").waitFor(); });
      await shot(page, `landing-fresh-${w}`);
      check(`${w}: Start fresh on the Overview lands at the top`, r.before > 100 && r.maxY > 100 && r.y === 0 && /Overview/.test(r.tab), JSON.stringify(r));
      check(`${w}: no page errors (shed)`, errs.length === 0, errs.join(" | "));
    } finally { await ctx.close(); }
  }
} catch (e) {
  out.push("ERROR " + (e.stack || e).toString().split("\n").slice(0, 3).join(" | "));
} finally {
  await browser?.close().catch(() => {}); server.kill(); console.log(out.join("\n"));
  process.exitCode = out.length && out.every((l) => l.startsWith("PASS")) ? 0 : 1;
}
