/** Read the admitted source's canonical inventory and selected evidence blobs. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const repository = new URL("../", import.meta.url);
const metadata = new Set([
  "package-lock.json",
  "docs/provenance/npm-package-evidence.json",
  "docs/provenance/third-party-material.json",
]);
const blobPath =
  /^docs\/provenance\/evidence\/npm\/blobs\/sha256\/[a-f0-9]{2}\/[a-f0-9]{64}$/u;
const maximumBlobBytes = 64 * 1024 * 1024;

/** The caller independently authenticates the commit. No lookup falls back to
 * the checkout or downloads an archive that should already belong to Git. */
export function readCanonicalMaterialFromGit(commit) {
  assert.match(commit, /^[a-f0-9]{40}$/u);
  return (path, maximum) => {
    assert.ok(
      metadata.has(path) || blobPath.test(path),
      "Unexpected canonical material source path",
    );
    assert.ok(
      Number.isSafeInteger(maximum) &&
        maximum >= 0 &&
        maximum <= maximumBlobBytes,
    );
    try {
      const bytes = execFileSync(
        "git",
        [
          "--no-replace-objects",
          "--no-lazy-fetch",
          "cat-file",
          "blob",
          `${commit}:${path}`,
        ],
        {
          cwd: repository,
          maxBuffer: Math.max(1024, maximum),
          timeout: 30_000,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      assert.ok(bytes.length <= maximum);
      return bytes;
    } catch (error) {
      throw new Error(
        `Canonical recipient material is unavailable or oversized at ${commit}:${path}`,
        { cause: error },
      );
    }
  };
}
