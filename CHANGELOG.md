# Changelog

All notable changes to Money Garden. Dates are release dates.

## 0.4.0 — 2026-07-06 · *The turning of the seasons* 🍂

Your garden finally remembers. Past months were always stored — now you
can visit them.

### Added

- **Month navigation:** little ‹ › arrows beside the date in the header walk
  you through every month since your first entry. Overview, Log, and the
  budget plots follow along (Garden, Orchard, and Advice always reflect
  today); a **↩ today** button brings you home, and browsing is clearly
  marked so you never mistake June for now. Past months read as closed books:
  "Left over in June", the full month's pace curve, that month's donut.
- **🍂 Seasons tab** — the almanac, up to the latest 12 months side by side:
  - **The harvest ledger:** earned vs spent bars with your goal contributions
    traced over the top. Tap a month to step into it.
  - **Savings rate** against the dashed 20% benchmark.
  - **Needs & wants** stacked month by month — the 50/30/20 shape over time.
  The still-unfolding current month is sketched lightly ("so far"); months
  with nothing logged stay in the row at zero, honest as bare soil.

  Once your history outgrows twelve months, an **‹ older · newer ›** pager
  appears above the charts to slide the window back a year at a time.
- **Richer sample data:** "Plant sample data" now seeds two completed months
  of history alongside the current one, so Seasons, month navigation, and
  the trailing-average spending estimate all have something to show.
- Chart tooltips now track the pointer exactly on wide screens (the old
  pointer math ignored SVG letterboxing — an inherited quirk).
- The freedom tree's harvest window now reads "71+" when slower markets
  wouldn't reach your number within the 60-year simulation — the reference
  rendered a nonsensical "71–71+" in that case. (The math was always right:
  the upper end of the window is genuinely open, not equal to the lower.)

### Notes

- Budgets aren't stored per month, so past spending is shown against your
  current plot sizes (the app says so when you're browsing).
- The 12-month window is a chart-legibility cap, not a data limit — month
  navigation reaches all the way back, and the whole history is one small
  JSON blob (a full sample garden is ~5 kB).

## 0.3.0 — 2026-07-06 · *The seed vault* 🏦

Your garden, backed up. The safety feature the roadmap wanted before
anything else touches the data.

### Added

- **⬇️ Save backup** (in the footer shed): downloads your entire garden as
  one human-readable JSON file — `money-garden-backup-YYYY-MM-DD.json` — in
  a versioned envelope so future versions can always read old backups.
- **⬆️ Import backup:** pick a backup file and Money Garden shows you what's
  inside ("10 transactions · 3 goals · 4 commitments · exported …") and
  exactly what it would replace, then asks for an explicit confirm. Cancel
  any time; a damaged or foreign file is refused with a plain-words message
  and your current data is never touched.
- Imports are forgiving by design: backups from older versions are migrated
  on the way in, unknown fields from newer versions survive the round trip,
  and even a bare data dump (a hand-copied localStorage value) imports fine.
- GUIDE: a "Backing up your garden" section.

## 0.2.0 — 2026-07-06 · *The weeding* 🌿✂️

The first pass after the port: every known bug in the inherited math, fixed
deliberately — each behind its own test.

### Fixed

- **Dates now follow your local calendar.** Previously every date stamp used
  UTC, so (in UTC+8) anything logged before ~8am was dated *yesterday* — and
  on the 1st of the month, dated *last month*, silently shifting monthly
  totals and miscounting streaks. An expense logged at 7am now belongs to
  today, the way a paper journal would have it. Existing entries keep their
  original dates.
- **The FIRE number no longer panics at the start of the month.** Typical
  monthly spending (which sizes the FIRE number and emergency-fund coverage)
  used to be "this month's pace, extrapolated" — so rent logged on day 1
  projected to a ~$42,000/month lifestyle and a multi-million freedom number.
  It's now learned from the **average of your last three completed months**,
  with sensible fallbacks for brand-new gardens (actuals-so-far + budget for
  the remaining days, then a floored projection).
- **Rent on the 1st no longer makes it Stormy.** The health score's
  budget-adherence points scale in as the month unfolds — early-month pace
  wobbles carry little weight, and the comparison reaches full strength from
  mid-month. Day-1 rent now scores ~51/55 adherence instead of 0.
- **Emergency-fund advice tells the truth.** The "you're $X away from the
  3-month mark" amount was computed only from the current month's spend, so
  in a spend-free month it read **$0.00** no matter what you'd saved. Both
  emergency messages now share the same spending estimate as the coverage
  figure, so the months shown and the dollar amounts always agree.
- **Coast FIRE agrees with the chart.** The coast threshold compounded
  annually while the projection chart compounded monthly, so the 🍒 badge and
  the curve could disagree near the boundary. Both now use the same monthly
  model.
- **Annual installments count as a monthly drain.** An annual-cadence
  installment was summed at full face value per month (subscriptions already
  divided by 12). Unreachable through the form, but future imports made the
  guard worth having.

### Added

- **Emergency-fund prefill:** ticking "This is my emergency fund" on an empty
  goal form fills the name in for you (and untick undoes only its own work —
  a name you typed is never touched).
- **README** (the full tour) and **GUIDE** (a friendly one-pager for people
  you share the app with).

### Changed

- Orchard copy: the freedom number's basis now reads "your typical monthly
  spending" rather than "your current spending pace", matching the new
  trailing-average estimate.
- Internal: the rate assumptions in the FIRE engine (clamps, ±2% band width,
  annual→monthly conversion) are named constants in one place.

## 0.1.0 — 2026-07-05 · *Transplanting* 🪴

The original single-file app, re-potted — same garden, sturdier roots.

- **Restructured** into Vite + React + TypeScript (strict), with all
  financial logic extracted into a pure, dependency-free engine
  (`src/engine/`) behind 100+ unit tests. Behavior matches the original
  file exactly, quirks included (fixed separately in 0.2.0).
- **Installable PWA:** web manifest, offline support via a hand-rolled
  service worker, self-hosted fonts, zero CDNs, zero network calls.
- **Single-file build:** `npm run build:single` produces one self-contained
  `money-garden.html` that runs from a double-click.
- **Your data carries over:** same storage key, same format — existing
  gardens load unchanged.
