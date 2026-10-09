import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { verifyDownloadedCandidateBundle } from "./candidate-bundle.mjs";
import { scopedWorkflowJobs } from "./generate-release-evidence.mjs";
import {
  assertDraftRelease,
  assertReleaseAssets,
  GitHubReleaseClient,
} from "./github-release.mjs";
import { assertPublicRegistryFacts } from "./qualify-public-registry.mjs";
import { readPublicRegistry } from "./public-registry-read.mjs";
import { buildReleaseEvidence } from "./release-evidence.mjs";
import { validateReleaseEvidence } from "./validate-release-evidence.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const controlPath = "docs/release/rc2-finalization-recovery.json";
const evidenceName =
  "hadden-industries-owlapi-0.1.0-rc.2.release-evidence.json";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path, value) =>
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
const requireFact = (condition, message) => {
  if (!condition) throw new Error(message);
};

const command = (executable, args, options = {}) => {
  const result = spawnSync(executable, args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    cwd: repositoryRoot,
    ...options,
  });
  const diagnostic = String(result.stderr ?? "")
    .replaceAll(options.env?.GITHUB_TOKEN ?? "<no-token>", "<REDACTED>")
    .slice(-4000);
  requireFact(
    result.status === 0,
    `${basename(executable)} operation failed (exit ${result.status}). ${diagnostic}`,
  );
  return result.stdout;
};

/** These are retained observations, not a replacement GitHub approvals response. */
export const assertApprovalObservations = (control, records, jobs) => {
  requireFact(
    JSON.stringify(
      control.approvalObservations.map(({ environment }) => environment).sort(),
    ) === JSON.stringify(["npm-release", "release-manual"]),
    "Both distinct original approval observations are required.",
  );
  for (const observation of control.approvalObservations) {
    const bytes = records[observation.record];
    requireFact(
      bytes && hash(bytes) === observation.sha256,
      "Retained approval observation digest differs.",
    );
    const record = JSON.parse(bytes.toString("utf8"));
    const approval =
      observation.environment === "release-manual"
        ? record.approval
        : record.npmReleaseApproval;
    requireFact(
      record.repository === control.repository &&
        String(record.runId) === control.runId &&
        record.attempt === control.publicationAttempt &&
        record.headSha === control.sourceCommit &&
        record.observedAt === observation.observedAt &&
        approval?.state === "approved" &&
        approval.user === observation.reviewer &&
        observation.reviewer === "MaksymShostak" &&
        (observation.environment === "release-manual" ||
          approval.verified === true),
      "Retained observation does not establish this original approval.",
    );
    const job = jobs.find(({ id }) => id === observation.jobId);
    requireFact(
      job?.run_attempt === 1 &&
        String(job.run_id) === control.runId &&
        job.head_sha === control.sourceCommit &&
        job.status === "completed" &&
        job.conclusion === "success",
      "Original protected job did not succeed for the approved source.",
    );
  }
};

export const assertRecoveryRun = (control, run, jobs) => {
  requireFact(
    String(run.id) === control.runId &&
      run.run_attempt === 2 &&
      run.head_sha === control.sourceCommit &&
      run.head_branch === "main" &&
      run.path === ".github/workflows/release.yml" &&
      run.event === "workflow_dispatch" &&
      run.status === "completed" &&
      run.conclusion === "failure",
    "Original release is not the exact failed verification attempt.",
  );
  for (const failed of control.failedJobs) {
    const job = jobs.find(({ id }) => id === failed.id);
    requireFact(
      job?.name === failed.name &&
        job.run_attempt === failed.attempt &&
        job.head_sha === control.sourceCommit &&
        String(job.run_id) === control.runId &&
        job.conclusion === "failure",
      "The original failed history changed or is absent.",
    );
  }
};

export const assertArchiveEntries = (entries, expected) => {
  const observed = entries.trim().split(/\r?\n/u).sort();
  requireFact(
    JSON.stringify(observed) === JSON.stringify([...expected].sort()) &&
      observed.every(
        (name) =>
          /^[A-Za-z0-9_.-]+$/u.test(name) && name !== "." && name !== "..",
      ),
    "Artifact archive has an unexpected or unsafe entry.",
  );
};

