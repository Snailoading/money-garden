/*
 * Content Security Policy — build-time only.
 *
 * A CSP is a rule the page hands the browser: run only these scripts, load
 * only from these places, contact nothing. Money Garden makes no network
 * calls, so the policy says exactly that (`connect-src 'none'`): nothing can
 * be fetched, beaconed or loaded from anywhere else, and no injected script
 * can run at all — the "local-first" promise, enforced by the browser rather
 * than by care alone. (One thing no CSP can restrict: navigating the page
 * itself away. Only code already allowed to run could try that.)
 *
 * Injected into the FINISHED html of each build (never the source, never
 * the dev server — Vite's live reload needs connections and inline scripts),
 * with the inline scripts' sha256 hashes computed from the exact final text.
 * Hand-pasting a hash would silently break on any edit to the boot script,
 * even a comment. Build tooling, not app code — the engine never sees this.
 */
import { createHash } from "node:crypto";
import type { Plugin } from "vite";

export type CspKind = "hosted" | "single";

/**
 * The CSP source for every inline <script> (no src=) — sha256 of its text,
 * the way the browser computes it:
 * - a script ends at the first `</script` followed by space, `/` or `>`, as
 *   in the HTML parser (bundled code escapes it inside strings);
 * - line endings are normalized to \n first — the parser does that before
 *   the script exists, so a CRLF checkout (Windows) must hash the same.
 */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script(?=[\s/>])[^>]*>/gi)) {
    if (/(?:^|\s)src\s*=/i.test(m[1])) continue; // loaded from a file: 'self' covers it (data-src= doesn't count)
    const text = m[2].replace(/\r\n?/g, "\n");
    hashes.push(`'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`);
  }
  return hashes;
}

/**
 * The policy text. `default-src 'none'` closes everything; each line opens
 * only what the app uses:
 * - scripts: our own bundle (hosted) + the inline ones by hash. Never
 *   'unsafe-inline' or 'unsafe-eval' for scripts — those reopen injection.
 * - styles: 'unsafe-inline' for the inline <style> blocks (the splash; the
 *   single file's whole stylesheet). React's style={…} props go through the
 *   DOM style API, which CSP doesn't govern. Styles can't run code, and
 *   img-src/font-src/connect-src below stop CSS from phoning home.
 * - connect-src 'none': no fetch/XHR/WebSocket/beacon, to anywhere.
 * - base-uri/form-action 'none': no rewriting relative links, no form posts.
 * The single file runs from file:// (no real origin), so it gets no 'self'
 * at all — everything it needs is inline or a data: URI.
 */
export function cspFor(kind: CspKind, scriptHashes: string[]): string {
  if (kind === "single" && scriptHashes.length === 0) {
    throw new Error("CSP: the single-file build has no inline scripts to allow — it couldn't run.");
  }
  const self = kind === "hosted" ? ["'self'"] : [];
  const directives: [string, ...string[]][] = [
    ["default-src", "'none'"],
    ["script-src", ...self, ...scriptHashes],
    ["style-src", ...self, "'unsafe-inline'"],
    ["img-src", ...self, "data:"],
    ["font-src", ...(kind === "hosted" ? ["'self'"] : ["data:"])],
    ...(kind === "hosted"
      ? ([["manifest-src", "'self'"], ["worker-src", "'self'"]] as [string, ...string[]][])
      : []),
    ["connect-src", "'none'"],
    ["base-uri", "'none'"],
    ["form-action", "'none'"],
  ];
  return directives.map((d) => d.join(" ")).join("; ");
}

/** The page with its CSP meta tag placed right after <meta charset> — a CSP
 * meta only governs what comes AFTER it, so it must precede every script. */
export function withCsp(html: string, kind: CspKind): string {
  if (/http-equiv=["']Content-Security-Policy["']/i.test(html)) {
    throw new Error("CSP: this page already has a Content-Security-Policy meta tag.");
  }
  const charset = html.match(/<meta charset[^>]*>/i);
  if (!charset || charset.index === undefined) {
    throw new Error("CSP: no <meta charset> to place the policy after — refusing to ship without one.");
  }
  const end = charset.index + charset[0].length;
  const tag = `\n  <meta http-equiv="Content-Security-Policy" content="${cspFor(kind, inlineScriptHashes(html))}" />`;
  return html.slice(0, end) + tag + html.slice(end);
}

/**
 * Vite plugin: add the CSP to every .html the build emits. enforce "post"
 * and listed LAST in the plugin array, so it runs after the single-file
 * plugin has inlined the bundle (whose hash it then includes).
 */
export function cspPlugin(kind: CspKind): Plugin {
  return {
    name: "money-garden-csp",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === "asset" && file.fileName.endsWith(".html")) {
          file.source = withCsp(String(file.source), kind);
        }
      }
    },
  };
}
