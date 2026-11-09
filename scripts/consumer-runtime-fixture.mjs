import { CI_RUNTIME, runtimeSemver as semver } from "./runtime-policy.mjs";
import { qualificationMatrix } from "./consumer-runtime-matrix.mjs";

/** Shared offline fixtures retain both newer-patch and latest-equals-reference cases. */
export function consumerRuntimeFixture({
  policy = CI_RUNTIME,
  newerPatches = true,
} = {}) {
  const versions = [
    ...new Set([
      ...policy.minimums,
      ...Object.values(policy.node).flatMap((reference) =>
        newerPatches
          ? [reference, semver.inc(reference, "patch")]
          : [reference],
      ),
    ]),
  ];
  const releases = versions.map((version) => ({ version: `v${version}` }));
  // The selector creates fresh selections and platform entries; no policy arrays escape.
  return { releases, matrix: qualificationMatrix(releases, policy) };
}