const readJobs = async (client, runId) => {
  const jobs = [];
  for (let page = 1; page <= 5; page++) {
    const response = await client.read(
      `/actions/runs/${runId}/jobs?filter=all&per_page=100&page=${page}`,
    );
    jobs.push(...response.jobs);
    if (jobs.length >= response.total_count) return jobs;
  }
  throw new Error("Release job inventory exceeded the bounded recovery read.");
};

const liveState = async (client, control) => {
  const [
    run,
    jobs,
    approvals,
    reference,
    tag,
    release,
    immutability,
    deployment,
    statuses,
  ] = await Promise.all([
    client.read(`/actions/runs/${control.runId}`),
    readJobs(client, control.runId),
    client.read(`/actions/runs/${control.runId}/approvals`),
    client.read(`/git/ref/tags/${control.tag}`),
    client.read(`/git/tags/${control.tagObject}`),
    client.getReleaseByTag(control.tag),
    client.read("/immutable-releases"),
    client.read(`/deployments/${control.deploymentId}`),
    client.read(`/deployments/${control.deploymentId}/statuses`),
  ]);
  assertRecoveryRun(control, run, jobs);
  requireFact(
    Array.isArray(approvals) && approvals.length === 0,
    "Approval-history state changed; reassess recovery rather than replacing live history.",
  );
  requireFact(
    reference.object?.type === "tag" &&
      reference.object.sha === control.tagObject &&
      tag.sha === control.tagObject &&
      tag.tag === control.tag &&
      tag.object?.type === "commit" &&
      tag.object.sha === control.sourceCommit &&
      tag.verification?.verified === true,
    "The signed canonical tag changed or is not GitHub verified.",
  );
  requireFact(
    immutability.enabled === true && release.id === control.releaseId,
    "Immutability or exact draft identity differs.",
  );
  assertDraftRelease(release, { tag: control.tag });
  requireFact(
    deployment.environment === "npm-release" &&
      deployment.sha === control.sourceCommit &&
      statuses.some(
        (status) =>
          status.state === "success" &&
          status.environment === "npm-release" &&
          status.log_url ===
            `https://github.com/${control.repository}/actions/runs/${control.runId}/job/114054625054`,
      ),
    "Original protected publisher deployment does not match.",
  );
  return { run, jobs, approvals, release, deployment, statuses };
};

const publicReadback = async (control) => {
  const registry = "https://registry.npmjs.org";
  const coordinate = encodeURIComponent("@hadden-industries/owlapi");
  const json = async (url) =>
    JSON.parse((await readPublicRegistry(new URL(url))).toString("utf8"));
  const [metadata, tags] = await Promise.all([
    json(`${registry}/${coordinate}/0.1.0-rc.2`),
    json(`${registry}/-/package/${coordinate}/dist-tags`),
  ]);
  const tarball = await readPublicRegistry(new URL(metadata.dist.tarball));
  assertPublicRegistryFacts({
    expectedVersion: "0.1.0-rc.2",
    retainedSha256: control.tarballSha256,
    metadata,
    distTags: tags,
    registryTarballSha256: hash(tarball),
  });
  requireFact(
    metadata.dist.integrity ===
      `sha512-${createHash("sha512").update(tarball).digest("base64")}`,
    "Current public tarball integrity differs.",
  );
  return {
    checkedAt: new Date().toISOString(),
    next: tags.next,
    latest: tags.latest,
    sha256: hash(tarball),
    integrity: metadata.dist.integrity,
  };
};

