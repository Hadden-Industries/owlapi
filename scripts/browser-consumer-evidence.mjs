/** Browser test inputs bind npm-built modes and the separately verified JSPM map. */
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { jsonEquals, stableJson } from "./canonical-json.mjs";
import { assertCiConsumerAttribution } from "./ci-recipient-attribution.mjs";
import { assertPackageIdentity } from "./package-identity.mjs";
import { sha256Buffer, sha256File } from "./release-file-utils.mjs";

export const BROWSER_CONSUMER_MODES = Object.freeze([
  "bundler",
  "import-map",
  "worker",
]);
export const BROWSER_PROJECTS = Object.freeze([
  "chromium",
  "firefox",
  "webkit",
]);
export const BROWSER_PREPARATION_NAME = "browser-consumer-manifest.json";
export const BROWSER_QUALIFICATION_NAME = "browser-qualification.json";

const assertions = Object.freeze({
  bundler: "bundler consumes the retained package through public specifiers",
  "import-map":
    "import-map consumes the retained package through public specifiers",
  worker: "bundled DedicatedWorker returns clone-safe parsing evidence",
});
const modes = Object.keys(assertions);
const digestPattern = /^[a-f0-9]{64}$/u;

/** Keep one original per exact npm observation, with separate per-mode decisions. */
export function indexBrowserNpmAttributions(attributions) {
  const observations = new Map();
  const decisions = {};
  for (const mode of modes) {
    const { evidence, decision } = attributions[mode];
    const key = decision.resolutionSha256;
    if (observations.has(key))
      assert.ok(jsonEquals(observations.get(key), evidence));
    observations.set(key, evidence);
    decisions[mode] = decision;
  }
  return { observations: Object.fromEntries(observations), decisions };
}

/** Identify the npm fixture input. The import-map browser then uses JSPM. */
export function browserNpmAttribution(manifest, mode) {
  assert.ok(modes.includes(mode));
  const decision = manifest.npmAttributions.decisions[mode];
  return {
    schemaVersion: 1,
    decision,
    evidence: manifest.npmAttributions.observations[decision.resolutionSha256],
  };
}

/** Hash the exact served payload, excluding locks, temporary archives and npm caches. */
export function browserFixturePayloadDigests(directory) {
  return Object.fromEntries(
    BROWSER_CONSUMER_MODES.map((mode) => {
      const root = join(
        directory,
        mode,
        mode === "import-map" ? "runtime" : "dist",
      );
      const files = [];
      function visit(path = "") {
        for (const entry of readdirSync(join(root, path), {
          withFileTypes: true,
        })) {
          const location = path ? `${path}/${entry.name}` : entry.name;
          if (entry.isDirectory()) visit(location);
          else {
            assert.ok(
              entry.isFile(),
              "Browser fixture contains a non-regular file",
            );
            files.push({
              path: location,
              sha256: sha256File(join(root, location)),
            });
          }
        }
      }
      visit();
      files.sort((left, right) =>
        left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
      );
      assert.ok(
        files.some(({ path }) => path === "index.html"),
        "Browser fixture index is missing",
      );
      return [mode, sha256Buffer(Buffer.from(stableJson(files)))];
    }),
  );
}

/** Check the preparation selected by the current runner or authenticated proof reader. */
export function assertBrowserPreparation(
  manifest,
  { directory, tarballSha256 } = {},
) {
  assert.equal(
    manifest.schemaVersion,
    2,
    "Required browser preparation schema differs",
  );
  assertPackageIdentity(manifest.package);
  const digest = manifest.candidate.tarball.sha256;
  assert.match(digest, digestPattern);
  if (tarballSha256 !== undefined)
    assert.equal(
      digest,
      tarballSha256,
      "Browser fixture belongs to a different candidate",
    );
  assert.ok(jsonEquals(manifest.consumers, BROWSER_CONSUMER_MODES));
  assert.deepEqual(Object.keys(manifest.npmAttributions).sort(), [
    "decisions",
    "observations",
  ]);
  for (const member of [
    manifest.npmAttributions.decisions,
    manifest.fixturePayloadSha256,
  ])
    assert.ok(jsonEquals(Object.keys(member).sort(), modes));
  const expectedObservations = new Set(
    Object.values(manifest.npmAttributions.decisions).map(
      ({ resolutionSha256 }) => resolutionSha256,
    ),
  );
  assert.deepEqual(
    Object.keys(manifest.npmAttributions.observations).sort(),
    [...expectedObservations].sort(),
    "Browser proof contains missing or unused npm originals",
  );
  for (const mode of modes) {
    assertCiConsumerAttribution(browserNpmAttribution(manifest, mode), {
      role:
        mode === "import-map" ? "browser-import-map-input" : `browser-${mode}`,
      tarballSha256: digest,
      decisionDirectory: directory && join(directory, "eligibility"),
    });
    assert.match(manifest.fixturePayloadSha256[mode], digestPattern);
  }
  assert.equal(manifest.referenceImportMap.integrityScope, "provider-only");
  assert.equal(manifest.referenceImportMap.provider, "jspm.io");
  assert.match(manifest.referenceImportMap.generatedSha256, digestPattern);
  assert.ok(
    Number.isSafeInteger(manifest.referenceImportMap.providerModuleCount) &&
      manifest.referenceImportMap.providerModuleCount > 0,
  );
  if (directory !== undefined)
    assert.ok(
      jsonEquals(
        manifest.fixturePayloadSha256,
        browserFixturePayloadDigests(directory),
      ),
      "Browser fixture bytes differ from preparation",
    );
  return manifest;
}

