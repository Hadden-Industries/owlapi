import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const control = JSON.parse(
  readFileSync(
    join(repositoryRoot, "docs", "release", "publication-control.json"),
    "utf8",
  ),
);

if (control.enabled || control.mode !== "UNRESOLVED" || control.reviewedOn) {
  throw new Error(
    "Phase 19C requires a disabled, unresolved publication-control boundary.",
  );
}
process.stdout.write(
  `${JSON.stringify({ result: "PASS", externalMutationAuthorized: false }, null, 2)}\n`,
);