const downloadArtifact = async (client, artifact, control, root) => {
  const metadata = await client.read(`/actions/artifacts/${artifact.id}`);
  requireFact(
    metadata.name === artifact.name &&
      metadata.digest === artifact.digest &&
      !metadata.expired &&
      String(metadata.workflow_run?.id) === control.runId &&
      metadata.workflow_run?.head_sha === control.sourceCommit,
    "Retained artifact server identity differs.",
  );
  const redirect = await fetch(
    `${client.apiRoot}/actions/artifacts/${artifact.id}/zip`,
    {
      redirect: "manual",
      headers: client.headers(),
      signal: AbortSignal.timeout(60000),
    },
  );
  requireFact(
    redirect.status === 302,
    "Artifact API did not return the expected download redirect.",
  );
  const url = new URL(redirect.headers.get("location"));
  requireFact(
    url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (url.hostname.endsWith(".blob.core.windows.net") ||
        url.hostname.endsWith(".actions.githubusercontent.com")),
    "Artifact download origin is not an approved GitHub storage origin.",
  );
  // Never forward the GitHub credential to object storage.
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(60000),
  });
  requireFact(response.ok, "Artifact storage download failed.");
  const archive = Buffer.from(await response.arrayBuffer());
  requireFact(
    archive.length <= 16 * 1024 * 1024 &&
      `sha256:${hash(archive)}` === artifact.digest,
    "Downloaded artifact archive digest differs.",
  );
  const zip = join(root, `${artifact.key}.zip`);
  writeFileSync(zip, archive, { flag: "wx" });
  assertArchiveEntries(command("tar", ["-tf", zip]), artifact.files);
  return { archiveSha256: hash(archive) };
};

export const buildRecoveryEvidence = ({
  control,
  reports,
  candidate,
  jobs,
  run,
  controlCommit,
  inputEvidence,
  generatedAt = new Date().toISOString(),
}) => {
  const { publication, tag, draft, registry } = reports;
  requireFact(
    [publication, tag, draft, registry].every(
      (report) => report.result === "PASS",
    ) &&
      publication.schemaVersion === 2 &&
      publication.registryState === "DIRECT_BOOTSTRAP_READY" &&
      publication.candidate?.sha256 === control.tarballSha256 &&
      tag.sourceCommit === control.sourceCommit &&
      tag.tag === control.tag &&
      draft.releaseId === control.releaseId &&
      registry.tarballSha256 === control.tarballSha256 &&
      registry.next === "0.1.0-rc.2" &&
      registry.latest === "0.1.0-rc.2" &&
      registry.provenance?.sourceCommit === control.sourceCommit &&
      registry.provenance.subjectSha256 === control.tarballSha256 &&
      registry.provenance.runId === control.runId &&
      registry.provenance.runAttempt === 1 &&
      ["scoped", "alias"].every(
        (mode) =>
          registry.consumer?.[mode]?.package?.name ===
            "@hadden-industries/owlapi" &&
          registry.consumer[mode].package.version === "0.1.0-rc.2" &&
          registry.consumer[mode].integrity === registry.integrity &&
          registry.consumer[mode].signatureAudit?.invalid?.length === 0 &&
          registry.consumer[mode].signatureAudit?.missing?.length === 0,
      ),
    "Retained release reports do not qualify this exact publication.",
  );
  const { requiredJobs, publisherJob } = scopedWorkflowJobs({
    jobs,
    runId: control.runId,
    runAttempt: 2,
    commit: control.sourceCommit,
    provenance: registry.provenance,
  });
  const workflow = {
    name: "Release",
    commit: control.sourceCommit,
    runId: control.runId,
    runAttempt: 2,
    url: `https://github.com/${control.repository}/actions/runs/${control.runId}`,
    actor: run.actor.login,
  };
  const evidence = buildReleaseEvidence({
    generatedAt,
    producerContract: publication.producerContract,
    source: {
      repository: control.repository,
      ref: `refs/tags/${control.tag}`,
      commit: control.sourceCommit,
      tag: control.tag,
    },
    workflow,
    qualificationWorkflow: { ...workflow, runAttempt: 1 },
    candidate,
    publication: {
      mode: "DIRECT_OIDC",
      registry: "https://registry.npmjs.org/",
      coordinate: "@hadden-industries/owlapi@0.1.0-rc.2",
      channel: "next",
      integrity: registry.integrity,
      tarballUrl: registry.tarballUrl,
      verifiedAt: registry.verifiedAt,
      next: registry.next,
      latest: registry.latest,
      latestPresent: true,
      signatureAuditResult: "PASS",
      provenance: registry.provenance,
      publisherJob,
    },
    reconciliation: null,
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
    approvals: control.approvalObservations.map(
      ({ environment, reviewer, state, observedAt }) => ({
        environment,
        reviewer,
        state,
        observedAt,
      }),
    ),
    requiredJobs,
    inputEvidence,
    extendedTests: [
      ...[
        "branded-safari",
        "historical-browsers",
        "hosted-browser-service",
        "physical-real-devices",
      ].map((environment) => ({
        environment,
        result: "NOT_RUN",
        reason: "NO_PROVIDER_CONFIGURED",
      })),
      {
        environment: "operator-finalization-recovery",
        result: "PASS",
        reason: `Owner-authorized operator recovery at control revision ${controlCommit}. Original publication attempt 1 and verification attempt 2 are preserved. The workflow evidence job failed; it is not represented as successful. Approvals are retained operator observations of earlier authenticated API reads and direct owner confirmations; current API history is empty. Control: https://github.com/${control.repository}/blob/${controlCommit}/${controlPath}`,
      },
    ],
  });
  return validateReleaseEvidence(evidence);
};

