// Browsing a past month, Overview names that month — never "this month"
// (v0.18.5). The donut's centre said "This month" over October's slices,
// and so did the "Total money out" line under the stats (shown when goal
// draws happened). Sample data's previous month has spending and a draw
// from the rain barrel, so both show there.
import { chromium } from "playwright";
import { spawn, execSync } from "node:child_process";
import { SP, DIST, shot } from "./paths.mjs";
const PORT = 8157; const BASE = `http://127.0.0.1:${PORT}/`;
try { execSync(`lsof -tnP -iTCP:${PORT} -sTCP:LISTEN | xargs kill`, { stdio: "ignore" }); } catch {}
const server = spawn("python3", [`${SP}/server.py`, DIST, String(PORT)], { stdio: "ignore" });
const out = []; const check = (n, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`);

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
  await page.getByRole("button", { name: "Plant sample data", exact: true }).click();
  await page.getByText("Sent to goals", { exact: true }).waitFor();

  const donut = page.getByRole("img", { name: "Spending by category" });
  const centre = () => donut.locator("text").first().textContent();
  // The previous month's name as the app writes it ("October").
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString("en-US", { month: "long" });

  check("today: the donut centre says This month", (await centre()) === "This month", await centre());

  await page.getByRole("button", { name: "Previous month", exact: true }).click();
  await page.getByText(`Left over in ${prev}`, { exact: true }).waitFor();
  check(`past month: the donut centre says ${prev}`, (await centre()) === prev, await centre());
  const moneyOut = page.getByText(/^Total money out /);
  check(`past month: "Total money out in ${prev}"`, (await moneyOut.textContent()).startsWith(`Total money out in ${prev}:`), await moneyOut.textContent());
  // Nowhere on Overview: the whole main area's text, not just the two spots.
  const said = (await page.locator("main").innerText()).match(/[^\n]*this month[^\n]*/i);
  check("past month: nothing on the page says \"this month\" (Overview + shed)", said === null, said?.[0] ?? "");
  await shot(page, "past-month-overview", { fullPage: true });

  // Picking a slice still shows that category; letting go brings the month back.
  // (Not slice.hover(): a big arc's bounding-box centre is in the donut's
  // hole. Slices are sorted largest first and start at 12 o'clock, so the
  // first is at least a tenth of the ring — aim a little clockwise of 12,
  // mid-ring: radius 64 of the 170-unit viewBox. It's Housing: the sample's
  // $1,400 rent is every month's biggest slice.)
  const box = await donut.boundingBox(); const k = box.width / 170;
  await page.mouse.move(box.x + (85 + 64 * Math.sin(0.15)) * k, box.y + (85 - 64 * Math.cos(0.15)) * k);
  const picked = await centre();
  await page.mouse.move(5, 5);
  check("past month: a picked slice shows its category, then the month returns",
    picked === "Housing" && (await centre()) === prev, `picked "${picked}", after "${await centre()}"`);

  // Back to today: "This month" again.
  await page.getByText("↩ today", { exact: true }).click();
  await page.getByText("Left to spend this month", { exact: true }).waitFor();
  check("back to today: This month again", (await centre()) === "This month", await centre());
  check("no page errors", errs.length === 0, errs.join(" | "));
  await ctx.close();
  await browser.close();
} catch (e) { out.push("ERROR " + (e.stack || e).toString().split("\n").slice(0, 3).join(" | ")); } finally {
  await browser?.close().catch(() => {}); server.kill(); console.log(out.join("\n"));
  // Non-zero exit when any check failed (or none ran) — useful run alone, too.
  process.exitCode = out.length && out.every((l) => l.startsWith("PASS")) ? 0 : 1;
}
