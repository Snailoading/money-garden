// Where the suites find things, relative to this folder — so they run from
// any checkout. `SP` is this e2e/ folder (home of server.py; the name is
// left over from the scratchpad the suites were first written in).
// E2E_DIST / E2E_SINGLE point a suite at another build (e.g. a control
// build without some feature, to prove a check really detects it).
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const SP = fileURLToPath(new URL(".", import.meta.url)).replace(/\/$/, "");
export const REPO = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
export const DIST = process.env.E2E_DIST ?? `${REPO}/dist`;
export const SINGLE = process.env.E2E_SINGLE ?? `${REPO}/dist-single/money-garden.html`;

// Screenshots are OFF unless a run is given a folder for them:
//   E2E_SHOTS=/path/to/folder npm test
// (Claude points it at its session scratchpad when it needs to look at the
// screens.) The checks decide pass/fail; the project never stores images.
export const SHOTS = process.env.E2E_SHOTS || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

/** Screenshot a page or element as <name>.png — a no-op unless E2E_SHOTS is set. */
export async function shot(target, name, options = {}) {
  if (!SHOTS) return;
  await target.screenshot({ path: `${SHOTS}/${name}.png`, ...options });
}
