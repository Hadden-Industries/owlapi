import { readFileSync } from "node:fs";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { basename } from "node:path";
import { validateReleasedOracle } from "./validate-released-oracle.mjs";

const directory = new URL(
  "../../docs/compatibility/profiles/java-owlapi-5.5.1/",
  import.meta.url,
);
const readJson = (name) =>
  JSON.parse(readFileSync(new URL(name, directory), "utf8"));
const validate = addFormats(new Ajv({ strict: true })).compile(
  readJson("provenance.schema.json"),
);

test("released-oracle identity is exact and incomplete qualification cannot be asserted", () => {
  const draft = readJson("provenance.json");
  expect(validate(draft)).toBe(true);
  const wrongSource = structuredClone(draft);
  wrongSource.upstream.commit.commitObjectId =
    "b61ebe2da83daceebb3e7ba7afbd2582c9240c33";
  expect(validate(wrongSource)).toBe(false);
  const falseClaim = structuredClone(draft);
  falseClaim.qualification.status = "qualified";
  falseClaim.qualification.completedAt = null;
  falseClaim.oracle.harnessSourceCommitObjectId = null;
  expect(validate(falseClaim)).toBe(false);
});

const overrideJson = (filename, mutate) => (path) => {
  const bytes = readFileSync(path);
  if (basename(path) !== filename) return bytes;
  const value = JSON.parse(bytes);
  mutate(value);
  return Buffer.from(JSON.stringify(value));
};

test("measured draft evidence validates without being promoted to qualified release evidence", () => {
  const result = validateReleasedOracle({ requireQualified: false });
  expect(result).toEqual({
    qualificationStatus: "unqualified",
    observationCount: 17,
    dependencyArtifactCount: 2146,
  });
  expect(() => validateReleasedOracle()).toThrow(/unqualified/);
});

test("incomplete dependency closure and altered observations fail admission", () => {
  expect(() =>
    validateReleasedOracle({
      requireQualified: false,
      readArtifact: overrideJson("provenance.json", (value) => {
        value.mavenCentral.dependencyLock.sourceBuildClosureStatus =
          "unresolved";
      }),
    }),
  ).toThrow(/incomplete|Invalid released-oracle/);
  expect(() =>
    validateReleasedOracle({
      requireQualified: false,
      readArtifact: overrideJson("central-observations.json", (value) => {
        expect(value.observations[0].stdout).not.toBe("");
        value.observations[0].stdout = "forged successful outcome";
      }),
    }),
  ).toThrow(/Changed evidence artifact/);
});
