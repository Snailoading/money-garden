# Money Garden — Architecture

*As of v0.4.0. One rule explains most of this document: **all financial logic
lives in `src/engine/` and imports nothing from React or the DOM.** The UI is
leaves on that trunk; the engine could be transplanted into another frontend
(the possible future "Meridian") without change.*

## The layers

```
┌────────────────────────────────────────────────────────────────────────┐
│  UI  (src/ui/ — React, all styling inline off theme.ts + global.css)   │
│                                                                        │
│  main.tsx ─ mounts <ErrorBoundary><MoneyGarden/>, registers the SW     │
│      │     (ErrorBoundary: a render crash shows a rescue screen with a │
│      │     raw-data download instead of a blank page; never writes)    │
│      │                                                                 │
│  App.tsx ─ owns ALL state; every money change is an engine call        │
│      │     (actions.ts, or state.ts for the rest), saved through ONE   │
│      │     path: setStateSafe = save gate + save queue. Also: header   │
│      │     (weather, streak, month ‹ ›), tab router, footer "shed"     │
│      │     (backup, import + confirm card, sample data, 2-step reset), │
│      │     toast                                                       │
│      ▼                                                                 │
│  tabs/       Overview  Log  Budgets  Garden  Orchard  Seasons  Advice  │
│  charts/     SvgPace  SvgDonut  SvgProjection  SvgSeasons (×4)         │
│  art/        Plant (5 stages)  OrchardTree (freedom tree)              │
│  Recovery.tsx  shown INSTEAD of the garden when the save is unreadable │
│  bits.tsx    Stat  CardTitle  Empty  Field  PlantMini                  │
│  hooks.ts    useReveal (entry anims)  useNearest/svgX (tooltips)       │
│              useArmed (two-step confirm: arm → Delete? → auto-disarm)  │
│  store.ts    the one shared storage-adapter instance                   │
│  storageNote.ts  the shed's "where your garden lives" line + the       │
│              navigator.storage.persist() request (UI side, not engine) │
│  download.ts downloadText() — backups and rescued raw data             │
└───────────────┬────────────────────────────────────────────────────────┘
                │  plain function calls, plain data back
┌───────────────▼────────────────────────────────────────────────────────┐
│  ENGINE  (src/engine/ — pure TypeScript, no React/DOM, unit-tested)    │
│                                                                        │
│   types.ts ◄──────────── everyone (State shape, CATEGORIES, defaults)  │
│   format.ts ◄─────────── everyone (fmt, dates — LOCAL calendar)        │
│                                                                        │
│   stats.ts    derive(state, now)          → Derived   (the big one)    │
│               deriveMonthView(state, ym)  → MonthView (browse history) │
│               monthAggregates(state, ym)  → shared month core          │
│               (budget basis: goal draws — isDraw — excluded from every │
│               budget number; surfaced separately as `drawn`)           │
│      ├── fire.ts         deriveFire(inv, exp, now) → FIRE/Coast/proj.  │
│      │                    (age derives from birthYear at compute time) │
│      │                    deriveWatering() → the can's journal status  │
│      └── commitments.ts  deriveCommitments(), nextDueDate(), …         │
│   trends.ts   monthRange(), monthlyTrends() → Seasons + nav bounds     │
│   advice.ts   buildAdvice(state, derived) → prioritized Tip[]          │
│   journal.ts  filterTransactions(), matchesFilter(), isFilterActive()  │
│               (Log search/filter; depends on types.ts only)            │
│   actions.ts  the forward money actions, pure: (state, args, now) →    │
│               { state, events } — logEntry, waterGoal,                 │
│               drawFromGoal, waterHolding, payCommitment, plans…;       │
│               same state back = refused/no-op; impossible numbers      │
│               refused (v0.18.0). The forward half of every linked      │
│               entry; removeTransaction/updateTransaction the reverse   │
│   state.ts    emptyState, sampleState, migrate, serialize, bumpStreak  │
│               (update/removeTransaction exactly reverse the goalId,    │
│               holdingId, and commitmentId linkage side-effects)        │
│               ensureEmergencyGoal enforces the rain-barrel invariant   │
│               in migrate(): one isEmergency goal always exists, first  │
│               in goals[], target 0 = "not set up yet"; deleteGoal      │
│               refuses it, setupEmergencyFund gives it target+opening   │
│               balance once (no transaction — not a monthly flow)       │
│               loadSaved(raw) → fresh | ok | unreadable (never throws;  │
│               only "fresh" may be overwritten)                         │
│               linkedAmountBounds()/canRemoveTransaction(): how far a   │
│               goal-linked entry may move and stay exactly reversible   │
│               isFreshGarden(): nothing entered at all — the only state │
│               one-tap "Plant sample data" may replace (v0.17.5)        │
│   validate.ts findStateProblems() — reports (never repairs) damage     │
│               that would crash the app or corrupt its sums; gates both │
│               loadSaved and parseBackup (depends on types.ts only)     │
│   backup.ts   buildBackup(), parseBackup() → seed-vault envelope       │
│               (imports run through migrate, so barrel-less backups     │
│               gain the barrel on import too; damaged files refused)    │
│   storage.ts  createStore() → three-tier adapter (below);              │
│               createSaveQueue() → one write in flight, newest wins     │
└───────────────┬────────────────────────────────────────────────────────┘
                │  one JSON string, key "money-garden:state-v1"
┌───────────────▼────────────────────────────────────────────────────────┐
│  STORAGE  (per-call fallback; every get/set result reports its tier)   │
│     platform storage (injected host iface, e.g. future native shell)   │
│       → browser localStorage                                           │
│         → in-memory (session only — banner + shed warning + a toast)   │
│  The shed names the tier the garden's OWN last load/save used (since   │
│  v0.17.5); persist() is requested once the garden holds real data.     │
└────────────────────────────────────────────────────────────────────────┘
```

