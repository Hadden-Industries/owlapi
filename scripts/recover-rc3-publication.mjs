import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { crc32 } from "node:zlib";
import { GitHubReleaseClient, assertReleaseAssets } from "./github-release.mjs";
import {
  downloadReleaseArtifact,
  resolveRetainedApprovals,
} from "./release-approvals.mjs";
import { readZipArchiveFilesWith } from "./release-zip-core.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";
import { verifyDownloadedCandidateBundle } from "./candidate-bundle.mjs";
import { assertOwlContractReport } from "./owl-contract-evidence.mjs";
import { buildReleaseEvidence } from "./release-evidence.mjs";
import { validateReleaseEvidence } from "./validate-release-evidence.mjs";
import { readPublicationAttempt } from "./qualify-public-registry.mjs";
import {
  RC3_RECOVERY as control,
  RECOVERY_JOBS,
  RECOVERY_SOURCE_JOBS,
  RECOVERY_REQUIRED_JOBS,
  assertRecoverySource,
  assertRecoveryRegistryUnused,
} from "./rc3-recovery-policy.mjs";

const stem = "hadden-industries-owlapi-0.1.0-rc.3";
const artifactFiles = {
  candidate: ["SHA256SUMS", `${stem}.cdx.json`, `${stem}.tgz`],
  preflight: ["publication-preflight.json"],
  tag: ["tag-verification.json"],
  draft: ["draft-release.json"],
};
const command = (args, options = {}) => {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    timeout: 30000,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};
const allJobs = async (client, runId, attempt = 1) => {
  const result = await client.read(
    `/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100`,
  );
  assert.ok(Array.isArray(result.jobs) && result.jobs.length < 100);
  assert.equal(result.jobs.length, result.total_count);
  return result.jobs;
};
const jobFact = (job) => ({
  name: job.name,
  conclusion: job.conclusion,
  url: job.html_url,
});

export function verifySourceReports({ reports, candidate, artifact, tag }) {
  const preflight = reports.preflight;
  assert.equal(preflight.result, "PASS");
  assert.equal(preflight.schemaVersion, 2);
  assert.equal(preflight.canonicalTag, control.tag);
  assert.equal(preflight.registryState, "DIRECT_BOOTSTRAP_READY");
  assert.equal(preflight.candidate.sha256, candidate.tarball.sha256);
  assert.equal(preflight.candidate.bytes, candidate.tarball.bytes);
  assert.equal(
    preflight.candidate.coordinate,
    "@hadden-industries/owlapi@0.1.0-rc.3",
  );
  assertOwlContractReport(preflight.producerContract, {
    candidateSha256: candidate.tarball.sha256,
    artifact: { id: artifact.id, digest: artifact.digest },
  });
  assert.equal(
    preflight.producerContract.identity.commit,
    control.sourceCommit,
  );
  assert.equal(
    String(preflight.producerContract.identity.runId),
    control.runId,
  );
  assert.equal(preflight.producerContract.identity.runAttempt, 1);
  assert.equal(reports.tag.result, "PASS");
  assert.equal(reports.tag.sourceCommit, control.sourceCommit);
  assert.equal(reports.tag.tag, control.tag);
  assert.equal(tag.sha, control.tagObject);
  assert.equal(tag.object.type, "commit");
  assert.equal(tag.object.sha, control.sourceCommit);
  assert.equal(tag.verification.verified, true);
  assert.equal(reports.draft.result, "PASS");
  assert.equal(reports.draft.releaseId, control.releaseId);
  assert.equal(reports.draft.sourceCommit, control.sourceCommit);
  assert.equal(reports.draft.tag, control.tag);
  assert.equal(reports.draft.draft, true);
}

/** Draft visibility requires GitHub write permission. Only the isolated draft
 * job performs this live read; source/evidence jobs consume authenticated reports. */
