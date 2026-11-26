/** Portable original bytes for a single installed npm graph. Native location and
 * range semantics are owned by release-consumer-resolution and the selected npm. */
import assert from "node:assert/strict";
import { jsonEquals } from "./canonical-json.mjs";
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  captureConsumerResolution,
  replayConsumerResolution,
} from "./release-consumer-resolution.mjs";
import { isStrictDescendantPath, sha256Buffer } from "./release-file-utils.mjs";

const decode = (bytes) =>
  new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);

/** Seed one empty consumer using a relative locator so its original lock can be disclosed and replayed. */
export function prepareTarballConsumer(
  directory,
  tarballPath,
  dependencyName,
  manifest,
) {
  copyFileSync(tarballPath, join(directory, "candidate.tgz"));
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify(
      { ...manifest, dependencies: { [dependencyName]: "file:candidate.tgz" } },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
}

/** Seed an admitted local-tarball consumer with its unchanged original bytes. */
export function prepareReplayedTarballConsumer(directory, tarball, evidence) {
  const { manifest, lock, resolution } = evidence;
  assert.equal(
    sha256Buffer(tarball),
    resolution.tarballSha256,
    "Replayed original tarball changed",
  );
  assert.equal(
    sha256Buffer(Buffer.from(manifest)),
    resolution.manifestSha256,
    "Replayed original manifest changed",
  );
  assert.equal(
    sha256Buffer(Buffer.from(lock)),
    resolution.lockSha256,
    "Replayed original lock changed",
  );
  assert.deepEqual(JSON.parse(manifest).dependencies, {
    [resolution.dependencyName]: "file:candidate.tgz",
  });
  writeFileSync(join(directory, "candidate.tgz"), tarball, { flag: "wx" });
  writeFileSync(join(directory, "package.json"), manifest, { flag: "wx" });
  writeFileSync(join(directory, "package-lock.json"), lock, { flag: "wx" });
}

/** Capture the native originals in the same directory as the package being exercised. */
export async function captureResolutionEvidence(directory, options) {
  const resolution = await captureConsumerResolution(directory, options);
  const manifest = readFileSync(join(directory, "package.json")),
    lock = readFileSync(join(directory, "package-lock.json"));
  assert.equal(sha256Buffer(manifest), resolution.manifestSha256);
  assert.equal(sha256Buffer(lock), resolution.lockSha256);
  return {
    schemaVersion: 1,
    manifest: decode(manifest),
    lock: decode(lock),
    resolution,
  };
}

/** Require the eligible graph and installed first-party payload to survive the product tests. */
export async function verifyTestedConsumerResolution(
  directory,
  options,
  expected,
) {
  const tested = await captureConsumerResolution(directory, options);
  assert.ok(
    jsonEquals(tested, expected),
    "Installed consumer changed during its qualification tests",
  );
}

/** Reopen only the fixed manifest/lock pair. Replay performs no installation or registry reads. */
export async function verifyResolutionEvidence(evidence, options) {
  assert.deepEqual(Object.keys(evidence).sort(), [
    "lock",
    "manifest",
    "resolution",
    "schemaVersion",
  ]);
  assert.equal(evidence.schemaVersion, 1);
  for (const key of ["lock", "manifest"])
    assert.equal(typeof evidence[key], "string");
  const directory = mkdtempSync(join(tmpdir(), "owlapi-native-lock-"));
  assert.ok(isStrictDescendantPath(tmpdir(), directory));
  try {
    writeFileSync(join(directory, "package.json"), evidence.manifest, {
      flag: "wx",
    });
    writeFileSync(join(directory, "package-lock.json"), evidence.lock, {
      flag: "wx",
    });
    await replayConsumerResolution(directory, options, evidence.resolution);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  return evidence.resolution;
}
