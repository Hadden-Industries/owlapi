/** Select the contract of an authenticated, already submitted npm stage. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { assertQualificationAdvisory } from "./qualification-advisory-binding.mjs";

// Last Git revision before the protected Stage and qualification began
// requiring consumer-resolution policy 2. A later controller cannot opt out.
const lastLegacyStageController = "42062f3b2d0dfca622437e5f0d7317389c75477e";

function beforeReconciliation(commit) {
  assert.match(commit, /^[a-f0-9]{40}$/u);
  execFileSync(
    "git",
    [
      "--no-replace-objects",
      "--no-lazy-fetch",
      "merge-base",
      "--is-ancestor",
      commit,
      lastLegacyStageController,
    ],
    {
      cwd: new URL("../", import.meta.url),
      timeout: 10_000,
      windowsHide: true,
      stdio: "pipe",
    },
  );
}

/** The caller supplies the native REQUESTED/STAGED journal receipt and the
 * original qualification, both already authenticated by their producing jobs. */
export function submittedStagePolicy(manifest, receipt) {
  assert.equal(receipt.state, "STAGED");
  assert.equal(receipt.commit, manifest.commit);
  if (manifest.consumerResolutionPolicy === 2) {
    assertQualificationAdvisory(receipt.qualificationAdvisory);
    return 2;
  }
  assert.equal(manifest.consumerResolutionPolicy, undefined);
  assert.equal(receipt.qualificationAdvisory, undefined);
  try {
    beforeReconciliation(manifest.commit);
    beforeReconciliation(receipt.controller ?? receipt.commit);
  } catch (error) {
    throw new Error(
      "Only an original pre-reconciliation stage can continue under the legacy contract",
      { cause: error },
    );
  }
  return 1;
}
