import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { startBrowserFixtureServer } from "./browser-fixture-server.mjs";
import {
  BROWSER_PREPARATION_NAME,
  BROWSER_PROJECTS,
  BROWSER_QUALIFICATION_NAME,
  assertBrowserPreparation,
  assertBrowserQualification,
  readBrowserAssertions,
} from "./browser-consumer-evidence.mjs";
import { isStrictDescendantPath, sha256Buffer } from "./release-file-utils.mjs";

const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const valueAfter = (name) => {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) {
    throw new Error(`Missing required ${name} argument`);
  }
  return process.argv[index + 1];
};

if (!process.env.npm_execpath) {
  throw new Error(
    "Run browser tests through the named npm script so the locked Playwright package is authoritative.",
  );
}

const fixtureRoot = resolve(valueAfter("--fixture-root"));
const project = process.argv.includes("--project")
  ? valueAfter("--project")
  : undefined;
const projects = project ? [project] : BROWSER_PROJECTS;
assert.ok(
  projects.every((name) => BROWSER_PROJECTS.includes(name)),
  "Unknown browser consumer project",
);
const preparationPath = join(fixtureRoot, BROWSER_PREPARATION_NAME);
const preparation = readFileSync(preparationPath, "utf8");
const manifest = assertBrowserPreparation(JSON.parse(preparation), {
  directory: fixtureRoot,
});
const temporary = mkdtempSync(join(tmpdir(), "owlapi-browser-assertions-"));
assert.ok(isStrictDescendantPath(tmpdir(), temporary));
const reportPath = join(temporary, "native.json");
let server;

try {
  server = await startBrowserFixtureServer({ root: fixtureRoot });
  const arguments_ = [
    fileURLToPath(import.meta.resolve("@playwright/test/cli")),
    "test",
    "--reporter=list,json",
    ...(project ? [`--project=${project}`] : []),
  ];
  const status = await new Promise((resolveStatus, reject) => {
    const child = spawn(process.execPath, arguments_, {
      cwd: REPOSITORY_ROOT,
      env: {
        ...process.env,
        OWLAPI_BROWSER_BASE_URL: server.baseUrl,
        PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath,
      },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("close", resolveStatus);
  });
  if (status !== 0) {
    throw new Error(
      `Playwright browser-consumer tests failed with status ${status}`,
    );
  }
  const native = lstatSync(reportPath);
  assert.ok(
    native.isFile() && native.size <= 16 * 1024 * 1024,
    "Invalid native browser report file",
  );
  const assertions = readBrowserAssertions(
    JSON.parse(readFileSync(reportPath, "utf8")),
    projects,
  );
  assert.equal(
    readFileSync(preparationPath, "utf8"),
    preparation,
    "Browser preparation changed during qualification",
  );
  assertBrowserPreparation(manifest, { directory: fixtureRoot });
  if (process.env.GITHUB_ACTIONS === "true") {
    const identity = {
      workflow: process.env.GITHUB_WORKFLOW,
      job: process.env.GITHUB_JOB,
      commit: process.env.GITHUB_SHA,
      runId: Number(process.env.GITHUB_RUN_ID),
      runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    };
    assert.ok(["CI", "Release"].includes(identity.workflow));
    assert.equal(projects.length, 1);
    assert.equal(identity.job, `browser_${project}`);
    assert.match(identity.commit ?? "", /^[a-f0-9]{40}$/u);
    for (const number of [identity.runId, identity.runAttempt])
      assert.ok(Number.isSafeInteger(number) && number > 0);
    assert.match(process.env.CANDIDATE_ARTIFACT_ID ?? "", /^[1-9]\d*$/u);
    assert.match(
      process.env.CANDIDATE_ARTIFACT_DIGEST ?? "",
      /^[a-f0-9]{64}$/u,
    );
    const candidateArtifact = {
      id: Number(process.env.CANDIDATE_ARTIFACT_ID),
      digest: `sha256:${process.env.CANDIDATE_ARTIFACT_DIGEST}`,
    };
    assert.ok(Number.isSafeInteger(candidateArtifact.id));
    const record = assertBrowserQualification(
      {
        schemaVersion: 1,
        result: "PASS",
        identity,
        candidateArtifact,
        preparation,
        preparationSha256: sha256Buffer(Buffer.from(preparation)),
        assertions,
      },
      {
        identity,
        candidateArtifact,
        projects,
        tarballSha256: manifest.candidate.tarball.sha256,
      },
    );
    writeFileSync(
      join(fixtureRoot, BROWSER_QUALIFICATION_NAME),
      `${JSON.stringify(record, null, 2)}\n`,
      { flag: "wx" },
    );
  }
} finally {
  try {
    if (server) await server.close();
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
