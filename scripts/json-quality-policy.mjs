import { readJsonPolicy } from "../tooling/json/public-api.mjs";
import { verifyPinnedIntegrationCheckout } from "../util/owlapi-reference/pinned-integration-checkout.mjs";

const approvedExclusions = new Set([
  "**/node_modules/**",
  ".development-tools/python/**",
  ".development-tools/uv-cache/**",
  ".venv/**",
  ".release/universal-ontology/**",
  "tooling/markdown/archives/hadden-industries-markdown-quality-linux-x64-1.0.3.tgz!/package/cargo-notices.json",
  "tooling/markdown/archives/hadden-industries-markdown-quality-win32-x64-1.0.3.tgz!/package/cargo-notices.json",
]);

/** Repository approval authority only; the package owns schema and checking.
 * Report version/bytes are independently admitted by the native archive owner.
 */
export async function readRepositoryJsonPolicy(root) {
  const policy = await readJsonPolicy(root);
  for (const entry of policy.exceptions.filter((entry) => entry.exclude))
    for (const path of entry.paths)
      if (!approvedExclusions.has(path))
        throw new Error(
          `OwlAPI JSON coverage exclusion requires a new owner decision: ${path}`,
        );
  if (
    policy.exceptions.some(
      (entry) =>
        entry.exclude && entry.paths.includes(".release/universal-ontology/**"),
    )
  )
    await verifyPinnedIntegrationCheckout(root);
  return policy;
}
