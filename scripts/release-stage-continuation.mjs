/** Select the contract of an authenticated, already submitted npm stage. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { assertQualificationAdvisory } from "./qualification-advisory-binding.mjs";
import { readControllerBlob } from "./release-controller-blob.mjs";

const stageSource = "scripts/staged-release.mjs";
const oid = /^[a-f0-9]{40}$/u;
const mandatoryGuard =
  /assert\.equal\(\s*manifest\.consumerResolutionPolicy,\s*2,\s*"New stage requires the current consumer reconciliation policy",?\s*\)/u;
const stageAdmission = /const advisory\s*=\s*await verifyNewStageAdvisories\(/u;

function legacyStageHistory(controller, localRepository) {
  assert.match(controller, oid);
  const git = (...args) =>
    execFileSync("git", ["--no-replace-objects", "--no-lazy-fetch", ...args], {
      cwd: localRepository,
      timeout: 10_000,
      windowsHide: true,
      stdio: "pipe",
      maxBuffer: 4 * 1024 * 1024,
      encoding: "utf8",
    }).trim();
  assert.equal(
    git("rev-parse", "--is-shallow-repository"),
    "false",
    "Original first-parent stage history requires a full checkout",
  );
  const history = git(
    "rev-list",
    "--first-parent",
    "--reverse",
    controller,
  ).split("\n");
  assert.equal(history.at(-1), controller);
  const hasMandatoryStage = (commit) => {
    const source = readControllerBlob(
      commit,
      stageSource,
      localRepository,
    ).toString("utf8");
    return mandatoryGuard.test(source) && stageAdmission.test(source);
  };
  // The first activation stays authoritative if later controllers refactor the guard.
  const stageChanges = git(
    "log",
    "--first-parent",
    "--full-history",
    "--reverse",
    "--format=%H",
    "--diff-filter=AM",
    controller,
    "--",
    stageSource,
  ).split("\n");
  const activation = stageChanges.find(hasMandatoryStage);
  const boundary = history.indexOf(activation);
  assert.ok(
    boundary >= 0,
    "Missing mandatory reconciliation activation on protected first-parent history",
  );
  return new Set(history.slice(0, boundary));
}

/** The caller supplies the native REQUESTED/STAGED journal receipt and the
 * original qualification, both already authenticated by their producing jobs. */
export function submittedStagePolicy(
  manifest,
  receipt,
  { controller, localRepository = new URL("../", import.meta.url) } = {},
) {
  assert.equal(receipt.state, "STAGED");
  assert.equal(receipt.commit, manifest.commit);
  if (manifest.consumerResolutionPolicy === 2) {
    assertQualificationAdvisory(receipt.qualificationAdvisory);
    return 2;
  }
  assert.equal(manifest.consumerResolutionPolicy, undefined);
  assert.equal(receipt.qualificationAdvisory, undefined);
  try {
    const originals = legacyStageHistory(controller, localRepository);
    assert.ok(
      originals.has(manifest.commit) &&
        originals.has(receipt.controller ?? receipt.commit),
    );
  } catch (error) {
    throw new Error(
      "Only an original pre-reconciliation stage can continue under the legacy contract",
      { cause: error },
    );
  }
  return 1;
}
