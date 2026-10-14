import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { basename } from "node:path";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

const comparisonFixture = (mutate) => {
  const names = ["behavior-comparison.json", "selected-parity-comparison.json"];
  const bytesByName = new Map();
  for (const name of names) {
    const rows = readJson(name).map((row) =>
      Object.fromEntries(Object.entries(row).reverse()),
    );
    mutate?.(rows, name);
    bytesByName.set(name, Buffer.from(JSON.stringify(rows)));
  }
  // Fixture bytes have their own declared identities; the real retained
  // evidence and its manifest remain unchanged.
  const manifest = readJson("evidence-manifest.json");
  for (const entry of manifest.evidence) {
    const bytes = bytesByName.get(entry.path);
    if (!bytes) continue;
    entry.byteLength = bytes.length;
    entry.sha256 = createHash("sha256").update(bytes).digest("hex");
  }
  bytesByName.set(
    "evidence-manifest.json",
    Buffer.from(JSON.stringify(manifest)),
  );
  return (path) => bytesByName.get(basename(path)) ?? readFileSync(path);
};

test("retained oracle comparison accepts member permutations with independently bound fixture bytes", () => {
  expect(validateReleasedOracle({ readArtifact: comparisonFixture() })).toEqual(
    expect.objectContaining({
      qualificationStatus: "qualified",
      observationCount: 28,
      selectedObservationCount: 15,
    }),
  );
});

test.each(["behavior-comparison.json", "selected-parity-comparison.json"])(
  "retained oracle comparison rejects changed values in %s after byte admission",
  (name) => {
    const readArtifact = comparisonFixture((rows, filename) => {
      if (filename === name) rows[0].unexpectedFact = true;
    });
    expect(() => validateReleasedOracle({ readArtifact })).toThrow(
      /Recorded (behavioral|selected parity) comparison differs/,
    );
  },
);

test("retained oracle comparison rejects reordered rows after byte admission", () => {
  const readArtifact = comparisonFixture((rows) => rows.reverse());
  expect(() => validateReleasedOracle({ readArtifact })).toThrow(
    /Recorded behavioral comparison differs/,
  );
});

test("qualified oracle evidence validates against its frozen committed harness", () => {
  const result = validateReleasedOracle();
  expect(result).toEqual({
    qualificationStatus: "qualified",
    observationCount: 28,
    selectedObservationCount: 15,
    dependencyArtifactCount: 2146,
  });
  const draft = overrideJson("provenance.json", (value) => {
    value.qualification.status = "unqualified";
    value.qualification.completedAt = null;
    value.oracle.harnessSourceCommitObjectId = null;
  });
  expect(() => validateReleasedOracle({ readArtifact: draft })).toThrow(
    /unqualified/,
  );
  expect(
    validateReleasedOracle({
      // The synthetic draft still describes the retained historical inputs;
      // supply their actual frozen bytes rather than today's edited helpers.
      readArtifact: (path) => {
        const repository = fileURLToPath(new URL("../../", import.meta.url));
        const fixture = readJson("fixture-manifest.json").fixtures.find(
          (entry) => resolve(fileURLToPath(directory), entry.path) === path,
        );
        if (!fixture) return draft(path);
        const committed = spawnSync(
          "git",
          [
            "show",
            `${readJson("provenance.json").oracle.harnessSourceCommitObjectId}:${path.slice(repository.length).replaceAll("\\", "/")}`,
          ],
          { cwd: repository },
        );
        expect(committed.status).toBe(0);
        return committed.stdout;
      },
      requireQualified: false,
    }).qualificationStatus,
  ).toBe("unqualified");
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
