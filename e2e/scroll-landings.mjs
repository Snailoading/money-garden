// Where you land after a jump (v0.18.11). Overview's "🌸 Spent from goals"
// opens the Log filtered to goal draws with the LEDGER at the top of the
// screen — not the entry form, which on a phone left the filtered list below
// the fold — and already there on the first painted frame (no flash of the
// Log's top); an ordinary visit to the Log still opens at its top.
// Replacing the whole garden from the shed at the bottom of the page —
// restoring a backup, Replant sample data, Start fresh — shows the new
// garden from its top, also when the tab doesn't change. Tapping the tab
// you're already on glides back to its top (jumps under Reduce Motion),
// keeping the tab and its search exactly as they were.
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

  // ---- 3. Tapping the tab you're on goes back to its top
  for (const size of SIZES.filter((s) => s.name !== "760")) {
    for (const motion of ["no-preference", "reduce"]) {
      const { ctx, page, errs } = await sampleGarden(browser, { ...size, reducedMotion: motion });
      try {
        const w = `${size.name}${motion === "reduce" ? " reduce-motion" : ""}`;
        const tabBtn = (name) => page.locator("nav").getByRole("button", { name: new RegExp(name) });
        /** From `y` (or as far as the page goes), tap the current tab: the
         * scroll two frames later (a glide has barely begun), then once it
         * has settled. */
        const tapCurrent = async (name, y) => {
          await page.evaluate((y) => window.scrollTo(0, y), y);
          await page.waitForTimeout(100);
          const before = await page.evaluate(() => Math.round(scrollY));
          await page.evaluate(() => {
            window.__firstFrameY = null;
            document.addEventListener("click", () => requestAnimationFrame(() => requestAnimationFrame(() => { window.__firstFrameY = scrollY; })), { capture: true, once: true });
          });
          // Phone: a real tap (the bar is fixed, so nothing scrolls first, and
          // it proves the bar is tappable once the keyboard's away). Laptop:
          // a DOM click — Playwright's click() first scrolls the button into
          // view, and there the tab row is up in the header; that alone moved
          // the page and passed the checks without the fix.
          if (size.hasTouch) await tabBtn(name).click(); else await tabBtn(name).evaluate((b) => b.click());
          const settled = await page.waitForFunction(() => scrollY === 0, null, { timeout: 2000 }).then(() => true, () => false);
          await page.waitForFunction(() => window.__firstFrameY !== null, null, { timeout: 2000 }).catch(() => {});
          const r = await page.evaluate(() => ({ firstFrameY: window.__firstFrameY, y: Math.round(scrollY), tab: document.querySelector('nav [aria-current="page"]')?.textContent }));
          return { before, settled, ...r };
        };

        let r = await tapCurrent("Overview", 400);
        check(`${w}: tapping Overview on Overview goes back to the top`, r.before > 100 && r.settled && /Overview/.test(r.tab), JSON.stringify(r));
        if (motion === "reduce") check(`${w}: …at once`, r.firstFrameY === 0, JSON.stringify(r));
        else check(`${w}: …gliding there (not there on the next frame)`, r.settled && r.firstFrameY > 0, JSON.stringify(r)); // a glide may not have begun yet; a jump is already at 0

        // The Log, mid-search: tapping Log keeps the search as it was.
        await tabBtn("Log").click();
        await page.getByRole("button", { name: "Search the ledger" }).click();
        // the 🔍 focuses the box a frame later — let it, or it lands after
        // the blur below and the keyboard (and hidden bar) come back
        await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Search the ledger" && document.activeElement.tagName === "INPUT");
        await page.getByRole("textbox", { name: "Search the ledger" }).fill("o");
        // put the keyboard away: the phone bar steps aside while you type
        await page.evaluate(() => document.activeElement.blur());
        await page.waitForTimeout(400);
        r = await tapCurrent("Log", 100000);
        // null if the search closed (a remounted Log would lose it)
        const query = await page.evaluate(() => document.querySelector('input[aria-label="Search the ledger"]')?.value ?? null);
        check(`${w}: tapping Log on the Log goes back to the top, search kept`, r.before > 100 && r.settled && /Log/.test(r.tab) && query === "o", JSON.stringify({ ...r, query }));
        check(`${w}: no page errors (current tab)`, errs.length === 0, errs.join(" | "));
      } finally { await ctx.close(); }
    }
  }
} catch (e) {
  out.push("ERROR " + (e.stack || e).toString().split("\n").slice(0, 3).join(" | "));
} finally {
  await browser?.close().catch(() => {}); server.kill(); console.log(out.join("\n"));
  process.exitCode = out.length && out.every((l) => l.startsWith("PASS")) ? 0 : 1;
}
