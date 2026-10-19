import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { cspFor, inlineScriptHashes, withCsp } from "./csp";

const sha = (s: string) => `'sha256-${createHash("sha256").update(s, "utf8").digest("base64")}'`;

const page = (head: string, body = "") =>
  `<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="UTF-8" />\n  <title>t</title>\n${head}\n</head>\n<body>${body}</body>\n</html>\n`;

describe("inlineScriptHashes — what the browser will hash", () => {
  it("hashes each inline script's exact text, whitespace included", () => {
    const a = "\n    var x = 1;\n  ";
    const b = "console.log('two')";
    expect(inlineScriptHashes(page(`<script>${a}</script>`, `<script type="module" crossorigin>${b}</script>`))).toEqual([sha(a), sha(b)]);
  });

  it("skips scripts loaded from a file (src=) — 'self' covers those", () => {
    expect(inlineScriptHashes(page(`<script type="module" crossorigin src="./assets/index-x.js"></script>`))).toEqual([]);
  });

  it("hashes CRLF text as the browser does — after normalizing line endings to \\n", () => {
    // The HTML parser turns \r\n and lone \r into \n before the script
    // exists; a Windows (CRLF) checkout must still produce the right hash.
    const lf = "\n    var x = 1;\n    var y = 2;\n  ";
    expect(inlineScriptHashes(page(`<script>${lf.replace(/\n/g, "\r\n")}</script>`))).toEqual([sha(lf)]);
    expect(inlineScriptHashes(page(`<script>${lf.replace(/\n/g, "\r")}</script>`))).toEqual([sha(lf)]);
  });

  it("knows src= from data-src=, and odd-but-valid closing tags", () => {
    expect(inlineScriptHashes(page(`<script data-src="x">a()</script>`))).toEqual([sha("a()")]);
    expect(inlineScriptHashes(page(`<script>b()</script >`))).toEqual([sha("b()")]);
    expect(inlineScriptHashes(page(`<script>c()</SCRIPT>`))).toEqual([sha("c()")]);
  });

  it("ends a script at the first </script>, like the HTML parser (text '<script>' inside is fine)", () => {
    const body = `var s = "<script>"; var t = "<\\/script>";`;
    expect(inlineScriptHashes(page(`<script>${body}</script>`))).toEqual([sha(body)]);
  });
});

describe("cspFor — the policy for each build", () => {
  const directives = (p: string) => Object.fromEntries(p.split(";").map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));

  it("hosted: nothing by default, no network connections, scripts only from this site or by hash", () => {
    const d = directives(cspFor("hosted", ["'sha256-AAA='"]));
    expect(d["default-src"]).toEqual(["'none'"]);
    expect(d["connect-src"]).toEqual(["'none'"]);
    expect(d["script-src"]).toEqual(["'self'", "'sha256-AAA='"]);
    expect(d["style-src"]).toEqual(["'self'", "'unsafe-inline'"]);
    expect(d["img-src"]).toEqual(["'self'", "data:"]);
    expect(d["font-src"]).toEqual(["'self'"]);
    expect(d["manifest-src"]).toEqual(["'self'"]);
    expect(d["worker-src"]).toEqual(["'self'"]);
    expect(d["base-uri"]).toEqual(["'none'"]);
    expect(d["form-action"]).toEqual(["'none'"]);
    // Never these: they would re-open exactly what the policy exists to close.
    expect(cspFor("hosted", [])).not.toMatch(/unsafe-eval|script-src[^;]*unsafe-inline|\*/);
  });

  it("single file: everything is inline, so no 'self' at all (file:// has no real origin)", () => {
    const p = cspFor("single", ["'sha256-AAA='", "'sha256-BBB='"]);
    const d = directives(p);
    expect(d["script-src"]).toEqual(["'sha256-AAA='", "'sha256-BBB='"]);
    expect(d["style-src"]).toEqual(["'unsafe-inline'"]);
    expect(d["img-src"]).toEqual(["data:"]);
    expect(d["font-src"]).toEqual(["data:"]);
    expect(d["connect-src"]).toEqual(["'none'"]);
    expect(p).not.toContain("'self'");
    expect(p).not.toMatch(/unsafe-eval|script-src[^;]*unsafe-inline/);
  });

  it("refuses to build a script policy with no scripts allowed (that page couldn't run)", () => {
    expect(() => cspFor("single", [])).toThrow(/no inline scripts/i);
  });
});

describe("withCsp — injecting the policy", () => {
  const boot = "\n    document.documentElement.dataset.theme = 'day';\n  ";
  const html = page(`  <script>${boot}</script>`, `<script type="module" crossorigin src="./assets/a.js"></script>`);

  it("puts the meta tag right after <meta charset>, before any script (a CSP meta only governs what follows it)", () => {
    const out = withCsp(html, "hosted");
    const meta = out.indexOf('<meta http-equiv="Content-Security-Policy"');
    expect(meta).toBeGreaterThan(out.indexOf("<meta charset"));
    expect(meta).toBeLessThan(out.indexOf("<script"));
  });

  it("allows exactly the page's own inline scripts, by hash", () => {
    const out = withCsp(html, "hosted");
    const content = out.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/)![1];
    expect(content).toBe(cspFor("hosted", [sha(boot)]));
  });

  it("changes nothing else in the page", () => {
    const out = withCsp(html, "hosted");
    expect(out.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/, "")).toBe(html);
  });

  it("fails the build loudly if there's no <meta charset> to anchor on (never ship silently without CSP)", () => {
    expect(() => withCsp("<html><head></head><body><script>1</script></body></html>", "hosted")).toThrow(/charset/);
  });

  it("refuses a page that already carries a CSP (two policies would both apply)", () => {
    const twice = withCsp(html, "hosted");
    expect(() => withCsp(twice, "hosted")).toThrow(/already/i);
  });
});
