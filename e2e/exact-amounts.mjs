// Money on screen is exact to the cent: amounts are rounded only when shown,
// never before adding up (v0.18.5). A past month of $12.50 + $7.50 + $4.50
// — each would round UP by 50¢ — must read $24.50 in the donut, its legend
// and the pace tooltip, not $26.00; a $499.60 orchard must not read $500.00.
import { chromium } from "playwright";
import { spawn, execSync } from "node:child_process";
import { SP, DIST, shot } from "./paths.mjs";
const PORT = 8151; const BASE = `http://127.0.0.1:${PORT}/`;
try { execSync(`lsof -tnP -iTCP:${PORT} -sTCP:LISTEN | xargs kill`, { stdio: "ignore" }); } catch {}
const server = spawn("python3", [`${SP}/server.py`, DIST, String(PORT)], { stdio: "ignore" });
const out = []; const check = (n, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`);

// Last month, as the app's local calendar sees it (same machine, same TZ).
const now = new Date();
const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const ym = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
const t = (id, amount, category, day) => ({ id, type: "expense", amount, category, note: "", date: `${ym}-${day}` });
const garden = {
  income: 0, budgets: {}, goals: [], commitments: [], streak: { count: 0, lastDate: null },
  transactions: [t("a", 12.5, "groceries", "01"), t("b", 7.5, "dining", "05"), t("c", 4.5, "shopping", "07")],
  invest: { holdings: [{ id: "h", name: "ETF", value: 499.6 }], monthly: 0, ret: 7, birthYear: 0, retireAge: 65, wr: 4, retireSpend: 100 },
};

/** Every <text> in the chart labelled `label` (SVG text, so read textContent). */
const svgTexts = (page, label) => page.evaluate((label) =>
  [...document.querySelectorAll(`svg[aria-label^="${label}"] text`)].map((el) => el.textContent.trim()), label);
/** Point at the left or right edge of a chart, then read its tooltip line.
 * Moves off the chart first and waits for the old tooltip to go, so a read
 * can never pick up the previous check's tooltip. */
async function tooltipAt(page, label, edge, prefix) {
  await page.mouse.move(0, 0);
  for (let i = 0; i < 20 && (await svgTexts(page, label)).some((s) => s.startsWith(prefix)); i++) await page.waitForTimeout(50);
  const box = await page.locator(`svg[aria-label^="${label}"]`).first().boundingBox();
  await page.mouse.move(edge === "left" ? box.x + 2 : box.x + box.width - 2, box.y + box.height / 2);
  for (let i = 0; i < 20; i++) {
    const line = (await svgTexts(page, label)).find((s) => s.startsWith(prefix));
    if (line) return line;
    await page.waitForTimeout(100);
  }
  return "(no tooltip)";
}

let browser;
try {
  let pid = null;
  for (let i = 0; i < 50 && pid === null; i++) { try { pid = Number(await (await fetch(BASE + "__pid")).text()); } catch { await new Promise((r) => setTimeout(r, 100)); } }
  if (pid !== server.pid) throw new Error("orphan server");
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
  await ctx.addInitScript((garden) => {
    localStorage.setItem("money-garden:install-hint", "muted");
    if (!localStorage.getItem("money-garden:state-v1")) localStorage.setItem("money-garden:state-v1", JSON.stringify(garden));
  }, garden);
  const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(e.message)); page.setDefaultTimeout(5000);
  await page.goto(BASE); await page.getByText("Money Garden", { exact: true }).waitFor();

  // Overview, browsing last month.
  await page.getByRole("button", { name: "Previous month", exact: true }).click();
  await page.getByText("↩ today", { exact: true }).waitFor();
  const main = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  check("E1 Spent reads $24.50", /Spent \$24\.50/.test(main), main.slice(0, 160));
  const donut = await svgTexts(page, "Spending by category");
  check("E2 donut centre reads $24.50", donut.includes("$24.50"), donut.join(" | "));
  const card = (await page.locator("section, .mg-card", { has: page.getByText("Where it went", { exact: true }) }).last().innerText()).replace(/\s+/g, " ");
  check("E3 legend keeps the cents", ["$12.50", "$7.50", "$4.50"].every((s) => card.includes(s)), card.slice(0, 200));
  const day1 = await tooltipAt(page, "Cumulative spending", "left", "Spent");
  check("E4 pace tooltip, day 1: Spent $12.50", day1 === "Spent $12.50", day1);
  const lastDay = await tooltipAt(page, "Cumulative spending", "right", "Spent");
  check("E5 pace tooltip, last day: Spent $24.50", lastDay === "Spent $24.50", lastDay);
  await shot(page, "exact-amounts-overview", { fullPage: true });

  // Orchard: today's point of the projection is the $499.60 portfolio.
  await page.getByRole("button", { name: /Orchard/ }).first().click();
  await page.locator('svg[aria-label="Portfolio projection"]').waitFor();
  const expected = await tooltipAt(page, "Portfolio projection", "left", "Expected");
  check("E6 projection tooltip, today: Expected $499.60", expected === "Expected $499.60", expected);
  check("E7 no page errors", errs.length === 0, errs.join(" | "));
  await ctx.close();
  await browser.close();
} catch (e) { out.push("ERROR " + (e.stack || e).toString().split("\n").slice(0, 3).join(" | ")); } finally {
  await browser?.close().catch(() => {}); server.kill(); console.log(out.join("\n"));
  // Non-zero exit when any check failed (or none ran) — useful run alone, too.
  process.exitCode = out.length && out.every((l) => l.startsWith("PASS")) ? 0 : 1;
}