## The two data flows

**Write path** (every user action, since v0.18.0): tab component calls a
handler in `App.tsx` → the handler calls an engine action in `actions.ts`
(`actions.waterGoal(state, id, amount, now)` …), which builds the next
`State` immutably — ids, dates, streak, linked balances — and returns
`{ state, events }` (events are facts like "bloomed", turned into toasts by
the App; the same state back means refused or no-op) → `commit` →
`setStateSafe(next)`, the ONE save path, which:

1. **gates** the change: `findStateProblems(next)` — the same inspector as
   load and import — refuses damage (in practice an impossible number like
   Infinity, which JSON would write as null = $0) before it touches
   anything, and reports acceptance so success toasts wait;
2. sets React state;
3. hands the garden to the **save queue** (`createSaveQueue`): one write in
   flight, the newest pending garden wins, a failed write never wedges it —
   so with an async store an older garden can't overwrite a newer one.

There is exactly one writer; components never touch storage. The rest of the
changes call `state.ts` engine functions directly (they predate `actions.ts`
and were already tested there): entry edits and deletes (`updateTransaction`,
`removeTransaction`), planting/editing/deleting goals and barrel setup
(`insertGoal`, `updateGoal`, `deleteGoal`, `setupEmergencyFund`), commitment
edits (`updateCommitment`), and whole-garden replacements (sample data,
start fresh, the initial empty garden — or a backup already checked by
`parseBackup`). All of them go through the same gate and queue.

**Read path** (every render): `App.tsx` derives everything from `state` in
`useMemo`s — `derive(state)` for "today" (monthly stats, health, FIRE,
commitments), `deriveMonthView(state, viewYm)` when browsing a past month,
`monthRange`/`monthlyTrends` for navigation bounds and Seasons. Tabs receive
plain data (`d`, `view`, callbacks) and render it; `MonthView`'s field names
mirror `Derived`'s so tabs read `view ?? d`.

On load (since v0.17.4): `store.get(key)` → `loadSaved(raw)` = `JSON.parse`
→ fill missing top-level fields from a fresh state → `migrate()` (fills
missing fields from defaults, **never drops unknown fields**) →
`findStateProblems()`. The verdict decides everything: **fresh** (nothing
saved) initializes an empty garden; **ok** adopts it; **unreadable** shows
`Recovery.tsx` and writes *nothing* — the save stays byte-for-byte intact
until the user downloads it and/or chooses a two-step "Start fresh", which
first copies the raw string to its own timestamped key,
`money-garden:unreadable-save:<ISO time>` (never overwriting an earlier copy). (Before
v0.17.4 a parse failure fell through to "fresh" and overwrote the only copy.)
Backup import runs the same fill → `migrate()` → `findStateProblems()`
sequence and refuses damaged files before the confirm card — one gate for
both doors. The gate's bar is "would crash or corrupt the sums", never
"looks unusual": every shape the app has ever written must pass.

## Engine module dependencies (arrows = imports)

```
types ◄── format ◄── commitments ◄── stats ◄── trends
  ▲          ▲            ▲            ▲
  │          │            │            └── advice   (also ← commitments, format)
  │          │            └── fire ◄── stats
  │          └── state ◄── backup, actions (also ← format, types)
  ├── validate ◄── state, backup
  └── storage (standalone; host access via globalThis only)
```

No cycles; `types` and `format` are the shared floor. `stats.ts` is the
composition point: it owns the month core and pulls in `fire` + `commitments`
to assemble `Derived`.

## Conventions the code enforces (see CLAUDE.md for the full list)

