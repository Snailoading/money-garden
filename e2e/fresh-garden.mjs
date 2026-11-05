// A garden with nothing logged yet has a neutral weather pill (v0.18.6).
// Health reads only the journal and the logging streak, so until either
// exists it's a fixed 55 — which read "☁️ Overcast · 55/100, Spending is
// creeping up" before a single entry, even with an income set. It now reads
// "🌱 New garden — Plant your first entry." with no score; the first entry
// (or sample data, or a no-spend day) brings the real weather back.
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

  // 2. Set up but nothing logged (an income): still New garden, also after
  //    a reload. Then the first expense brings the real weather.
  {
    const { ctx, page, errs } = await freshPage();
    await page.getByLabel("Monthly income").fill("4200");
    // The income is saved: the garden is no longer "fresh soil" (no sample card).
    await page.getByRole("button", { name: "Plant sample data", exact: true }).waitFor({ state: "detached" });
    const withIncome = await pill(page);
    check("income only, nothing logged: still New garden", isNew(withIncome), withIncome);
    await page.reload(); await page.getByText("Money Garden", { exact: true }).waitFor();
    await page.getByLabel("Monthly income").waitFor();
    const reloaded = await pill(page);
    check("income only, after reload: still New garden", isNew(reloaded) && (await page.getByLabel("Monthly income").inputValue()) === "4200", reloaded);
    await page.getByRole("button", { name: "Log", exact: true }).click();
    await page.getByPlaceholder("0.00").fill("12.50");
    await page.getByRole("button", { name: "Add expense", exact: true }).click();
    await page.getByText("This month's ledger", { exact: true }).waitFor();
    await page.locator("li.mg-row").first().waitFor();
    const logged = await pill(page);
    check("first expense: the real weather and score return", isScored(logged), logged);
    check("no page errors (income, first expense)", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  // 3. A no-spend day is logging too (it builds the streak): real weather.
  {
    const { ctx, page, errs } = await freshPage();
    await page.getByRole("button", { name: "Log", exact: true }).click();
    await page.getByRole("button", { name: "🌵 Mark a no-spend day", exact: true }).click();
    await page.getByText(/^🔥 1$/).waitFor();
    const noSpend = await pill(page);
    check("no-spend day: the real weather and score return", isScored(noSpend), noSpend);
    check("no page errors (no-spend day)", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  await browser.close();
} catch (e) { out.push("ERROR " + (e.stack || e).toString().split("\n").slice(0, 3).join(" | ")); } finally {
  await browser?.close().catch(() => {}); server.kill(); console.log(out.join("\n"));
  // Non-zero exit when any check failed (or none ran) — useful run alone, too.
  process.exitCode = out.length && out.every((l) => l.startsWith("PASS")) ? 0 : 1;
}
