/** Read-only release shadow producer. Publish only independently verified case receipts. */
import assert from "node:assert/strict";
import { constants } from "node:fs";
import {
  appendFile,
  copyFile,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  corpusArtifactTransport,
  corpusImportMapSha256,
  corpusShardArtifactName,
  corpusShardJobName,
  corpusShardRunner,
  corpusShardUploadStep,
  corpusShadowJava,
  readCorpusCandidate,
  readCorpusShardArchive,
  reconcileHostedCorpus,
} from "./release-corpus-artifacts.mjs";
import { REPOSITORY, REPOSITORY_ID } from "./release-identity.mjs";
import { requireSameUpload } from "./release-ci-package.mjs";
import { readRunArtifacts } from "./github-evidence-reader.mjs";
import { assertPromotedCi } from "./promoted-release-proof.mjs";
import {
  runtimeDigest,
  validateFrozenMatrix,
} from "./consumer-runtime-matrix.mjs";
import { verifyDownloadedCandidateBundle } from "./candidate-bundle.mjs";
import {
  matchesLogicalArtifact,
  selectArtifactGroups,
} from "../tooling/artifact-transport/identity.mjs";
import { comparisonCases } from "../util/owlapi-reference/comparison-cases.mjs";
import { julyComparisonManifest } from "../util/owlapi-reference/comparison-fixtures.mjs";
import {
  comparisonIdentity,
  sha256,
} from "../util/owlapi-reference/comparison-evidence.mjs";
import {
  corpusQualificationRoster,
  corpusQualificationShards,
  retainedDependencyGraphIdentity,
} from "../util/owlapi-reference/comparison-release-evidence.mjs";
import {
  oracleLockPath,
  oracleVersion,
  pinnedSourceOracle,
} from "../util/owlapi-reference/comparison-oracle.mjs";

const javaSelection = corpusShadowJava.setupJavaVersion;
export const corpusSourcePins = Object.freeze({
  javaRevision: pinnedSourceOracle().revision,
  julyRevision: julyComparisonManifest.revision,
  javaSelection,
});
const freshJobName = "Release / retained candidate / Produce";
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const writeJson = (path, input) =>
  writeFile(path, JSON.stringify(input) + "\n", { flag: "wx" });
const digest = /^sha256:([0-9a-f]{64})$/u;
const positive = (value) => Number.isSafeInteger(value) && value > 0;

function workflowRun(env) {
  const runId = Number(env.GITHUB_RUN_ID);
  const attempt = Number(env.GITHUB_RUN_ATTEMPT);
  assert.ok(
    env.GITHUB_REPOSITORY === REPOSITORY &&
      Number(env.GITHUB_REPOSITORY_ID) === REPOSITORY_ID &&
      env.GITHUB_EVENT_NAME === "workflow_dispatch" &&
      env.GITHUB_REF === "refs/heads/main" &&
      /^[0-9a-f]{40}$/u.test(env.GITHUB_SHA) &&
      positive(runId) &&
      positive(attempt),
    "Corpus production requires the protected release qualification run",
  );
  return {
    runId,
    attempt,
    commit: env.GITHUB_SHA,
    repositoryId: REPOSITORY_ID,
  };
}

export function corpusProducerMatrix(
  roster = corpusQualificationRoster(comparisonCases),
) {
  const sourceCases = new Set(
    roster.cells
      .filter(({ oracle }) => oracle?.kind === "pinned-source")
      .map(({ caseId }) => caseId),
  );
  return {
    include: corpusQualificationShards(comparisonCases, roster).map(
      (shard) => ({
        id: shard.shardId,
        runner: corpusShardRunner(shard.platform),
        shell: shard.platform === "win32" ? "pwsh" : "bash",
        sourceOracle: shard.caseIds.some((caseId) => sourceCases.has(caseId)),
        july: shard.selection.suite === "july",
      }),
    ),
  };
}