- **Dates** are `YYYY-MM-DD` strings on the **local** calendar; month
  membership is a string-prefix match. Date-dependent functions take an
  injected `now` (tests pin the calendar; UI passes the real clock).
- **Money math ships with tests** — every engine module has a colocated
  `*.test.ts` (Vitest, plain Node, no jsdom).
- **Every money change is an engine function** — the forward actions in
  `actions.ts` (since v0.18.0) and the rest in `state.ts`. Each action that
  creates a journal entry has a reversibility test: deleting that entry
  restores every balance exactly (only the streak stays — it records that you
  tended the garden). The App calls them and turns their results into
  toasts; it never builds a garden itself.
- **Persistence compatibility**: the key `money-garden:state-v1` and
  `migrate()` are load-bearing; schema changes must keep old localStorage
  data *and* old backup files importable.
- **Charts are hand-rolled SVG** (no libraries): `useReveal` drives CSS-only
  entry animations, `svgX`/`useNearest` map pointers through the SVG's own
  CTM for tooltips, and a global `prefers-reduced-motion` rule stops all
  motion.

## Theming (since v0.6.0)

The palette is CSS variables in `global.css` (`:root` = day,
`[data-theme="night"]` = night); the typed `C` object in `theme.ts` serves
them to components as `var(--x)` strings, so a theme switch is one attribute
flip on `<html>`. A boot script in `index.html` stamps the theme *before
first paint* (direct localStorage read — the documented exception to the
adapter rule); `App.tsx` owns the ☀️/🌙/🌗 mode (persisted under
`money-garden:theme` via the adapter) and re-resolves auto mode (clock-based,
day 7am–7pm) on a timer. SVG colors go through `style=`, never presentation
attributes, because the latter don't resolve `var()`.

Cold starts paint a static splash (since v0.14.4): inline `<style>` + inlined
icon SVG in `index.html`, so it renders from raw HTML before the bundle
arrives, themed by the same boot script. An `App.tsx` mount effect removes it;
the in-app "Preparing your garden…" state covers the storage load after that.

## Build targets (both from the same source)

| Target | Command | Output |
|---|---|---|
| Hosted PWA | `npm run build` | `dist/` — hashed assets + `manifest.webmanifest` + `sw.js` (generated at build time by an inline Vite plugin with the precache list baked in; cache-first assets, network-first navigations with a ~2s timeout falling back to the precached shell) |
| Single file | `npm run build:single` | `dist-single/money-garden.html` — everything inlined (JS, CSS, fonts as data URIs), PWA tags stripped, `__SINGLE_FILE__` define skips SW registration; runs from `file://` |

Fonts (Fraunces + DM Sans, variable woff2) are self-hosted in
`src/assets/fonts/` — the app makes **zero** network requests at runtime.

## Hosting

`base: "./"` (vite.config.ts) emits relative asset paths, so the hosted
build works from any subpath — verified serving `dist/` under `/money-garden/`.
Never hand-write a root-absolute asset path (`src="/x.png"`); use relative or
`import`, or it breaks off-root.

- **Current: GitHub Pages** via `.github/workflows/deploy.yml` — tests, builds
  `dist/`, deploys on push to `main`. Free for the public repo; served at
  `https://snailoading.github.io/money-garden/`. (One-time: Settings → Pages →
  Source → GitHub Actions.)
- **Alternative: Cloudflare Pages** — point it at the repo (build `npm run
  build`, output `dist`); no workflow needed. Root URL, unlimited bandwidth,
  per-branch previews, and — the real reason to switch — custom response
  headers via a `_headers` file, which GitHub Pages can't do. Worth it if a
  custom domain or a Content-Security-Policy is wanted. Starter `_headers`:

  ```
  /*
    Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'
    Referrer-Policy: no-referrer
    X-Content-Type-Options: nosniff
  ```

  The big win is `default-src`/`connect-src 'self'`: nothing can be sent to
  another origin and no external script can load. `'unsafe-inline'` is needed
  for the pre-paint theme boot script and React's inline `style` attributes;
  tighten `script-src` to a sha256 hash of the (static) boot script for a
  stricter policy. The `_headers` file is inert on GitHub Pages, so it can be
  added any time.

## Where things would grow next

- **Meridian** (second frontend): consume `src/engine/` as-is; nothing in it
  knows about the garden metaphor except advice copy.
- **Debt tracking / net worth** (roadmap 6, 9): new engine modules beside
  `fire.ts`; `advice.ts` gains rules; schema change → extend `migrate()` and
  bump the backup `SCHEMA_VERSION` only if the envelope itself changes.
- **Native (Expo)**: implement the `PlatformStorage` interface in
  `storage.ts` — the adapter's first tier exists exactly for this. Its async
  writes are already sequenced by `createSaveQueue` (v0.18.0), so an older
  garden can never land after a newer one.
