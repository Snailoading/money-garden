/// <reference types="vitest/config" />
import { createHash } from "node:crypto";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/*
 * Hand-rolled service worker (no Workbox — keep the dependency tree small and
 * auditable). At build time we know every hashed asset filename, so this
 * plugin emits sw.js with the precache list baked in:
 * - install: cache the app shell + all assets, then activate immediately
 * - activate: drop caches from older builds
 * - fetch: cache-first for hashed assets (immutable by construction);
 *   network-first for navigations so new deploys arrive, falling back to the
 *   cached shell when offline
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
      const version = createHash("sha256").update(JSON.stringify(precache)).digest("hex").slice(0, 12);
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: `/* Money Garden service worker — generated at build time. */
const CACHE = "money-garden-${version}";
const PRECACHE = ${JSON.stringify(precache, null, 2)};

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("./", copy));
          return res;
        })
        .catch(() => caches.match("./", { ignoreVary: true }))
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
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
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
