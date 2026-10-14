import { readJsonPolicy } from "../tooling/json/public-api.mjs";

/** Enforce the accepted zero-exclusion boundary after shared schema admission.
 * Protection and producer formatting never remove a document from checking.
 */
export async function readRepositoryJsonPolicy(root) {
  const policy = await readJsonPolicy(root);
  if (policy.exceptions.some(({ exclude }) => exclude === true)) {
    throw new Error(
      "OwlAPI JSON coverage exclusions require a new owner decision; none are approved.",
    );
  }
  return policy;
}
