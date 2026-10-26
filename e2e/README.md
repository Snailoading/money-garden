# Browser checks (e2e)

These scripts open the **real built app** in a headless browser and use it
like a person would — tap buttons, type amounts, switch tabs, open two tabs,
download and import backups — checking that the screens are wired to the
logic correctly. The app's own unit tests (`npm test` in the project root)
check the logic itself; these check what the unit tests can't see.

They live in their own folder with their own `package.json` on purpose: the
app's dependencies stay small, and the GitHub deploy never installs or runs
them.

## Running

Needs Node 20+ and `python3` on your PATH (the suites serve the build with
`server.py`).

```sh
cd e2e
npm install          # once — installs Playwright here (e2e/node_modules),
                     # like a virtualenv that only this folder uses
npm test             # builds dist/ + dist-single/, runs every suite
node csp.mjs         # or run one suite directly
```

Playwright's browsers live outside the project (on a Mac, in
`~/Library/Caches/ms-playwright`). If they're missing:
`npx playwright install chromium` (add `webkit firefox` for cross-browser runs).

Options (after `npm test --`; the `--` passes them through to the script):

| Option | Effect |
|---|---|
| `--no-build` | reuse the existing builds |
| `--engines=webkit,firefox` | also run the CSP suite in Safari's and Firefox's engines |
| `multi-tab csp` | run only the named suites |

Screenshots are **off** by default — the checks decide pass or fail, and
the project never stores images. To look at the screens, give a run a
folder: `E2E_SHOTS=/some/folder npm test`.

Every suite prints one `PASS` / `FAIL` / `ERROR` line per check and exits
non-zero if any check failed. `run-all.mjs` sums them up and exits non-zero
if anything failed — a suite that crashes, times out (5 minutes) or reports
no checks at all counts as failed.

## The suites

| Suite | Guards | Since |
|---|---|---|
| `multi-tab` | two open tabs follow each other's saves; never echo; drafts kept; damaged data → Recovery; a tab that can't save keeps its own garden | v0.18.1 |
| `midnight` | "today" turns over at midnight (timer, wake-up, once-a-minute net); the Log's date follows; picked dates stay | v0.18.1 |
| `backup-reminder` | the shed's backup line: dates, the 14-day amber reminder, other tabs, restore, start fresh | v0.18.1 |
| `theme-flash` | no wrong-theme flash at startup, frame by frame; title-bar colour; toggle; dusk | v0.18.1–2 |
| `withdrawal-rate` | the FI tip names the user's own withdrawal rate | v0.18.2 |
| `csp` | the security policy: normal use has zero violations; injected scripts and every way to send data out are blocked — hosted and single-file | v0.18.2 |

Each suite serves `dist/` with `server.py` on its own fixed port. The server
answers `/__pid` with its process id, and the suite refuses to run unless
that matches the server it just started — a crashed earlier run can leave an
old server on the port, which once made results lie. `E2E_DIST` /
`E2E_SINGLE` point a suite at a different build (for control runs).

## Writing a new suite

Copy an existing one. Lessons learned the hard way:

- Close the browser in `finally` — an open browser keeps Node alive forever
  after a failed check.
- Use `exact: true` on button names ("Plant sample data" is inside
  "Replant sample data…"; "Save" is inside "Save backup").
- Wait for things (`waitFor`), never a bare `isVisible()` right after an
  action.
- Prove a check can fail: run it against a build without the feature, or
  with the feature broken. A check that can't fail proves nothing.
- Add the suite to `SUITES` in `run-all.mjs` and to the table above.