/** Reconstruct exclusively from digest-checked server archives, not mutable extracted files. */
const evidenceFromArchives = ({
  root,
  control,
  controlBytes,
  state,
  commit,
  generatedAt,
}) => {
  const files = {};
  for (const artifact of control.artifacts) {
    const zip = join(root, `${artifact.key}.zip`);
    requireFact(
      `sha256:${hash(readFileSync(zip))}` === artifact.digest,
      "Retained recovery archive changed after preparation.",
    );
    assertArchiveEntries(command("tar", ["-tf", zip]), artifact.files);
    files[artifact.key] = Object.fromEntries(
      artifact.files.map((name) => [
        name,
        command("tar", ["-xOf", zip, name], { encoding: null }),
      ]),
    );
  }
  const reports = Object.fromEntries(
    control.artifacts
      .filter(({ key }) => key !== "candidate")
      .map(({ key, files: names }) => [
        key,
        JSON.parse(files[key][names[0]].toString("utf8")),
      ]),
  );
  const content = files.candidate;
  verifyDownloadedCandidateBundle({
    fileNames: Object.keys(content),
    checksumText: content.SHA256SUMS.toString("utf8"),
    sbomText:
      content["hadden-industries-owlapi-0.1.0-rc.2.cdx.json"].toString("utf8"),
    tarball: content["hadden-industries-owlapi-0.1.0-rc.2.tgz"],
  });
  const assets = Object.entries(content).map(([name, bytes]) => ({
    name,
    bytes: bytes.length,
    sha256: hash(bytes),
  }));
  const candidate = {
    artifactId: String(control.artifacts[0].id),
    artifactDigest: control.artifacts[0].digest,
    checksums: assets.find(({ name }) => name === "SHA256SUMS"),
    sbom: assets.find(({ name }) => name.endsWith(".json")),
    tarball: assets.find(({ name }) => name.endsWith(".tgz")),
  };
  requireFact(
    candidate.tarball.sha256 === control.tarballSha256,
    "Candidate does not match approved bytes.",
  );
  assertReleaseAssets({ assets: state.release.assets, expected: assets });
  const inputEvidence = [
    { name: basename(controlPath), sha256: hash(controlBytes) },
    ...control.approvalObservations.map(({ record: name, sha256 }) => ({
      name,
      sha256,
    })),
    ...control.artifacts
      .filter(({ key }) => key !== "candidate")
      .map(({ key, files: names }) => ({
        name: names[0],
        sha256: hash(files[key][names[0]]),
      })),
  ];
  return buildRecoveryEvidence({
    control,
    reports,
    candidate,
    jobs: state.jobs,
    run: state.run,
    controlCommit: commit,
    inputEvidence,
    generatedAt,
  });
};

export const assertPreparedEvidence = (bytes, reconstructed) => {
  requireFact(
    Buffer.from(bytes).equals(
      Buffer.from(`${JSON.stringify(reconstructed, null, 2)}\n`),
    ),
    "Prepared evidence differs from authenticated recovery inputs.",
  );
};

export const pinnedGitHubToken = (gh, expectedSha256, run = command) => {
  requireFact(
    hash(readFileSync(gh)) === expectedSha256,
    "GitHub CLI changed before authentication.",
  );
  return run(gh, ["auth", "token"], {
    env: { ...process.env, GH_PROMPT_DISABLED: "1" },
  }).trim();
};

