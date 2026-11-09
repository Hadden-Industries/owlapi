import { resolveJsonQualityPolicy } from "@hadden-industries/json-quality";
import { verifyPinnedIntegrationCheckout } from "../util/owlapi-reference/pinned-integration-checkout.mjs";

const approvedExclusions = new Set([
  "node_modules/**",
  "tooling/artifact-transport/node_modules/**",
  ".development-tools/python/**",
  ".development-tools/uv-cache/**",
  ".venv/**",
  ".release/universal-ontology/**",
]);

/** Repository approval authority only; the package owns schema and checking.
 * Retained original provenance values remain protected by their physical owner.
 */
export async function validateRepositoryJsonPolicy(policy, root) {
  policy = resolveJsonQualityPolicy(policy);
  for (const entry of policy.exceptions.filter(
    (entry) => entry.excludeUntrackedSources,
  ))
    for (const path of entry.paths)
      if (!approvedExclusions.has(path))
        throw new Error(
          `OwlAPI JSON coverage exclusion requires a new owner decision: ${path}`,
        );
  if (
    policy.exceptions.some(
      (entry) =>
        entry.excludeUntrackedSources &&
        entry.paths.includes(".release/universal-ontology/**"),
    )
  )
    await verifyPinnedIntegrationCheckout(root);
  return policy;
}

/** Approve the same immutable policy used by this execution. No second read or
 * unaccounted parse can authorize different exclusions before guarded writes.
 * This zero-member inventory is a domain gate, not a JSON source collection.
 */
export async function* capturedRepositoryPolicy(access, { root }) {
  const lease = await access.materializeControl(
    await access.select(await access.capturedSource(".json-quality.json")),
    "262144",
    (policy) => {
      resolveJsonQualityPolicy(policy);
      return true;
    },
  );
  try {
    await validateRepositoryJsonPolicy(lease.value, root);
  } finally {
    await lease.release();
  }
  yield* [];
}
