/*
 * `npm run build:single` — one self-contained HTML file for direct sharing.
 * Everything (JS, CSS, fonts, favicon) is inlined; PWA bits (manifest link,
 * apple-touch-icon, service worker) are stripped because they only make sense
 * on a hosted origin. The file runs from file:// with the storage adapter
 * falling back to localStorage exactly like the original reference app.
 */
import { rename } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { cspPlugin } from "./tooling/csp.ts";

function singleFileOutput(): Plugin {
  return {
    name: "money-garden-single-file-output",
    transformIndexHtml(html) {
      // Hosted-only tags have no meaning in a local file.
      return html
        .replace(/\s*<link rel="manifest"[^>]*>/, "")
        .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, "");
    },
    async closeBundle() {
      // ESM config — no __dirname; vite build runs from the project root.
      await rename(
        resolve("dist-single/index.html"),
        resolve("dist-single/money-garden.html"),
      );
    },
  };
}

export default defineConfig({
  // cspPlugin last, after viteSingleFile has inlined the bundle: the policy
  // allows the inlined scripts by their exact hashes.
  plugins: [react(), viteSingleFile(), singleFileOutput(), cspPlugin("single")],
  // Don't copy public/ (manifest, icons, hosted favicon) into the single file's dir.
  publicDir: false,
  define: {
    __SINGLE_FILE__: "true",
  },
  build: {
    outDir: "dist-single",
    // Inline every asset (fonts included) as data: URIs.
    assetsInlineLimit: 100_000_000,
  },
});