export const verifyPinnedGitHubCli = (gh, expectedSha256, verify) => {
  const before = hash(readFileSync(gh));
  requireFact(
    before === expectedSha256,
    "GitHub CLI changed before verification.",
  );
  verify();
  const after = hash(readFileSync(gh));
  requireFact(after === before, "GitHub CLI changed during verification.");
  return {
    path: gh,
    executableSha256Before: before,
    executableSha256After: after,
  };
};

export const recoveryReceipt = ({
  root,
  commit,
  control,
  controlBytes,
  evidenceSha256,
  githubCliObservation,
}) => ({
  schemaVersion: 1,
  result: "PASS",
  mode: "OPERATOR_FINALIZATION_RECOVERY",
  controlCommit: commit,
  controlSha256: hash(controlBytes),
  sourceCommit: control.sourceCommit,
  githubCli: control.githubCli,
  githubCliObservation,
  evidenceSha256,
  childIdentityInterpretation:
    "Child promotionCommit binds the original release source; githubCli archive identity in the legacy verifier is its workflow policy constant. This receipt records the operator revision and observed Windows executable digests before and after verification.",
  reports: ["finalization.json", "immutable-verification.json"].map((name) => ({
    name,
    sha256: hash(readFileSync(join(root, name))),
  })),
  verifiedAt: new Date().toISOString(),
});

export const completeRecovery = async ({ root, intent, finalize, verify }) => {
  writeJson(join(root, "github-write-intent.json"), intent);
  await finalize();
  await verify();
};

