/** Read-only verification of the exact failed recipient after an authorized decision. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { GitHubReleaseClient } from "./github-release.mjs";
import { createRepositoryReader } from "./github-evidence-reader.mjs";
import { REPOSITORY, REPOSITORY_ID } from "./release-identity.mjs";
import { PACKAGE_FILE_STEM, PACKAGE_VERSION } from "./package-identity.mjs";
import { CI_JOB_NAMES } from "./ci-qualification.mjs";
import {
  CANONICAL_NODE,
  CI_RUNTIME,
  runtimeSemver,
} from "./runtime-policy.mjs";
import {
  assertTimedUpload,
  checkedNativeJob,
  releaseJobs,
} from "./release-audit-job.mjs";
import { downloadReleaseArtifact } from "./release-approvals.mjs";
import { readQualifiedZip } from "./release-ci-package.mjs";
import { parseCorpusArtifactLocator } from "./corpus-qualification-manifest.mjs";
import { artifactProducingAttempt } from "../tooling/artifact-transport/identity.mjs";
import { verifyDownloadedCandidateBundle } from "./candidate-bundle.mjs";
import {
  captureResolutionEvidence,
  verifyResolutionEvidence,
} from "./release-consumer-evidence.mjs";
import {
  assertHealthyNpmGraph,
  assertNpmSbomInventory,
  flattenNpmGraph,
} from "./npm-production-graph.mjs";
import { prepareRecipientMaterial } from "../util/third-party-evidence/recipient-material.mjs";
import { readPendingMacRecipientCase } from "./replay-ci-recipient-material.mjs";
import {
  installRegistryConsumer,
  publicRegistryEnvironment,
} from "./public-registry-consumer.mjs";
import {
  preflightFullReleaseAudit,
  preflightReleaseAudit,
} from "./release-audit-evaluator.mjs";
import {
  INSTALLED_TEST_SCRIPTS,
  productionInstallScriptPolicy,
  writeInstalledConsumerFixtures,
} from "./installed-consumer-fixtures.mjs";
import {
  findNpmCliCandidates,
  observeNpmVersion,
  selectNpmCliForVersion,
} from "./assert-workflow-runtime.mjs";
import { assertConsumerNpm } from "./consumer-runtime-tools.mjs";
import { qualificationMatrix } from "./consumer-runtime-matrix.mjs";
import { isStrictDescendantPath, sha256Buffer } from "./release-file-utils.mjs";
import { jsonEquals, stableJson } from "./canonical-json.mjs";
import {
  openRecipientMaterialCase,
  recipientMaterialCaseDirectory,
  recipientMaterialCaseLimit,
  recipientMaterialCaseUpload,
} from "./recipient-material-case.mjs";
import {
  assertAuthorizedRecipientMaterialReplay,
  authorizeRecipientMaterialReplay,
} from "./recipient-material-case-authority.mjs";

const replayWorkflow = ".github/workflows/recipient-material-replay.yml";
const publicWorkflow = ".github/workflows/release-registry.yml";
const originalCi = ".github/workflows/ci.yml";
const originalRelease = ".github/workflows/release.yml";
const stem = `${PACKAGE_FILE_STEM}-${PACKAGE_VERSION}`;
const tarballName = `${stem}.tgz`;
const sbomName = `${stem}.cdx.json`;
const archiveLimit = 64 * 1024 * 1024;
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const hash = (value) => sha256Buffer(Buffer.from(stableJson(value)));

function runtime({ platform, npm }) {
  const { os, cpu, node } = platform;
  const lane = CI_RUNTIME.consumerPlatforms.find(
    (entry) => entry.os === os && entry.arch === cpu,
  );
  assert.ok(
    lane &&
      runtimeSemver.valid(node) === node &&
      runtimeSemver.prerelease(node) === null,
  );
  assert.ok(
    CI_RUNTIME.minimums.some((minimum) =>
      runtimeSemver.satisfies(node, `^${minimum}`),
    ),
  );
  assert.ok(
    npm === CI_RUNTIME.consumerNpm ||
      (npm === CI_RUNTIME.npm && node === CANONICAL_NODE),
  );
  return { runner: lane.runner, shell: lane.shell, node, npm };
}

function expectedSource({ role, origin, context, evidence }, platform) {
  const { runner, node } = platform;
  const tail = `${origin.runId}-${origin.attempt}`;
  const label = CI_RUNTIME.consumerPlatforms[0].runner;
  if (context?.kind === "PUBLIC_OBSERVATION") {
    assert.equal(origin.workflow, publicWorkflow);
    assert.equal(origin.job, "material");
    assert.ok(["public-alias", "public-scoped"].includes(role));
    return {
      name: "material",
      runner: label,
      logical: `recipient-material-case-material-${tail}`,
    };
  }
  if (context?.kind === "MAC_SCANNER") {
    assert.equal(origin.workflow, replayWorkflow);
    assert.equal(origin.job, "scan");
    assert.equal(evidence.resolution.platform.os, "darwin");
    assert.ok(["portability-alias", "portability-scoped"].includes(role));
    return {
      name: "Recipient material / Scan",
      runner: label,
      logical: `recipient-material-case-scan-${tail}`,
    };
  }
  assert.ok(
    [originalCi, originalRelease].includes(origin.workflow),
    "Original case requires a qualified workflow",
  );
  const workflow = origin.workflow === originalCi ? "CI" : "Release";
  const producer = `${workflow} / retained candidate / Produce`;
  if (context?.kind === "PRODUCER_CANDIDATE") {
    assert.equal(origin.job, "produce");
    assert.equal(runner, label);
    assert.ok(
      [
        "candidate-producer",
        "candidate-inspection",
        "candidate-normal",
        "candidate-scoped",
      ].includes(role),
    );
    return {
      name: producer,
      runner: label,
      logical: `recipient-material-case-produce-${tail}`,
    };
  }
  assert.equal(
    context?.kind,
    "QUALIFIED_CANDIDATE",
    "A hosted case requires its original candidate artifact",
  );
  if (["portability-alias", "portability-scoped"].includes(role)) {
    const os = { linux: "Linux", win32: "Windows", darwin: "macOS" }[
      evidence.resolution.platform.os
    ];
    const inMatrix = origin.job === "consumer_runtime";
    assert.ok(
      inMatrix ||
        /^portability_(?:ubuntu|windows|macos)_node_(?:22|24|26)$/u.test(
          origin.job,
        ),
    );
    const nativeProducer = !inMatrix && platform.npm === CI_RUNTIME.npm;
    if (nativeProducer) assert.match(origin.job, /_node_26$/u);
    const name = inMatrix
      ? `${workflow} / complete consumer qualification / Consumer / ${runner} / Node ${node}`
      : CI_JOB_NAMES[origin.job].replace(/^CI/u, workflow);
    return {
      name,
      runner,
      producer,
      logical: `recipient-material-case-${origin.job}-${os}-${nativeProducer ? "" : `${node}-`}${tail}`,
    };
  }
  const browser = /^browser_(chromium|firefox|webkit)$/u.test(origin.job);
  assert.ok(
    browser
      ? /^browser-(?:bundler|worker|import-map-input)$/u.test(role)
      : origin.job === "owl_contract" && role === "owl-contract",
  );
  assert.equal(runner, label);
  return {
    name: CI_JOB_NAMES[origin.job].replace(/^CI/u, workflow),
    runner,
    producer,
    logical: `recipient-material-case-${origin.job}-${tail}`,
  };
}

async function readArtifact(client, locator) {
  const artifact = await client.read(`/actions/artifacts/${locator.id}`, {
    retryArtifact404: true,
  });
  assert.equal(artifact.id, locator.id);
  assert.equal(artifact.digest, `sha256:${locator.sha256}`);
  if (
    artifact.expired === true ||
    Date.parse(artifact.expires_at) <= Date.now()
  ) {
    const error = new Error("Original recipient evidence expired");
    error.code = "RECIPIENT_ORIGINAL_EXPIRED";
    throw error;
  }
  assert.ok(
    artifact.expired === false && Date.parse(artifact.expires_at) > Date.now(),
    "Original recipient evidence expired",
  );
  return artifact;
}

const readZip = (client, artifact, names, limit) =>
  readQualifiedZip(
    (metadata, maximum) => downloadReleaseArtifact(client, metadata, maximum),
    artifact,
    limit,
    names,
  );

export async function reopenOriginalRecipientMaterialCase(client, env) {
  assert.match(env.RECIPIENT_CASE_SHA256 ?? "", /^[a-f0-9]{64}$/u);
  const artifact = await readArtifact(
    client,
    parseCorpusArtifactLocator(env.RECIPIENT_OBSERVATION),
  );
  const producerCase = artifact.name.startsWith(
    "recipient-material-case-produce-",
  );
  const name = `${producerCase ? `${recipientMaterialCaseDirectory}/` : ""}case-${env.RECIPIENT_CASE_SHA256}.json`;
  const members = await readZip(
    client,
    artifact,
    producerCase ? [name, tarballName, sbomName] : [name],
    producerCase ? archiveLimit : recipientMaterialCaseLimit,
  );
  const original = openRecipientMaterialCase(
    members.get(name),
    env.RECIPIENT_CASE_SHA256,
  );
  const { packet } = original;
  assert.equal(packet.origin.scope, "GITHUB_ACTIONS");
  assert.equal(
    packet.origin.commit,
    env.GITHUB_SHA,
    "Original recipient needs a current qualified controller",
  );
  assert.equal(producerCase, packet.context?.kind === "PRODUCER_CANDIDATE");
  const lane = runtime(packet.evidence.resolution);
  const source = expectedSource(packet, lane);
  const run = await client.read(`/actions/runs/${packet.origin.runId}`);
  assert.deepEqual(
    [
      run.id,
      run.path,
      run.head_sha,
      run.head_branch,
      run.repository?.id,
      run.head_repository?.id,
    ],
    [
      packet.origin.runId,
      packet.origin.workflow,
      packet.origin.commit,
      "main",
      REPOSITORY_ID,
      REPOSITORY_ID,
    ],
  );
  assert.ok(["push", "workflow_dispatch"].includes(run.event));
  assert.ok(
    run.status === "completed" &&
      ["failure", "success"].includes(run.conclusion) &&
      positive(run.run_attempt) &&
      run.run_attempt >= packet.origin.attempt,
    "Missing completed original qualification run",
  );
  const jobs = await releaseJobs(client, run.id, packet.origin.attempt);
  const matching = jobs.filter(({ name }) => name === source.name);
  assert.equal(matching.length, 1);
  const [job] = matching;
  assert.ok(
    positive(job.id) &&
      job.status === "completed" &&
      job.conclusion === "failure",
  );
  assert.deepEqual(
    [job.head_sha, job.run_id, job.run_attempt, job.labels],
    [run.head_sha, run.id, packet.origin.attempt, [source.runner]],
  );
  assertTimedUpload(
    artifact,
    run,
    job,
    source.logical,
    recipientMaterialCaseUpload,
  );
  return { original, lane, source, artifact, run, job, jobs, members };
}

export async function reopenOriginalRecipientMaterialSubject(
  client,
  input,
  env,
  npmCli,
) {
  const {
    original: { packet },
    members,
    source,
    run,
    jobs,
  } = input;
  const { context, evidence, role } = packet;
  if (context.kind === "PRODUCER_CANDIDATE") {
    const tarball = members.get(tarballName);
    const sbom = members.get(sbomName);
    assert.equal(sha256Buffer(sbom), context.sbomSha256);
    return { tarball, sbom };
  }
  if (context.kind === "PUBLIC_OBSERVATION") {
    const [{ loadPublicContext }, { readPendingPublicObservation }] =
      await Promise.all([
        import("./public-audit-batch.mjs"),
        import("./public-reconciliation-proof.mjs"),
      ]);
    const { checkpoint, operation, matrix, input, options } =
      await loadPublicContext(
        client,
        {
          ...env,
          HISTORY_OBJECT: context.historyObject,
          GITHUB_RUN_ID: String(run.id),
          GITHUB_RUN_ATTEMPT: String(packet.origin.attempt),
        },
        npmCli,
      );
    assert.ok(
      jsonEquals(input, context.stage),
      "Original registry stage changed",
    );
    const { observation, registryTarball } = await readPendingPublicObservation(
      client,
      checkpoint,
      operation,
      matrix,
      input,
      { ...options, lane: context.lane },
    );
    assert.ok(
      jsonEquals(context.observation, {
        artifact: observation.artifact,
        source: observation.source,
      }),
      "Original public observation changed",
    );
    assert.ok(
      jsonEquals(
        evidence,
        observation.consumers[role.slice("public-".length)].evidence,
      ),
      "Original public recipient changed",
    );
    return { tarball: options.tarball, registryTarball, registryInput: input };
  }
  if (context.kind === "MAC_SCANNER") {
    const { pending, tarball, originalSha256 } =
      await readPendingMacRecipientCase(client, {
        ...env,
        RECIPIENT_OBSERVATION: context.originalObservation,
      });
    assert.equal(originalSha256, context.originalSha256);
    assert.equal(role, pending.role);
    assert.ok(
      jsonEquals(evidence, pending.evidence),
      "Original macOS recipient changed",
    );
    return { tarball };
  }
  assert.match(context.candidate.digest, /^sha256:[a-f0-9]{64}$/u);
  const candidate = await readArtifact(
    client,
    parseCorpusArtifactLocator(
      `${context.candidate.id}:${context.candidate.digest.slice(7)}`,
    ),
  );
  const prefix = `${stem}-candidate-${run.id}-`;
  const attempt = artifactProducingAttempt(candidate.name, prefix, {
    run: run.id,
    attempt: run.run_attempt,
    legacy: false,
  });
  assert.ok(attempt, "Missing original producer candidate");
  assert.ok(attempt <= packet.origin.attempt);
  const producer = checkedNativeJob(
    attempt === packet.origin.attempt
      ? jobs
      : await releaseJobs(client, run.id, attempt),
    source.producer,
    run,
  );
  assert.equal(producer.run_attempt, attempt);
  assert.deepEqual(producer.labels, [CI_RUNTIME.consumerPlatforms[0].runner]);
  assertTimedUpload(
    candidate,
    run,
    producer,
    prefix + attempt,
    "Upload the exact same-run candidate",
  );
  const files = await readZip(
    client,
    candidate,
    [tarballName, sbomName, "SHA256SUMS"],
    archiveLimit,
  );
  const tarball = files.get(tarballName);
  verifyDownloadedCandidateBundle({
    fileNames: [...files.keys()],
    checksumText: files.get("SHA256SUMS"),
    sbomText: files.get(sbomName),
    tarball,
  });
  return { tarball };
}

/** Reuse the original-lock native reader and authenticate all material before
 * touching an installed package. This is eligible only for the measured role. */
