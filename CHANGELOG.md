# Changelog

## 0.8.3 — 2026-07-12 · *The advisor mentions it too* 🪴

### Added

- **A standing install note on the Advice tab** ("Pot the garden — install
  it as an app"), for anyone who closed the one-time overlay without
  reading it. Same per-platform instructions, styled like a "Worth doing"
  note but clearly app-housekeeping, always the last card. Its ✕ mutes it
  (and the overlay) for good, and installing removes it on its own. It
  lives in the UI layer, not the advice engine — the engine's promise of
  "computed only from your real data" stays intact.

## 0.8.2 — 2026-07-12 · *Take the garden with you* 📲

Now that the garden lives at a link, it can live on your home screen.

### Added

- **A one-time install invitation** when the app opens in a browser tab: a
  small overlay explaining how to install — tailored per platform (iPhone:
  Share → Add to Home Screen, plus the real reason: it protects your data
  from Safari's periodic storage cleanup; Android: browser menu; desktop:
  the address-bar install icon or Safari's Add to Dock). Any dismissal —
  the button, tapping outside, or Escape — is permanent, and anyone already
  running the installed app never sees it at all.
- GitHub Pages deployment: every push to main tests, builds, and publishes
  the hosted PWA automatically.

All notable changes to Money Garden. Dates are release dates.

## 0.8.1 — 2026-07-08 · *Rain barrel, read clearly* 🪣

- The emergency-fund card now shows its **coverage in months** — "≈ 1.0
  months of expenses · aim for 3–6" — tinted by zone (red under 3 months,
  green within 3–6), so the standard the 🛟 fund is measured against is
  visible right where you tend it, not only in the Advice tab.
- Editing an old entry whose goal was since deleted now says so plainly
  ("🥀 The goal this fed has been deleted — editing changes only the
  journal") instead of promising to water a goal that's gone.

## 0.8.0 — 2026-07-08 · *The rain barrel* 🪣

The emergency fund finally works like one — and goals grew the same care
tools everything else has.

### Added

- **Draw from a goal:** every goal with a balance has "🪣 Draw from this
  goal" — rent due before payday, or spending the laptop fund on the
  laptop. It logs an honest expense (it counts in your budgets and monthly
  spend) and drains the goal, the advisor's coverage reading drops
  accordingly, and deleting the entry puts the money back exactly. Draws
  are capped at the goal's balance — you can't pour out more than the
  barrel holds; log any remainder as a regular expense.
- **Edit goals in place:** name, target, flower, and the emergency flag get
  the same ✏️ treatment as everything else. The balance itself stays
  journal-driven — you change it by watering, drawing, or tending entries,
  so every dollar remains traceable.
- **One lifebuoy, visibly moved:** marking a goal as your emergency fund
  unflags the previous one (the advisor only ever tracks one), with an
  inline notice before you save and a toast naming the new holder. The
  demoted goal keeps every dollar — it just hands over the 🛟.
- **Two-step goal deletion**, closing the last one-tap-destruction hole.

### Notes

- Editing a linked draw entry is capped the same way (the form shows the
  ceiling), and linked entries keep their type — converting a draw into
  income would orphan what it means.

## 0.7.0 — 2026-07-07 · *Garden care* 🧤

Fixes and kindnesses, most of them from actually living with the app.

### Added

- **🌵 No-spend days count as tending.** A one-tap "Mark a no-spend day" in
  the Log tab keeps your streak alive without inventing a journal entry —
  the streak now rewards *showing up*, not spending. (Spotted by its
  gardener: the old rule quietly encouraged logging a purchase just to keep
  the flame.)
- **Edit commitments in place:** vines and trellis rows now have a ✏️ like
  the ledger — for price increases, changed billing days, renamed plans,
  or correcting an installment's counts.
- **"Log payment" now actually moves the date.** Payments are linked to
  their commitment, so logging one advances the next-due date a cycle (and
  quiets the due-soon strip and renewal advice); deleting the payment
  reverts the date — and un-counts an installment payment, fixing the
  stuck "5 of 6 paid". Payments logged before v0.7.0 aren't linked.

### Fixed

- **Goals overflow honestly.** Watering more than a goal needs used to cap
  the flower but journal the full amount — so deleting that entry drained
  money you'd genuinely saved. Goals can now overflow ("$1,775 of $1,500 ·
  Overflowing 🌊"): every number is real and every entry reverses exactly.
- Night mode: the Monthly income box typed in black-on-dark; it now uses
  the theme's ink like every other field.

## 0.6.0 — 2026-07-07 · *The night garden* 🌙

The same garden, asleep — deep greens, moonlit marigold, and every chart
still readable by starlight.

### Added

- **Night mode**, designed as a nighttime palette of the same garden rather
  than a generic dark theme. The ☀️/🌙/🌗 button in the header cycles three
  modes: fixed day, fixed night, and **auto** — which follows the clock
  (day 7am–7pm, night otherwise). Auto re-checks as dusk crosses while the
  app is open. Your choice is remembered on this device (it deliberately
  rides outside backups) and is applied *before first paint*, so the app
  never flashes the wrong sky. The PWA's chrome color follows along.
- New users start in auto — the garden greets you in whatever light the
  hour calls for.

### Notes

- Auto follows the clock, not the operating system's dark-mode setting —
  a deliberate choice so the garden gets its nights even on systems locked
  to light mode.
- Under the hood, the palette moved from per-component constants to CSS
  variables (day values byte-identical — verified by pixel-diffing every
  tab), which is what makes theme switching a single attribute flip.

## 0.5.0 — 2026-07-07 · *Tending notes* ✏️

Typos happen. Now they're a tap to fix, not a delete-and-retype.

### Added

- **Edit entries in place:** every ledger row has a ✏️ beside its ✕. The row
  unfolds into a small form — amount, category, note, date, and (for
  expenses/income) the type — with Enter to save and Escape to cancel.
  Editing a date across a month boundary simply re-files the entry.
- **Two-step delete:** the row's ✕ now asks — first tap arms it ("Delete?",
  reverting on its own after a few seconds), second tap deletes. Brings the
  ledger in line with the app's never-destroy-in-one-tap rule, which matters
  more now that deleting can drain a linked goal.
- **Goal linkage:** new goal-watering entries remember which flower they
  watered. Edit the amount and the goal's balance moves by the difference;
  delete the entry and the goal drains — both clamped to the goal's range,
  and the toast tells you when a goal was adjusted. This also makes deletion
  honest for new waterings (it never used to un-water the goal).

### Notes

- Entries logged before v0.5.0 aren't linked to goals (they carry no goal
  reference, and guessing from note text would be worse than not guessing);
  editing them changes only the journal.
- Editing never counts toward your logging streak — corrections aren't
  logging.

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
