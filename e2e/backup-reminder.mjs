// The shed's backup line (v0.18.1). A fake clock jumps weeks ahead; a
// visibilitychange (useToday's wake-up check) makes the app notice.
import { chromium } from "playwright";
import { spawn, execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { SP, DIST, shot } from "./paths.mjs";
const PORT = 8145; const BASE = `http://127.0.0.1:${PORT}/`;
const META = "money-garden:backup-reminder";
try { execSync(`lsof -tnP -iTCP:${PORT} -sTCP:LISTEN | xargs kill`, { stdio: "ignore" }); } catch {}
const server = spawn("python3", [`${SP}/server.py`, DIST, String(PORT)], { stdio: "ignore" });
const out = []; const check = (n, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`);
let browser;
try {
  let pid = null;
  for (let i = 0; i < 50 && pid === null; i++) { try { pid = Number(await (await fetch(BASE + "__pid")).text()); } catch { await new Promise((r) => setTimeout(r, 100)); } }
  if (pid !== server.pid) throw new Error(`orphan server on port (got ${pid}, spawned ${server.pid})`);
  browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", timezoneId: "Asia/Kuala_Lumpur" });
  await ctx.addInitScript(() => {
    if (!localStorage.getItem("money-garden:theme")) localStorage.setItem("money-garden:theme", "day");
    localStorage.setItem("money-garden:install-hint", "muted");
  });
  const T0 = new Date("2026-11-01T10:00:00+08:00").getTime();
  const DAY = 86_400_000;
  const newPage = async () => {
    const page = await ctx.newPage(); page.on("pageerror", (e) => errors.push(e.message));
    page.setDefaultTimeout(5000);
    await page.clock.install({ time: T0 });
    await page.goto(BASE); await page.getByText("Money Garden", { exact: true }).waitFor();
    return page;
  };
  const shed = (page) => page.locator("footer").innerText();
  const meta = async (page) => JSON.parse((await page.evaluate((k) => localStorage.getItem(k), META)) ?? "null");
  const jumpTo = async (page, t) => {
    await page.clock.setSystemTime(t);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.waitForTimeout(100);
  };
  const tab = (page, n) => page.getByRole("button", { name: new RegExp(n) }).first().click();
  const DUE = /aren't in a backup yet/;

  const A = await newPage();
  // B1: a fresh garden — nothing to back up, nothing said.
  let s = await shed(A);
  check("B1 fresh garden: no backup line", !/No backup saved|Last backup|in a backup/.test(s));
  check("B1b …and no reminder record written", (await meta(A))?.unsavedSince == null);

  // B2: real data → "No backup saved from this browser yet.", clock started.
  await A.getByRole("button", { name: "Plant sample data", exact: true }).click(); await A.waitForTimeout(100);
  check("B2 sample garden: 'No backup saved from this browser yet.'", /No backup saved from this browser yet\./.test(await shed(A)));
  const m2 = await meta(A);
  check("B2b clock started at the change", m2?.unsavedSince && Math.abs(Date.parse(m2.unsavedSince) - T0) < 5000, JSON.stringify(m2));

  // B3: 13 days later — not yet; 14 days — due (amber).
  await jumpTo(A, T0 + 13 * DAY);
  check("B3 13 days: not due yet", !DUE.test(await shed(A)) && /No backup saved from this browser yet\./.test(await shed(A)));
  await jumpTo(A, T0 + 14 * DAY);
  s = await shed(A);
  check("B3b 14 days: due, with the count", /changes from 14 days ago that aren't in a backup yet/.test(s), s.slice(0, 200));
  // The theme's --amber, resolved to rgb() the same way the line's colour is.
  const [dueColor, amber] = await A.getByText(DUE).evaluate((el) => {
    const probe = document.createElement("span"); probe.style.color = "var(--amber)"; document.body.append(probe);
    const want = getComputedStyle(probe).color; probe.remove();
    return [getComputedStyle(el).color, want];
  });
  check("B3c …in the theme's amber", dueColor === amber, `${dueColor} vs ${amber}`);
  await A.locator("footer").scrollIntoViewIfNeeded();
  await shot(A, "backup-due-day");

  // B4: tab B (opened now) sees it due too; A saves a backup → B updates live.
  const B = await newPage();
  await jumpTo(B, T0 + 14 * DAY);
  check("B4 a second tab shows it due", DUE.test(await shed(B)));
  const [dl] = await Promise.all([A.waitForEvent("download"), A.getByRole("button", { name: "⬇️ Save backup", exact: true }).click()]);
  const backupPath = await dl.path();
  await A.waitForTimeout(150);
  s = await shed(A);
  check("B4b after Save backup: 'Last backup: Nov 15.' and no reminder", /Last backup: Nov 15\./.test(s) && !DUE.test(s), s.slice(0, 200));
  const m4 = await meta(A);
  check("B4c record: lastAt now, nothing uncovered", m4.unsavedSince === null && Math.abs(Date.parse(m4.lastAt) - (T0 + 14 * DAY)) < 5000, JSON.stringify(m4));
  await B.waitForTimeout(150);
  check("B4d the other tab's shed updated too (no reload)", /Last backup: Nov 15\./.test(await shed(B)) && !DUE.test(await shed(B)));
  await B.close();

  // B5: a new change restarts the clock; 14 days later it's due again.
  await tab(A, "Log");
  await A.getByPlaceholder("0.00").fill("6");
  await A.getByPlaceholder("Ramen with Sam").fill("After the backup");
  await A.getByRole("button", { name: "Add expense", exact: true }).click(); await A.waitForTimeout(100);
  const m5 = await meta(A);
  check("B5 a change after the backup starts a new clock", m5.unsavedSince && Math.abs(Date.parse(m5.unsavedSince) - (T0 + 14 * DAY)) < 5000 && m5.lastAt === m4.lastAt);
  check("B5b …the shed still shows the last backup's date", /Last backup: Nov 15\./.test(await shed(A)));
  await jumpTo(A, T0 + 30 * DAY);
  check("B5c 16 days after that change: due", /changes from 16 days ago/.test(await shed(A)));
  check("B5d …and the due line names the last backup", /aren't in a backup yet\. Last backup: Nov 15\./.test(await shed(A)), (await shed(A)).slice(120, 300));

  // B6: reload keeps it (the record is saved, not just in memory).
  await A.reload(); await A.getByText("Money Garden", { exact: true }).waitFor();
  check("B6 after reload: still due", /changes from 16 days ago/.test(await shed(A)));

  // B7: restoring a backup covers the garden but isn't a new backup.
  await A.locator('input[type="file"]').setInputFiles({ name: "b.json", mimeType: "application/json", buffer: readFileSync(backupPath) });
  await A.getByRole("button", { name: "Replace my garden", exact: true }).waitFor();
  await A.getByRole("button", { name: "Replace my garden", exact: true }).click(); await A.waitForTimeout(150);
  s = await shed(A);
  const m7 = await meta(A);
  check("B7 after restoring: not due, last backup date unchanged", !DUE.test(s) && /Last backup: Nov 15\./.test(s), s.slice(0, 200));
  check("B7b record: nothing uncovered, lastAt kept", m7.unsavedSince === null && m7.lastAt === m4.lastAt, JSON.stringify(m7));

  // B8: starting fresh hides the line and stops the clock.
  await A.getByRole("button", { name: "Start fresh…", exact: true }).click();
  await A.getByRole("button", { name: "Really erase everything?", exact: true }).click(); await A.waitForTimeout(150);
  check("B8 after Start fresh: no backup line", !/No backup saved|Last backup|in a backup/.test(await shed(A)));
  check("B8b clock stopped", (await meta(A)).unsavedSince === null);

  // B9: junk in the record → treated as nothing known, no crash.
  await A.evaluate((k) => localStorage.setItem(k, "{not json"), META);
  await A.reload(); await A.getByText("Money Garden", { exact: true }).waitFor();
  await A.getByRole("button", { name: "Plant sample data", exact: true }).click(); await A.waitForTimeout(100);
  check("B9 a damaged record is ignored (garden works, 'No backup saved from this browser yet.')", /No backup saved from this browser yet\./.test(await shed(A)));

  // B10: night theme — the amber line stays readable (screenshot).
  await A.evaluate(() => localStorage.setItem("money-garden:theme", "night"));
  await A.reload(); await A.getByText("Money Garden", { exact: true }).waitFor();
  await jumpTo(A, T0 + 60 * DAY);
  check("B10 due again on the re-planted garden", DUE.test(await shed(A)));
  await A.locator("footer").scrollIntoViewIfNeeded();
  await shot(A, "backup-due-night");

  // B12: a tab whose own garden saves are failing (memory mode) must NOT
  // adopt another tab's "backed up" record — that backup doesn't hold its
  // on-screen changes.
  { const qctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", timezoneId: "Asia/Kuala_Lumpur" });
    await qctx.addInitScript(() => {
      localStorage.setItem("money-garden:theme", "day"); localStorage.setItem("money-garden:install-hint", "muted");
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (k === "money-garden:state-v1" && window.__quota) throw new DOMException("full", "QuotaExceededError");
        return orig.call(this, k, v);
      };
    });
    const mk = async () => { const p = await qctx.newPage(); p.on("pageerror", (e) => errors.push(e.message)); p.setDefaultTimeout(5000);
      await p.clock.install({ time: T0 }); await p.goto(BASE); await p.getByText("Money Garden", { exact: true }).waitFor(); return p; };
    const Q = await mk();
    await Q.getByRole("button", { name: "Plant sample data", exact: true }).click(); await Q.waitForTimeout(100);
    const R = await mk();
    await Q.evaluate(() => { window.__quota = true; });
    await tab(Q, "Log");
    await Q.getByPlaceholder("0.00").fill("8");
    await Q.getByPlaceholder("Ramen with Sam").fill("Only in Q");
    await Q.getByRole("button", { name: "Add expense", exact: true }).click(); await Q.waitForTimeout(150);
    await jumpTo(Q, T0 + 20 * DAY); await jumpTo(R, T0 + 20 * DAY);
    check("B12 (setup) failing tab Q shows due", DUE.test(await shed(Q)));
    await Promise.all([R.waitForEvent("download"), R.getByRole("button", { name: "⬇️ Save backup", exact: true }).click()]);
    await Q.waitForTimeout(150);
    check("B12b Q keeps its reminder after R's backup (R's file lacks Q's changes)", DUE.test(await shed(Q)) && !/Last backup/.test(await shed(Q)), (await shed(Q)).slice(120, 260));
    check("B12c …while R shows its own backup", /Last backup: Nov 21\./.test(await shed(R)));
    await qctx.close(); }

  check("B11 no page errors", errors.length === 0, errors.join(" | "));
  await browser.close();
} catch (e) { out.push("ERROR " + (e.stack || e).toString().split("\n").slice(0, 3).join(" | ")); } finally {
  await browser?.close().catch(() => {}); server.kill(); console.log(out.join("\n"));
  // Non-zero exit when any check failed (or none ran) — useful run alone, too.
  process.exitCode = out.length && out.every((l) => l.startsWith("PASS")) ? 0 : 1;
}
