import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

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