export async function replayRecipientMaterialObservation({
  original,
  subject,
  npmCli,
  root,
  authorization,
}) {
  assertAuthorizedRecipientMaterialReplay(authorization, original);
  const { packet, caseSha256 } = original;
  const { evidence, role, material } = packet;
  const { resolution } = evidence;
  const { tarball, registryTarball, registryInput, sbom } = subject;
  assert.deepEqual(
    [process.platform, process.arch, process.versions.node],
    [resolution.platform.os, resolution.platform.cpu, resolution.platform.node],
  );
  assert.equal(sha256Buffer(tarball), resolution.tarballSha256);
  const dependencyName = resolution.dependencyName;
  await verifyResolutionEvidence(evidence, {
    tarball,
    dependencyName,
    registryTarball,
    platform: resolution.platform,
    observedNpm: resolution.npm,
    npmCli,
  });
  const reader = await prepareRecipientMaterial({ npmCli });
  await reader.verifyRetained({
    recordBytes: Buffer.from(material.original),
    recordSha256: material.sha256,
    resolution,
    lockfileBytes: Buffer.from(evidence.lock),
  });
  const directory = join(root, "consumer");
  let environment;
  const run = (args) =>
    execFileSync(process.execPath, args, {
      cwd: directory,
      env: environment,
      windowsHide: true,
      stdio: "pipe",
      timeout: 20 * 60_000,
    });
  if (registryTarball) {
    ({ environment } = installRegistryConsumer({
      directory,
      dependencyName,
      metadata: {
        ...registryInput.package,
        dist: { tarball: registryTarball, integrity: registryInput.integrity },
      },
      npmCli,
      original: evidence,
    }));
  } else {
    mkdirSync(directory);
    environment = publicRegistryEnvironment(directory);
    writeFileSync(join(directory, "package.json"), evidence.manifest, {
      flag: "wx",
    });
    writeFileSync(join(directory, "package-lock.json"), evidence.lock, {
      flag: "wx",
    });
    if (dependencyName)
      writeFileSync(join(directory, "candidate.tgz"), tarball, { flag: "wx" });
    const normal = role === "candidate-normal";
    if (normal) {
      const scripts = productionInstallScriptPolicy();
      assert.ok(
        !Object.values(scripts).some(Boolean) &&
          jsonEquals(JSON.parse(evidence.manifest).allowScripts, scripts),
        "Accepted lifecycle scripts require exact pre-authentication",
      );
    }
    run([
      npmCli,
      "ci",
      ...(dependencyName ? [] : ["--omit=dev"]),
      normal ? "--strict-allow-scripts" : "--ignore-scripts",
      "--no-fund",
      "--no-audit",
      "--cache",
      join(root, "cache"),
    ]);
  }
  const actual = await captureResolutionEvidence(directory, {
    tarball,
    dependencyName,
    registryTarball,
    npmCli,
  });
  assert.ok(
    jsonEquals(actual, evidence),
    "Native replay changed the original recipient",
  );
  const auditSubject = {
    manifestBytes: Buffer.from(evidence.manifest),
    lockBytes: Buffer.from(evidence.lock),
    tarballSha256: resolution.tarballSha256,
    graphSha256: hash(resolution.graph),
    platform: { ...resolution.platform, npm: resolution.npm },
    scope: "production",
    role: registryTarball
      ? "recipient"
      : dependencyName
        ? "candidate"
        : "producer",
  };
  const audit = await preflightReleaseAudit(auditSubject, {
    npmCli,
    npm: resolution.npm,
  });
  assert.equal(
    audit.eligible,
    true,
    "Recipient replay advisory policy requires disposition",
  );
  const checks = [
    "ORIGINAL_NATIVE_GRAPH",
    "AUTHENTICATED_RECIPIENT_MATERIAL",
    "PRODUCTION_ADVISORY",
  ];
  if (dependencyName) {
    writeInstalledConsumerFixtures(directory, dependencyName);
    for (const script of INSTALLED_TEST_SCRIPTS) run([script]);
    checks.push(...INSTALLED_TEST_SCRIPTS);
  } else {
    const full = await preflightFullReleaseAudit(
      {
        ...auditSubject,
        scope: "full",
        graphSha256: hash(JSON.parse(evidence.lock).packages),
      },
      { npmCli, npm: resolution.npm },
    );
    assert.equal(
      full.eligible,
      true,
      "Producer full advisory policy requires disposition",
    );
    const graph = JSON.parse(
      run([npmCli, "ls", "--omit=dev", "--all", "--json"]),
    );
    assertHealthyNpmGraph(graph);
    assertNpmSbomInventory(JSON.parse(sbom), flattenNpmGraph(graph), {
      graph: resolution.graph,
      tarball,
    });
    checks.push("FULL_ADVISORY", "LOCKED_SBOM");
  }
  return {
    schemaVersion: 1,
    result: "PASS",
    scope: "RECIPIENT_MATERIAL_REPLAY",
    role,
    caseSha256,
    materialSha256: material.sha256,
    source: packet.origin,
    authorization,
    subject: audit.subject,
    observedAt: audit.observedAt,
    checks,
  };
}

