import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
import {
  createRepositoryReader,
  readRunArtifacts,
} from "./github-evidence-reader.mjs";
import { matchesLogicalArtifact } from "../tooling/artifact-transport/identity.mjs";
import { PACKAGE_FILE_STEM, PACKAGE_VERSION } from "./package-identity.mjs";

const env = process.env;
assert.equal(env.GITHUB_REPOSITORY, "Hadden-Industries/owlapi");
assert.equal(env.GITHUB_REF, "refs/heads/main");
assert.equal(env.GITHUB_SHA, env.SUBJECT);
assert.match(env.SUBJECT, /^[0-9a-f]{40}$/u);
const read = createRepositoryReader({
  repository: env.GITHUB_REPOSITORY,
  token: env.GH_TOKEN,
});
assert.equal((await read("/git/ref/heads/main")).object.sha, env.SUBJECT);
if (process.argv[2] === "admit") {
  assert.match(env.ORIGIN_RUN, /^[1-9][0-9]*$/u);
  assert.match(env.ORIGIN_ATTEMPT, /^[1-9][0-9]*$/u);
  const run = await read(
    "/actions/runs/" + env.ORIGIN_RUN + "/attempts/" + env.ORIGIN_ATTEMPT,
  );
  assert.equal(run.repository.full_name, env.GITHUB_REPOSITORY);
  assert.equal(run.head_repository.full_name, env.GITHUB_REPOSITORY);
  assert.deepEqual(
    [
      String(run.id),
      String(run.run_attempt),
      run.head_branch,
      run.head_sha,
      run.path,
      run.status,
      run.conclusion,
    ],
    [
      env.ORIGIN_RUN,
      env.ORIGIN_ATTEMPT,
      "main",
      env.SUBJECT,
      ".github/workflows/ci.yml",
      "completed",
      "success",
    ],
  );
  assert.ok(["push", "workflow_dispatch"].includes(run.event));
  const artifacts = await readRunArtifacts(read, env.ORIGIN_RUN);
  const logical =
    PACKAGE_FILE_STEM +
    "-" +
    PACKAGE_VERSION +
    "-candidate-" +
    env.ORIGIN_RUN +
    "-" +
    env.ORIGIN_ATTEMPT;
  const matches = artifacts.filter(
    (a) =>
      !a.expired &&
      matchesLogicalArtifact(a.name, logical, {
        run: run.id,
        attempt: run.run_attempt,
        legacy: false,
      }),
  );
  assert.equal(matches.length, 1, "Diagnostic needs original candidate bytes");
  assert.ok(Number.isSafeInteger(matches[0].id) && matches[0].id > 0);
  appendFileSync(env.GITHUB_OUTPUT, "artifact_id=" + matches[0].id + "\n");
} else {
  assert.equal(process.argv[2], "complete");
  appendFileSync(
    env.GITHUB_STEP_SUMMARY,
    "Installed-only diagnostic for " +
      env.SUBJECT +
      ". A FULL_REQUIRED decision still needs a full main qualification.\n",
  );
}
