# Money Garden 🌻

**A personal finance tracker and long-term planner disguised as a garden.**

Money doesn't have to feel like a spreadsheet with a grudge. In Money Garden, your financial health is the *weather*, your budgets are *plots of soil*, your savings goals are *flowers* that grow as you fund them, your subscriptions are *vines* (they keep drinking until you cut them), and your investment portfolio is a *freedom tree* growing toward the day it can feed you.

Local-first, single-user, no accounts, no server, no analytics. Every number lives on your own device and nowhere else. Plant coins, pull weeds, grow free. 🌱

📖 **[User guide](GUIDE.md)** · 🗒️ **[Changelog](CHANGELOG.md)** · 🏗️ **[Architecture](ARCHITECTURE.md)**

---

## Getting started

**Run it from source** (Node LTS):

```bash
npm install
npm run dev        # → http://localhost:5173
```

**Or grow a single seed:** `npm run build:single` produces `dist-single/money-garden.html` — one self-contained file (app, styles, fonts, icon, everything) that runs from a double-click, no internet required. Hand it to a friend like a cutting from your garden.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm test` | The engine's unit tests (money math is sacred — 119 of them) |
| `npm run build` | The hosted PWA → `dist/` (installable, works offline) |
| `npm run build:single` | The shareable single file → `dist-single/money-garden.html` |
| `npm run preview` | Serve `dist/` locally to try the real PWA + service worker |

First visit looks bare? Tap **Plant sample data** to explore with realistic numbers, then **Start fresh…** when you're ready to grow your own.

---

## A tour of the garden — the seven tabs

### 🌤️ Overview
The month at a glance: a big friendly **"left to spend"** number (with a per-day pace through month-end), earned / spent / sent-to-goals, and your savings rate. A **spending-pace chart** plots your cumulative spend against an even-pace line so you can see mid-month whether you're running hot, and a **category donut** shows where the money actually went. Your goals sprout along the horizon.

### ✏️ Log
The daily driver. Record expenses (10 categories, each tagged *need* or *want*), income, and transfers to savings — with notes and dates, Enter-to-submit, and one-tap delete. Typo? Every entry **edits in place** (✏️): amount, category, note, date — and fixing a goal-watering entry adjusts the goal's balance too. Every number in the app recalculates instantly. A **logging streak** 🔥 rewards the habit — and a 🌵 **no-spend day** counts too, because not spending is the best log of all.

### 🧺 Budgets
Set monthly limits per category with color-coded progress bars: green means room to grow, amber means nearly full, red means **overgrown** (with the exact overage, so you know what to prune). Below the plots, **Vines & Trellis** tracks recurring commitments:

- **🌿 Vines (subscriptions):** monthly or annual cadence, payment day, optional end date, and the running monthly + yearly drain they all add up to.
- **🪜 The trellis (installments):** tax bills and big purchases paid in steps — per-payment amount, progress bar, and automatic retirement when the last payment clears.

A **due-soon strip** flags anything billing within 14 days (red within 3), and **💸 Log payment** records the expense to your journal in one tap — advancing the next-due date, which quietly reverts if you delete the entry. Rows edit in place (✏️) for price hikes and changed billing days. Day-31 subscriptions politely bill on Feb 28 like civilized plants.

### 🌷 Garden
Savings goals as plants — sunflower, tulip, bluebell, poppy, or lavender — growing through five stages (seed → sprout → leaves → bud → full bloom), advancing as you fund them. **💧 Water** a goal to log the transfer on the spot, **🪣 draw** from it when life calls on the money (an honest expense that drains the goal, exactly reversible), and ✏️ edit its name, target, or flower any time. Mark one goal as your **emergency fund** 🛟 (the rain barrel) and the advisor tracks it against the classic 3–6-months-of-expenses standard — exactly one lifebuoy at a time, and moving it tells you so. Full bloom comes with a gentle sway of celebration; overshoot and it's **Overflowing 🌊**.

### 🌳 Orchard
The long game. Track investment holdings, set your growing conditions (age, retirement age, monthly investing, expected return, withdrawal rate, planned retirement spending), and watch the **freedom tree** grow toward your **FIRE number** — fruiting 🍒 at Coast FIRE and turning gold 🍎 when work becomes optional. The projection chart compounds month by month with a **±2% market band**, so your freedom date reads as an honest *window*, not a promise. Supports recurring monthly investing *and* one-off watering for bonuses and windfalls — both logged to your journal.

### 🍂 Seasons
The almanac. Arrow through past months right from the header (‹ June 2026 ›) — Overview, Log, and the budget plots all follow — and see up to twelve months of history at a glance: **the harvest ledger** (earned vs spent, with what you sent to goals traced over the top), your **savings rate** against the 20% benchmark, and the **needs & wants** shape over time. Tap any month in the ledger to wander through it; the current month is sketched lightly, since it's still growing.

### 🪴 Advice
A rules-based gardener's notebook, generating prioritized notes from your actual numbers — **Do first / Worth doing / Going well** — covering emergency-fund coverage, savings rate vs. the 20% benchmark, 50/30/20 needs-vs-wants shape, budget overruns, spending pace, subscription audits (and annual-renewal ambushes), installment payoffs, idle-cash nudges, Coast FIRE, and your financial-independence countdown. Grounded in standard rules of thumb, hedged like an honest gardener. **General education, not personalized financial advice.**

---

## Everywhere in the app

- **Hand-rolled SVG charts** — no chart library, just paths and math — with touch-friendly tooltips and entry animations (which politely stand still if you prefer reduced motion).
- **A garden health score** (0–100) shown as weather — ☀️ Sunny, 🌤️ Fair, ☁️ Overcast, 🌧️ Stormy — blending budget adherence (55), savings behaviour (30), and your logging streak (15). Rent on the 1st won't storm your skies: early-month pace wobbles are weighted down until the month has shown its shape.
- **Automatic saving** through a three-tier storage adapter: platform storage → browser localStorage → session memory. The footer (**🧰 the shed**) always discloses where your data lives, and warns you if saving isn't available.
- **Backup & restore** 🏦 — one click downloads your whole garden as a readable, versioned JSON file; importing shows you what's inside (and what it would replace) before asking for an explicit confirm. Old backups and even raw data dumps import cleanly.
- **A two-step "erase everything"** — no single click can salt your fields.
- **Fraunces & DM Sans**, self-hosted; the exact garden palette; tabular numerals so your figures line up like fence posts.
- **A night garden** 🌙 — the same garden after dark, not a different app. The ☀️/🌙/🌗 button cycles day, night, and auto (follows the clock: day 7am–7pm), remembered across visits and applied before first paint so there's never a flash of the wrong sky.

## The math, honestly

- **FIRE number** = annual spending × (100 ÷ withdrawal rate). The default 4% gives the classic ×25.
- **Everything is in today's dollars** with real (after-inflation) returns — 7% ≈ the long-run stock average. No double-counting inflation.
- **Projections simulate month by month** (compounding + contribution), never closed-form shortcuts, and always show the ±2% band.
- **Coast FIRE** = today's portfolio compounding alone (monthly, same model as the chart) to your number by retirement age.
- **Typical monthly spending** — the basis for FIRE sizing and emergency coverage — is learned from your **last three completed months** of real data, with sensible fallbacks for brand-new gardens. Set a planned retirement spend to override it.
- **Dates are local.** An expense logged at 7am belongs to *today*, whatever UTC thinks.

## Under the hood 🔧

Vite + React + TypeScript (strict). All financial logic lives in **`src/engine/`** — pure functions, no React, no DOM, fully unit-tested — so the garden's brain could be transplanted into another body someday. The UI in `src/ui/` is just leaves on that trunk. The hosted build is an installable PWA with a hand-rolled service worker (no Workbox, no CDNs, nothing phones home); the dependency tree is deliberately tiny and auditable, because this app holds someone's financial life.

## Privacy, in one sentence

Your data is written to your device's storage under the key `money-garden:state-v1`, is never transmitted anywhere, and the app makes zero network requests once loaded. 🤝

## Roadmap 🗺️

~~Export/backup & import (JSON)~~ ✓ → ~~month history & trend charts~~ ✓ → ~~inline transaction editing~~ ✓ → ~~dark mode (*night garden* 🌙)~~ ✓ → debt tracking (*weeds* 🌿✂️) → monthly harvest reports → bank CSV import → net worth over time → native mobile apps with home-screen widgets.

---

*Nothing here is licensed financial, tax, or investment advice. Markets are bumpier than any band; treat every freedom date as a compass, not a calendar. Grown with care.* 🌻