async function main(env) {
  assert.equal(env.GITHUB_ACTIONS, "true");
  assert.equal(env.GITHUB_REPOSITORY, REPOSITORY);
  assert.equal(env.GITHUB_REF, "refs/heads/main");
  assert.equal(env.GITHUB_EVENT_NAME, "workflow_dispatch");
  assert.equal(
    env.GITHUB_WORKFLOW_REF,
    `${REPOSITORY}/${replayWorkflow}@${env.GITHUB_REF}`,
  );
  const client = new GitHubReleaseClient({
    repository: REPOSITORY,
    token: env.GH_TOKEN,
    reader: createRepositoryReader({
      repository: REPOSITORY,
      token: env.GH_TOKEN,
      requestLimit: 96,
    }),
  });
  const branch = await client.read("/branches/main");
  assert.ok(branch.protected === true && branch.commit?.sha === env.GITHUB_SHA);
  const input = await reopenOriginalRecipientMaterialCase(client, env);
  const authorization = await authorizeRecipientMaterialReplay(
    client,
    input.original,
    env.RECIPIENT_RIGHTS_CHECKPOINT,
  );
  if (process.argv[2] === "prepare") {
    const { runner, shell, node, npm } = input.lane;
    const matrix = qualificationMatrix(
      [...CI_RUNTIME.minimums, ...Object.values(CI_RUNTIME.node), node].map(
        (version) => ({ version: `v${version}` }),
      ),
    );
    appendFileSync(
      env.GITHUB_OUTPUT,
      `runner=${runner}\nshell=${shell}\nnode=${node}\nconsumer=${npm === CI_RUNTIME.consumerNpm}\nmatrix=${JSON.stringify(matrix)}\n`,
    );
    return;
  }
  assert.equal(process.argv[2], "replay");
  const root = mkdtempSync(join(tmpdir(), "owlapi-rights-replay-"));
  assert.ok(isStrictDescendantPath(tmpdir(), root));
  try {
    const npmCli =
      input.lane.npm === CI_RUNTIME.consumerNpm
        ? env.OWLAPI_CONSUMER_NPM
        : selectNpmCliForVersion({
            expectedNpm: CI_RUNTIME.npm,
            candidates: findNpmCliCandidates(),
            observeVersion: observeNpmVersion,
          }).npmCli;
    if (input.lane.npm === CI_RUNTIME.consumerNpm) assertConsumerNpm(npmCli);
    const subject = await reopenOriginalRecipientMaterialSubject(
      client,
      input,
      env,
      npmCli,
    );
    const result = await replayRecipientMaterialObservation({
      original: input.original,
      subject,
      npmCli,
      root,
      authorization,
    });
    const directory = ".release/recipient-rights-replay";
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, "replay.json"),
      stableJson({
        ...result,
        original: {
          jobId: input.job.id,
          artifactId: input.artifact.id,
          digest: input.artifact.digest,
        },
      }),
      { flag: "wx" },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    await main(process.env);
  } catch {
    process.stderr.write(
      "Recipient material replay held. Check the original case custody, runtime and authenticated rights disposition.\n",
    );
    process.exitCode = 1;
  }
}
