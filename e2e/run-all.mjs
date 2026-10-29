// Run every browser suite against fresh builds and print one summary.
//   npm test                               build both targets, run all (Chromium)
//   npm test -- --no-build                 reuse the existing dist/ and dist-single/
//   npm test -- --engines=webkit,firefox   ALSO run the CSP suite in those engines
//   npm test -- multi-tab csp              run only the named suites
//   E2E_SHOTS=/some/folder npm test        save screenshots there (off by default)
// Exits non-zero if any check fails, so it can gate a commit (or CI, later).
import { execSync, spawnSync } from "node:child_process";
import { REPO } from "./paths.mjs";

const SUITES = ["data-safety", "multi-tab", "midnight", "backup-reminder", "theme-flash", "withdrawal-rate", "csp", "header-pills"];

const args = process.argv.slice(2);
const build = !args.includes("--no-build");
const extraEngines = (args.find((a) => a.startsWith("--engines="))?.split("=")[1] ?? "")
  .split(",").filter((e) => e && e !== "chromium");
const only = args.filter((a) => !a.startsWith("--"));
const unknown = only.filter((s) => !SUITES.includes(s));
if (unknown.length) {
  console.error(`Unknown suite(s): ${unknown.join(", ")}. Known: ${SUITES.join(", ")}`);
  process.exit(2);
}

if (build) {
  console.log("Building dist/ and dist-single/ …");
  try {
    execSync("npm run build && npm run build:single", { cwd: REPO, stdio: "pipe" });
  } catch (e) {
    // Show the real reason (a type error, a failing plugin…), then stop.
    console.error(String(e.stdout ?? "") + String(e.stderr ?? ""));
    console.error("Build failed — no suites were run.");
    process.exit(1);
  }
}

// Each run: [label, suite file, extra args]. CSP repeats per extra engine.
const runs = [];
for (const s of only.length ? only : SUITES) {
  runs.push([s, s, []]);
  if (s === "csp") for (const e of extraEngines) runs.push([`csp (${e})`, s, ["enforced", e]]);
}

let failed = 0;
const rows = [];
for (const [label, file, extra] of runs) {
  const t = Date.now();
  // Suites print one "PASS|FAIL|ERROR  name" line per check.
  // A hung suite must not hang the whole run: 5 minutes each, then it fails.
  const r = spawnSync("node", [`${file}.mjs`, ...extra], { cwd: new URL(".", import.meta.url), encoding: "utf8", timeout: 300_000 });
  const lines = (r.stdout ?? "").split("\n");
  const pass = lines.filter((l) => l.startsWith("PASS")).length;
  const bad = lines.filter((l) => /^(FAIL|ERROR)/.test(l));
  // No checks at all, a crash, or a timeout counts as a failure — never a silent pass.
  const ok = !bad.length && pass > 0 && r.status === 0;
  if (!ok) failed++;
  rows.push(`${ok ? "✓" : "✗"} ${label.padEnd(18)} ${String(pass).padStart(3)} passed${bad.length ? `, ${bad.length} failed` : ""}  (${((Date.now() - t) / 1000).toFixed(0)}s)`);
  for (const l of bad) rows.push(`    ${l.slice(0, 200)}`);
  if (!bad.length && !ok) {
    // A Node crash prints the file:line first; the line naming the Error says why.
    const errLines = (r.stderr ?? "").trim().split("\n");
    const errLine = errLines.find((l) => /Error/.test(l)) ?? errLines[0];
    const why = r.error?.code === "ETIMEDOUT" ? "timed out after 5 minutes" : errLine?.slice(0, 160) || `exit code ${r.status}`;
    rows.push(`    (${pass === 0 ? "no checks reported" : "crashed after its checks"}: ${why})`);
  }
}
console.log(rows.join("\n"));
console.log(failed ? `\n${failed} suite(s) failed.` : "\nAll suites passed.");
process.exit(failed ? 1 : 0);
