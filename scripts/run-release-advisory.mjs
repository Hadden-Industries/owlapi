/** The same-repository workflow evaluates already-produced inputs. Its signing
 * job never installs or executes a package from the submitted dependency graph. */
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { GitHubReleaseClient } from "./github-release.mjs";
import { REPOSITORY } from "./release-identity.mjs";
import {
  auditTrust,
  releaseJobs,
  checkedNativeJob,
  assertProtectedReleaseRun,
} from "./release-audit-job.mjs";
import { evaluateReleaseAudit } from "./release-audit-evaluator.mjs";
import {
  selectNpmCliForVersion,
  findNpmCliCandidates,
  observeNpmVersion,
} from "./assert-workflow-runtime.mjs";
import { CI_RUNTIME } from "./runtime-policy.mjs";
import { isStrictDescendantPath } from "./release-file-utils.mjs";
import { withAuditNpmClients } from "./release-audit-runtimes.mjs";
import { readAdvisoryCases } from "./release-audit-cases.mjs";

export async function runProtectedAdvisoryJob(
  env = process.env,
  { privateAuditStore } = {},
) {
  const purposes = {
    qualification: ".github/workflows/release.yml",
    public: ".github/workflows/release-registry.yml",
  };
  const workflow = purposes[env.AUDIT_PURPOSE];
  assert.ok(
    typeof workflow === "string" &&
      env.GITHUB_WORKFLOW_REF ===
        REPOSITORY + "/" + workflow + "@refs/heads/main",
    "Unexpected advisory caller",
  );
  const client = new GitHubReleaseClient({
    repository: REPOSITORY,
    token: env.GH_TOKEN,
  });
  const expected = {
    workflow,
    controller: env.GITHUB_SHA,
    runId: Number(env.GITHUB_RUN_ID),
    attempt: Number(env.GITHUB_RUN_ATTEMPT),
  };
  const run = await client.read("/actions/runs/" + expected.runId);
  assertProtectedReleaseRun(run, expected, true);
  const main = await client.read("/branches/main");
  assert.ok(
    main.protected === true && main.commit?.sha === expected.controller,
    "Advisory evaluator requires the current protected source",
  );
  const native = checkedNativeJob(
    await releaseJobs(client, run.id, run.run_attempt),
    "Release advisory / Evaluate",
    run,
    "in_progress",
  );
  const trust = auditTrust(expected, native);
  const advisoryCases = readAdvisoryCases(expected.controller);
  const { npmCli } = selectNpmCliForVersion({
    candidates: findNpmCliCandidates(),
    expectedNpm: CI_RUNTIME.npm,
    observeVersion: observeNpmVersion,
  });
  const issued = await withAuditNpmClients(npmCli, async (npmCliForVersion) => {
    let batch;
    if (env.AUDIT_PURPOSE === "qualification") {
      const { loadQualificationAuditBatch } =
        await import("./qualification-audit-batch.mjs");
      batch = await loadQualificationAuditBatch(client, env, npmCli, {
        issuing: true,
        npmCliForVersion,
      });
    } else {
      const { loadPublicAuditBatch } = await import("./public-audit-batch.mjs");
      batch = await loadPublicAuditBatch(
        client,
        env,
        npmCliForVersion(CI_RUNTIME.consumerNpm),
      );
    }
    const receipt = await evaluateReleaseAudit(batch.entries, {
      authenticate: batch.authenticate,
      trust,
      npmCli,
      npmCliForVersion,
      advisoryCases,
      store: privateAuditStore,
    });
    return { ...receipt, count: batch.entries.length };
  });
  assert.equal(
    (await client.read("/branches/main")).commit.sha,
    expected.controller,
    "Protected source changed before recording decision",
  );
  const parent = resolve(".release");
  mkdirSync(parent, { recursive: true });
  const scratch = mkdtempSync(join(parent, "advisory-writing-"));
  assert.ok(isStrictDescendantPath(parent, scratch));
  try {
    writeFileSync(join(scratch, "receipt.json"), issued.statement, {
      flag: "wx",
    });
    writeFileSync(join(scratch, "receipt.sigstore.json"), issued.signature, {
      flag: "wx",
    });
    renameSync(scratch, join(parent, "advisory"));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  process.stdout.write(
    "Verified " +
      issued.count +
      " retained release subjects. Recorded one signed project decision.\n",
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await runProtectedAdvisoryJob();
  } catch {
    process.stderr.write(
      "Protected release check could not issue an eligible advisory decision. Check the native job, exact subject and evaluator policy.\n",
    );
    process.exitCode = 1;
  }
}
