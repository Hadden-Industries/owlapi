import assert from "node:assert/strict";
import { crc32 } from "node:zlib";
import { sameJobExecution } from "./github-job-execution.mjs";
import { readRunArtifacts } from "./github-evidence-reader.mjs";
import {
  runtimeDigest,
  validateFrozenMatrix,
} from "./consumer-runtime-matrix.mjs";
import { CI_RUNTIME } from "./runtime-policy.mjs";
import { PACKAGE_NAME } from "./package-identity.mjs";
import { INSTALLED_TEST_SCRIPTS } from "./installed-consumer-fixtures.mjs";
import {
  assertNpmSbomInventory,
  flattenNpmGraph,
} from "./npm-production-graph.mjs";
import { artifactProducingAttempt } from "../tooling/artifact-transport/identity.mjs";
import { originalBytes, originArtifact } from "./staged-release.mjs";
import { readZipArchiveFilesWith } from "./release-zip-core.mjs";

const filename = ".github/workflows/release-registry.yml";
const repo = "Hadden-Industries/owlapi";
const parse = (bytes) =>
  JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
const isId = (n) => Number.isSafeInteger(n) && n > 0;

export function qualificationRuntimeMatrix(manifest) {
  const matrix = validateFrozenMatrix(
    manifest.runtimeMatrix ??
      JSON.parse(manifest.qualification.runtime_matrix.outputs.matrix),
  );
  if (manifest.schemaVersion === 2)
    assert.equal(runtimeDigest(matrix), manifest.ci.matrixSha256);
  return matrix;
}

export function publicRecipientInput({ operation, manifest, receipt }, matrix) {
  return {
    schemaVersion: 1,
    package: manifest.package,
    integrity: manifest.integrity,
    tarballSha256: manifest.assets.tarball.sha256,
    manifestSha256: operation.manifestSha256,
    stageId: receipt.stageId,
    stageRun: receipt.runId,
    stageAttempt: receipt.attempt,
    matrixSha256: runtimeDigest(matrix),
  };
}

const nativeJobs = (response, names, run, allowSkippedMatrix = false) => {
  assert.equal(
    response.total_count,
    response.jobs.length,
    "Incomplete public job inventory",
  );
  assert.equal(
    new Set(response.jobs.map((job) => job.name)).size,
    response.jobs.length,
  );
  for (const job of response.jobs) {
    const skippedMatrix =
      allowSkippedMatrix &&
      job.status === "completed" &&
      job.conclusion === "skipped" &&
      [
        "public_recipient",
        "Public recipient (${{ matrix.runner }}, ${{ matrix.node }})",
      ].includes(job.name);
    assert.ok(
      (names.includes(job.name) || skippedMatrix) &&
        isId(job.id) &&
        isId(job.run_attempt),
    );
    assert.equal(job.run_id, run.id);
    assert.equal(job.head_sha, run.head_sha);
  }
  return response.jobs;
};

const requirePublicRun = (run, operation) => {
  assert.deepEqual(
    [
      String(run.id),
      String(run.run_attempt),
      run.path,
      run.repository?.full_name,
      run.head_repository?.full_name,
      run.head_branch,
      run.head_sha,
      run.event,
      run.status,
      run.conclusion,
    ],
    [
      operation.publicRun,
      operation.publicAttempt,
      filename,
      repo,
      repo,
      "main",
      operation.publicController,
      "workflow_dispatch",
      "completed",
      "success",
    ],
    "The signed public run is no longer the final successful run",
  );
};

/** A rerun can report retained jobs under a newer attempt and even new job IDs.
 * Match the native execution interval and runner to the original timed upload.
 */
