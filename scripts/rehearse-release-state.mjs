import { pathToFileURL } from "node:url";

import {
  badReleaseActions,
  classifyReleaseState,
  requiredManualHandoffs,
} from "./release-state.mjs";

const digest = "a".repeat(64);

export const rehearseReleaseStates = () => {
  const scenarios = {
    pristineBootstrap: classifyReleaseState({
      canonicalTagExists: false,
      registryVersion: null,
      retainedSha256: digest,
    }),
    immutableTagWithoutPublication: classifyReleaseState({
      canonicalTagExists: true,
      registryVersion: null,
      retainedSha256: digest,
    }),
    exactArtifactReconciliation: classifyReleaseState({
      canonicalTagExists: true,
      registryVersion: null,
      retainedSha256: digest,
      reconciliation: {
        enabled: true,
        sourceCommit: "b".repeat(40),
        tagTargetCommit: "b".repeat(40),
        qualificationResult: "PASS",
        publicationPreflightResult: "PASS",
        candidateArtifactVerified: true,
        githubReleaseAbsent: true,
        reproducedSha256: digest,
      },
    }),
    reconciledExistingPublication: classifyReleaseState({
      canonicalTagExists: true,
      registryVersion: { tarballSha256: digest },
      retainedSha256: digest,
    }),
  };
  if (
    scenarios.pristineBootstrap.action !== "DIRECT_BOOTSTRAP_READY" ||
    scenarios.immutableTagWithoutPublication.action !==
      "ABANDON_TAGGED_VERSION" ||
    scenarios.exactArtifactReconciliation.action !==
      "RECONCILE_QUALIFIED_CANDIDATE" ||
    scenarios.reconciledExistingPublication.action !==
      "VERIFY_EXISTING_PUBLICATION"
  ) {
    throw new Error(
      "Release-state rehearsal did not reach its normative outcomes.",
    );
  }
  return {
    schemaVersion: 1,
    result: "PASS",
    scenarios,
    directBootstrapHandoffs: requiredManualHandoffs("DIRECT_BOOTSTRAP"),
    badAlphaContainment: badReleaseActions({
      channel: "next",
      production: false,
    }),
  };
};

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  process.stdout.write(`${JSON.stringify(rehearseReleaseStates(), null, 2)}\n`);
}
