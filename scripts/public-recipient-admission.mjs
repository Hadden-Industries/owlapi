/** Verify the hosted advisory result before switching to the selected consumer Node. */
import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadPublicContext } from "./public-audit-batch.mjs";
import { GitHubReleaseClient } from "./github-release.mjs";
import { REPOSITORY } from "./release-identity.mjs";
import { assertConsumerNpm } from "./consumer-runtime-tools.mjs";
import { CI_RUNTIME } from "./runtime-policy.mjs";
import {
  findNpmCliCandidates,
  observeNpmVersion,
  selectNpmCliForVersion,
} from "./assert-workflow-runtime.mjs";
import { admitPublicRecipientReplay } from "./public-reconciliation-proof.mjs";
import { publicReplayPlanPath } from "./public-recipient-plan.mjs";
import { stableJson } from "./canonical-json.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";

const env = process.env;
try {
  assert.equal(env.GITHUB_REPOSITORY, REPOSITORY);
  assert.equal(env.GITHUB_REF, "refs/heads/main");
  assert.equal(env.GITHUB_EVENT_NAME, "workflow_dispatch");
  assert.equal(env.GITHUB_REF_PROTECTED, "true");
  const client = new GitHubReleaseClient({
    repository: REPOSITORY,
    token: env.GH_TOKEN,
  });
  const consumerNpmCli = env.OWLAPI_CONSUMER_NPM;
  assertConsumerNpm(consumerNpmCli, env.OWLAPI_EXPECTED_NODE);
  const { npmCli } = selectNpmCliForVersion({
    expectedNpm: CI_RUNTIME.npm,
    candidates: findNpmCliCandidates(),
    observeVersion: observeNpmVersion,
  });
  const { checkpoint, operation, matrix, input, options } =
    await loadPublicContext(client, env, consumerNpmCli);
  const lane = matrix.include.find(
    (entry) =>
      entry.node === env.OWLAPI_EXPECTED_NODE &&
      entry.os === process.platform &&
      entry.arch === process.arch,
  );
  assert.ok(lane);
  assert.deepEqual(JSON.parse(env.OWLAPI_PUBLIC_RECIPIENT), input);
  assert.deepEqual(JSON.parse(env.OWLAPI_RUNTIME_MATRIX), matrix);
  const plan = await admitPublicRecipientReplay(
    client,
    checkpoint,
    operation,
    matrix,
    input,
    { tarball: options.tarball, npmCli, consumerNpmCli, lane },
  );
  const bytes = Buffer.from(stableJson(plan));
  mkdirSync(dirname(publicReplayPlanPath), { recursive: true });
  writeFileSync(publicReplayPlanPath, bytes, { flag: "wx" });
  appendFileSync(env.GITHUB_OUTPUT, `plan_sha256=${sha256Buffer(bytes)}\n`);
  process.stdout.write(
    "Public recipient replay inputs authorized by the original protected advisory decision.\n",
  );
} catch {
  process.stderr.write(
    "Public recipient replay authorization failed. Check the original material proof and protected advisory run.\n",
  );
  process.exitCode = 1;
}