export function assertRecoveryDraft(release, expectedAssets) {
  assert.equal(release.id, control.releaseId);
  assert.equal(release.tag_name, control.tag);
  assert.equal(release.draft, true);
  assert.equal(release.prerelease, true);
  assert.equal(release.immutable, false);
  assertReleaseAssets({
    assets: release.assets,
    expected: expectedAssets,
  });
}

export async function readSource({
  client,
  download = downloadReleaseArtifact,
}) {
  const run = await client.read(`/actions/runs/${control.runId}`);
  const jobs = await allJobs(client, control.runId);
  const failedJob = assertRecoverySource(run, jobs);
  const records = {},
    artifacts = {};
  for (const [key, id] of Object.entries(control.artifacts)) {
    const artifact = await client.read(`/actions/artifacts/${id}`);
    assert.equal(artifact.id, id);
    assert.equal(String(artifact.workflow_run?.id), control.runId);
    assert.equal(artifact.workflow_run?.head_sha, control.sourceCommit);
    assert.equal(artifact.expired, false);
    const archive = await download(client, artifact);
    assert.equal(archive.length, artifact.size_in_bytes);
    assert.equal(`sha256:${sha256Buffer(archive)}`, artifact.digest);
    const entries = readZipArchiveFilesWith(archive, { crc32 });
    assert.deepEqual(
      entries.map((e) => e.path).sort(),
      [...artifactFiles[key]].sort(),
    );
    records[key] = Object.fromEntries(entries.map((e) => [e.path, e.content]));
    artifacts[key] = artifact;
  }
  const candidate = verifyDownloadedCandidateBundle({
    fileNames: Object.keys(records.candidate),
    tarball: records.candidate[`${stem}.tgz`],
    sbomText: records.candidate[`${stem}.cdx.json`],
    checksumText: records.candidate.SHA256SUMS,
  });
  const reports = Object.fromEntries(
    ["preflight", "tag", "draft"].map((key) => [
      key,
      JSON.parse(records[key][artifactFiles[key][0]]),
    ]),
  );
  const ref = await client.read(`/git/ref/tags/${control.tag}`);
  assert.equal(ref.object.type, "tag");
  assert.equal(ref.object.sha, control.tagObject);
  const tag = await client.read(`/git/tags/${control.tagObject}`);
  verifySourceReports({
    reports,
    candidate,
    artifact: artifacts.candidate,
    tag,
  });
  const expected = Object.values(candidate.assets);
  const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  assert.deepEqual(
    [...reports.draft.assets].sort(byName),
    expected.sort(byName),
  );
  return {
    run,
    jobs,
    failedJob,
    records,
    artifacts,
    reports,
    candidate,
  };
}

export function assertControllerPackageUnchanged(root, commit) {
  command(["diff", "--exit-code", "HEAD"], { cwd: root });
  assert.equal(command(["rev-parse", "HEAD"], { cwd: root }).trim(), commit);
  command(["merge-base", "--is-ancestor", control.sourceCommit, commit], {
    cwd: root,
  });
  assert.notEqual(commit, control.sourceCommit);
  // Only release-controller code, its tests and records may differ. The original
  // package and dependency graph remain frozen at the signed source commit.
  const changed = command(
    ["diff", "--name-only", control.sourceCommit, commit],
    { cwd: root },
  )
    .trim()
    .split("\n")
    .filter(Boolean);
  assert.ok(changed.length > 0);
  for (const path of changed)
    assert.ok(
      path.startsWith("scripts/") ||
        path.startsWith("docs/release/") ||
        path.startsWith("docs/plans/") ||
        path === ".github/workflows/release.yml" ||
        path === ".github/workflows/markdown-quality.yml",
      `Recovery changes package or unrelated source: ${path}`,
    );
}

