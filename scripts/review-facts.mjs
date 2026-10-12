import { createHash } from "node:crypto";
import { stableJson } from "./canonical-json.mjs";

export const REVIEW_DIGEST_ALGORITHM = "sha256-sorted-json-v1";
const fields = {
  rights: [
    "package",
    "contributors",
    "materialClasses",
    "externalDependencies",
    "unresolvedExternalContributions",
    "conclusion",
  ],
  thirdParty: ["package", "summary", "components", "materials"],
  dependencies: [
    "package",
    "recordedOn",
    "productionAudit",
    "installScriptPolicy",
    "transitiveInventoryAuthority",
    "upgradeGate",
    "dependencies",
  ],
};
export const reviewFactsDigest = (kind, document) => {
  const keys =
    kind === "scopedName"
      ? Object.keys(document).filter(
          (key) => !["$schema", "schemaVersion", "review"].includes(key),
        )
      : fields[kind];
  if (!keys) throw new TypeError(`Unknown review facts kind: ${kind}`);
  return createHash("sha256")
    .update(
      stableJson(Object.fromEntries(keys.map((key) => [key, document[key]]))),
    )
    .digest("hex");
};
