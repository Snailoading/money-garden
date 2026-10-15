/*
 * Hand the user a text file to keep (backups, rescued raw data).
 * The browser-only half of the backup feature — the engine builds the
 * content, this saves it.
 */

/** How long the temporary file URL stays valid. Revoking it in the same
 * tick as click() can cancel the download in some Safari builds; a
 * generous delay (FileSaver.js uses 40s) costs nothing but a little memory. */
const REVOKE_AFTER_MS = 40_000;

export function downloadText(filename: string, text: string, type = "application/json"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}