const assertController = async (client, env) => {
  assert.equal(env.GITHUB_REPOSITORY, control.repository);
  assert.equal(env.GITHUB_REF, "refs/heads/main");
  assert.equal(env.GITHUB_RUN_ATTEMPT, "1");
  assert.match(env.GITHUB_SHA ?? "", /^[a-f0-9]{40}$/u);
  const run = await client.read(`/actions/runs/${env.GITHUB_RUN_ID}`);
  assert.equal(run.head_sha, env.GITHUB_SHA);
  assert.equal(run.head_branch, "main");
  assert.equal(run.event, "workflow_dispatch");
  assert.equal(run.path, ".github/workflows/release.yml");
  assert.equal(run.run_attempt, 1);
  assert.equal(run.head_repository.full_name, control.repository);
  return run;
};

const verifySource = async (client, directory, env) => {
  await assertController(client, env);
  const current = await client.read("/git/ref/heads/main");
  assert.equal(current.object.sha, env.GITHUB_SHA);
  assertControllerPackageUnchanged(process.cwd(), env.GITHUB_SHA);
  const source = await readSource({ client });
  await assertRecoveryRegistryUnused();
  mkdirSync(directory, { recursive: true });
  const report = {
    result: "PASS",
    sourceCommit: control.sourceCommit,
    sourceRunId: control.runId,
    controllerCommit: env.GITHUB_SHA,
    controllerRunId: env.GITHUB_RUN_ID,
    originalPublisher: jobFact(source.failedJob),
    publicationWrite: "NOT_ATTEMPTED",
    candidateArtifactId: control.artifacts.candidate,
    candidateSha256: source.candidate.tarball.sha256,
  };
  writeFileSync(
    join(directory, "source-verification.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    { flag: "wx" },
  );
  process.stdout.write(`${JSON.stringify(report)}\n`);
};

const generateEvidence = async (client, directory, env) => {
  const run = await assertController(client, env);
  const source = await readSource({ client });
  const jobs = await allJobs(client, env.GITHUB_RUN_ID);
  const required = RECOVERY_REQUIRED_JOBS.filter(
    (name) => !RECOVERY_SOURCE_JOBS.includes(name),
  ).map((name) => {
    const matches = jobs.filter((j) => j.name === name);
    assert.equal(matches.length, 1);
    const job = matches[0];
    assert.equal(job.head_sha, env.GITHUB_SHA);
    assert.equal(String(job.run_id), env.GITHUB_RUN_ID);
    assert.equal(job.run_attempt, 1);
    assert.equal(job.conclusion, "success");
    return jobFact(job);
  });
  const registry = JSON.parse(
    readFileSync(join(directory, "registry-verification.json"), "utf8"),
  );
  assert.equal(registry.result, "PASS");
  assert.equal(registry.tarballSha256, source.candidate.tarball.sha256);
  const publication = await readPublicationAttempt({
    client,
    env,
    publisherName: RECOVERY_JOBS.recovery_publish,
  });
  assert.equal(publication.state, "PUBLICATION_ACCEPTED");
  assert.equal(registry.provenance.runId, env.GITHUB_RUN_ID);
  assert.equal(registry.provenance.sourceCommit, env.GITHUB_SHA);
  assert.equal(registry.provenance.runAttempt, 1);
  for (const mode of ["alias", "scoped"]) {
    assert.equal(
      registry.consumer[mode].package.name,
      "@hadden-industries/owlapi",
    );
    assert.equal(registry.consumer[mode].package.version, "0.1.0-rc.3");
    assert.equal(registry.consumer[mode].integrity, registry.integrity);
  }
  const retained = await resolveRetainedApprovals({
    client,
    commit: env.GITHUB_SHA,
    runId: env.GITHUB_RUN_ID,
    runAttempt: 1,
    jobs,
    liveHistory: await client.read(
      `/actions/runs/${env.GITHUB_RUN_ID}/approvals`,
    ),
    recovery: true,
  });
  const { preflight, tag, draft } = source.reports;
  const assets = source.candidate.assets;
  const workflow = {
    name: "Release",
    commit: env.GITHUB_SHA,
    runId: env.GITHUB_RUN_ID,
    runAttempt: 1,
    url: run.html_url,
    actor: run.actor.login,
  };
  const evidence = buildReleaseEvidence({
    generatedAt: new Date().toISOString(),
    producerContract: preflight.producerContract,
    source: {
      repository: control.repository,
      ref: `refs/tags/${control.tag}`,
      tag: control.tag,
      commit: control.sourceCommit,
    },
    workflow,
    qualificationWorkflow: {
      name: "Release",
      commit: control.sourceCommit,
      runId: control.runId,
      runAttempt: 1,
      url: source.run.html_url,
      actor: source.run.actor.login,
    },
    candidate: {
      artifactId: String(control.artifacts.candidate),
      artifactDigest: source.artifacts.candidate.digest,
      ...assets,
    },
    publication: {
      mode: "DIRECT_OIDC",
      registry: registry.registry,
      coordinate: registry.coordinate,
      channel: "next",
      integrity: registry.integrity,
      tarballUrl: registry.tarballUrl,
      verifiedAt: registry.verifiedAt,
      next: registry.next,
      latest: registry.latest,
      latestPresent: true,
      signatureAuditResult: "PASS",
      provenance: registry.provenance,
      publisherJob: {
        url: jobs.find((j) => j.name === RECOVERY_JOBS.recovery_publish)
          .html_url,
        runAttempt: 1,
        conclusion: "success",
      },
    },
    reconciliation: {
      failureClass: "PRE_PUBLICATION_APPROVAL_CAPTURE_IMPORT_FAILURE",
      sourceFailureJob: jobFact(source.failedJob),
      publicationWrite: "NOT_ATTEMPTED",
      tagObject: control.tagObject,
      packageReproduction: "ORIGINAL_QUALIFIED_ARTIFACT",
    },
    signing: {
      signerId: tag.signerId,
      signerPrincipal: tag.signerPrincipal,
      fingerprint: tag.fingerprint,
      githubVerifiedAt: tag.githubVerifiedAt,
    },
    githubRelease: {
      id: draft.releaseId,
      url: draft.releaseUrl,
      draft: true,
      assets: draft.assets,
    },
    approvals: retained.approvals,
    requiredJobs: [
      ...RECOVERY_SOURCE_JOBS.map((name) =>
        jobFact(source.jobs.find((j) => j.name === name)),
      ),
      ...required,
    ],
    extendedTests: [
      "branded-safari",
      "historical-browsers",
      "hosted-browser-service",
      "physical-real-devices",
    ].map((environment) => ({
      environment,
      result: "NOT_RUN",
      reason: "NO_PROVIDER_CONFIGURED",
    })),
    inputEvidence: [
      ...Object.values(source.artifacts).map((a) => ({
        name: a.name,
        sha256: a.digest.slice(7),
      })),
      ...retained.inputs,
    ],
  });
  validateReleaseEvidence(evidence);
  writeFileSync(
    join(directory, `${stem}.release-evidence.json`),
    `${JSON.stringify(evidence, null, 2)}\n`,
    { flag: "wx" },
  );
};

const main = async () => {
  const mode = process.argv[2],
    directory = resolve(".release/recovery");
  const client = new GitHubReleaseClient({
    repository: control.repository,
    token: process.env.GITHUB_TOKEN,
  });
  if (mode === "source") await verifySource(client, directory, process.env);
  else if (mode === "draft") {
    assert.equal(process.env.GITHUB_JOB, "recovery_draft");
    await assertController(client, process.env);
    const source = await readSource({ client });
    const release = await client.read(`/releases/${control.releaseId}`);
    assertRecoveryDraft(release, source.reports.draft.assets);
    process.stdout.write(
      `${JSON.stringify({ result: "PASS", releaseId: release.id, tag: release.tag_name, assets: source.reports.draft.assets })}\n`,
    );
  } else if (mode === "evidence")
    await generateEvidence(client, directory, process.env);
  else throw new Error("Expected source, draft or evidence recovery operation");
};
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  await main();
