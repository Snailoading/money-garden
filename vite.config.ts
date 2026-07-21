/// <reference types="vitest/config" />
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/*
 * Hand-rolled service worker (no Workbox — keep the dependency tree small and
 * auditable). At build time we know every hashed asset filename, so this
 * plugin emits sw.js with the precache list baked in:
 * - install: cache the app shell + all assets, then activate immediately
 * - activate: drop caches from older builds
 * - fetch: cache-first for hashed assets (immutable by construction);
 *   network-first with a short timeout for navigations so new deploys arrive
 *   while lie-fi cold starts fall back to the cached shell quickly (offline
 *   falls back too, via fetch rejection)
 */
function serviceWorkerPlugin(): Plugin {
  return {
    name: "money-garden-sw",
    apply: "build",
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle).filter((f) => !f.endsWith(".map") && f !== "sw.js");
      const precache = [
        "./",
        ...assets.map((f) => "./" + f),
        "./manifest.webmanifest",
        "./icons/money-garden-icon-180.png",
        "./icons/money-garden-icon-192.png",
        "./icons/money-garden-icon-512.png",
        "./icons/money-garden-icon-maskable-512.png",
        "./icons/money-garden-icon.svg",
      ];
      // Version = hash of the precache NAME list PLUS the bytes of every entry
      // that isn't content-hashed (index.html, manifest, icons). The JS/CSS/
      // fonts self-invalidate through their hashed filenames; the fixed-name
      // files would otherwise serve stale forever after a content-only change
      // (a regenerated icon, a tweaked theme_color), so fold their bytes in
      // too. Read from source on disk — cwd is the project root at build time.
      const versionHash = createHash("sha256").update(JSON.stringify(precache));
      for (const entry of precache) {
        const rel = entry.replace(/^\.\//, "");
        if (rel.startsWith("assets/")) continue; // already content-hashed by name
        const src = rel === "" ? "index.html" : "public/" + rel; // "./" → the HTML template
        try { versionHash.update(readFileSync(src)); } catch { /* missing → names still cover it */ }
      }
      const version = versionHash.digest("hex").slice(0, 12);
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: `/* Money Garden service worker — generated at build time. */
const CACHE = "money-garden-${version}";
// How long a navigation waits on the network before the precached shell
// serves instead — long enough for a normal online round-trip, short enough
// that lie-fi cold starts stay usable.
const NAV_TIMEOUT_MS = 2000;
const PRECACHE = ${JSON.stringify(precache, null, 2)};

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      // Prefix-scoped: caches.keys() is per-ORIGIN, and on github.io every
      // project shares one origin — a bare "!== CACHE" filter would delete
      // OTHER apps' caches. Only prune our own older versions.
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("money-garden-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  if (req.mode === "navigate") {
    // Network-first WITH a timeout, and NO write-back. Fully offline, fetch
    // rejects fast and the cached shell serves — but on "lie-fi" (connected,
    // barely transferring) a plain network-first hangs the cold start for as
    // long as the browser is willing to wait. After NAV_TIMEOUT_MS we serve
    // the precached shell instead; genuinely online loads answer well inside
    // it, so deploys still arrive promptly (no version skew: the shell and
    // its hashed assets come from the same coherent precache).
    // No write-back for the same reason as v0.14.3: the shell is precached
    // at install; a live navigation response written into the cache could
    // pair new HTML with old assets or store a captive-portal page.
    e.respondWith(
      (async () => {
        const network = fetch(req);
        // Swallow a late rejection when we've already answered from cache —
        // an unhandled promise rejection, not a real failure. (Attaching
        // .catch() here doesn't consume the promise for the await below.)
        network.catch(() => {});
        try {
          const res = await Promise.race([
            network,
            new Promise((resolve) => setTimeout(() => resolve(null), NAV_TIMEOUT_MS)),
          ]);
          if (res) return res;
        } catch { /* offline / DNS failure — fall through to the shell */ }
        const shell = await caches.match("./", { ignoreVary: true });
        // No cached shell (e.g. storage was cleared): the slow network is
        // still the only hope — hand the in-flight fetch back to the page.
        return shell || network;
      })()
    );
    return;
  }
  // ignoreVary: hosts often serve assets with "Vary: Origin", and module
  // scripts request with CORS (an Origin header) while the precache fetches
  // did not — without this the cache would never match those entries.
  e.respondWith(
    caches.match(req, { ignoreVary: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          // Cache only real successes. fetch RESOLVES on 404/500, so an
          // unguarded put would store an error under a hashed key and then
          // serve it as a permanent cache hit (self-poisoning).
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
`,
      });
    },
  };
}

export default defineConfig({
  // Relative base so the hosted build works from any subpath (GitHub Pages etc.).
  base: "./",
  plugins: [react(), serviceWorkerPlugin()],
  define: {
    __SINGLE_FILE__: "false",
  },
  test: {
    // Engine tests are pure functions — plain Node, no browser DOM emulation needed.
    environment: "node",
  },
});
