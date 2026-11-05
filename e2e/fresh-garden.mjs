// A fresh garden's weather pill is neutral (v0.18.6). With nothing entered,
// health is the no-budget default 55 — "☁️ Overcast · 55/100, Spending is
// creeping up" before a single entry. A fresh garden now reads "🌱 New
// garden — Plant your first entry." with no score, and the real weather
// returns the moment anything is entered (the same isFreshGarden test that
// offers "Plant sample data"): sample data, or just an income.
import { chromium } from "playwright";
import { spawn, execSync } from "node:child_process";
import { SP, DIST, shot } from "./paths.mjs";
const PORT = 8158; const BASE = `http://127.0.0.1:${PORT}/`;
try { execSync(`lsof -tnP -iTCP:${PORT} -sTCP:LISTEN | xargs kill`, { stdio: "ignore" }); } catch {}
const server = spawn("python3", [`${SP}/server.py`, DIST, String(PORT)], { stdio: "ignore" });
const out = []; const check = (n, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`);

let browser;
try {
  let pid = null;
  for (let i = 0; i < 50 && pid === null; i++) { try { pid = Number(await (await fetch(BASE + "__pid")).text()); } catch { await new Promise((r) => setTimeout(r, 100)); } }
  if (pid !== server.pid) throw new Error("orphan server");
  browser = await chromium.launch();

  /** A fresh visit: a new browser context, so nothing is saved yet. */
  const freshPage = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    await ctx.addInitScript(() => {
      localStorage.setItem("money-garden:theme", "day"); localStorage.setItem("money-garden:install-hint", "muted");
    });
    const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(e.message)); page.setDefaultTimeout(5000);
    await page.goto(BASE); await page.getByText("Money Garden", { exact: true }).waitFor();
    return { ctx, page, errs };
  };
  // The weather pill's text, e.g. "🌱 New garden Plant your first entry."
  const pill = (page) => page.locator('[title^="Garden health"]').innerText().then((t) => t.replace(/\s+/g, " ").trim());
  const isNew = (t) => t === "🌱 New garden Plant your first entry.";
  const isScored = (t) => /^\S+ (Sunny|Fair|Overcast|Stormy) · \d+\/100 /.test(t);

  // 1. Fresh → New garden; sample data → real weather; Start fresh → New garden.
  {
    const { ctx, page, errs } = await freshPage();
    const fresh = await pill(page);
    check("fresh garden: 🌱 New garden, no score, no spending talk", isNew(fresh) && !fresh.includes("/100") && !fresh.includes("creeping"), fresh);
    await shot(page, "fresh-garden-pill", { clip: { x: 0, y: 0, width: 1280, height: 200 } });

    await page.getByRole("button", { name: "Plant sample data", exact: true }).click();
    await page.getByText("Sent to goals", { exact: true }).waitFor();
    const planted = await pill(page);
    check("sample data: the real weather and score return", isScored(planted), planted);

    await page.getByRole("button", { name: "Start fresh…", exact: true }).click();
    await page.getByRole("button", { name: "Really erase everything?", exact: true }).click();
    await page.getByRole("button", { name: "Plant sample data", exact: true }).waitFor();
    const cleared = await pill(page);
    check("Start fresh: back to New garden", isNew(cleared), cleared);
    check("no page errors (sample / start fresh)", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  // 2. Just an income: no entries yet, but the garden isn't fresh any more.
  {
    const { ctx, page, errs } = await freshPage();
    await page.getByLabel("Monthly income").fill("4200");
    await page.getByRole("button", { name: "Plant sample data", exact: true }).waitFor({ state: "detached" });
    const withIncome = await pill(page);
    check("income only: the real weather and score return", isScored(withIncome), withIncome);
    // It survives a reload (it's the saved garden, not a passing state).
    await page.reload(); await page.getByText("Money Garden", { exact: true }).waitFor();
    const reloaded = await pill(page);
    check("income only, after reload: still the real weather", isScored(reloaded), reloaded);
    check("no page errors (income only)", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  await browser.close();
} catch (e) { out.push("ERROR " + (e.stack || e).toString().split("\n").slice(0, 3).join(" | ")); } finally {
  await browser?.close().catch(() => {}); server.kill(); console.log(out.join("\n"));
  // Non-zero exit when any check failed (or none ran) — useful run alone, too.
  process.exitCode = out.length && out.every((l) => l.startsWith("PASS")) ? 0 : 1;
}
