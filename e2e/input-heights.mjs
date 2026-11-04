// Every input, select and date field is 40px tall (v0.18.5). Browsers size
// selects and date inputs differently unless the height is fixed — CLAUDE.md's
// "one style, 40px" rule — and the Overview's Monthly income field had its own
// inline style and stood 31px. This walks every tab, in an empty garden and
// with sample data, on desktop and on a touch phone (where inputs are lifted
// to 16px text), and measures every form field each tab shows on arrival,
// plus the ledger search pill and its Filters panel. (Edit panels aren't
// opened — they all use inputStyle today.)
import { chromium } from "playwright";
import { spawn, execSync } from "node:child_process";
import { SP, DIST, shot } from "./paths.mjs";
const PORT = 8155; const BASE = `http://127.0.0.1:${PORT}/`;
try { execSync(`lsof -tnP -iTCP:${PORT} -sTCP:LISTEN | xargs kill`, { stdio: "ignore" }); } catch {}
const server = spawn("python3", [`${SP}/server.py`, DIST, String(PORT)], { stdio: "ignore" });
const out = []; const check = (n, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`);
const TABS = ["Overview", "Log", "Budgets", "Garden", "Orchard", "Seasons", "Advice"];

/** In the page: every visible form field with a name and its height. */
function fields() {
  // Fields with no box of their own: checkboxes, the hidden file picker, etc.
  const skip = new Set(["checkbox", "radio", "file", "range", "color", "hidden", "button", "submit", "reset"]);
  // The ledger search box sits INSIDE the 40px search pill (the pill is the
  // field you see), so the pill is measured instead of the bare input.
  const els = [...document.querySelectorAll("input, select, textarea")]
    .filter((el) => !skip.has(el.type) && !el.closest(".mg-search"))
    .concat([...document.querySelectorAll(".mg-search.open")]);
  return els.map((el) => {
    const r = el.getBoundingClientRect();
    const name = el.matches(".mg-search") ? "search pill" : el.getAttribute("aria-label")
      || el.closest("label")?.textContent.trim().slice(0, 30)
      || el.parentElement?.textContent.trim().slice(0, 30) || el.tagName;
    return { name, tag: el.tagName.toLowerCase(), type: el.type, h: r.height,
      visible: r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" };
  }).filter((f) => f.visible);
}

let browser;
try {
  let pid = null;
  for (let i = 0; i < 50 && pid === null; i++) { try { pid = Number(await (await fetch(BASE + "__pid")).text()); } catch { await new Promise((r) => setTimeout(r, 100)); } }
  if (pid !== server.pid) throw new Error("orphan server");
  browser = await chromium.launch();
  const devices = [
    { label: "desktop", viewport: { width: 1280, height: 900 } },
    { label: "phone", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  ];
  for (const { label, ...device } of devices) {
    for (const garden of ["empty", "sample"]) {
      const ctx = await browser.newContext({ ...device, serviceWorkers: "block" });
      await ctx.addInitScript(() => {
        localStorage.setItem("money-garden:theme", "day"); localStorage.setItem("money-garden:install-hint", "muted");
      });
      const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(e.message)); page.setDefaultTimeout(5000);
      await page.goto(BASE); await page.getByText("Money Garden", { exact: true }).waitFor();
      const where = `${label}/${garden}`;
      if (label === "phone") {
        // Not vacuous: the phone context really is a touch screen, so the
        // 16px-text rule (the one that could stretch a field) is in force.
        check(`${where}: coarse pointer in force`, await page.evaluate(() => matchMedia("(pointer: coarse)").matches));
      }
      if (garden === "sample") {
        await page.getByRole("button", { name: "Plant sample data", exact: true }).click();
        await page.getByText("Sent to goals", { exact: true }).waitFor();
      }
      const all = [];
      for (const tab of TABS) {
        await page.getByRole("button", { name: new RegExp(tab) }).first().click();
        await page.waitForTimeout(300);
        all.push(...(await page.evaluate(fields)).map((f) => ({ ...f, where: tab })));
        // The ledger search (only once there are entries): the pill, and the
        // Filters panel's selects and date-range fields opened beneath it.
        if (tab === "Log" && garden === "sample") {
          await page.getByRole("button", { name: "Search the ledger" }).click();
          await page.getByRole("button", { name: "Filters", exact: true }).click();
          await page.waitForTimeout(500); // the pill's and the panel's open animations
          all.push(...(await page.evaluate(fields)).map((f) => ({ ...f, where: "Log search" })));
          await shot(page, `input-heights-${label}-log-filters`, { fullPage: false });
          await page.getByRole("button", { name: "Close search" }).click();
        }
      }
      await page.getByRole("button", { name: "Overview" }).first().click();
      await shot(page, `input-heights-${label}-${garden}-overview`, { fullPage: false });

      // Not vacuous: the field this fix moved, a select, a date — and, with
      // entries, the search pill and the filter panel's From and To dates
      // (≥ 3 below: the search pass re-measures the Log form's Date too).
      const names = all.map((f) => `${f.where}:${f.name}`);
      const searched = all.filter((f) => f.where === "Log search");
      check(`${where}: found the fields`, names.some((n) => n.startsWith("Overview:Monthly income"))
        && all.some((f) => f.tag === "select") && all.some((f) => f.type === "date") && all.length >= 8
        && (garden === "empty" || (searched.some((f) => f.name === "search pill") && searched.filter((f) => f.type === "date").length >= 3)),
        `${all.length} fields: ` + [...new Set(names)].slice(0, 10).join(", "));
      const off = all.filter((f) => Math.abs(f.h - 40) > 0.01);
      check(`${where}: every field is 40px tall`, off.length === 0,
        off.length ? off.map((f) => `${f.where}:"${f.name}" ${f.h}px`).join(", ") : `${all.length} fields`);
      check(`${where}: no page errors`, errs.length === 0, errs.join(" | "));
      await ctx.close();
    }
  }
  await browser.close();
} catch (e) { out.push("ERROR " + (e.stack || e).toString().split("\n").slice(0, 3).join(" | ")); } finally {
  await browser?.close().catch(() => {}); server.kill(); console.log(out.join("\n"));
  // Non-zero exit when any check failed (or none ran) — useful run alone, too.
  process.exitCode = out.length && out.every((l) => l.startsWith("PASS")) ? 0 : 1;
}
