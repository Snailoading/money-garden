// Seasons gridlines sit on round values and their labels say exactly where
// they sit (v0.18.5). The old charts drew lines at ⅓ and ⅔ of the data's
// max and rounded the labels, so a line at $1,630 read "$2k". Here every
// label is read with its line's height and the pairs must fall on ONE
// straight scale (same pixels per dollar), with zero at the baseline.
// Sample data (a mixed surplus/deficit history) plus an all-deficit garden.
import { chromium } from "playwright";
import { spawn, execSync } from "node:child_process";
import { SP, DIST, shot } from "./paths.mjs";
const PORT = 8152; const BASE = `http://127.0.0.1:${PORT}/`;
try { execSync(`lsof -tnP -iTCP:${PORT} -sTCP:LISTEN | xargs kill`, { stdio: "ignore" }); } catch {}
const server = spawn("python3", [`${SP}/server.py`, DIST, String(PORT)], { stdio: "ignore" });
const out = []; const check = (n, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`);

const CHARTS = [
  ["bars", "Earned vs spent per month"],
  ["rate", "Savings rate per month"],
  ["left", "Money left over per month"],
  ["split", "Needs vs wants per month"],
];
/** "$2.5k" → 2500, "−$1k" → −1000, "30%" → 30. */
const parse = (s) => {
  const neg = s.startsWith("−");
  const m = s.replace("−", "").match(/^\$?([\d.]+)([kM]?)%?$/);
  if (!m) return NaN;
  const v = Number(m[1]) * (m[2] === "k" ? 1e3 : m[2] === "M" ? 1e6 : 1);
  return neg ? -v : v;
};
/** Axis labels (x = 44 in the viewBox) with their y, in viewBox units. */
const axisLabels = (page, label) => page.evaluate((label) =>
  [...document.querySelectorAll(`svg[aria-label^="${label}"] text[x="44"]`)]
    .map((el) => ({ text: el.textContent.trim(), y: Number(el.getAttribute("y")) })), label);

// Last two months, as the app's local calendar sees them (same machine/TZ).
const ymBack = (k) => { const d = new Date(); const p = new Date(d.getFullYear(), d.getMonth() - k, 1); return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, "0")}`; };
const deficitGarden = {
  income: 0, budgets: {}, goals: [], commitments: [], streak: { count: 0, lastDate: null },
  transactions: [
    { id: "a", type: "expense", amount: 1200, category: "housing", note: "", date: `${ymBack(2)}-03` },
    { id: "b", type: "expense", amount: 300, category: "groceries", note: "", date: `${ymBack(1)}-03` },
  ],
  invest: { holdings: [], monthly: 0, ret: 7, birthYear: 0, retireAge: 65, wr: 4, retireSpend: 0 },
};
// A $950 month: with headroom the axis takes $250 steps up to $1,250 — the
// fifth line whose label once rounded to "$1.3k".
const fiveLineGarden = {
  ...deficitGarden,
  transactions: [{ id: "a", type: "expense", amount: 950, category: "housing", note: "", date: `${ymBack(1)}-03` }],
};

/** Check every chart on the Seasons tab: round, exact, one linear scale. */
async function checkCharts(page, tag, only = null) {
  for (const [key, label] of CHARTS) {
    if (only && !only.includes(key)) continue;
    const ls = await axisLabels(page, label);
    const pts = ls.map((l) => ({ ...l, v: parse(l.text) }));
    const shown = pts.map((p) => p.text).join(" ");
    check(`${tag} ${key}: labels found and readable`, pts.length >= 2 && pts.every((p) => Number.isFinite(p.v)), shown || "(none)");
    if (pts.length < 2) continue;
    // Zero sits on the baseline: labelled "$0" on the diverging chart,
    // otherwise the axis foot (y(0) = 196 → its label would sit at 200).
    const zero = pts.find((p) => p.v === 0)?.y ?? 200;
    const ratios = pts.filter((p) => p.v !== 0).map((p) => (zero - p.y) / p.v);
    const spread = (Math.max(...ratios) - Math.min(...ratios)) / Math.abs(ratios[0]);
    check(`${tag} ${key}: every label sits where its line is`, spread < 0.005, `${shown} · spread ${(spread * 100).toFixed(2)}%`);
    // Zero counts as a gridline (the baseline), so −$1k → $0 → $1k is even.
    const vals = [0, ...pts.map((p) => p.v).filter((v) => v !== 0)].sort((a, b) => a - b);
    const steps = vals.slice(1).map((v, i) => v - vals[i]);
    check(`${tag} ${key}: evenly spaced round steps`, steps.every((s) => Math.abs(s - steps[0]) < 1e-9 * Math.abs(steps[0] || 1)), shown);
  }
}

