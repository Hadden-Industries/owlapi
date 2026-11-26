import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

/** Read bounded policy or qualification bytes from an independently selected local Git object. */
export function readControllerBlob(commit, path) {
  assert.match(commit, /^[a-f0-9]{40}$/u);
  assert.ok(
    typeof path === "string" &&
      /^[a-zA-Z0-9._/-]+$/u.test(path) &&
      !path.split("/").some((part) => !part || part === ".." || part === "."),
  );
  return execFileSync(
    "git",
    ["--no-lazy-fetch", "cat-file", "blob", commit + ":" + path],
    {
      cwd: new URL("../", import.meta.url),
      windowsHide: true,
      timeout: 10000,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
}
