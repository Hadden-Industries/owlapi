import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { assertArchivedOwlContractReport } from "./owl-contract-evidence.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

export const validateReleaseEvidence = (record) => {
  const schema = JSON.parse(
    readFileSync(
      join(repositoryRoot, "docs", "release", "release-evidence.schema.json"),
      "utf8",
    ),
  );
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  if (!validate(record)) {
    throw new Error(
      `Release evidence violates its strict schema: ${ajv.errorsText(validate.errors)}`,
    );
  }
  if (record.schemaVersion === 4) {
    assertArchivedOwlContractReport(record.producerContract, {
      package: { name: record.package.name, version: record.package.version },
      candidateSha256: record.candidate.tarball.sha256,
      artifact: {
        id: Number(record.candidate.artifactId),
        digest: record.candidate.artifactDigest,
      },
    });
    const execution = record.producerContract.identity;
    if (
      execution.workflow !== "Release" ||
      execution.commit !== record.source.commit ||
      execution.runId !== Number(record.workflow.runId) ||
      execution.runAttempt > record.qualificationWorkflow.runAttempt
    )
      throw new Error(
        "Release OWL proof has a different authenticated workflow identity.",
      );
  }
  return record;
};

const main = () => {
  const path = process.argv[2];
  if (!path) {
    throw new Error("Release-evidence validation requires a record path.");
  }
  validateReleaseEvidence(JSON.parse(readFileSync(resolve(path), "utf8")));
  process.stdout.write(`${resolve(path)}\n`);
};

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  main();
}
