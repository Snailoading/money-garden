# Money Garden 🌻

**A personal finance tracker and long-term planner disguised as a garden.**

Every financial concept maps to a living metaphor: your financial health is the weather, budgets are garden plots, savings goals are flowers that grow as you fund them, and your investment portfolio is a freedom tree working toward the day it can feed you.

It's a single-file web app — no account, no server, no install. All data stays on your own device.

---

## Getting started

1. Open `money-garden.html` in any modern browser (needs internet on load — it fetches React and fonts from a CDN).
2. Tap **Plant sample data** to explore with realistic example numbers, or start logging your own.
3. On a phone, open the hosted link and choose **Add to Home screen** for an app icon and full-screen experience. (On iPhone this also protects your saved data from Safari's periodic storage cleanup.)

Your data saves automatically. The footer always tells you where: app storage, this browser, or session-only.

---

## The six tabs

### 🌤️ Overview
The month at a glance: income, spending, amount saved, and savings rate, plus a **garden health score** (0–100) computed from your savings rate, budget adherence, goal progress, and reserves — reflected in the weather (sunny, overcast, or stormy). Includes a **spending pace chart** (cumulative spend vs. an even-pace line, so you can see mid-month whether you're running hot) and a **category donut** showing where the money went.

### ✏️ Log
The daily driver. Record expenses (10 categories, each tagged *need* or *want*), income, and transfers to savings, with notes and dates. Entries are deletable; every number recalculates instantly. A logging streak rewards the habit.

### 🧺 Budgets
Set monthly limits per category with color-coded progress (green → amber → red/overgrown). Below it, **Vines & Trellis** tracks recurring commitments:

- **Vines (subscriptions):** monthly or annual cadence, payment day, optional end date, and a running total of what they drain per month and per year.
- **The trellis (installments):** tax bills or big purchases paid in steps — per-payment amount, payments made/remaining, a progress bar, and automatic retirement when the last payment clears.

A **due-soon strip** flags anything billing within 14 days (red within 3), and **Log payment** records the expense to your journal in one tap.

### 🌷 Garden
Savings goals as plants (sunflower, tulip, bluebell, poppy, lavender) that grow through five stages — seed → sprout → leaves → bud → full bloom — advancing a stage every 25% funded. Watering a goal logs the transfer, and each goal shows a projected bloom date based on your actual saving pace. Mark one goal as your **emergency fund** and it's tracked against the 3–6-months-of-expenses standard.

### 🌳 Orchard
The long game. Track investment holdings and set your assumptions:

- age and traditional retirement age
- monthly investing amount (your dollar-cost averaging)
- expected annual return (7% ≈ the long-run stock average after inflation)
- withdrawal rate (4% is the classic rule; 3–3.5% is more cautious)
- planned retirement spending per month, in today's dollars (leave at 0 to use your current spending pace)

From these, the app computes your **FIRE number** (annual spending × 25 under the 4% rule), your **Coast FIRE** point (the portfolio that compounds to freedom by retirement age with zero further contributions), and grows a **freedom tree** that fruits when self-sustaining. The projection chart shows compounding to your independence age with a **±2% market band**, so the freedom date reads as an honest window rather than a promise. Supports recurring monthly investing *and* one-off contributions (bonuses, windfalls), each logged to your journal.

### 🪴 Advice
A rule-based financial coach generating prioritized notes (**Do first / Worth doing / Going well**) from your actual numbers:

- emergency-fund coverage and savings rate vs. the 20% benchmark
- 50/30/20 needs-vs-wants balance and budget overruns
- spending pace vs. the calendar, and goal arrival dates
- subscription audits, annual-renewal warnings, and installment payoffs (with a nudge to redirect freed-up cash into investing)
- idle-cash-to-index-fund guidance, DCA automation, and your financial-independence countdown

Grounded in standard personal-finance rules of thumb. **General education, not personalized financial advice.**

---

## Everywhere in the app

- Interactive charts with touch-friendly hover tooltips and entry animations, drawn in dependency-free SVG
- Automatic saving via a three-tier storage system: Claude artifact storage → browser localStorage → session memory (active mode shown in the footer)
- Sample data to explore with, and a two-step "erase everything" reset in the footer
- A custom sunflower-coin app icon, embedded in the file itself
- Phone-friendly layout; works on Android, iPhone, and desktop

---

## The family

Three versions share the same financial engine:

| File | What it is |
|---|---|
| `money-garden.jsx` | The original Claude artifact (garden design, Recharts charts) |
| `money-garden.html` | The shareable standalone — this app, zero chart dependencies |
| `meridian-finance.html` | The professional skin: light/dark mode toggle, dashboard design, same features |

## Sharing it

The recommended route for friends on any device: host the HTML file (e.g., drag it onto **Netlify Drop** or use GitHub Pages) and send the link. Recipients on Android and iPhone can then use **Add to Home screen**. Sending the raw file works on desktop and (clunkily) on Android Chrome, but iPhones can't run local HTML files — use a link for them.

Each person's data is stored privately in their own browser; nothing is shared between users or sent anywhere.

## Notes & limitations

- Requires internet on load (React and fonts come from a CDN); afterwards everything runs and saves locally.
- Projections assume steady returns and today's dollars; real markets are bumpier than any band. Treat independence dates as a compass, not a calendar.
- Nothing here is licensed financial, tax, or investment advice.

*Grown with care. Plant coins, pull weeds, grow free.* 🌱
