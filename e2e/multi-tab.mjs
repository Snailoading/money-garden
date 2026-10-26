// Multi-tab sync (v0.18.1). Two pages in ONE browser context share
// localStorage, and the browser fires `storage` events between them — the
// same as two real tabs of the site.
import { chromium } from "playwright";
import { spawn, execSync } from "node:child_process";
import { SP, DIST, shot } from "./paths.mjs";
const PORT = 8141; const BASE = `http://127.0.0.1:${PORT}/`;
const KEY = "money-garden:state-v1";
try { execSync(`lsof -tnP -iTCP:${PORT} -sTCP:LISTEN | xargs kill`, { stdio: "ignore" }); } catch {}
const server = spawn("python3", [`${SP}/server.py`, DIST, String(PORT)], { stdio: "ignore" });
const out = []; const check = (n, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`);
let browser;
try {
  let pid = null;
  for (let i = 0; i < 50 && pid === null; i++) { try { pid = Number(await (await fetch(BASE + "__pid")).text()); } catch { await new Promise((r) => setTimeout(r, 100)); } }
  if (pid !== server.pid) throw new Error(`orphan server on port (got ${pid}, spawned ${server.pid})`);
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.addInitScript(() => {
    if (!localStorage.getItem("money-garden:theme")) localStorage.setItem("money-garden:theme", "day");
    localStorage.setItem("money-garden:install-hint", "muted");
    // Count this page's own writes of the garden key — adopting another
    // tab's save must never write (that would echo back and forth).
    window.__writes = 0;
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === "money-garden:state-v1") {
        window.__writes++;
        // window.__quota = true makes this page's garden saves fail the way a full disk does.
        if (window.__quota) throw new DOMException("full", "QuotaExceededError");
      }
      return orig.call(this, k, v);
    };
  });
  const errors = [];
  const open = async () => {
    const page = await ctx.newPage(); page.on("pageerror", (e) => errors.push(e.message));
    page.setDefaultTimeout(5000);
    await page.goto(BASE); await page.getByText("Money Garden", { exact: true }).waitFor();
    return page;
  };
  const S = (page) => page.evaluate((k) => localStorage.getItem(k), KEY);
  const writes = (page) => page.evaluate(() => window.__writes);
  const tab = (page, n) => page.getByRole("button", { name: new RegExp(n) }).first().click();
  const settle = (page) => page.waitForTimeout(250);
  const notes = (raw) => JSON.parse(raw).transactions.map((t) => t.note).sort();
  const logExpense = async (page, amount, note) => {
    await page.getByPlaceholder("0.00").fill(String(amount));
    await page.getByPlaceholder("Ramen with Sam").fill(note);
    await page.getByRole("button", { name: "Add expense", exact: true }).click(); await settle(page);
  };

  const A = await open();
  const B = await open();
  await tab(A, "Log"); await tab(B, "Log");
  const bWrites0 = await writes(B);

  // T1: a save in A shows up in B without a reload.
  await logExpense(A, 12, "Ramen from A");
  await B.getByText("Ramen from A").first().waitFor({ timeout: 3000 }).catch(() => {});
  check("T1 A's entry appears in B without a reload", await B.getByText("Ramen from A").first().isVisible());
  check("T1b B says why its screen changed (toast)", await B.getByText("Garden updated from another tab").isVisible());
  check("T1c adopting wrote nothing in B (no echo)", (await writes(B)) === bWrites0, `B writes ${bWrites0} → ${await writes(B)}`);
  check("T1d A got no toast for its own save", !(await A.getByText("Garden updated from another tab").isVisible()));
  await shot(B, "multi-tab-B-after-sync");

  // T2: B's next edit keeps A's entry (the bug this fixed: B used to save
  // its stale garden over A's).
  await logExpense(B, 4, "Coffee from B");
  const both = notes(await S(B));
  check("T2 B's save keeps A's entry", both.includes("Ramen from A") && both.includes("Coffee from B"), JSON.stringify(both));
  await A.getByText("Coffee from B").first().waitFor({ timeout: 3000 }).catch(() => {});
  check("T2b …and A now shows B's entry", await A.getByText("Coffee from B").first().isVisible());

  // T3: a draft being typed in B survives an update from A.
  await B.getByPlaceholder("0.00").fill("55");
  await B.getByPlaceholder("Ramen with Sam").fill("half-typed in B");
  await logExpense(A, 7, "Bus from A");
  await B.getByText("Bus from A").first().waitFor({ timeout: 3000 }).catch(() => {});
  check("T3 B shows A's newest entry", await B.getByText("Bus from A").first().isVisible());
  check("T3b B's half-typed form kept its draft",
    (await B.getByPlaceholder("0.00").inputValue()) === "55" && (await B.getByPlaceholder("Ramen with Sam").inputValue()) === "half-typed in B");
  await B.getByPlaceholder("0.00").fill(""); await B.getByPlaceholder("Ramen with Sam").fill("");

  // T4: the save removed from another tab → B keeps its garden, writes nothing.
  const good = await S(A);
  let w = await writes(B);
  await A.evaluate((k) => localStorage.removeItem(k), KEY); await settle(B);
  check("T4 key removed elsewhere → B keeps showing its garden", await B.getByText("Bus from A").first().isVisible());
  check("T4b …and writes nothing (save stays removed until B's next change)", (await writes(B)) === w && (await S(B)) === null);
  await A.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, good]); await settle(B);

  // T5: damaged data from another tab → B shows Recovery and writes nothing.
  w = await writes(B);
  await A.evaluate((k) => localStorage.setItem(k, "{not json"), KEY);
  await B.getByText(/isn't valid JSON/).first().waitFor({ timeout: 3000 }).catch(() => {});
  check("T5 damaged save elsewhere → B shows the Recovery screen", await B.getByText(/isn't valid JSON/).first().isVisible());
  check("T5b …and B wrote nothing over it", (await writes(B)) === w && (await S(B)) === "{not json");
  await shot(B, "multi-tab-B-recovery");

  // T6: a good garden saved elsewhere lifts B out of Recovery.
  await A.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, good]);
  await B.getByText("Money Garden", { exact: true }).waitFor({ timeout: 3000 }).catch(() => {});
  await tab(B, "Log");
  check("T6 good save elsewhere → B leaves Recovery and shows the garden", await B.getByText("Bus from A").first().isVisible());
  const shed = await B.locator("footer").innerText();
  check("T6b …with the storage disclosure back in the shed", /this browser|device/i.test(shed), shed.slice(0, 120));

  // T7: another key (the theme) changing elsewhere is not a garden update.
  await B.waitForTimeout(3500); // let the earlier toast expire
  w = await writes(B);
  await A.evaluate(() => localStorage.setItem("money-garden:theme", "night")); await settle(B);
  check("T7 a theme change elsewhere doesn't touch B's garden", !(await B.getByText("Garden updated from another tab").isVisible()) && (await writes(B)) === w);

  // T8: a reload of B reads the same garden it was showing.
  await B.reload(); await B.getByText("Money Garden", { exact: true }).waitFor(); await tab(B, "Log");
  check("T8 after reload B still has all three entries",
    ["Ramen from A", "Coffee from B", "Bus from A"].every((n) => notes(good).includes(n)) && await B.getByText("Coffee from B").first().isVisible());

  // T10: B's own saves are failing (quota → memory). Its screen holds the
  // only copy of its changes, so a save from A must NOT replace it.
  await tab(A, "Log"); await tab(B, "Log");
  await B.evaluate(() => { window.__quota = true; });
  await logExpense(B, 9, "Unsaved in B");
  check("T10 B's failing save shows the memory banner", await B.getByRole("alert").isVisible());
  await B.waitForTimeout(3500); // let B's "saving unavailable" toast expire
  await logExpense(A, 3, "Later in A");
  await settle(B);
  check("T10b B keeps its unsaved entry (not swapped for A's garden)", await B.getByText("Unsaved in B").first().isVisible() && !(await B.getByText("Later in A").first().isVisible()));
  check("T10c …and says why", await B.getByText("this tab's unsaved garden is kept").isVisible());
  await shot(B, "multi-tab-B-quota-kept");
  // Once B's own saves work again it is back in sync: its next save lands
  // (last writer wins — B's garden, with its unsaved entry), and later saves
  // from A are adopted again.
  await B.evaluate(() => { window.__quota = false; });
  await B.waitForTimeout(3500);
  await logExpense(B, 1, "Saved again in B");
  check("T10d B's next save lands, keeping its formerly unsaved entry", notes(await S(A)).includes("Unsaved in B") && notes(await S(A)).includes("Saved again in B"));
  await logExpense(A, 2, "Back in sync from A");
  await B.getByText("Back in sync from A").first().waitFor({ timeout: 3000 }).catch(() => {});
  check("T10e after a successful own save, B adopts A's saves again", await B.getByText("Back in sync from A").first().isVisible());

  // T11: B is browsing an old month; A replaces the garden with a fresh one
  // → B comes back to today (that month no longer exists there).
  await A.evaluate((k) => localStorage.removeItem(k), KEY); await A.reload(); await A.getByText("Money Garden", { exact: true }).waitFor();
  await A.getByRole("button", { name: "Plant sample data", exact: true }).click(); await settle(A);
  await B.getByRole("button", { name: "Previous month", exact: true }).waitFor();
  await B.waitForTimeout(300);
  await B.getByRole("button", { name: "Previous month", exact: true }).click();
  await B.getByRole("button", { name: "Previous month", exact: true }).click();
  check("T11 B is browsing a past month", await B.getByRole("button", { name: "↩ today" }).isVisible());
  await A.getByRole("button", { name: "Start fresh…", exact: true }).click();
  await A.getByRole("button", { name: "Really erase everything?", exact: true }).click(); await settle(B);
  check("T11b A started fresh → B is back on today", !(await B.getByRole("button", { name: "↩ today" }).isVisible()) && await B.getByText("Fresh soil 🌱").isVisible());

  check("T9 no page errors", errors.length === 0, errors.join(" | "));
  await browser.close();
} catch (e) { out.push("ERROR " + (e.stack || e).toString().split("\n").slice(0, 3).join(" | ")); } finally {
  await browser?.close().catch(() => {}); server.kill(); console.log(out.join("\n"));
  // Non-zero exit when any check failed (or none ran) — useful run alone, too.
  process.exitCode = out.length && out.every((l) => l.startsWith("PASS")) ? 0 : 1;
}