const main = async () => {
  const args = process.argv.slice(2);
  const publish = args.includes("--publish");
  requireFact(
    args.length === (publish ? 7 : 6) &&
      args[0] === "--output" &&
      args[2] === "--approval-records" &&
      args[4] === "--gh" &&
      (!publish || args[6] === "--publish"),
    "Use --output <new external directory> --approval-records <retained directory> --gh <pinned Windows executable> [--publish].",
  );
  const root = resolve(args[1]);
  const approvalRoot = resolve(args[3]);
  requireFact(
    !root.toLowerCase().startsWith(repositoryRoot.toLowerCase()),
    "Recovery outputs must remain outside the source checkout.",
  );
  const commit = command("git", ["rev-parse", "HEAD"]).trim();
  requireFact(
    command("git", ["status", "--porcelain"]).trim() === "",
    "Recovery requires a clean, committed control revision.",
  );
  const controlBytes = readFileSync(join(repositoryRoot, controlPath));
  requireFact(
    hash(controlBytes) ===
      hash(command("git", ["show", `HEAD:${controlPath}`])),
    "Recovery control differs from committed bytes.",
  );
  const control = JSON.parse(controlBytes.toString("utf8"));
  const gh = resolve(args[5]);
  requireFact(
    hash(readFileSync(gh)) === control.githubCli.executableSha256,
    "GitHub CLI does not match the reviewed Windows 2.101.0 executable.",
  );
  const token = pinnedGitHubToken(gh, control.githubCli.executableSha256);
  const client = new GitHubReleaseClient({
    repository: control.repository,
    token,
  });
  const state = await liveState(client, control);
  const records = Object.fromEntries(
    control.approvalObservations.map(({ record }) => [
      record,
      readFileSync(join(approvalRoot, record)),
    ]),
  );
  assertApprovalObservations(control, records, state.jobs);
  const readback = publish ? null : await publicReadback(control);
  const childEnv = {
    ...process.env,
    GITHUB_TOKEN: token,
    GITHUB_REPOSITORY: control.repository,
    GITHUB_SHA: control.sourceCommit,
  };
  if (!publish) {
    requireFact(
      !existsSync(root),
      "Preparation requires a new evidence directory.",
    );
    mkdirSync(root, { recursive: true });
    const downloads = {};
    for (const artifact of control.artifacts)
      downloads[artifact.key] = await downloadArtifact(
        client,
        artifact,
        control,
        root,
      );
    const evidence = evidenceFromArchives({
      root,
      control,
      controlBytes,
      state,
      commit,
    });
    writeJson(join(root, evidenceName), evidence);
    writeJson(join(root, "prepared.json"), {
      result: "PASS",
      mode: "READ_ONLY_OPERATOR_PREPARATION",
      controlCommit: commit,
      controlSha256: hash(controlBytes),
      evidenceSha256: hash(readFileSync(join(root, evidenceName))),
      readback,
      archives: Object.fromEntries(
        Object.entries(downloads).map(([key, value]) => [
          key,
          value.archiveSha256,
        ]),
      ),
      failedJobs: control.failedJobs,
      currentApprovalsHistory: state.approvals,
    });
    process.stdout.write(`${join(root, "prepared.json")}\n`);
    return;
  }
  const prepared = readJson(join(root, "prepared.json"));
  const preparedBytes = readFileSync(join(root, evidenceName));
  const evidence = validateReleaseEvidence(
    JSON.parse(preparedBytes.toString("utf8")),
  );
  const reconstructed = evidenceFromArchives({
    root,
    control,
    controlBytes,
    state,
    commit,
    generatedAt: evidence.generatedAt,
  });
  assertPreparedEvidence(preparedBytes, reconstructed);
  requireFact(
    prepared.result === "PASS" &&
      prepared.controlCommit === commit &&
      prepared.controlSha256 === hash(controlBytes) &&
      prepared.evidenceSha256 === hash(preparedBytes),
    "Prepared evidence or control revision changed.",
  );
  assertReleaseAssets({
    assets: state.release.assets,
    expected: evidence.githubRelease.assets,
  });
  for (const artifact of control.artifacts) {
    requireFact(
      `sha256:${hash(readFileSync(join(root, `${artifact.key}.zip`)))}` ===
        artifact.digest,
      "Retained recovery archive changed after preparation.",
    );
  }
  command(
    process.execPath,
    [
      "scripts/verify-release-tag.mjs",
      "--tag",
      control.tag,
      "--commit",
      control.sourceCommit,
      "--output",
      join(root, "fresh-tag-before-publication.json"),
    ],
    { env: childEnv },
  );
  // Exclusive durable intent prevents a second invocation from replaying any possible write.
  const finalState = await liveState(client, control);
  assertApprovalObservations(control, records, finalState.jobs);
  assertReleaseAssets({
    assets: finalState.release.assets,
    expected: evidence.githubRelease.assets,
  });
  const finalReadback = await publicReadback(control);
  const publicationRoot = join(root, "publication-evidence");
  mkdirSync(publicationRoot);
  const publicationEvidence = join(publicationRoot, evidenceName);
  writeJson(publicationEvidence, reconstructed);
  const publicationSha256 = hash(readFileSync(publicationEvidence));
  requireFact(
    publicationSha256 === prepared.evidenceSha256,
    "Canonical publication evidence changed.",
  );
  const intent = {
    controlCommit: commit,
    sourceCommit: control.sourceCommit,
    releaseId: control.releaseId,
    evidenceSha256: publicationSha256,
    checkedAt: new Date().toISOString(),
    readback: finalReadback,
  };
  let githubCliObservation;
  await completeRecovery({
    root,
    intent,
    finalize: () =>
      command(
        process.execPath,
        [
          "scripts/finalize-github-release.mjs",
          "--evidence",
          publicationEvidence,
          "--evidence-sha256",
          publicationSha256,
          "--source-commit",
          control.sourceCommit,
          "--output",
          join(root, "finalization.json"),
        ],
        { env: childEnv },
      ),
    verify: () => {
      githubCliObservation = verifyPinnedGitHubCli(
        gh,
        control.githubCli.executableSha256,
        () =>
          command(
            process.execPath,
            [
              "scripts/verify-immutable-release.mjs",
              "--gh",
              gh,
              "--source-commit",
              control.sourceCommit,
              "--output-directory",
              join(root, "immutable-assets"),
              "--report",
              join(root, "immutable-verification.json"),
            ],
            { env: childEnv },
          ),
      );
    },
  });
  writeJson(
    join(root, "operator-recovery-receipt.json"),
    recoveryReceipt({
      root,
      commit,
      control,
      controlBytes,
      evidenceSha256: publicationSha256,
      githubCliObservation,
    }),
  );
  process.stdout.write(`${join(root, "operator-recovery-receipt.json")}\n`);
};

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  await main();