export function corpusProducerOrigin(env, needs, jobs) {
  const run = workflowRun(env);
  assert.equal(needs.release_dispatch?.outputs?.corpus_shadow, "true");
  const admission = needs.release_admission?.outputs;
  assert.equal(needs.release_admission?.result, "success");
  if (admission.mode === "reuse") {
    const ci = JSON.parse(admission.evidence);
    assertPromotedCi(ci, {
      commit: run.commit,
      matrixSha256: runtimeDigest(
        validateFrozenMatrix(JSON.parse(env.OWLAPI_RUNTIME_MATRIX)),
      ),
    });
    return {
      source: {
        ...run,
        route: "promoted",
        candidateRunId: ci.build.runId,
        candidateAttempt: ci.build.producingAttempt,
        candidateCommit: ci.build.providerHead,
        candidateJobId: ci.build.producerJob,
        candidateProofId: ci.packageProof.id,
        candidateProofSha256: digest.exec(ci.packageProof.digest)?.[1],
      },
      subject: {
        artifactId: String(ci.candidate.id),
        artifactSha256: digest.exec(ci.candidate.digest)?.[1],
        tarballSha256: ci.assets.tarball.sha256,
        integrity: ci.integrity,
      },
    };
  }
  assert.equal(admission.mode, "fresh");
  assert.equal(needs.candidate?.result, "success");
  const candidate = needs.candidate.outputs;
  const producers = jobs.filter(
    (job) =>
      job.name === freshJobName &&
      job.conclusion === "success" &&
      job.run_id === run.runId &&
      job.run_attempt === run.attempt &&
      job.head_sha === run.commit,
  );
  assert.equal(
    producers.length,
    1,
    "The original same-run candidate job is absent or ambiguous",
  );
  return {
    source: {
      ...run,
      route: "fresh",
      candidateRunId: run.runId,
      candidateAttempt: run.attempt,
      candidateCommit: run.commit,
      candidateJobId: producers[0].id,
      candidateProofId: Number(candidate.proof_id),
      candidateProofSha256: candidate.proof_digest,
    },
    subject: {
      artifactId: candidate.artifact_id,
      artifactSha256: candidate.artifact_digest,
    },
  };
}

async function readAttemptJobs(read, { runId, attempt }) {
  const jobs = [];
  let total;
  for (let page = 1; page <= 20; page++) {
    const result = await read(
      `/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100&page=${page}`,
    );
    total ??= result.total_count;
    assert.ok(
      Number.isSafeInteger(total) &&
        total === result.total_count &&
        Array.isArray(result.jobs),
      "Unstable corpus job inventory",
    );
    jobs.push(...result.jobs);
    if (
      jobs.length === total &&
      new Set(jobs.map(({ id }) => id)).size === total
    )
      return jobs;
    if (result.jobs.length !== 100) break;
  }
  throw new Error("Incomplete corpus job inventory");
}

export async function selectCorpusShardArtifacts(
  shards,
  jobs,
  artifacts,
  source,
  transport,
) {
  const selected = [];
  let run;
  for (const shard of shards) {
    const logical = corpusShardArtifactName(
      source.runId,
      source.attempt,
      shard.shardId,
    );
    const retained = artifacts.filter(({ name }) =>
      matchesLogicalArtifact(name, logical, {
        run: source.runId,
        attempt: source.attempt,
        legacy: true,
      }),
    );
    if (!retained.length) continue;
    const producers = jobs.filter(
      ({ name }) => name === corpusShardJobName(shard.shardId),
    );
    assert.equal(producers.length, 1, "Missing or duplicate corpus shard job");
    const [job] = producers;
    if (job.conclusion !== "success") continue;
    let [artifact] = retained;
    if (retained.length > 1) {
      const copies = selectArtifactGroups(retained, {
        name: logical,
        run: source.runId,
        attempt: source.attempt,
      }).get(logical);
      assert.equal(
        copies.length,
        retained.length,
        "Ambiguous corpus shard archives",
      );
      run ??= await transport.read(`/actions/runs/${source.runId}`);
      const readCopy = (copy) => {
        requireSameUpload(copy, run, job, corpusShardUploadStep, Date.now());
        return readCorpusShardArchive(transport.download, copy);
      };
      [artifact] = copies;
      const expected = await readCopy(artifact);
      for (const copy of copies.slice(1)) {
        assert.deepEqual(
          await readCopy(copy),
          expected,
          "Conflicting corpus shard payloads",
        );
      }
    }
    selected.push({
      shardId: shard.shardId,
      id: artifact.id,
      sha256: digest.exec(artifact.digest)?.[1],
      jobId: job.id,
    });
  }
  return selected;
}