export async function readPublicEvidence(
  client,
  checkpoint,
  operation,
  matrix,
  input,
  pinnedReport,
  sbom,
) {
  const runId = operation.publicRun;
  assert.match(runId, /^[1-9]\d{0,15}$/u);
  assert.match(operation.publicAttempt, /^[1-9]\d{0,2}$/u);
  const runPath = "/actions/runs/" + runId;
  const savedBytes = checkpoint.files.get("public-run-origin.json");
  const saved = savedBytes && parse(savedBytes);
  const observed = async (read, retained) => {
    try {
      return await read();
    } catch (error) {
      if (retained && [404, 410].includes(error.httpStatus)) return retained;
      throw error;
    }
  };
  const run = await observed(() => client.read(runPath), saved?.run);
  requirePublicRun(run, operation);
  const roster = [
    {
      job: "registry",
      prefix: "release-registry-" + runId + "-",
      runner: CI_RUNTIME.consumerPlatforms.find((p) => p.os === "linux").runner,
      members: ["public.json", "recipient-input.json"],
      step: "Retain original operation evidence",
    },
    ...matrix.include.map((lane) => ({
      job: "Public recipient (" + lane.runner + ", " + lane.node + ")",
      prefix: "public-recipient-" + lane.runner + "-" + lane.node + "-",
      runner: lane.runner,
      members: ["lane.json"],
      lane,
      step: "Retain public recipient proof",
    })),
  ];
  const names = roster.map((item) => item.job);
  const latestPath = runPath + "/jobs?filter=latest&per_page=100";
  const latestJobs = await observed(
    () => client.read(latestPath),
    saved?.latestJobs,
  );
  const latest = nativeJobs(latestJobs, names, run);
  assert.equal(
    latest.length,
    names.length,
    "Missing a frozen public recipient job",
  );
  const inventory = await observed(
    () => readRunArtifacts((path) => client.read(path), runId),
    saved?.artifacts,
  );
  const allArtifacts = new Map(
    inventory.map((artifact) => [artifact.id, artifact]),
  );
  assert.equal(
    allArtifacts.size,
    inventory.length,
    "Duplicate native public artifact IDs",
  );
  // An expired member may be served only from its signed original receipt.
  for (const artifact of saved?.artifacts ?? []) {
    if (allArtifacts.has(artifact.id)) {
      const live = allArtifacts.get(artifact.id);
      for (const key of ["name", "digest", "size_in_bytes", "created_at"])
        assert.equal(
          live[key],
          artifact[key],
          "Conflicting retained public artifact",
        );
    } else allArtifacts.set(artifact.id, artifact);
  }
  const attempts = new Map();
  const records = [];
  const files = new Map();
  for (const item of roster) {
    const finalJob = latest.find((j) => j.name === item.job);
    assert.equal(finalJob.status, "completed");
    assert.equal(finalJob.conclusion, "success");
    assert.deepEqual(finalJob.labels, [item.runner]);
    const matches = [];
    for (const artifact of allArtifacts.values()) {
      const attempt = artifactProducingAttempt(artifact.name, item.prefix, {
        run: runId,
        attempt: run.run_attempt,
        legacy: false,
      });
      if (attempt === null) continue;
      if (!attempts.has(attempt)) {
        const jobs = await observed(
          () =>
            client.read(
              runPath + "/attempts/" + attempt + "/jobs?per_page=100",
            ),
          saved?.attempts?.[attempt],
        );
        attempts.set(
          attempt,
          nativeJobs(jobs, names, run, attempt < run.run_attempt),
        );
      }
      const job = attempts.get(attempt).find((j) => j.name === item.job);
      if (
        job?.run_attempt === attempt &&
        job.conclusion === "success" &&
        sameJobExecution(job, finalJob)
      )
        matches.push({ artifact, job, attempt });
    }
    assert.equal(
      matches.length,
      1,
      "Missing or duplicate original public proof for " + item.job,
    );
    const [{ artifact, job, attempt }] = matches;
    assert.deepEqual(job.labels, [item.runner]);
    const upload = job.steps.filter((step) => step.name === item.step);
    assert.equal(upload.length, 1);
    const [step] = upload;
    const created = Date.parse(artifact.created_at);
    assert.ok(
      step.status === "completed" &&
        step.conclusion === "success" &&
        created >= Date.parse(step.started_at) &&
        created <= Date.parse(step.completed_at),
      "Public proof upload is outside the original execution interval",
    );
    const logical = item.prefix + attempt;
    const pointer = await originArtifact(
      client,
      {
        runId,
        attempt,
        filename,
        commit: run.head_sha,
        logical,
        artifactId: artifact.id,
        nativeProducer: job,
        runArtifacts: inventory,
      },
      checkpoint,
    );
    assert.equal(
      pointer.digest,
      artifact.digest,
      "Original public digest changed",
    );
    assert.equal(pointer.size_in_bytes, artifact.size_in_bytes);
    assert.equal(pointer.workflow_run?.repository_id, run.repository.id);
    assert.equal(
      pointer.workflow_run?.head_repository_id,
      run.head_repository.id,
    );
    const bytes = await originalBytes(client, pointer);
    assert.equal(bytes.length, pointer.size_in_bytes);
    const entries = readZipArchiveFilesWith(bytes, {
      crc32,
      expectedNames: new Set(item.members),
      maximumUncompressedBytes: 4 * 1024 * 1024,
    });
    assert.deepEqual(
      entries.map((entry) => entry.path).sort(),
      [...item.members].sort(),
    );
    const member = (name) =>
      entries.find((entry) => entry.path === name).content;
    if (item.lane) {
      const laneReceipt = member("lane.json");
      const proof = parse(laneReceipt);
      assert.deepEqual(proof.lane, item.lane);
      assert.deepEqual(
        [proof.commit, proof.run, proof.attempt, proof.input, proof.npm],
        [run.head_sha, runId, String(attempt), input, CI_RUNTIME.consumerNpm],
        "Public lane exercised a different recipient input",
      );
      assert.deepEqual(Object.keys(proof.consumers).sort(), [
        "alias",
        "scoped",
      ]);
      for (const [mode, consumer] of Object.entries(proof.consumers)) {
        assert.deepEqual(consumer.installedTests, INSTALLED_TEST_SCRIPTS);
        assert.equal(consumer.identity.integrity, input.integrity);
        assert.deepEqual(consumer.identity.package, input.package);
        assert.equal(
          consumer.identity.dependencyName,
          mode === "scoped" ? PACKAGE_NAME : "owlapi",
        );
        assert.match(consumer.lockSha256, /^[a-f0-9]{64}$/u);
        assert.match(consumer.manifestSha256, /^[a-f0-9]{64}$/u);
        assert.equal(
          consumer.manifest.dependencies[consumer.identity.dependencyName],
          consumer.identity.specifier,
        );
        assert.deepEqual(
          flattenNpmGraph(
            consumer.graph.dependencies[consumer.identity.dependencyName],
            PACKAGE_NAME,
          ),
          consumer.identities,
        );
        assertNpmSbomInventory(sbom, consumer.identities);
      }
      files.set(logical + ".json", laneReceipt);
    } else {
      assert.ok(
        member("public.json").equals(pinnedReport),
        "Original registry proof changed",
      );
      const inputBytes = member("recipient-input.json");
      assert.deepEqual(parse(inputBytes), input);
      files.set("recipient-input.json", inputBytes);
    }
    records.push({
      job: job.name,
      finalJobId: finalJob.id,
      jobId: job.id,
      runId,
      attempt,
      runner: item.runner,
      runnerId: job.runner_id,
      startedAt: job.started_at,
      completedAt: job.completed_at,
      uploadedAt: artifact.created_at,
      artifact: {
        id: pointer.id,
        name: pointer.name,
        bytes: pointer.size_in_bytes,
        digest: pointer.digest,
      },
    });
  }
  requirePublicRun(
    await observed(() => client.read(runPath), saved?.run),
    operation,
  );
  files.set("public-jobs.json", Buffer.from(JSON.stringify(records) + "\n"));
  return files;
}
