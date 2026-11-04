// Every control is big enough to tap (v0.18.5): nothing under WCAG's 24px
// minimum; every icon-only button (‹ › ✏️ ✕) is a square tap area
// (.mg-icon-btn, 32×32) that shows as a tile on hover, its glyph centred;
// compact in-row buttons ("Delete?", "Log payment") are 32px tall — all
// without changing the layout: the header keeps its 18px month row, and
// ✏️ ✕ take no more room beside a ledger amount or in a vine row than before
// (wider buttons once pushed every phone row onto two lines).
import { chromium } from "playwright";
import { spawn, execSync } from "node:child_process";
import { SP, DIST, shot } from "./paths.mjs";
const PORT = 8154; const BASE = `http://127.0.0.1:${PORT}/`;
try { execSync(`lsof -tnP -iTCP:${PORT} -sTCP:LISTEN | xargs kill`, { stdio: "ignore" }); } catch {}
const server = spawn("python3", [`${SP}/server.py`, DIST, String(PORT)], { stdio: "ignore" });
const out = []; const check = (n, ok, d = "") => out.push(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`);
const TABS = ["Overview", "Log", "Budgets", "Garden", "Orchard", "Seasons", "Advice"];

/** In the page: every visible control with its size and whether it's an icon button. */
const controls = () => [...document.querySelectorAll("button, a[href], input, select, [role=button]")]
  .map((e) => ({ e, r: e.getBoundingClientRect() }))
  .filter(({ e, r }) => r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden")
  .map(({ e, r }) => ({
    name: (e.getAttribute("aria-label") || e.textContent || e.getAttribute("placeholder") || e.tagName).trim().slice(0, 30),
    w: Math.round(r.width), h: Math.round(r.height), icon: e.classList.contains("mg-icon-btn"),
  }));

let browser;
try {
  let pid = null;
  for (let i = 0; i < 50 && pid === null; i++) { try { pid = Number(await (await fetch(BASE + "__pid")).text()); } catch { await new Promise((r) => setTimeout(r, 100)); } }
  if (pid !== server.pid) throw new Error("orphan server");
  browser = await chromium.launch();
  for (const width of [760, 414, 390, 375, 320]) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: "block" });
    // "dismissed", not "muted": no install pop-up, but the Advice tab keeps
    // its install tip — whose ✕ is one of the buttons to measure.
    await ctx.addInitScript(() => localStorage.setItem("money-garden:install-hint", "dismissed"));
    const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(e.message)); page.setDefaultTimeout(5000);
    await page.goto(BASE); await page.getByText("Money Garden", { exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready); // measure with the real fonts
    await page.getByRole("button", { name: "Plant sample data", exact: true }).click();
    const all = [];
    for (const tab of TABS) {
      await page.getByRole("button", { name: new RegExp(tab) }).first().click();
      await page.waitForTimeout(250);
      all.push(...(await page.evaluate(controls)).map((c) => ({ ...c, tab })));
    }
    const small = all.filter((c) => Math.min(c.w, c.h) < 24);
    check(`${width}: nothing under 24px`, all.length > 50 && small.length === 0,
      small.length ? small.map((c) => `${c.tab}:"${c.name}" ${c.w}×${c.h}`).join(", ") : `${all.length} controls checked`);
    const icons = all.filter((c) => c.icon);
    // Squares, with two deliberate smaller ones: the header arrows are 24×24
    // (bigger would move the month label), and Close search is 26×26
    // (bigger would clip its focus ring inside the search pill).
    const sideFor = (c) => (/^(Previous|Next) month$/.test(c.name) ? 24 : c.name === "Close search" ? 26 : 32);
    const off = icons.filter((c) => c.w < sideFor(c) || c.h < sideFor(c) || c.w !== c.h);
    // ‹ › on every tab, ✏️ ✕ in the Log, vines, goals, holdings, the Advice tip.
    check(`${width}: icon buttons are 32×32 squares (header ‹ › 24×24)`, icons.length >= 20 && off.length === 0,
      off.length ? off.map((c) => `${c.tab}:"${c.name}" ${c.w}×${c.h}`).join(", ") : `${icons.length} icon buttons`);
    check(`${width}: the Advice install tip's ✕ was measured`, all.some((c) => c.tab === "Advice" && c.name === "Don't show this again"));
    // …and its bigger tap area takes no width from the tip's text: box width
    // plus margins stays at the old 19px glyph box.
    await page.getByRole("button", { name: /Advice/ }).first().click();
    const tipX = await page.getByRole("button", { name: "Don't show this again" }).evaluate((b) => {
      const cs = getComputedStyle(b); return b.getBoundingClientRect().width + parseFloat(cs.marginLeft) + parseFloat(cs.marginRight);
    });
    check(`${width}: Advice tip ✕ takes no extra width`, tipX <= 20, `${tipX.toFixed(1)}px of layout width`);
    // The holding ✕ too: its old glyph took 22.7px of the row; a full 32px
    // pushed it onto its own line at 414px (iPhone XR/11) where it fit before.
    await page.getByRole("button", { name: /Orchard/ }).first().click();
    const holdX = await page.getByLabel(/^Remove Retirement/).evaluate((b) => {
      const cs = getComputedStyle(b); return b.getBoundingClientRect().width + parseFloat(cs.marginLeft) + parseFloat(cs.marginRight);
    });
    check(`${width}: holding ✕ takes no extra width (≤ 22.7px)`, holdX <= 22.7, `${holdX.toFixed(1)}px of layout width`);

    // The header doesn't move: the month row keeps the glyph's 18px height,
    // and ‹ / the month label sit where they did before the bigger tap areas
    // (measured on v0.18.4: ‹ centred 3px right of the title's left edge,
    // the label 14px right of it).
    const hdr = await page.evaluate(() => {
      const r = (el) => el.getBoundingClientRect(); const h1 = r(document.querySelector("h1"));
      const centre = (el) => { const range = document.createRange(); range.selectNodeContents(el); const g = range.getBoundingClientRect(); return (g.left + g.right) / 2; };
      const prev = document.querySelector('[aria-label="Previous month"]');
      const next = document.querySelector('[aria-label="Next month"]');
      const label = r(prev.parentElement.children[1]);
      return {
        row: Math.round(r(prev.parentElement).height), glyphX: Math.round(centre(prev) - h1.left), labelX: Math.round(label.left - h1.left),
        // › mirrors ‹: the same gap from the label's other side.
        gapL: label.left - centre(prev), gapR: centre(next) - label.right,
      };
    });
    check(`${width}: header month row unmoved`,
      hdr.row <= 20 && Math.abs(hdr.glyphX - 3) <= 1 && Math.abs(hdr.labelX - 14) <= 1 && Math.abs(hdr.gapL - hdr.gapR) <= 1,
      `row ${hdr.row}px, ‹ at +${hdr.glyphX}, label at +${hdr.labelX}, ‹/› gaps ${hdr.gapL.toFixed(1)}/${hdr.gapR.toFixed(1)}`);

    // Vine rows: where ✏️ ✕ share a line with "Log payment", the pair takes
    // the room it did before (10 gap + 26 + 10 + 22.7 = 68.7px), so the name
    // and details beside it don't reflow (a wider pair wrapped "next Nov 20";
    // even +0.3px wrapped rows at single widths).
    await page.getByRole("button", { name: /Budgets/ }).first().click();
    await page.getByRole("button", { name: /^Remove / }).first().waitFor();
    const vines = await page.evaluate(() => [...document.querySelectorAll('[aria-label^="Remove "]')].map((x) => {
      const pay = [...x.closest(".mg-row").querySelectorAll("button")].find((b) => b.textContent.includes("Log payment"));
      if (!pay) return null;
      const p = pay.getBoundingClientRect(), r = x.getBoundingClientRect();
      return Math.abs(p.top + p.height / 2 - (r.top + r.height / 2)) < 4 ? +(r.right - p.right).toFixed(1) : null; // same line only
    }).filter((v) => v !== null));
    if (width === 760) check("760: vine ✏️ ✕ take no more room (≤ 68.7px)", vines.length >= 3 && vines.every((v) => v <= 68.7), `${vines.join(", ")}px`);

    // Ledger rows wrap when the note can't keep 105px beside the amount and
    // ✏️ ✕ (by design: a long note or amount does). What must not change is
    // how much room ✏️ ✕ take beside the amount — 65.4px before the bigger
    // tap areas. Even +2.6px moved the wrap point and pushed 6 of 11 rows
    // onto two lines at 375px (iPhone SE / mini); 40px-wide buttons with the
    // old gaps took 100px and wrapped every phone row.
    await page.getByRole("button", { name: /Log/ }).first().click();
    await page.getByTitle("Delete entry", { exact: true }).first().waitFor();
    const rows = await page.evaluate(() => [...document.querySelectorAll("li.mg-row")].map((li) => {
      const amt = li.querySelector("b.mg-num");
      const group = amt.parentElement.getBoundingClientRect();
      return { actions: +(group.width - amt.getBoundingClientRect().width).toFixed(1), text: li.textContent.slice(0, 24) };
    }));
    // Close search only exists with the search open: big enough, and its
    // focus ring (3px outline + 2px offset) fits inside the clipped pill.
    await page.getByRole("button", { name: "Search the ledger" }).click();
    const close = page.getByRole("button", { name: "Close search" });
    await close.waitFor();
    const fit = await close.evaluate((b) => {
      const r = b.getBoundingClientRect(); const pill = b.closest(".mg-search");
      return { w: Math.round(r.width), h: Math.round(r.height), inner: pill.clientHeight };
    });
    check(`${width}: Close search is 26×26, focus ring fits the pill`, fit.w >= 26 && fit.h >= 26 && fit.h + 10 <= fit.inner,
      `${fit.w}×${fit.h} in a ${fit.inner}px pill`);
    await close.click();

    const wide = rows.filter((r) => r.actions > 65.5);
    check(`${width}: ✏️ ✕ take no more room beside the amount (≤ 65.5px)`, rows.length >= 5 && wide.length === 0,
      wide.length ? wide.map((r) => `${r.text} ${r.actions}px`).join(" | ") : `${rows.length} rows, max ${Math.max(...rows.map((r) => r.actions))}px`);

    // Hovering an icon button shows its square as a tile (the tap area made
    // visible); moving away clears it.
    if (width === 760) {
      const del = page.getByTitle("Delete entry", { exact: true }).first();
      const look = () => del.evaluate((b) => { const cs = getComputedStyle(b); return { bg: cs.backgroundColor, r: cs.borderTopLeftRadius }; });
      await del.hover(); await page.waitForTimeout(150); const on = await look();
      await page.mouse.move(1, 1); await page.waitForTimeout(150); const offTile = await look();
      check("760: hover shows the tap square as a tile, and clears", on.bg !== "rgba(0, 0, 0, 0)" && on.r === "10px" && offTile.bg === "rgba(0, 0, 0, 0)",
        `hover ${on.bg} r${on.r} → away ${offTile.bg}`);
    }

    // Compact in-row buttons are 32px tall: "Log payment", and the "Delete?"
    // a first tap on ✕ reveals, on every screen (the Garden one was 20px).
    const hOf = (loc) => loc.evaluate((e) => Math.round(e.getBoundingClientRect().height));
    const compact = [];
    await page.getByTitle("Delete entry", { exact: true }).first().click();
    compact.push(["Log Delete?", await hOf(page.getByTitle("Really delete this entry", { exact: true }))]);
    await page.getByRole("button", { name: /Budgets/ }).first().click();
    compact.push(["Log payment", await hOf(page.getByRole("button", { name: /Log payment/ }).first())]);
    await page.getByLabel(/^Remove Gym/).click();
    compact.push(["vine Delete?", await hOf(page.getByRole("button", { name: /^Really remove Gym/ }))]);
    await page.getByRole("button", { name: /Garden/ }).first().click();
    await page.getByLabel(/^Remove goal Japan/).click();
    compact.push(["goal Delete?", await hOf(page.getByRole("button", { name: /^Really delete goal Japan/ }))]);
    await page.getByRole("button", { name: /Orchard/ }).first().click();
    await page.getByLabel(/^Remove Retirement/).click();
    compact.push(["holding Delete?", await hOf(page.getByRole("button", { name: /^Really remove Retirement/ }))]);
    check(`${width}: compact buttons are 32px tall (Log payment, every Delete?)`, compact.length === 5 && compact.every(([, h]) => h === 32),
      compact.map(([n, h]) => `${n} ${h}`).join(", "));

    check(`${width}: no page errors`, errs.length === 0, errs.join(" | "));
    await shot(page, `tap-targets-${width}-log`, { fullPage: true });
    await ctx.close();
  }

  // Icons sit centred in their hover tiles — measured from the rendered
  // pixels at 2× and 3× screen densities (an emoji's artwork can sit
  // off-centre in its own box, which the tile would expose). ≤ 0.25px.
  for (const DSF of [2, 3]) {
    const ctx = await browser.newContext({ viewport: { width: 760, height: 900 }, deviceScaleFactor: DSF, serviceWorkers: "block" });
    await ctx.addInitScript(() => localStorage.setItem("money-garden:install-hint", "dismissed"));
    const page = await ctx.newPage(); page.setDefaultTimeout(5000);
    await page.goto(BASE); await page.getByText("Money Garden", { exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole("button", { name: "Plant sample data", exact: true }).click();
    await page.getByRole("button", { name: /Log/ }).first().click();
    /** The icon's ink centre minus its hover tile's centre, in CSS px — both
     * found in the same rendered pixels, i.e. exactly what you see when the
     * tile shows. (The browser rounds both to whole pixels when painting, so
     * measuring against the button's fractional layout box is misleading.) */
    const offset = async (loc) => {
      await loc.scrollIntoViewIfNeeded(); await loc.hover(); await page.waitForTimeout(150);
      const r = await loc.evaluate((e) => { const q = e.getBoundingClientRect(); return { x: q.x, y: q.y, w: q.width, h: q.height }; });
      const png = (await page.screenshot()).toString("base64");
      return page.evaluate(async ([src, r, s]) => {
        const img = new Image(); img.src = "data:image/png;base64," + src; await img.decode();
        const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
        const g = c.getContext("2d"); g.drawImage(img, 0, 0);
        // A 1px margin around the button (the tile is drawn inside it; a wider
        // margin catches neighbours' borders): the tile is anything differing
        // from the surface (faint fill and border), the ink the strongly dark part.
        const X0 = Math.floor((r.x - 1) * s), Y0 = Math.floor((r.y - 1) * s), W = Math.ceil((r.w + 2) * s), H = Math.ceil((r.h + 2) * s);
        const d = g.getImageData(X0, Y0, W, H).data;
        // The surface = the most common colour on the sampled area's outer
        // ring (a single corner pixel can land on a neighbour, e.g. the
        // search pill's border around Close search).
        const counts = new Map();
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          if (x > 0 && y > 0 && x < W - 1 && y < H - 1) continue;
          const i = (y * W + x) * 4, key = `${d[i]},${d[i + 1]},${d[i + 2]}`; counts.set(key, (counts.get(key) || 0) + 1);
        }
        const bg = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0].split(",").map(Number);
        const t = [1e9, -1, 1e9, -1], k = [1e9, -1, 1e9, -1];
        const grow = (b, x, y) => { b[0] = Math.min(b[0], x); b[1] = Math.max(b[1], x); b[2] = Math.min(b[2], y); b[3] = Math.max(b[3], y); };
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4; const diff = Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]);
          if (diff > 6) grow(t, x, y);
          if (diff > 150) grow(k, x, y);
        }
        return { dx: ((k[0] + k[1]) / 2 - (t[0] + t[1]) / 2) / s, dy: ((k[2] + k[3]) / 2 - (t[2] + t[3]) / 2) / s, tile: `${(t[1] - t[0] + 1) / s}×${(t[3] - t[2] + 1) / s}` };
      }, [png, r, DSF]);
    };
    const glyphs = [["Log ✕", page.getByTitle("Delete entry", { exact: true }).first()], ["Log ✏️", page.getByTitle("Edit entry", { exact: true }).first()]];
    const res = [];
    for (const [n, loc] of glyphs) res.push([n, await offset(loc)]);
    // Close search: inside the open search pill the tile shares the pill's
    // fill (only its outline shows), so the pixel method can't find it.
    // Check the geometry instead — the ✕ exactly centred in its button, and
    // every gap a whole number of pixels (a half-pixel gap is what painted
    // it a pixel off before).
    await page.getByRole("button", { name: "Search the ledger" }).click();
    const geo = await page.getByRole("button", { name: "Close search" }).evaluate((b) => {
      const r = b.getBoundingClientRect(), v = b.querySelector("svg").getBoundingClientRect();
      const pill = b.closest(".mg-search"), p = pill.getBoundingClientRect(), bw = parseFloat(getComputedStyle(pill).borderTopWidth); // computed width (the stylesheet's 1.5px computes to 1px)
      return { dx: v.x + v.width / 2 - (r.x + r.width / 2), dy: v.y + v.height / 2 - (r.y + r.height / 2), gaps: [v.x - r.x, v.y - r.y, r.y - (p.y + bw)] };
    });
    check(`${DSF}×: Close search ✕ centred on whole pixels`,
      Math.abs(geo.dx) < 0.01 && Math.abs(geo.dy) < 0.01 && geo.gaps.every((g) => Math.abs(g - Math.round(g)) < 0.01),
      `centre ${geo.dx.toFixed(2)},${geo.dy.toFixed(2)} · gaps ${geo.gaps.map((g) => g.toFixed(2)).join("/")}px`);
    await page.getByRole("button", { name: /Advice/ }).first().click();
    res.push(["Advice tip ✕", await offset(page.getByRole("button", { name: "Don't show this again" }))]);
    await page.getByRole("button", { name: /Budgets/ }).first().click();
    res.push(["vine ✏️", await offset(page.getByLabel(/^Edit Gym/))], ["vine ✕", await offset(page.getByLabel(/^Remove Gym/))]);
    await page.getByRole("button", { name: /Garden/ }).first().click();
    res.push(["goal ✏️", await offset(page.getByLabel(/^Edit goal Japan/))], ["goal ✕", await offset(page.getByLabel(/^Remove goal Japan/))]);
    await page.getByRole("button", { name: /Orchard/ }).first().click();
    res.push(["holding ✕", await offset(page.getByLabel(/^Remove Retirement/))]);
    const bad = res.filter(([, o]) => Math.abs(o.dx) > 0.25 || Math.abs(o.dy) > 0.25 || o.tile !== "32×32");
    check(`${DSF}×: icons centred in their hover tiles (≤ 0.25px)`, bad.length === 0,
      res.map(([n, o]) => `${n} ${o.dx.toFixed(2)},${o.dy.toFixed(2)} (tile ${o.tile})`).join(" · "));
    await ctx.close();
  }
  await browser.close();
} catch (e) { out.push("ERROR " + (e.stack || e).toString().split("\n").slice(0, 3).join(" | ")); } finally {
  await browser?.close().catch(() => {}); server.kill(); console.log(out.join("\n"));
  // Non-zero exit when any check failed (or none ran) — useful run alone, too.
  process.exitCode = out.length && out.every((l) => l.startsWith("PASS")) ? 0 : 1;
}