async function emit(env, fields) {
  for (const [key, value] of Object.entries(fields)) {
    assert.ok(/^[a-z_]+$/u.test(key) && !/[\r\n]/u.test(value));
    await appendFile(env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
}

async function plan(env) {
  const needs = JSON.parse(env.CORPUS_NEEDS);
  const transport = corpusArtifactTransport(env);
  const run = workflowRun(env);
  const jobs =
    needs.release_admission.outputs.mode === "fresh"
      ? await readAttemptJobs(transport.read, run)
      : [];
  const { source, subject } = corpusProducerOrigin(env, needs, jobs);
  const original = await readCorpusCandidate({ source, subject, ...transport });
  assert.ok(
    original.consumerLock,
    "An authenticated producer lock is required",
  );
  const roster = corpusQualificationRoster(comparisonCases);
  await emit(env, {
    matrix: JSON.stringify(corpusProducerMatrix(roster)),
    java_revision: corpusSourcePins.javaRevision,
    july_revision: corpusSourcePins.julyRevision,
    java_selection: corpusSourcePins.javaSelection,
    plan: JSON.stringify({
      source,
      subject: {
        ...subject,
        tarballSha256: original.tarballSha256,
        integrity: original.integrity,
        dependencyGraphSha256: original.dependencyGraphSha256,
        importMapSha256: await corpusImportMapSha256(),
        contentsByPlatform: {},
      },
      rosterSha256: comparisonIdentity(roster),
    }),
  });
}

function readPlan(env) {
  const run = workflowRun(env);
  const plan = JSON.parse(env.CORPUS_PLAN);
  const { source } = plan;
  for (const [key, value] of Object.entries(run))
    assert.equal(source[key], value);
  const roster = corpusQualificationRoster(comparisonCases);
  assert.equal(
    plan.rosterSha256,
    comparisonIdentity(roster),
    "Corpus roster changed after planning",
  );
  return { ...plan, roster };
}

function workDirectory(env) {
  assert.ok(isAbsolute(env.RUNNER_TEMP));
  return join(env.RUNNER_TEMP, "owlapi-corpus-work");
}

async function acquireCandidate(env) {
  const { source, subject } = readPlan(env);
  const original = await readCorpusCandidate({
    source,
    subject,
    ...corpusArtifactTransport(env),
  });
  assert.ok(original.consumerLock);
  assert.equal(original.dependencyGraphSha256, subject.dependencyGraphSha256);
  const work = workDirectory(env);
  const candidate = join(work, "candidate");
  await mkdir(work);
  await mkdir(candidate);
  const names = [...original.retained.keys()];
  const bundle = verifyDownloadedCandidateBundle({
    fileNames: names,
    checksumText: original.retained.get("SHA256SUMS").toString("utf8"),
    sbomText: original.retained
      .get(names.find((name) => name.endsWith(".cdx.json")))
      .toString("utf8"),
    tarball: original.retained.get(names.find((name) => name.endsWith(".tgz"))),
  });
  for (const [name, bytes] of original.retained)
    await writeFile(join(candidate, name), bytes, { flag: "wx" });
  await writeJson(join(candidate, "candidate-manifest.json"), {
    schemaVersion: 1,
    package: bundle.package,
    tarball: bundle.tarball,
    sbom: bundle.sbom,
  });
  await writeJson(join(work, "consumer-lock.json"), original.consumerLock);
}

async function produceShard(env) {
  assert.ok(
    !env.GH_TOKEN && !env.GITHUB_TOKEN,
    "Credentials cannot enter a comparison worker",
  );
  const { roster, subject } = readPlan(env);
  const shard = corpusQualificationShards(comparisonCases, roster).find(
    ({ shardId }) => shardId === env.CORPUS_SHARD_ID,
  );
  assert.ok(
    shard?.platform === process.platform,
    "Corpus shard is outside the selected platform",
  );
  assert.ok(
    env.npm_execpath,
    "Run hosted corpus comparisons through the pinned npm",
  );
  const { runComparison } =
    await import("../util/owlapi-reference/compare-java-js.mjs");
  const { installCandidate } =
    await import("../util/owlapi-reference/qualify-universal-ontology.mjs");
  const work = workDirectory(env);
  const consumerLock = await readJson(join(work, "consumer-lock.json"));
  const candidateDirectory = join(work, "candidate");
  const manifest = await readJson(
    join(candidateDirectory, "candidate-manifest.json"),
  );
  assert.equal(
    manifest.tarball.sha256,
    subject.tarballSha256,
    "The prepared candidate changed",
  );
  assert.equal(
    retainedDependencyGraphIdentity(consumerLock, subject),
    subject.dependencyGraphSha256,
    "The prepared dependency lock changed",
  );
  assert.equal(
    await corpusImportMapSha256(),
    subject.importMapSha256,
    "The reviewed import map changed",
  );
  const attempt = join(work, "attempt");
  const options = {
    candidateDirectory,
    consumerLock,
    publicReceipts: true,
    memoryGuard: false,
    cacheDirectory: join(work, "objects"),
    mavenDirectory: join(work, "released-maven"),
    referenceCheckout: resolve(".release/java-owlapi"),
    ontologyRepository: resolve(".release/universal-ontology"),
    javaHome: env.JAVA_HOME,
    javaSelection,
  };
  const request = { suite: "release-semantics", shard: shard.shardId };
  const prepared = await runComparison(
    { ...request, action: "prepare" },
    {
      ...options,
      outputDirectory: join(work, "preparation"),
    },
  );
  const incompleteInputs =
    prepared.cases?.filter(({ status }) => status !== "prepared") ?? [];
  if (incompleteInputs.length) {
    await appendFile(
      env.GITHUB_STEP_SUMMARY,
      `Corpus shard ${shard.shardId} has ${incompleteInputs.length} cases with incomplete preparation.\n`,
    );
    throw new Error("Pinned shard inputs are incomplete");
  }
  const warm = join(work, "warm-install");
  await mkdir(warm);
  await installCandidate(candidateDirectory, warm, { consumerLock });
  const offline = { ...options, offline: true, outputDirectory: attempt };
  const run = await runComparison({ ...request, action: "run" }, offline);
  const proof = await runComparison({ ...request, action: "verify" }, offline);
  const incomplete = proof.cases.filter(({ status }) => status !== "passed");
  await appendFile(
    env.GITHUB_STEP_SUMMARY,
    `Corpus shard ${shard.shardId} has ${incomplete.length} incomplete cases out of ${shard.caseIds.length}.\n`,
  );
  for (const row of incomplete) {
    const input = roster.cells.find(
      ({ caseId }) => caseId === row.caseId,
    )?.input;
    if (input)
      await appendFile(
        env.GITHUB_STEP_SUMMARY,
        `- Held input ${input} in case ${row.caseId}\n`,
      );
  }
  assert.ok(
    !incomplete.length && run.cases.every(({ status }) => status === "passed"),
    "Corpus shard has unresolved cases",
  );
  assert.equal(
    proof.candidate.dependencyGraphSha256,
    subject.dependencyGraphSha256,
  );
  assert.equal(proof.candidate.importMapSha256, subject.importMapSha256);
  assert.match(proof.candidate.contentSha256, /^[a-f0-9]{64}$/u);
  const upload = resolve(".release/corpus-proof");
  await mkdir(upload, { recursive: true });
  await copyFile(
    join(attempt, "report.json"),
    join(upload, "report.json"),
    constants.COPYFILE_EXCL,
  );
  await writeJson(join(upload, "verification.json"), proof);
}

async function aggregate(env) {
  const { roster, source, subject } = readPlan(env);
  const transport = corpusArtifactTransport(env);
  const [jobs, artifacts] = await Promise.all([
    readAttemptJobs(transport.read, source),
    readRunArtifacts(transport.read, source.runId),
  ]);
  const input = {
    schemaVersion: 2,
    source,
    subject,
    oracle: {
      version: oracleVersion,
      lockSha256: sha256(await readFile(oracleLockPath)),
    },
    artifacts: await selectCorpusShardArtifacts(
      corpusQualificationShards(comparisonCases, roster),
      jobs,
      artifacts,
      source,
      transport,
    ),
  };
  const result = await reconcileHostedCorpus({
    input,
    ...transport,
    collectPlatformContents: true,
  });
  await appendFile(
    env.GITHUB_STEP_SUMMARY,
    `Corpus ${source.route} coverage: ${result.requiredCount} required cells, ${result.missing.length} missing, ${result.rejected.length} rejected, ${result.holds.length} acquisition holds.\n`,
  );
  assert.equal(
    result.status,
    "complete",
    "Hosted corpus shadow coverage remains incomplete",
  );
  const output = resolve(".release/corpus-aggregate");
  await mkdir(output, { recursive: true });
  await writeJson(join(output, "corpus-qualification-input.json"), {
    ...input,
    subject: result.candidate,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const operations = {
      plan,
      candidate: acquireCandidate,
      shard: produceShard,
      aggregate,
    };
    const operation = process.argv[2];
    assert.ok(
      Object.hasOwn(operations, operation),
      "Unknown hosted corpus operation",
    );
    await operations[operation](process.env);
  } catch (error) {
    // Run and verify can include excerpts from acquired ontologies in exceptions.
    process.stderr.write(
      `Corpus producer ${process.argv[2]} did not complete (${error.code ?? error.name}).\n`,
    );
    process.exitCode = 1;
  }
}