let browser;
try {
  let pid = null;
  for (let i = 0; i < 50 && pid === null; i++) { try { pid = Number(await (await fetch(BASE + "__pid")).text()); } catch { await new Promise((r) => setTimeout(r, 100)); } }
  if (pid !== server.pid) throw new Error("orphan server");
  browser = await chromium.launch();

  // 1) Sample data — a mixed history, one month in deficit.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    await ctx.addInitScript(() => localStorage.setItem("money-garden:install-hint", "muted"));
    const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(e.message)); page.setDefaultTimeout(5000);
    await page.goto(BASE); await page.getByText("Money Garden", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Plant sample data", exact: true }).click();
    await page.getByRole("button", { name: /Seasons/ }).first().click();
    await page.locator('svg[aria-label^="Earned vs spent"]').waitFor();
    await checkCharts(page, "S");
    check("S no page errors", errs.length === 0, errs.join(" | "));
    // Bars grow in over 0.9s — wait it out so a screenshot shows them.
    if (process.env.E2E_SHOTS) await page.waitForTimeout(1500);
    await shot(page, "seasons-gridlines-sample", { fullPage: true });
    await ctx.close();
  }

  // 2) An all-deficit history: no positive gridlines, still one scale.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    await ctx.addInitScript((g) => {
      localStorage.setItem("money-garden:install-hint", "muted");
      if (!localStorage.getItem("money-garden:state-v1")) localStorage.setItem("money-garden:state-v1", JSON.stringify(g));
    }, deficitGarden);
    const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(e.message)); page.setDefaultTimeout(5000);
    await page.goto(BASE); await page.getByText("Money Garden", { exact: true }).waitFor();
    await page.getByRole("button", { name: /Seasons/ }).first().click();
    await page.locator('svg[aria-label^="Money left over"]').waitFor();
    await checkCharts(page, "D", ["left"]);
    const left = (await axisLabels(page, "Money left over per month")).map((l) => parse(l.text));
    check("D left: no gridlines above zero", left.every((v) => v <= 0), left.join(" "));
    check("D no page errors", errs.length === 0, errs.join(" | "));
    if (process.env.E2E_SHOTS) await page.waitForTimeout(1500);
    await shot(page, "seasons-gridlines-deficit", { fullPage: true });
    await ctx.close();
  }

  // 3) A five-line axis: the top label needs two decimals ($1.25k).
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    await ctx.addInitScript((g) => {
      localStorage.setItem("money-garden:install-hint", "muted");
      if (!localStorage.getItem("money-garden:state-v1")) localStorage.setItem("money-garden:state-v1", JSON.stringify(g));
    }, fiveLineGarden);
    const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(e.message)); page.setDefaultTimeout(5000);
    await page.goto(BASE); await page.getByText("Money Garden", { exact: true }).waitFor();
    await page.getByRole("button", { name: /Seasons/ }).first().click();
    await page.locator('svg[aria-label^="Earned vs spent"]').waitFor();
    await checkCharts(page, "F");
    const bars = (await axisLabels(page, "Earned vs spent per month")).map((l) => l.text);
    check("F bars: top line reads $1.25k", bars.includes("$1.25k"), bars.join(" "));
    check("F no page errors", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  await browser.close();
} catch (e) { out.push("ERROR " + (e.stack || e).toString().split("\n").slice(0, 3).join(" | ")); } finally {
  await browser?.close().catch(() => {}); server.kill(); console.log(out.join("\n"));
  // Non-zero exit when any check failed (or none ran) — useful run alone, too.
  process.exitCode = out.length && out.every((l) => l.startsWith("PASS")) ? 0 : 1;
}