function expectedAssertions(projects) {
  assert.ok(
    Array.isArray(projects) &&
      projects.length > 0 &&
      projects.every((project) => BROWSER_PROJECTS.includes(project)) &&
      new Set(projects).size === projects.length,
  );
  return [...projects].sort().flatMap((project) =>
    modes.map((mode) => ({
      project,
      mode,
      title: assertions[mode],
      status: "passed",
    })),
  );
}

/** Project native results onto the reviewed three tests without retaining host paths. */
export function readBrowserAssertions(native, projects) {
  const expected = expectedAssertions(projects);
  assert.ok(
    jsonEquals(native.errors, []) &&
      native.stats.expected === expected.length &&
      ["flaky", "skipped", "unexpected"].every(
        (count) => native.stats[count] === 0,
      ),
    "Browser native report contains failed, missing or skipped tests",
  );
  const byTitle = new Map(modes.map((mode) => [assertions[mode], mode]));
  const observed = [];
  // The browser suite owns the exact complete spec roster; nested or unrelated
  // tests cannot increment the status of any reviewed consumer mode.
  assert.equal(native.suites.length, 1);
  const suite = native.suites[0];
  assert.equal(suite.file, "browser-consumers.playwright.js");
  assert.ok(!suite.suites?.length);
  for (const { title, tests, ok } of suite.specs) {
    assert.ok(ok && byTitle.has(title));
    for (const test of tests) {
      assert.ok(
        test.status === "expected" &&
          test.expectedStatus === "passed" &&
          test.results.length === 1 &&
          test.results[0].retry === 0,
      );
      observed.push({
        project: test.projectName,
        mode: byTitle.get(title),
        title,
        status: test.results[0].status,
      });
    }
  }
  observed.sort((left, right) =>
    `${left.project}/${left.mode}`.localeCompare(
      `${right.project}/${right.mode}`,
      "en",
    ),
  );
  assert.ok(
    jsonEquals(observed, expected),
    "Browser assertion inventory differs from the selected projects",
  );
  return observed;
}

/** Reopen the exact prepared manifest from a job-bound, disclosure-safe result. */
export function assertBrowserQualification(
  record,
  { identity, candidateArtifact, projects, tarballSha256, decisionDirectory },
) {
  assert.ok(
    jsonEquals(
      Object.keys(record).sort(),
      [
        "assertions",
        "candidateArtifact",
        "identity",
        "preparation",
        "preparationSha256",
        "result",
        "schemaVersion",
      ].sort(),
    ),
  );
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.result, "PASS");
  assert.ok(
    jsonEquals(record.identity, identity),
    "Browser qualification came from a different job",
  );
  assert.ok(
    jsonEquals(record.candidateArtifact, candidateArtifact),
    "Browser qualification used another candidate artifact",
  );
  assert.equal(typeof record.preparation, "string");
  assert.equal(
    sha256Buffer(Buffer.from(record.preparation)),
    record.preparationSha256,
  );
  const preparation = assertBrowserPreparation(JSON.parse(record.preparation), {
    tarballSha256,
  });
  if (decisionDirectory) {
    for (const mode of modes)
      readQualificationDecision(preparation, mode, decisionDirectory);
  }
  assert.ok(
    jsonEquals(record.assertions, expectedAssertions(projects)),
    "Browser qualification test inventory differs",
  );
  return record;
}

function readQualificationDecision(preparation, mode, decisionDirectory) {
  const attribution = browserNpmAttribution(preparation, mode);
  assertCiConsumerAttribution(attribution, {
    role: attribution.decision.role,
    tarballSha256: preparation.candidate.tarball.sha256,
    decisionDirectory,
  });
}
