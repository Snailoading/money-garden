// What a screen reader hears (v0.18.5). Sighted users see the selected tab
// as a dark pill; a screen reader only gets the page's structure, so the
// selected tab carries aria-current="page" ("Overview, current page,
// button"), and the tab emoji are aria-hidden so they aren't read out by
// their Unicode names ("sun behind small cloud, Overview").
// The first-visit install pop-up keeps focus inside: the page behind is
// inert (no focus, hidden from screen readers) until it's dismissed.
import { chromium } from "playwright";
import { spawn, execSync } from "node:child_process";
import { SP, DIST } from "./paths.mjs";
const PORT = 8156; const BASE = `http://127.0.0.1:${PORT}/`;
try { execSync(`lsof -tnP -iTCP:${PORT} -sTCP:LISTEN | xargs kill`, { stdio: "ignore" }); } catch {}
const server = spawn("python3", [`${SP}/server.py`, DIST, String(PORT)], { stdio: "ignore" });
const out = []; const check = (n, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`);
const TABS = ["Overview", "Log", "Budgets", "Garden", "Orchard", "Seasons", "Advice"];

/** Labels of every element on the page marked aria-current, and its value. */
const currentOnes = (page) => page.evaluate(() =>
  [...document.querySelectorAll("[aria-current]")].map((el) => `${el.textContent.trim()}=${el.getAttribute("aria-current")}`));

/** Names in Chrome's real accessibility tree, skipping the nodes it hides
 *  from screen readers (aria-hidden, inert, display:none…) and the root
 *  (named by the page's <title>, "Money Garden" — not the header's). */
async function spoken(page) {
  const cdp = await page.context().newCDPSession(page);
  let nodes;
  try { ({ nodes } = await cdp.send("Accessibility.getFullAXTree")); } finally { await cdp.detach().catch(() => {}); }
  return nodes.filter((n) => !n.ignored && n.name?.value && n.role?.value !== "RootWebArea").map((n) => n.name.value.trim());
}

let browser;
try {
  let pid = null;
  for (let i = 0; i < 50 && pid === null; i++) { try { pid = Number(await (await fetch(BASE + "__pid")).text()); } catch { await new Promise((r) => setTimeout(r, 100)); } }
  if (pid !== server.pid) throw new Error("orphan server");
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => {
    localStorage.setItem("money-garden:theme", "day"); localStorage.setItem("money-garden:install-hint", "muted");
  });
  const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(e.message)); page.setDefaultTimeout(5000);
  await page.goto(BASE); await page.getByText("Money Garden", { exact: true }).waitFor();

  // The tab bar as a screen reader sees it: seven buttons named by their
  // labels alone — no emoji names.
  const snap = await page.locator("nav").ariaSnapshot();
  const names = [...snap.matchAll(/- button "([^"]*)"/g)].map((m) => m[1]);
  check("tab names are the labels alone", JSON.stringify(names) === JSON.stringify(TABS), snap.replace(/\n/g, " | "));

  // On arrival: Overview, and only Overview, is current.
  const start = await currentOnes(page);
  check("on arrival only Overview is current", start.length === 1 && start[0].endsWith("Overview=page"), start.join(", "));

  // An in-app jump (not a tab tap) moves the marker too: the empty Overview's
  // "Log one" opens the Log.
  await page.getByRole("button", { name: "Log one", exact: true }).click();
  await page.getByText("This month's ledger", { exact: true }).waitFor();
  const jumped = await currentOnes(page);
  check("\"Log one\" jump marks Log current", jumped.length === 1 && jumped[0].endsWith("Log=page"), jumped.join(", "));

  // Every tab, tapped by its exact accessible name: it, and only it, is current.
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByRole("button", { name: "Plant sample data", exact: true }).click();
  await page.getByText("Sent to goals", { exact: true }).waitFor();
  const wrong = [];
  for (const tab of TABS) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    const now = await currentOnes(page);
    if (!(now.length === 1 && now[0].endsWith(`${tab}=page`))) wrong.push(`${tab}: [${now.join(", ")}]`);
  }
  check("each tab tapped is the one current tab", wrong.length === 0, wrong.join(" | ") || `${TABS.length} tabs`);

  // Ledger rows: every row has the same ✏️ ✕, so their spoken names carry
  // the entry ("Edit Rent, −$1,400, Nov 1") — no two rows alike in the
  // sample garden (two identical entries on one day would rightly match),
  // each naming its own row's amount; "→" (read "right arrow") never spoken.
  // The label is split on ", " — fine for the sample notes, which have none.
  await page.getByRole("button", { name: "Log", exact: true }).click();
  const rows = await page.locator("li.mg-row").evaluateAll((lis) => lis.map((li) => ({
    text: li.textContent,
    edit: li.querySelector('button[title="Edit entry"]')?.getAttribute("aria-label") ?? "",
    del: li.querySelector('button[title="Delete entry"]')?.getAttribute("aria-label") ?? "",
  })));
  const bad = rows.filter((r) => {
    const entry = r.edit.replace(/^Edit /, "");
    const amount = entry.split(", ")[1]?.replace(" saved", "").replace(/^[+−]/, "");
    return !r.edit.startsWith("Edit ") || r.del !== `Delete ${entry}` || entry.includes("→")
      || !amount || !r.text.includes(amount) || !r.text.includes(entry.split(", ")[0]);
  });
  const editNames = rows.map((r) => r.edit);
  check("ledger buttons are named after their entry", rows.length >= 5 && bad.length === 0 && new Set(editNames).size === rows.length
    && editNames.some((n) => n.includes(" saved, ")) && editNames.some((n) => n.includes(", +$")) && editNames.some((n) => n.includes(", −$")),
    bad.length ? bad.map((r) => `${r.edit} / ${r.del}`).join(" | ") : `${rows.length} rows, e.g. "${editNames[0]}", "${editNames.find((n) => n.includes("saved"))}"`);
  // Arming a delete: the confirm button names the same entry.
  const first = page.locator("li.mg-row").first();
  const firstEntry = (await first.getByTitle("Edit entry", { exact: true }).getAttribute("aria-label")).replace(/^Edit /, "");
  await first.getByTitle("Delete entry", { exact: true }).click();
  const confirm = await first.getByTitle("Really delete this entry", { exact: true }).getAttribute("aria-label");
  check("armed delete names the same entry", confirm === `Really delete ${firstEntry}`, confirm);
  check("no page errors", errs.length === 0, errs.join(" | "));
  await ctx.close();

  // The install pop-up (a first visit: no install-hint saved yet), three ways:
  //   "Got it"   — normal first visit, closed with its button
  //   "Escape"   — normal first visit, closed with Escape
  //   "Recovery" — the save is unreadable, so Recovery shows first and the
  //                pop-up's "show" arrives before the garden does; after
  //                Start fresh the trap must still switch on (closed with Escape)
  for (const route of ["Got it", "Escape", "Recovery"]) {
    const ictx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    await ictx.addInitScript((route) => {
      localStorage.setItem("money-garden:theme", "day");
      // Once per tab, so Start fresh's own reload-free save isn't undone.
      if (route === "Recovery" && !sessionStorage.getItem("seeded")) {
        sessionStorage.setItem("seeded", "1"); localStorage.setItem("money-garden:state-v1", "{not json");
      }
    }, route);
    const ip = await ictx.newPage(); const ierrs = []; ip.on("pageerror", (e) => ierrs.push(e.message)); ip.setDefaultTimeout(5000);
    await ip.goto(BASE);
    if (route === "Recovery") {
      await ip.getByRole("button", { name: "Start fresh…", exact: true }).click();
      await ip.getByRole("button", { name: "Really start fresh?", exact: true }).click();
    }
    const dialog = ip.getByRole("dialog", { name: "Add Money Garden to your home screen" });
    await dialog.waitFor();
    // Where focus is, as "dialog" / "inside" / "header" / "main" / "body".
    const focusAt = () => ip.evaluate(() => {
      const a = document.activeElement;
      if (!a || a === document.body) return "body";
      if (a.getAttribute("role") === "dialog") return "dialog";
      if (a.closest('[role="dialog"]')) return "inside";
      return a.closest("header") ? "header" : a.closest("main") ? "main" : a.tagName;
    });
    const inertNow = () => ip.evaluate(() => [...document.querySelectorAll("header, main")].map((el) => el.inert));

    // Trapped from the start: the page behind is inert, and focus is on the
    // pop-up itself (so it's announced) with no ring painted.
    const before = await inertNow();
    const ring = await ip.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    const at = await focusAt();
    check(`${route}: pop-up opens trapped (page inert, focus on it, no ring)`,
      before.length === 2 && before.every((v) => v === true) && at === "dialog" && ring === "none",
      `inert ${before}, focus ${at}, outline ${ring}`);

    if (route === "Got it") {
      // Tab and Shift+Tab, round and round: never behind the pop-up. (Past
      // its last button focus may rest on the page itself — the browser's
      // own toolbar in a real window — then comes straight back.)
      const seen = [];
      for (const key of [...Array(8).fill("Tab"), ...Array(8).fill("Shift+Tab")]) {
        await ip.keyboard.press(key); seen.push(await focusAt());
      }
      check("pop-up: Tab / Shift+Tab never reach the page behind", seen.every((s) => ["dialog", "inside", "body"].includes(s)) && seen.includes("inside"), seen.join(" "));
      // A screen reader's view: the pop-up only, none of the page behind.
      // Read from Chrome's own accessibility tree (what screen readers get) —
      // Playwright's ariaSnapshot() doesn't apply `inert`.
      const heard = await spoken(ip);
      check("pop-up: screen reader hears only the pop-up", heard.includes("Got it") && heard.includes("Take the garden with you")
        && !heard.includes("Overview") && !heard.includes("Money Garden"), heard.join(" · ").slice(0, 300));
      await ip.getByRole("button", { name: "Got it", exact: true }).click();
    } else {
      await ip.keyboard.press("Escape");
    }

    // Closed: the page is back — reachable by keyboard and by screen readers.
    await dialog.waitFor({ state: "detached" });
    const after = await inertNow();
    let reached = false;
    for (let i = 0; i < 6 && !reached; i++) { await ip.keyboard.press("Tab"); reached = ["header", "main"].includes(await focusAt()); }
    const back = await spoken(ip);
    check(`${route}: closed, page back (not inert, Tab reaches it, readable)`,
      after.length === 2 && after.every((v) => v === false) && reached && back.includes("Overview") && back.includes("Money Garden"),
      `inert ${after}, tab reached ${reached}, heard ${back.length} names`);
    check(`${route}: no page errors`, ierrs.length === 0, ierrs.join(" | "));
    await ictx.close();
  }
  await browser.close();
} catch (e) { out.push("ERROR " + (e.stack || e).toString().split("\n").slice(0, 3).join(" | ")); } finally {
  await browser?.close().catch(() => {}); server.kill(); console.log(out.join("\n"));
  // Non-zero exit when any check failed (or none ran) — useful run alone, too.
  process.exitCode = out.length && out.every((l) => l.startsWith("PASS")) ? 0 : 1;
}
