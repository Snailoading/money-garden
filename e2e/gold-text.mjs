// No gold text below 4.5:1, in either theme (v0.18.5). Marigold is a fill
// colour — 1.86:1 as text on a day card — so gold TEXT uses --amber or
// --marigold-text (deep gold by day; the night garden keeps its exact old
// colours). This walks every tab with sample data (plus a browsed past
// month for the amber "↩ today" pill and month label), finds every visible
// piece of text whose colour is marigold or amber, and measures it against
// the background it actually sits on.
import { chromium } from "playwright";
import { spawn, execSync } from "node:child_process";
import { SP, DIST, shot } from "./paths.mjs";
const PORT = 8153; const BASE = `http://127.0.0.1:${PORT}/`;
try { execSync(`lsof -tnP -iTCP:${PORT} -sTCP:LISTEN | xargs kill`, { stdio: "ignore" }); } catch {}
const server = spawn("python3", [`${SP}/server.py`, DIST, String(PORT)], { stdio: "ignore" });
const out = []; const check = (n, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`);
const TABS = ["Overview", "Log", "Budgets", "Garden", "Orchard", "Seasons", "Advice"];

/** In the page: every visible gold text element with its contrast ratio. */
function goldText() {
  const rgb = (s) => (s.match(/[\d.]+/g) || []).map(Number); // "rgb(1, 2, 3)" → [1, 2, 3]
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const root = getComputedStyle(document.documentElement);
  const gold = ["--marigold", "--amber", "--marigold-text"].map((v) => {
    // Transparent fallback: a token missing from the build (older builds)
    // must match nothing, not silently become the inherited ink colour.
    const probe = document.createElement("span"); probe.style.color = `var(${v}, transparent)`; document.body.append(probe);
    const c = getComputedStyle(probe).color; probe.remove(); return c;
  });
  // The first ancestor with an opaque background is what the text sits on.
  const bgOf = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const c = rgb(getComputedStyle(n).backgroundColor);
      if (c.length >= 3 && (c[3] ?? 1) > 0.5) return c;
    }
    return [NaN, NaN, NaN]; // no opaque surface found — reported as a failure below
  };
  const found = [];
  for (const el of document.querySelectorAll("body *")) {
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").trim();
    if (!own) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.opacity === "0") continue;
    const color = el instanceof SVGElement ? cs.fill : cs.color;
    if (!gold.includes(color)) continue;
    const [a, b] = [lum(rgb(color)), lum(bgOf(el))].sort((x, y) => y - x);
    found.push({ text: own.slice(0, 40), ratio: (a + 0.05) / (b + 0.05) });
  }
  return found;
}

let browser;
try {
  let pid = null;
  for (let i = 0; i < 50 && pid === null; i++) { try { pid = Number(await (await fetch(BASE + "__pid")).text()); } catch { await new Promise((r) => setTimeout(r, 100)); } }
  if (pid !== server.pid) throw new Error("orphan server");
  browser = await chromium.launch();
  for (const theme of ["day", "night"]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    await ctx.addInitScript((theme) => {
      localStorage.setItem("money-garden:theme", theme); localStorage.setItem("money-garden:install-hint", "muted");
    }, theme);
    const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(e.message)); page.setDefaultTimeout(5000);
    await page.goto(BASE); await page.getByText("Money Garden", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Plant sample data", exact: true }).click();
    await page.getByText("Sent to goals", { exact: true }).waitFor();
    const all = [];
    for (const tab of TABS) {
      await page.getByRole("button", { name: new RegExp(tab) }).first().click();
      await page.waitForTimeout(300);
      all.push(...(await page.evaluate(goldText)).map((f) => ({ ...f, where: tab })));
    }
    // A browsed past month: the amber month label and "↩ today" pill.
    await page.getByRole("button", { name: "Overview" }).first().click();
    await page.getByRole("button", { name: "Previous month", exact: true }).click();
    await page.getByText("↩ today", { exact: true }).waitFor();
    all.push(...(await page.evaluate(goldText)).map((f) => ({ ...f, where: "past month" })));
    await shot(page, `gold-text-${theme}-past-month`, { clip: { x: 0, y: 0, width: 1280, height: 520 } });

    // Night keeps its exact old colours: "Sent to goals" in night marigold,
    // the "↩ today" pill in night amber (the values before v0.18.5).
    if (theme === "night") {
      const colorOf = (loc) => loc.evaluate((el) => getComputedStyle(el).color);
      const sent = await colorOf(page.getByText("Sent to goals", { exact: true }).locator("xpath=following-sibling::span[1]/b").first());
      const pill = await colorOf(page.getByText("↩ today", { exact: true }));
      check("night: colours unchanged (marigold #f5c34d, amber #d9b054)",
        sent === "rgb(245, 195, 77)" && pill === "rgb(217, 176, 84)", `sent to goals ${sent}, ↩ today ${pill}`);
    }

    // Budgets while browsing: the amber "Viewing …'s spending" note.
    await page.getByRole("button", { name: /Budgets/ }).first().click();
    await page.getByText(/^Viewing /).first().waitFor();
    all.push(...(await page.evaluate(goldText)).map((f) => ({ ...f, where: "past Budgets" })));

    const texts = all.map((f) => f.text);
    // Not vacuous: the two spots this fix moved to gold, plus the pill.
    check(`${theme}: found the gold texts`, ["↩ today"].every((t) => texts.includes(t)) && all.some((f) => f.where === "Overview" && f.text.startsWith("$")) && all.some((f) => f.where === "Log" && f.text.includes("$")),
      `${all.length} found: ` + [...new Set(all.map((f) => `${f.where}:"${f.text}"`))].slice(0, 8).join(", "));
    check(`${theme}: Budgets "Viewing …" note measured`, all.some((f) => f.where === "past Budgets" && f.text.startsWith("Viewing")));
    // `!(ratio >= 4.5)` so an unmeasurable NaN ratio fails instead of passing.
    const low = all.filter((f) => !(f.ratio >= 4.5));
    check(`${theme}: every gold text ≥ 4.5:1`, low.length === 0,
      low.length ? low.map((f) => `${f.where}:"${f.text}" ${f.ratio.toFixed(2)}`).join(", ") : `lowest ${Math.min(...all.map((f) => f.ratio)).toFixed(2)}`);
    check(`${theme}: no page errors`, errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  await browser.close();
} catch (e) { out.push("ERROR " + (e.stack || e).toString().split("\n").slice(0, 3).join(" | ")); } finally {
  await browser?.close().catch(() => {}); server.kill(); console.log(out.join("\n"));
  // Non-zero exit when any check failed (or none ran) — useful run alone, too.
  process.exitCode = out.length && out.every((l) => l.startsWith("PASS")) ? 0 : 1;
}
