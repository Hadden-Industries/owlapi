/** Reuse the native authenticated npm evidence owner for the isolated Actions SDK. */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { verifyRepositoryEvidence } from "../util/verify-npm-package-evidence.mjs";
import { hashBytes } from "../tooling/artifact-transport/identity.mjs";
import { jsonEquals } from "./canonical-json.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = "tooling/artifact-transport";
const recordPath = `${directory}/rights-review.json`;
const bindings = [
  `${directory}/package.json`,
  `${directory}/package-lock.json`,
  `${directory}/docs/provenance/npm-package-evidence.json`,
  ".github/actions/retain-artifact/dist/third-party-licenses.txt",
];

/** Automated package and notice evidence is distinct from the rights owner's decision. */
export async function artifactToolEvidence({
  repositoryRoot = root,
  write = false,
} = {}) {
  const summary = await verifyRepositoryEvidence({
    repositoryRoot: resolve(repositoryRoot, directory),
    schemaPath: resolve(
      repositoryRoot,
      "docs/provenance/npm-package-evidence.schema.json",
    ),
  });
  const inputs = {};
  for (const path of bindings) {
    inputs[path] = hashBytes(await readFile(resolve(repositoryRoot, path)));
  }
  const record = {
    schemaVersion: 1,
    scope: "DEVELOPMENT_ACTION_TRANSPORT_ONLY",
    reviewStatus: "PENDING_HUMAN_REVIEW",
    automatedEvidence: {
      verifier: "util/verify-npm-package-evidence.mjs",
      summary,
      inputs,
    },
    limitation:
      "Authenticated identities, retained legal text and scanner observations do not establish rights-owner approval or licensing compatibility.",
  };
  if (write) {
    let previous;
    try {
      previous = JSON.parse(
        await readFile(resolve(repositoryRoot, recordPath), "utf8"),
      );
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
    if (previous && previous.reviewStatus !== record.reviewStatus) {
      throw new Error(
        "An existing rights-owner decision requires explicit reassessment before regeneration",
      );
    }
    await writeFile(
      resolve(repositoryRoot, recordPath),
      `${JSON.stringify(record, null, 2)}\n`,
    );
  } else {
    const retained = JSON.parse(
      await readFile(resolve(repositoryRoot, recordPath), "utf8"),
    );
    if (!jsonEquals(retained, record)) {
      throw new Error("Stale isolated artifact-tool rights evidence");
    }
  }
  return {
    status: "AUTOMATED_EVIDENCE_VERIFIED",
    humanReview: record.reviewStatus,
    summary,
  };
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  if (process.argv.slice(2).some((value) => value !== "--write")) {
    throw new Error(
      "Only the explicit --write projection operation is supported",
    );
  }
  process.stdout.write(
    `${JSON.stringify(await artifactToolEvidence({ write: process.argv.includes("--write") }))}\n`,
  );
}
