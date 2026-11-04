// What a screen reader hears (v0.18.5). Sighted users see the selected tab
// as a dark pill; a screen reader only gets the page's structure, so the
// selected tab carries aria-current="page" ("Overview, current page,
// button"), and the tab emoji are aria-hidden so they aren't read out by
// their Unicode names ("sun behind small cloud, Overview").
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
  check("no page errors", errs.length === 0, errs.join(" | "));
  await ctx.close();
  await browser.close();
} catch (e) { out.push("ERROR " + (e.stack || e).toString().split("\n").slice(0, 3).join(" | ")); } finally {
  await browser?.close().catch(() => {}); server.kill(); console.log(out.join("\n"));
  // Non-zero exit when any check failed (or none ran) — useful run alone, too.
  process.exitCode = out.length && out.every((l) => l.startsWith("PASS")) ? 0 : 1;
}
