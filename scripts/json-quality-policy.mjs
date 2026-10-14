import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readJsonPolicy } from "../tooling/json/public-api.mjs";
import { sha256 } from "../util/third-party-evidence/digests.mjs";

// The owner superseded the zero-exclusion rule only for these two installed
// reports. Package updates must remove the exception rather than inherit it.
const temporaryCargoNotices = new Map(
  [
    [
      "win32-x64",
      "f5459fbdcf02354f87e1caf051238493f097be172b5af3e4f5e74b359146c29e",
    ],
    [
      "linux-x64",
      "22473eb073afc5d9f451888f96ab31dffc9bf3a55c50650f6fad058ba726df85",
    ],
  ].map(([platform, digest]) => [
    `tooling/markdown/node_modules/@hadden-industries/markdown-quality-${platform}/cargo-notices.json`,
    { name: `@hadden-industries/markdown-quality-${platform}`, digest },
  ]),
);

/** Enforce the exact temporary owner-approved boundary after schema admission.
 * All other protection and producer formatting entries retain checking.
 */
export async function readRepositoryJsonPolicy(root) {
  const policy = await readJsonPolicy(root);
  for (const exception of policy.exceptions.filter(({ exclude }) => exclude)) {
    for (const path of exception.paths) {
      const pin = temporaryCargoNotices.get(path);
      if (!pin) {
        throw new Error(
          `OwlAPI JSON coverage exclusions require a new owner decision: ${path}`,
        );
      }
      let metadata;
      try {
        metadata = JSON.parse(
          await readFile(join(root, dirname(path), "package.json"), "utf8"),
        );
      } catch (error) {
        // Optional platform packages are legitimately absent on other hosts.
        if (error.code === "ENOENT") {
          try {
            await readFile(join(root, path));
          } catch (reportError) {
            if (reportError.code === "ENOENT") continue;
            throw reportError;
          }
        }
        throw error;
      }
      if (
        metadata.name !== pin.name ||
        metadata.version !== "1.0.3" ||
        sha256(await readFile(join(root, path))) !== pin.digest
      ) {
        throw new Error(
          `Remove the temporary cargo-notices.json exclusion after the Markdown Quality package changes: ${path}`,
        );
      }
    }
  }
  return policy;
}
