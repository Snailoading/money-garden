// The phone tab bar (v0.18.9). Below 480px the tab row is a frosted bar fixed
// to the bottom of the screen; from 480px up it's the same row at the top.
// Every 2px from 320 to 478 (and 479, 375, 349, where the layout changes),
// day and night: the bar is pinned 10px above the bottom edge, holds all 7
// tabs, uses the right layout for the width (grid, tight grid under 375,
// sideways scroll under 350), no label spills out of
// its tab, and the page never scrolls sideways. Also: laptops keep today's
// row; the selected pill follows aria-current; the shed and toasts clear the
// bar; a press lifts the tab (not under Reduce Motion, not where the row
// would clip it); typing on a touch screen hides the bar, picking a date or
// a dropdown doesn't; Reduce Transparency makes it solid; the 320px row's
// fades follow its scroll and the selected tab stays in view; a keyboard-
// focused tab keeps its pill shape; the install pop-up locks the bar too;
// and a tab switch from mid-page opens the new tab at its top.
import { chromium } from "playwright";
import { spawn, execSync } from "node:child_process";
import { SP, DIST, shot } from "./paths.mjs";
const PORT = 8160; const BASE = `http://127.0.0.1:${PORT}/`;
try { execSync(`lsof -tnP -iTCP:${PORT} -sTCP:LISTEN | xargs kill`, { stdio: "ignore" }); } catch {}
const server = spawn("python3", [`${SP}/server.py`, DIST, String(PORT)], { stdio: "ignore" });
const out = []; const check = (n, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`);

const TABS = ["Overview", "Log", "Budgets", "Garden", "Orchard", "Seasons", "Advice"];
const FADE = 28; // the scrolling row's fade width, px
let browser;

/** A page with the sample garden. `hint: null` leaves the install pop-up to show. */
async function open(width, { theme = "day", touch = false, reduced = "no-preference", hint = "muted", sample = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, isMobile: touch, hasTouch: touch, serviceWorkers: "block", reducedMotion: reduced });
  await ctx.addInitScript(([t, h]) => {
    localStorage.setItem("money-garden:theme", t);
    if (h) localStorage.setItem("money-garden:install-hint", h);
  }, [theme, hint]);
  const page = await ctx.newPage(); page.setDefaultTimeout(5000);
  await page.goto(BASE); await page.getByText("Money Garden", { exact: true }).waitFor();
  if (sample) {
    await page.getByRole("button", { name: "Plant sample data", exact: true }).click();
    await page.getByText("Sent to goals", { exact: true }).waitFor();
  }
  return { ctx, page };
}
/** One crashed scenario reports ERROR and the rest still run. */
async function scenario(name, opts, fn) {
  let ctx;
  try {
    const opened = await open(opts.width, opts);
    ctx = opened.ctx;
    await fn(opened.page);
  } catch (e) {
    out.push(`ERROR ${name}: ${String(e.message ?? e).split("\n")[0]}`);
  } finally {
    await ctx?.close().catch(() => {});
  }
}
const tab = (page, name) => page.getByRole("button", { name, exact: true });
const settle = (page, ms = 350) => page.waitForTimeout(ms); // past the 0.2s fades
const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
/** Hold the mouse down on a tab (mouse, so :active applies and stays). */
async function press(page, name) {
  const b = await tab(page, name).boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
}
/** In the page: a tab's lift, droplet layer and top edge against the bar's. */
const tabState = (page, name) => page.evaluate((n) => {
  const b = [...document.querySelectorAll("nav button")].find((x) => x.textContent.endsWith(n));
  return {
    transform: getComputedStyle(b).transform, droplet: Number(getComputedStyle(b, "::before").opacity),
    top: b.getBoundingClientRect().top, barTop: document.querySelector("nav").getBoundingClientRect().top,
  };
}, name);
/** Is the bar shown, and does a tap at its centre reach it? */
const barState = (page) => page.evaluate(() => {
  const nav = document.querySelector("nav"), r = nav.getBoundingClientRect();
  return { visibility: getComputedStyle(nav).visibility, hit: !!document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest("nav") };
});
const setRowScroll = (page, where) => page.evaluate((w) => {
  const r = document.querySelector(".mg-tabs-row");
  r?.scrollTo({ left: w === "start" ? 0 : w === "end" ? r.scrollWidth : (r.scrollWidth - r.clientWidth) / 2, behavior: "instant" });
}, where);
const fades = (page) => page.evaluate(() => {
  const r = document.querySelector(".mg-tabs-row"); if (!r) return "no row";
  const s = getComputedStyle(r);
  return `${s.getPropertyValue("--tabs-fade-l").trim()}/${s.getPropertyValue("--tabs-fade-r").trim()}`;
});

/** In the page, at the current width: everything the sweep checks. */
const measure = () => {
  const nav = document.querySelector("nav"), row = document.querySelector(".mg-tabs-row");
  const n = nav.getBoundingClientRect();
  const buttons = [...nav.querySelectorAll("button")];
  return {
    position: getComputedStyle(nav).position,
    gap: innerHeight - n.bottom,
    side: n.left,
    height: n.height,
    count: buttons.length,
    overflows: row ? row.scrollWidth > row.clientWidth : null,
    display: row ? getComputedStyle(row).display : null,
    fontSize: parseFloat(getComputedStyle(buttons[0]).fontSize),
    pageWide: document.documentElement.scrollWidth > innerWidth,
    small: buttons.filter((b) => { const r = b.getBoundingClientRect(); return r.width < 32 || r.height < 32; }).map((b) => b.textContent),
    // the label's own text box, measured with a Range: a tab's scrollWidth
    // can't see a centred label spilling out of both sides
    spills: buttons.filter((b) => {
      const range = document.createRange(); range.selectNodeContents(b.lastChild);
      const t = range.getBoundingClientRect(), r = b.getBoundingClientRect();
      return t.left < r.left - 0.5 || t.right > r.right + 0.5;
    }).map((b) => b.textContent),
  };
};

try {
  let pid = null;
  for (let i = 0; i < 50 && pid === null; i++) { try { pid = Number(await (await fetch(BASE + "__pid")).text()); } catch { await new Promise((r) => setTimeout(r, 100)); } }
  if (pid !== server.pid) throw new Error("orphan server");
  browser = await chromium.launch();

  // ---- the 2px sweep: one page per theme, resized (not 160 fresh loads)
  for (const theme of ["day", "night"]) {
    await scenario(`sweep ${theme}`, { width: 478, theme }, async (page) => {
      const bad = { pinned: [], tabs: [], mode: [], font: [], side: [], spills: [], small: [], wide: [] };
      // Every 2px, plus the odd widths right at the layout's edges (375 is a
      // real iPhone) — the even steps alone would step over 479, 375 and 349.
      const widths = [...Array.from({ length: 80 }, (_, i) => 320 + i * 2), 349, 375, 479].sort((a, b) => b - a);
      for (const w of widths) {
        await page.setViewportSize({ width: w, height: 844 }); await frames(page);
        const m = await page.evaluate(measure);
        if (m.position !== "fixed" || Math.abs(m.gap - 10) > 0.5 || m.height !== 60) bad.pinned.push(`${w}:${m.position},${m.gap},${m.height}`);
        if (m.count !== 7) bad.tabs.push(`${w}:${m.count}`);
        const wantScroll = w < 350;
        if (m.overflows !== wantScroll || m.display !== (wantScroll ? "flex" : "grid")) bad.mode.push(`${w}:${m.display},${m.overflows}`);
        if (m.fontSize !== (w < 375 ? 10 : 10.5)) bad.font.push(`${w}:${m.fontSize}`);
        if (m.side !== (w < 375 ? 6 : 8)) bad.side.push(`${w}:${m.side}`);
        if (m.spills.length) bad.spills.push(`${w}:${m.spills}`);
        if (m.small.length) bad.small.push(`${w}:${m.small}`);
        if (m.pageWide) bad.wide.push(w);
        if ([478, 375, 374, 350, 349, 320].includes(w)) await shot(page, `tab-bar-${theme}-${w}`, { clip: { x: 0, y: 844 - 90, width: w, height: 90 } });
      }
      const show = (l) => (l.length ? `${l.length} widths, e.g. ${l.slice(0, 4).join(" ")}` : "320–479");
      check(`sweep ${theme}: the bar is fixed, 60px tall, 10px above the bottom`, !bad.pinned.length, show(bad.pinned));
      check(`sweep ${theme}: all 7 tabs are there`, !bad.tabs.length, show(bad.tabs));
      check(`sweep ${theme}: grid from 350px, sideways scroll below`, !bad.mode.length, show(bad.mode));
      check(`sweep ${theme}: labels 10.5px from 375, 10px below`, !bad.font.length, show(bad.font));
      check(`sweep ${theme}: side margins 8px from 375, 6px below`, !bad.side.length, show(bad.side));
      check(`sweep ${theme}: no label spills out of its tab`, !bad.spills.length, show(bad.spills));
      check(`sweep ${theme}: every tab is at least 32×32`, !bad.small.length, show(bad.small));
      check(`sweep ${theme}: the page never scrolls sideways`, !bad.wide.length, show(bad.wide));
    });
  }

  // ---- laptops keep today's row
  for (const width of [480, 760, 1280]) {
    await scenario(`laptop ${width}`, { width }, async (page) => {
      const r = await page.evaluate(() => {
        const nav = document.querySelector("nav"), main = document.querySelector("main"), sel = nav.querySelector('[aria-current="page"]'), other = nav.querySelector("button:not([aria-current])");
        const probe = document.createElement("div"); probe.style.background = "var(--ink)"; document.body.append(probe); const ink = getComputedStyle(probe).backgroundColor; probe.remove();
        const s = getComputedStyle(sel);
        return { position: getComputedStyle(nav).position, above: nav.getBoundingClientRect().bottom <= main.getBoundingClientRect().top,
          padding: s.padding, font: s.fontSize, radius: s.borderTopLeftRadius,
          pill: s.backgroundColor === ink, other: getComputedStyle(other).backgroundColor, mainBottom: getComputedStyle(main).paddingBottom, filter: getComputedStyle(nav).backdropFilter };
      });
      check(`${width}: the tabs are the ordinary row above the page`, r.position === "static" && r.above && r.filter === "none", JSON.stringify(r));
      const usual = r.padding === "8px 14px" && r.font === "14px" && r.radius === "999px" && r.pill && r.other === "rgba(0, 0, 0, 0)";
      check(`${width}: tabs look as they always did (8/14 padding, 14px, full pill, ink selected)`, usual, JSON.stringify(r));
      check(`${width}: no room is reserved for a bar`, r.mainBottom === "60px", r.mainBottom);
    });
  }

  // ---- the selected pill follows aria-current
  await scenario("selection", { width: 390 }, async (page) => {
    let off = [];
    for (const name of TABS) {
      await tab(page, name).click(); await page.mouse.move(0, 400); await settle(page, 60);
      const r = await page.evaluate(() => [...document.querySelectorAll("nav button")].map((b) => ({
        name: b.textContent, current: b.getAttribute("aria-current"), filled: getComputedStyle(b).backgroundColor !== "rgba(0, 0, 0, 0)",
      })));
      const current = r.filter((x) => x.current === "page"), filled = r.filter((x) => x.filled);
      const right = current.length === 1 && current[0].name.endsWith(name) && filled.length === 1 && filled[0].name === current[0].name;
      if (!right) off.push(`${name}: current ${current.map((x) => x.name)}, filled ${filled.map((x) => x.name)}`);
    }
    check("390: after each of the 7 taps, one tab is current and only it has the pill", !off.length, off.join("; "));
  });

  // ---- room around the bar
  await scenario("shed and toast", { width: 390 }, async (page) => {
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await settle(page, 100);
    const shed = await page.evaluate(() => {
      const b = [...document.querySelectorAll("footer button")].pop().getBoundingClientRect();
      return { clear: document.querySelector("nav").getBoundingClientRect().top - b.bottom };
    });
    check("390: at the page's end the shed's last button sits clear of the bar", shed.clear >= 8, `${shed.clear}px`);
    // a DOM click: a real one would scroll up to the header's button first
    await page.evaluate(() => document.querySelector('button[aria-label^="Switch theme"]').click());
    await page.getByRole("status").waitFor();
    const t = await page.evaluate(() => ({
      toastBottom: document.querySelector('[role="status"]').getBoundingClientRect().bottom,
      barTop: document.querySelector("nav").getBoundingClientRect().top,
    }));
    check("390: a toast sits entirely above the bar", t.toastBottom <= t.barTop, JSON.stringify(t));
  });

  // ---- the press lift
  for (const theme of ["day", "night"]) {
    await scenario(`lift ${theme}`, { width: 390, theme }, async (page) => {
      await press(page, "Seasons"); await settle(page, 400);
      const held = await tabState(page, "Seasons");
      check(`390 ${theme}: a pressed tab lifts past the bar`, held.transform !== "none" && held.top < held.barTop, `${held.transform}, top ${held.top} vs bar ${held.barTop}`);
      check(`390 ${theme}: a pressed tab shows the droplet`, held.droplet === 1, String(held.droplet));
      await shot(page, `tab-bar-pressed-${theme}`, { clip: { x: 0, y: 844 - 90, width: 390, height: 90 } });
      await page.mouse.up(); await page.mouse.move(0, 400); await settle(page, 400);
      const after = await page.evaluate(() => [...document.querySelectorAll("nav button")].map((b) => `${Number(getComputedStyle(b, "::before").opacity)}/${getComputedStyle(b).transform}`));
      check(`390 ${theme}: after release no tab keeps a droplet or lift`, after.every((x) => x === "0/none"), after.join(" "));
    });
  }
  await scenario("lift neighbour", { width: 390 }, async (page) => {
    await tab(page, "Budgets").click(); await page.mouse.move(0, 400); await settle(page, 100);
    await press(page, "Log"); await settle(page, 400);
    const top = await page.evaluate(() => {
      const r = [...document.querySelectorAll("nav button")].find((b) => b.textContent.endsWith("Log")).getBoundingClientRect();
      return document.elementFromPoint(r.right - 2, r.top + r.height / 2)?.closest("button")?.textContent;
    });
    check("390: a pressed tab's droplet is in front of the selected neighbour", !!top?.endsWith("Log"), String(top));
    await page.mouse.up();
  });
  await scenario("lift reduced", { width: 390, reduced: "reduce" }, async (page) => {
    await press(page, "Seasons"); await settle(page, 60);
    const held = await tabState(page, "Seasons");
    check("390 Reduce Motion: no lift, and the droplet appears at once", held.top >= held.barTop && held.droplet === 1, `top ${held.top} vs bar ${held.barTop}, droplet ${held.droplet}`);
    await page.mouse.up();
  });
  await scenario("lift scroll mode", { width: 320 }, async (page) => {
    await press(page, "Log"); await settle(page, 400);
    const held = await tabState(page, "Log");
    check("320 (row clips): a pressed tab brightens but doesn't lift", held.transform === "none" && held.droplet === 1, `${held.transform}, droplet ${held.droplet}`);
    await page.mouse.up();
  });

  // ---- typing
  await scenario("typing touch", { width: 390, touch: true }, async (page) => {
    await tab(page, "Log").click(); await settle(page, 150);
    const focused = async (locator) => { await locator.focus(); await settle(page); return barState(page); };
    const hiddenFor = (b) => b.visibility === "hidden" && !b.hit, shownFor = (b) => b.visibility === "visible" && b.hit;
    const amount = page.locator('main input[type="number"]').first();
    let b = await focused(amount); check("390 touch: typing an amount hides the bar", hiddenFor(b), JSON.stringify(b));
    await amount.evaluate((e) => e.blur()); await settle(page); b = await barState(page);
    check("390 touch: leaving the field brings it back", shownFor(b), JSON.stringify(b));
    b = await focused(page.locator("main input:not([type])").first()); check("390 touch: typing a note hides the bar", hiddenFor(b), JSON.stringify(b));
    b = await focused(page.locator("main select").first()); check("390 touch: a dropdown keeps the bar", shownFor(b), JSON.stringify(b));
    b = await focused(page.locator('main input[type="date"]').first()); check("390 touch: a date field keeps the bar", shownFor(b), JSON.stringify(b));
    // A button in the page, not one in the bar: hiding the bar would blur
    // its own focused tab, bring the bar back, and this could never fail.
    b = await focused(page.getByRole("button", { name: /no-spend day/ })); check("390 touch: a focused button keeps the bar", shownFor(b), JSON.stringify(b));
  });
  await scenario("typing no touch", { width: 390 }, async (page) => {
    await tab(page, "Log").click(); await settle(page, 150);
    await page.locator('main input[type="number"]').first().focus(); await settle(page);
    const b = await barState(page);
    check("390 no touch (a narrow desktop window): the bar stays while typing", b.visibility === "visible" && b.hit, JSON.stringify(b));
  });

  // ---- Reduce Transparency (Playwright has no option for it; Chrome's protocol does)
  for (const theme of ["day", "night"]) {
    await scenario(`solid ${theme}`, { width: 390, theme }, async (page) => {
      const read = () => page.evaluate(() => {
        const s = getComputedStyle(document.querySelector("nav"));
        const probe = document.createElement("div"); probe.style.background = "var(--card)"; document.body.append(probe);
        const card = getComputedStyle(probe).backgroundColor; probe.remove();
        return { bg: s.backgroundColor, image: s.backgroundImage, filter: s.backdropFilter, card };
      });
      const glass = await read();
      const translucent = /\/ 0?\.\d+\)$/.test(glass.bg) && glass.image.startsWith("linear-gradient") && glass.filter.includes("blur(");
      check(`390 ${theme}: normally the bar is translucent, blurred glass`, translucent, JSON.stringify(glass));
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "reduce" }] });
      const solid = await read();
      check(`390 ${theme} Reduce Transparency: a solid card, no gloss, no blur`, solid.bg === solid.card && solid.image === "none" && solid.filter === "none", JSON.stringify(solid));
    });
  }

  // ---- the 320px scrolling row
  await scenario("scroll mode", { width: 320 }, async (page) => {
    await setRowScroll(page, "end"); await frames(page);
    const end = await page.evaluate((f) => ({
      lastRight: [...document.querySelectorAll("nav button")].pop().getBoundingClientRect().right,
      fadeStart: document.querySelector(".mg-tabs-row").getBoundingClientRect().right - f,
    }), FADE);
    check("320: scrolled to the end, the last tab is clear of the fade", end.lastRight <= end.fadeStart + 0.5, JSON.stringify(end));
    await setRowScroll(page, "start"); await frames(page);
    await tab(page, "Advice").click(); await settle(page, 100);
    const current = await page.evaluate(() => document.querySelector('nav [aria-current="page"]').textContent);
    check("320: the last tab can be reached and tapped", current.endsWith("Advice"), current);
  });
  await scenario("fades", { width: 320 }, async (page) => {
    const want = { start: `0px/${FADE}px`, middle: `${FADE}px/${FADE}px`, end: `${FADE}px/0px` };
    for (const [where, value] of Object.entries(want)) {
      await setRowScroll(page, where); await frames(page);
      const got = await fades(page);
      check(`320: fades (left/right) at the ${where} are ${value}`, got === value, got);
    }
  });
  await scenario("fades reduced", { width: 320, reduced: "reduce" }, async (page) => {
    await setRowScroll(page, "end"); await frames(page);
    const got = await fades(page);
    check("320 Reduce Motion: stays the plain right-hand fade", got === `0px/${FADE}px`, got);
  });
  await scenario("keep in view", { width: 320 }, async (page) => {
    // The real case: bar scrolled right to reach Seasons, then a month bar
    // jumps to Overview, whose tab is now off the left edge.
    await setRowScroll(page, "end"); await frames(page);
    await tab(page, "Seasons").click(); await settle(page);
    const chart = page.locator('svg[aria-label^="Earned vs spent per month"]').first();
    // Well down the page first, or "opens at its top" below would prove nothing.
    await chart.evaluate((svg) => scrollBy(0, svg.getBoundingClientRect().top - 120)); await settle(page, 60);
    const scrolled = await page.evaluate(() => scrollY);
    const b = await chart.boundingBox();
    await page.mouse.click(b.x + b.width * 0.88, b.y + b.height * 0.5);
    await page.waitForFunction(() => document.querySelector('nav [aria-current="page"]').textContent.endsWith("Overview"));
    await page.waitForFunction(() => { const r = document.querySelector(".mg-tabs-row"); return r && r.scrollLeft === 0; }, null, { timeout: 2000 }).catch(() => {});
    const r = await page.evaluate((f) => {
      const s = document.querySelector('nav [aria-current="page"]').getBoundingClientRect();
      const rr = document.querySelector(".mg-tabs-row").getBoundingClientRect();
      return { left: s.left, rowLeft: rr.left, right: s.right, limit: rr.right - f, pageY: scrollY };
    }, FADE);
    check("320: a Seasons month opening Overview brings its tab into view", r.left >= r.rowLeft - 0.5 && r.right <= r.limit + 0.5, JSON.stringify(r));
    check("320: …and opens Overview at its top", scrolled > 0 && r.pageY === 0, `${scrolled} → ${r.pageY}`);
  });

  // ---- keyboard
  for (const width of [390, 1280]) {
    await scenario(`focus ${width}`, { width }, async (page) => {
      let seen = 0; const off = [];
      for (let i = 0; i < 40 && seen < 7; i++) {
        await page.keyboard.press("Tab");
        const f = await page.evaluate(() => {
          const a = document.activeElement; if (!a?.closest("nav")) return null;
          const s = getComputedStyle(a), other = [...a.closest("nav").querySelectorAll("button")].find((b) => b !== a);
          return { name: a.textContent, radius: s.borderTopLeftRadius, usual: getComputedStyle(other).borderTopLeftRadius, ring: s.outlineStyle, visible: a.matches(":focus-visible") };
        });
        if (!f) continue;
        seen++;
        if (!f.visible || f.ring !== "solid") off.push(`${f.name}: no ring`);
        if (f.radius !== f.usual) off.push(`${f.name}: radius ${f.radius}, usually ${f.usual}`);
      }
      check(`${width}: Tab reaches all 7 tabs, each ringed and keeping its usual corners`, seen === 7 && !off.length, `${seen} tabs ${off.join("; ")}`);
    });
  }
  await scenario("install pop-up", { width: 390, hint: null, sample: false }, async (page) => {
    const dialog = page.getByRole("dialog"); await dialog.waitFor();
    // inert is set in an effect just after the pop-up appears
    await page.waitForFunction(() => document.querySelector("nav").closest("[inert]"), null, { timeout: 2000 }).catch(() => {});
    const locked = await page.evaluate(() => !!document.querySelector("nav").closest("[inert]"));
    check("390: the install pop-up makes the bar inert", locked);
    let reached = false;
    for (let i = 0; i < 12; i++) { await page.keyboard.press("Tab"); if (await page.evaluate(() => !!document.activeElement?.closest("nav"))) reached = true; }
    check("390: Tab never reaches the bar behind the pop-up", !reached);
    await page.getByRole("button", { name: "Got it", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
    check("390: closing the pop-up frees the bar", await page.evaluate(() => !document.querySelector("nav").closest("[inert]")));
  });

  // ---- a new tab opens at its top
  for (const width of [390, 1280]) {
    await scenario(`top ${width}`, { width }, async (page) => {
      await tab(page, "Seasons").click(); await settle(page, 150);
      await page.evaluate(() => scrollTo(0, 400)); await settle(page, 60);
      const before = await page.evaluate(() => scrollY);
      // a DOM click at 1280: a real one would first scroll up to the row
      if (width < 480) await tab(page, "Advice").click(); else await tab(page, "Advice").evaluate((b) => b.click());
      await settle(page, 150);
      const after = await page.evaluate(() => scrollY);
      check(`${width}: a tab switch from mid-page opens the new tab at its top`, before > 0 && after === 0, `${before} → ${after}`);
    });
  }

  await browser.close();
} catch (e) {
  out.push("ERROR " + (e.stack || e).toString().split("\n").slice(0, 3).join(" | "));
} finally {
  await browser?.close().catch(() => {}); server.kill(); console.log(out.join("\n"));
  process.exitCode = out.length && out.every((l) => l.startsWith("PASS")) ? 0 : 1;
}
