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
│  main.tsx ─ mounts <MoneyGarden/>, registers the service worker        │
│      │                                                                 │
│  App.tsx ─ owns ALL state + every action handler; header (weather,     │
│      │     streak, month switcher ‹ › ), tab router, footer "shed"     │
│      │     (backup, import + confirm card, sample data, 2-step reset), │
│      │     toast                                                       │
│      ▼                                                                 │
│  tabs/       Overview  Log  Budgets  Garden  Orchard  Seasons  Advice  │
│  charts/     SvgPace  SvgDonut  SvgProjection  SvgSeasons (×3)         │
│  art/        Plant (5 stages)  OrchardTree (freedom tree)              │
│  bits.tsx    Stat  CardTitle  Empty  Field  PlantMini                  │
│  hooks.ts    useReveal (entry anims)  useNearest/svgX (tooltips)       │
└───────────────┬────────────────────────────────────────────────────────┘
                │  plain function calls, plain data back
┌───────────────▼────────────────────────────────────────────────────────┐
│  ENGINE  (src/engine/ — pure TypeScript, no React/DOM, 143 tests)      │
│                                                                        │
│   types.ts ◄──────────── everyone (State shape, CATEGORIES, defaults)  │
│   format.ts ◄─────────── everyone (fmt, dates — LOCAL calendar)        │
│                                                                        │
│   stats.ts    derive(state, now)          → Derived   (the big one)    │
│               deriveMonthView(state, ym)  → MonthView (browse history) │
│               monthAggregates(state, ym)  → shared month core          │
│      ├── fire.ts         deriveFire()     → FIRE/Coast/projections     │
│      └── commitments.ts  deriveCommitments(), nextDueDate(), …         │
│   trends.ts   monthRange(), monthlyTrends() → Seasons + nav bounds     │
│   advice.ts   buildAdvice(state, derived) → prioritized Tip[]          │
│   state.ts    emptyState, sampleState, migrate, serialize, bumpStreak  │
│   backup.ts   buildBackup(), parseBackup() → seed-vault envelope       │
│   storage.ts  createStore() → three-tier adapter (below)               │
└───────────────┬────────────────────────────────────────────────────────┘
                │  one JSON string, key "money-garden:state-v1"
┌───────────────▼────────────────────────────────────────────────────────┐
│  STORAGE  (per-call fallback; active tier disclosed in the footer)     │
│     platform storage (injected host iface, e.g. future native shell)   │
│       → browser localStorage                                           │
│         → in-memory (session only — UI toasts a warning once)          │
└────────────────────────────────────────────────────────────────────────┘
```

## The two data flows

**Write path** (every user action): tab component calls a handler in
`App.tsx` → handler builds the next `State` immutably (stamping ids/dates via
`format.ts`, advancing the streak via `bumpStreak`) → `setStateSafe(next)`
sets React state *and* persists `serialize(next)` through the storage
adapter. There is exactly one writer; components never touch storage.

**Read path** (every render): `App.tsx` derives everything from `state` in
`useMemo`s — `derive(state)` for "today" (monthly stats, health, FIRE,
commitments), `deriveMonthView(state, viewYm)` when browsing a past month,
`monthRange`/`monthlyTrends` for navigation bounds and Seasons. Tabs receive
plain data (`d`, `view`, callbacks) and render it; `MonthView`'s field names
mirror `Derived`'s so tabs read `view ?? d`.

On load: `store.get(key)` → `deserialize` = `JSON.parse` + `migrate()`
(fills missing fields from defaults, **never drops unknown fields**). Backup
import runs the same `migrate()` — one migration path for both doors.

## Engine module dependencies (arrows = imports)

```
types ◄── format ◄── commitments ◄── stats ◄── trends
  ▲          ▲            ▲            ▲
  │          │            │            └── advice   (also ← commitments, format)
  │          │            └── fire ◄── stats
  │          └── state ◄── backup
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

## Build targets (both from the same source)

| Target | Command | Output |
|---|---|---|
| Hosted PWA | `npm run build` | `dist/` — hashed assets + `manifest.webmanifest` + `sw.js` (generated at build time by an inline Vite plugin with the precache list baked in; cache-first assets, network-first navigations) |
| Single file | `npm run build:single` | `dist-single/money-garden.html` — everything inlined (JS, CSS, fonts as data URIs), PWA tags stripped, `__SINGLE_FILE__` define skips SW registration; runs from `file://` |

Fonts (Fraunces + DM Sans, variable woff2) are self-hosted in
`src/assets/fonts/` — the app makes **zero** network requests at runtime.

## Where things would grow next

- **Meridian** (second frontend): consume `src/engine/` as-is; nothing in it
  knows about the garden metaphor except advice copy.
- **Debt tracking / net worth** (roadmap 6, 9): new engine modules beside
  `fire.ts`; `advice.ts` gains rules; schema change → extend `migrate()` and
  bump the backup `SCHEMA_VERSION` only if the envelope itself changes.
- **Native (Expo)**: implement the `PlatformStorage` interface in
  `storage.ts` — the adapter's first tier exists exactly for this.
