// The data-safety screens (v0.17.4–v0.17.5): everything that stands between
// a person and losing their numbers. Rewritten fresh when the suites moved
// into the repo (the originals were lost), keeping the high-value checks:
//   DS1  unreadable save → Recovery: nothing erased, exact download, two-tap
//        start fresh that keeps a copy first — and refuses if it can't
//   DS2  a crash while drawing → rescue page; download = the save; nothing written
//   DS3  damaged backups refused before anything is replaced
//   DS4  two-tap delete of a ledger entry      DS5 … of a vine      DS6 … of a holding
//   DS7  "undo the draw first", then exact reversal to the cent
//   DS8  the browser can't save → red banner; nothing claims to be saved
//   DS9  sample data never replaces a started garden; Replant / Start fresh two-step
// Each section runs on its own, so one broken screen can't hide the others.
import { chromium } from "playwright";
import { spawn, execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { SP, DIST, shot } from "./paths.mjs";
const PORT = 8149; const BASE = `http://127.0.0.1:${PORT}/`;
const KEY = "money-garden:state-v1";
try { execSync(`lsof -tnP -iTCP:${PORT} -sTCP:LISTEN | xargs kill`, { stdio: "ignore" }); } catch {}
const server = spawn("python3", [`${SP}/server.py`, DIST, String(PORT)], { stdio: "ignore" });
const out = []; const check = (n, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`);
let browser;

/** A small started garden for `today` (YYYY-MM-DD): a goal watered $100
 * then drawn $70, a plain entry, a vine and a holding. */
const seedGarden = (today) => ({
  income: 4000, budgets: {}, streak: { count: 0, lastDate: null },
  transactions: [
    { id: "w1", type: "saving", amount: 100, category: "other", note: "→ Japan trip", date: today, goalId: "g1" },
    { id: "d1", type: "expense", amount: 70, category: "fun", note: "Flights deposit", date: today, goalId: "g1" },
    { id: "e1", type: "expense", amount: 12, category: "groceries", note: "Plain coffee", date: today },
  ],
  goals: [{ id: "g1", name: "Japan trip", plant: "tulip", target: 2800, saved: 30, isEmergency: false }],
  commitments: [{ id: "c1", kind: "sub", name: "Streaming", amount: 12, cadence: "monthly", payDay: 12, payMonth: 1, endDate: "", category: "subs" }],
  invest: { holdings: [{ id: "h1", name: "Index fund", value: 5000 }], monthly: 0, ret: 7, birthYear: 0, retireAge: 65, wr: 4, retireSpend: 0 },
});

try {
  let pid = null;
  for (let i = 0; i < 50 && pid === null; i++) { try { pid = Number(await (await fetch(BASE + "__pid")).text()); } catch { await new Promise((r) => setTimeout(r, 100)); } }
  if (pid !== server.pid) throw new Error(`orphan server on port (got ${pid}, spawned ${server.pid})`);
  browser = await chromium.launch();

  /**
   * A fresh browser context with a page on the app.
   * - save: a raw string to store, a garden-making function (seedGarden), or null (nothing saved)
   * - init: extra code to run in the page before the app (e.g. to break something on purpose)
   * Returns { ctx, page, pageErrors, raw } — raw is exactly what was stored.
   */
  const open = async ({ save = null, init = null, waitForApp = true } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", acceptDownloads: true });
    // The seed garden is built here in Node (the browser shares this
    // machine's clock and timezone) and handed over as plain text.
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const raw = typeof save === "function" ? JSON.stringify(save(today)) : save;
    await ctx.addInitScript((raw) => {
      if (sessionStorage.getItem("seeded")) return; // seed once; a reload keeps what the app saved
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("money-garden:theme", "day");
      localStorage.setItem("money-garden:install-hint", "muted");
      if (raw !== null) localStorage.setItem("money-garden:state-v1", raw);
    }, raw);
    if (init) await ctx.addInitScript(init);
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    page.setDefaultTimeout(10_000); // generous: a busy machine mustn't fail a correct app
    await page.goto(BASE);
    if (waitForApp) await page.getByText("Money Garden", { exact: true }).waitFor();
    return { ctx, page, pageErrors, raw };
  };
  const S = (page) => page.evaluate((k) => localStorage.getItem(k), KEY);
  const garden = async (page) => JSON.parse(await S(page));
  // Nav buttons read "<icon><label>", so anchor on the end of the name.
  const tab = (page, label) => page.getByRole("button", { name: new RegExp(`${label}$`) }).first().click();
  const settle = (page, ms = 200) => page.waitForTimeout(ms);
  const row = (page, note) => page.locator("li.mg-row", { hasText: note });
  const button = (page, name) => page.getByRole("button", { name, exact: true });
  /** Wait (up to 12s) until a control reaches a state — e.g. an armed delete
   * disarming on its own after its 4s window. Never a fixed sleep: those
   * waste time or fail on a busy machine. The wait ends the moment the
   * control changes; returns whether it happened. */
  const until = (locator, state) => locator.waitFor({ state, timeout: 12_000 }).then(() => true, () => false);
  /** Run one section on its own: an unexpected error is reported as that
   * section's ERROR, its browser contexts are closed, and the next section
   * still runs — one broken screen can't hide the others. */
  const section = async (name, body) => {
    try {
      await body();
    } catch (e) {
      out.push(`ERROR ${name}: ` + (e.message || String(e)).split("\n").slice(0, 2).join(" | "));
    } finally {
      for (const c of browser.contexts()) await c.close().catch(() => {});
    }
  };

  await section("DS1", async () => {
    // An unreadable save → Recovery; nothing erased.
    const raw = "{\"income\": 4000, \"transactions\": [oops";
    const { page, pageErrors } = await open({ save: raw, waitForApp: false });
    await page.getByText("We couldn't read your saved garden").waitFor();
    check("DS1 unreadable save shows the Recovery screen, with the reason", await page.getByText(/isn't valid JSON/).isVisible());
    check("DS1b …and the saved data is untouched", (await S(page)) === raw);
    const [dl] = await Promise.all([page.waitForEvent("download"), button(page, "⬇️ Download the saved data").click()]);
    check("DS1c the download is the saved data, byte for byte", readFileSync(await dl.path(), "utf8") === raw);
    await button(page, "Start fresh…").click();
    check("DS1d Start fresh needs a second tap (first only arms)",
      await button(page, "Really start fresh?").isVisible() && (await S(page)) === raw);
    check("DS1e …and disarms on its own", await until(button(page, "Start fresh…"), "visible"));
    await shot(page, "data-safety-recovery");
    await button(page, "Start fresh…").click();
    await button(page, "Really start fresh?").click();
    await page.getByText("Money Garden", { exact: true }).waitFor();
    const copies = await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => k.startsWith("money-garden:unreadable-save:")).map((k) => localStorage.getItem(k)));
    check("DS1f confirming tucks the old data away under its own key first", copies.length === 1 && copies[0] === raw);
    const fresh = await garden(page);
    check("DS1g …and the save is now a fresh garden", fresh.transactions.length === 0 && fresh.income === 0 && await page.getByText("Fresh soil 🌱").isVisible());
    check("DS1h no page errors", pageErrors.length === 0, pageErrors.join(" | "));
  });

  await section("DS1-blocked", async () => {
    // No room to keep a copy, and nothing downloaded → Start fresh refuses.
    const raw = "[1, 2, 3]";
    const { page, pageErrors } = await open({
      save: raw, waitForApp: false,
      init: () => {
        const orig = Storage.prototype.setItem;
        Storage.prototype.setItem = function (k, v) {
          if (String(k).startsWith("money-garden:unreadable-save:")) throw new DOMException("full", "QuotaExceededError");
          return orig.call(this, k, v);
        };
      },
    });
    await page.getByText("We couldn't read your saved garden").waitFor();
    await button(page, "Start fresh…").click();
    await button(page, "Really start fresh?").click();
    check("DS1i can't keep a copy and nothing downloaded → refuses, says why",
      await until(page.getByText("Couldn't keep a copy on this device"), "visible"));
    check("DS1j …and the old data is still there, untouched", (await S(page)) === raw && await page.getByText("We couldn't read your saved garden").isVisible());
    check("DS1k no page errors", pageErrors.length === 0, pageErrors.join(" | "));
  });

  await section("DS2", async () => {
    // A crash while drawing the loaded garden: make every money amount throw
    // — a stand-in for any render bug. `format` is a getter on the prototype
    // (plain assignment is silently ignored), so redefine the getter.
    const { page, raw } = await open({
      save: seedGarden, waitForApp: false,
      init: () => {
        Object.defineProperty(Intl.NumberFormat.prototype, "format", {
          configurable: true,
          get() { throw new Error("test-induced render failure"); },
        });
      },
    });
    await page.getByText("Something in the garden broke").waitFor();
    check("DS2 a render crash shows the rescue page, not a blank screen", await button(page, "Reload").isVisible());
    const [dl] = await Promise.all([page.waitForEvent("download"), button(page, "⬇️ Download your saved data").click()]);
    // Compared with what was SEEDED, not with storage read after the crash —
    // a crash that damaged the save would otherwise compare equal to itself.
    check("DS2b the rescue download is exactly the saved garden", readFileSync(await dl.path(), "utf8") === raw);
    check("DS2c nothing was written while crashed", (await S(page)) === raw);
    await shot(page, "data-safety-rescue");
  });

  await section("DS2-first-render", async () => {
    // A crash on the app's very first render: the app never mounts, so only
    // the rescue page itself can take the splash down. (Breaking getDate
    // fails the app's first "what's today?" — the boot script only uses
    // getHours, so it still runs.)
    const { page } = await open({
      save: seedGarden, waitForApp: false,
      init: () => { Date.prototype.getDate = () => { throw new Error("test-induced first-render failure"); }; },
    });
    await page.getByText("Something in the garden broke").waitFor();
    check("DS2d crash on the first render → rescue page", await button(page, "Reload").isVisible());
    check("DS2e …and the rescue page took the splash down itself", (await page.locator("#splash").count()) === 0);
  });

  await section("DS3", async () => {
    // Damaged backups refused before anything is replaced.
    const { page, pageErrors, raw } = await open({ save: seedGarden });
    const good = JSON.parse(raw);
    const undated = { id: "x", type: "expense", amount: 5, category: "fun", note: "no date" };
    const damaged = JSON.stringify({ app: "money-garden", schema: 1, exportedAt: "2026-10-01",
      state: { ...good, transactions: [...good.transactions, undated] } });
    const upload = (name, text) =>
      page.locator('input[type="file"]').setInputFiles({ name, mimeType: "application/json", buffer: Buffer.from(text) });
    await upload("damaged.json", damaged);
    check("DS3 a backup with an undated entry is refused, naming the problem", await until(page.getByText(/has no date/), "visible"));
    check("DS3b …no restore card appears, and the garden is untouched",
      !(await button(page, "Replace my garden").isVisible()) && (await S(page)) === raw);
    await page.getByText(/has no date/).waitFor({ state: "hidden", timeout: 12_000 }); // let that note clear first
    await upload("notes.json", "these are my notes, not a backup");
    check("DS3c a file that isn't JSON is refused too",
      await until(page.getByText(/isn't valid JSON/), "visible") && (await S(page)) === raw);
    check("DS3d no page errors", pageErrors.length === 0, pageErrors.join(" | "));
  });

  await section("DS4+DS7", async () => {
    const { page, pageErrors } = await open({ save: seedGarden });
    await tab(page, "Log");

    // DS4: a ledger entry — arm, disarm on its own, then confirm.
    const coffee = row(page, "Plain coffee");
    await coffee.getByRole("button", { name: "Delete entry", exact: true }).click();
    check("DS4 entry ✕ only arms (Delete? shown, entry kept)",
      await coffee.getByRole("button", { name: "Really delete this entry", exact: true }).isVisible() &&
      (await garden(page)).transactions.some((t) => t.id === "e1"));
    check("DS4b …and disarms on its own", await until(coffee.getByRole("button", { name: "Really delete this entry", exact: true }), "hidden"));
    await coffee.getByRole("button", { name: "Delete entry", exact: true }).click();
    await coffee.getByRole("button", { name: "Really delete this entry", exact: true }).click();
    await settle(page);
    check("DS4c second tap deletes it", !(await garden(page)).transactions.some((t) => t.id === "e1"));

    // DS7: the $100 watering, $70 of it drawn since.
    const watering = row(page, "→ Japan trip");
    await watering.getByRole("button", { name: "Delete entry", exact: true }).click();
    check("DS7 a watering whose money was drawn can't be deleted — it says to undo the draw first",
      await watering.getByText("Partly drawn — undo the draw first").isVisible() &&
      !(await watering.getByRole("button", { name: "Really delete this entry", exact: true }).isVisible()));
    const g0 = await garden(page);
    check("DS7b …and nothing changed", g0.transactions.some((t) => t.id === "w1") && g0.goals.find((g) => g.id === "g1").saved === 30);
    await shot(page, "data-safety-undo-draw-first");
    await until(watering.getByText("Partly drawn — undo the draw first"), "hidden");
    const draw = row(page, "Flights deposit");
    await draw.getByRole("button", { name: "Delete entry", exact: true }).click();
    await draw.getByRole("button", { name: "Really delete this entry", exact: true }).click();
    await settle(page);
    check("DS7c undoing the draw puts its $70 back in the goal", (await garden(page)).goals.find((g) => g.id === "g1").saved === 100);
    await watering.getByRole("button", { name: "Delete entry", exact: true }).click();
    await watering.getByRole("button", { name: "Really delete this entry", exact: true }).click();
    await settle(page);
    const g1 = await garden(page);
    check("DS7d …then the watering deletes, and the goal reverses exactly to $0",
      !g1.transactions.some((t) => t.id === "w1") && g1.goals.find((g) => g.id === "g1").saved === 0);
    check("DS4/7 no page errors", pageErrors.length === 0, pageErrors.join(" | "));
  });

  await section("DS5", async () => {
    // A vine (subscription).
    const { page, pageErrors } = await open({ save: seedGarden });
    await tab(page, "Budgets");
    await button(page, "Remove Streaming").click();
    check("DS5 vine ✕ only arms (Delete? shown, vine kept)",
      await button(page, "Really remove Streaming").isVisible() && (await garden(page)).commitments.length === 1);
    check("DS5b …and disarms on its own", await until(button(page, "Really remove Streaming"), "hidden"));
    await button(page, "Remove Streaming").click();
    await button(page, "Really remove Streaming").click();
    await settle(page);
    check("DS5c second tap removes it", (await garden(page)).commitments.length === 0);
    check("DS5d no page errors", pageErrors.length === 0, pageErrors.join(" | "));
  });

  await section("DS6", async () => {
    // An orchard holding.
    const { page, pageErrors } = await open({ save: seedGarden });
    await tab(page, "Orchard");
    await button(page, "Remove Index fund").click();
    check("DS6 holding ✕ only arms (Delete? shown, holding kept)",
      await button(page, "Really remove Index fund").isVisible() && (await garden(page)).invest.holdings.length === 1);
    check("DS6b …and disarms on its own", await until(button(page, "Really remove Index fund"), "hidden"));
    await button(page, "Remove Index fund").click();
    await button(page, "Really remove Index fund").click();
    await settle(page);
    check("DS6c second tap removes it", (await garden(page)).invest.holdings.length === 0);
    check("DS6d no page errors", pageErrors.length === 0, pageErrors.join(" | "));
  });

  await section("DS8", async () => {
    // The browser can't save the garden (storage full / blocked).
    const { page, pageErrors } = await open({
      init: () => {
        const orig = Storage.prototype.setItem;
        Storage.prototype.setItem = function (k, v) {
          if (k === "money-garden:state-v1") throw new DOMException("full", "QuotaExceededError");
          return orig.call(this, k, v);
        };
      },
    });
    check("DS8 when saving fails, a red banner says so right away",
      await until(page.getByRole("alert"), "visible") && /Saving isn't available/.test(await page.getByRole("alert").innerText()));
    await tab(page, "Log");
    await page.getByPlaceholder("0.00").fill("9");
    await page.getByPlaceholder("Ramen with Sam").fill("Session only");
    await button(page, "Add expense").click();
    await settle(page);
    check("DS8b the entry shows for this session…", await page.getByText("Session only").first().isVisible());
    const shed = await page.locator("footer").innerText();
    check("DS8c …but nothing claims it's saved: banner stays, the shed doesn't say 'saves automatically'",
      await page.getByRole("alert").isVisible() && !/saves automatically/.test(shed), shed.slice(0, 140));
    await shot(page, "data-safety-cant-save");
    check("DS8d no page errors", pageErrors.length === 0, pageErrors.join(" | "));
  });

  await section("DS9", async () => {
    // Sample data never replaces a started garden.
    const fresh = await open();
    check("DS9 an untouched garden offers one-tap Plant sample data", await button(fresh.page, "Plant sample data").isVisible());
    await fresh.ctx.close();

    const { page, pageErrors, raw } = await open({ save: JSON.stringify({ income: 3500 }) });
    check("DS9b a garden with anything entered (just an income) gets no one-tap button",
      !(await button(page, "Plant sample data").isVisible()));
    await button(page, "Replant sample data…").click();
    check("DS9c Replant only arms on the first tap",
      await button(page, "Really replace everything with sample data?").isVisible() && (await S(page)) === raw);
    check("DS9d …and disarms on its own, garden untouched",
      await until(button(page, "Replant sample data…"), "visible") && (await S(page)) === raw);
    await button(page, "Start fresh…").click();
    check("DS9e Start fresh only arms on the first tap",
      await button(page, "Really erase everything?").isVisible() && (await S(page)) === raw);
    check("DS9f …and disarms on its own", await until(button(page, "Start fresh…"), "visible") && (await S(page)) === raw);
    // The deliberate path still works: arm, then confirm.
    await button(page, "Replant sample data…").click();
    await button(page, "Really replace everything with sample data?").click();
    await settle(page);
    const planted = await garden(page);
    check("DS9g confirming Replant replaces the garden with the sample", planted.transactions.length > 10 && planted.income !== 3500);
    check("DS9h no page errors", pageErrors.length === 0, pageErrors.join(" | "));
  });

  await browser.close();
} catch (e) { out.push("ERROR " + (e.stack || e).toString().split("\n").slice(0, 3).join(" | ")); } finally {
  await browser?.close().catch(() => {}); server.kill(); console.log(out.join("\n"));
  // Non-zero exit when any check failed (or none ran) — useful run alone, too.
  process.exitCode = out.length && out.every((l) => l.startsWith("PASS")) ? 0 : 1;
}
