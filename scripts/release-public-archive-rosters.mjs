/** Recover the public proof rosters from independently admitted publication inputs. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { assertPackageIdentity } from "./package-identity.mjs";
import { readGzipTarEntries } from "./release-artifacts.mjs";
import { readControllerBlob } from "./release-controller-blob.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";

const utf8 = new TextDecoder("utf-8", { fatal: true });
const exportSubpath = /^\.\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/u;
const fixtureScript = /^installed-[a-z0-9-]+\.mjs$/u;

/** Return sorted explicit export subpaths from the immutable package bytes. */
export function readArchivedPublicExportSubpaths(tarball, input) {
  assert.equal(sha256Buffer(tarball), input.tarballSha256);
  assert.equal(
    "sha512-" + createHash("sha512").update(tarball).digest("base64"),
    input.integrity,
    "Archived registry SRI differs from the immutable tarball",
  );
  const entries = readGzipTarEntries(tarball);
  const files = new Map(entries.map(({ path, content }) => [path, content]));
  assert.equal(files.size, entries.length, "Duplicate package archive member");
  const manifest = JSON.parse(utf8.decode(files.get("package.json")));
  assertPackageIdentity(manifest, input.package.version);
  const declared = manifest.exports;
  assert.ok(
    declared && typeof declared === "object" && Object.hasOwn(declared, "."),
    "Archived package requires explicit exports",
  );
  return Object.entries(declared)
    .map(([key, target]) => {
      assert.ok(
        key === "." || exportSubpath.test(key),
        "Invalid archived export subpath",
      );
      const expected = key === "." ? "./index.js" : `${key}/index.js`;
      assert.equal(target, expected, "Invalid archived export target");
      assert.ok(files.has(target.slice(2)), "Missing archived export target");
      return key.slice(1);
    })
    .sort();
}

/** Return the producing controller's ordered fixture roster without executing its module. */
export function readArchivedInstalledTestScripts(controller) {
  const source = utf8.decode(
    readControllerBlob(controller, "scripts/installed-consumer-fixtures.mjs"),
  );
  // The original producers declare this roster as a literal frozen array. The
  // reader supports that declaration shape without interpreting historical JS.
  const declarations = [
    ...source.matchAll(
      /^export const INSTALLED_TEST_SCRIPTS = Object\.freeze\((\[[^\]]*\])\);$/gmu,
    ),
  ];
  assert.equal(
    declarations.length,
    1,
    "Missing or ambiguous original fixture roster",
  );
  const scripts = JSON.parse(declarations[0][1].replace(/,(\s*\])$/u, "$1"));
  assert.ok(
    scripts.length > 0 &&
      scripts.every(
        (name) => typeof name === "string" && fixtureScript.test(name),
      ) &&
      new Set(scripts).size === scripts.length,
    "Invalid original fixture roster",
  );
  return scripts;
}
