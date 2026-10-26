// The FI tip names the user's own withdrawal rate (v0.18.2): a garden that
// has reached its freedom number, at 3% (day theme) and 5% (night theme).
import { chromium } from "playwright";
import { spawn, execSync } from "node:child_process";
import { SP, DIST, shot } from "./paths.mjs";
const PORT = 8147; const BASE = `http://127.0.0.1:${PORT}/`;
try { execSync(`lsof -tnP -iTCP:${PORT} -sTCP:LISTEN | xargs kill`, { stdio: "ignore" }); } catch {}
const server = spawn("python3", [`${SP}/server.py`, DIST, String(PORT)], { stdio: "ignore" });
const out = []; const check = (n, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`);
let browser;
try {
  let pid = null;
  for (let i = 0; i < 50 && pid === null; i++) { try { pid = Number(await (await fetch(BASE + "__pid")).text()); } catch { await new Promise((r) => setTimeout(r, 100)); } }
  if (pid !== server.pid) throw new Error("orphan server");
  browser = await chromium.launch();
  for (const [wr, theme] of [[3, "day"], [5, "night"]]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
    await ctx.addInitScript(([wr, theme]) => {
      localStorage.setItem("money-garden:theme", theme); localStorage.setItem("money-garden:install-hint", "muted");
      if (!localStorage.getItem("money-garden:state-v1")) localStorage.setItem("money-garden:state-v1", JSON.stringify({
        income: 0, budgets: {}, transactions: [], goals: [], commitments: [], streak: { count: 0, lastDate: null },
        invest: { holdings: [{ id: "h", name: "ETF", value: 100000 }], monthly: 0, ret: 7, birthYear: 0, retireAge: 65, wr, retireSpend: 100 },
      }));
    }, [wr, theme]);
    const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(e.message)); page.setDefaultTimeout(5000);
    await page.goto(BASE); await page.getByText("Money Garden", { exact: true }).waitFor();
    await page.getByRole("button", { name: /Advice/ }).first().click();
    const card = page.locator("section", { has: page.getByText("The tree can feed you now", { exact: true }) });
    await card.waitFor();
    const txt = await card.innerText();
    check(`W${wr} names ${wr}%`, txt.includes(`By the ${wr}% rule of thumb`), txt.replace(/\s+/g, " ").slice(0, 260));
    check(`W${wr} caution matches the rate`, wr <= 3.5 ? txt.includes("already at or below") && !txt.includes("more cautious") : txt.includes("more cautious 3–3.5%"));
    check(`W${wr} disclaimer still on the page`, (await page.locator("main").innerText()).includes("not personalized financial advice"));
    check(`W${wr} no page errors`, errs.length === 0, errs.join(" | "));
    // Cards fade in with a staggered delay — wait it out before looking.
    await page.waitForTimeout(1500); await card.scrollIntoViewIfNeeded(); await shot(card, `withdrawal-rate-${wr}`);
    await ctx.close();
  }
  await browser.close();
} catch (e) { out.push("ERROR " + (e.stack || e).toString().split("\n").slice(0, 3).join(" | ")); } finally {
  await browser?.close().catch(() => {}); server.kill(); console.log(out.join("\n"));
  // Non-zero exit when any check failed (or none ran) — useful run alone, too.
  process.exitCode = out.length && out.every((l) => l.startsWith("PASS")) ? 0 : 1;
}
