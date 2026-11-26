/** Reopen the release-decisive native consumer observations before auditing. */
import assert from "node:assert/strict";
import { releaseJobs } from "./release-audit-job.mjs";
import { createRequire } from "node:module";
import { canonicalJson, jsonEquals, stableJson } from "./canonical-json.mjs";
import { CI_JOB_NAMES } from "./ci-qualification.mjs";
import { validateRuntimeReports } from "./aggregate-consumer-runtimes.mjs";
import {
  readStandalonePortabilityProof,
  STANDALONE_PORTABILITY_PROOF,
  STANDALONE_PORTABILITY_UPLOAD,
} from "./standalone-portability-proof.mjs";
import {
  assertBrowserQualification,
  browserNpmAttribution,
  BROWSER_CONSUMER_MODES,
  BROWSER_PROJECTS,
  BROWSER_QUALIFICATION_NAME,
} from "./browser-consumer-evidence.mjs";
import { assertNativeOwlContractReport } from "./owl-contract-evidence.mjs";
import {
  readCiConsumerDecisionMembers,
  replayCiConsumerAttribution,
} from "./ci-recipient-attribution.mjs";
import {
  standalonePortabilityRuntimes,
  validateFrozenMatrix,
} from "./consumer-runtime-matrix.mjs";
import { verifyQualifiedRecipientMaterial } from "./recipient-material-case-readmission.mjs";
import { sameJobExecution } from "./github-job-execution.mjs";
import { readRunArtifacts } from "./github-evidence-reader.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";
import { REPOSITORY, REPOSITORY_ID } from "./release-identity.mjs";
import { readQualifiedZip, requireSameUpload } from "./release-ci-package.mjs";
import { assertConsistentArchives } from "./release-resolution-proof.mjs";
import { downloadReleaseArtifact } from "./release-approvals.mjs";
import { CANONICAL_NODE, CI_RUNTIME } from "./runtime-policy.mjs";
import { UBUNTU } from "./ubuntu-runner.mjs";
import {
  findNpmCliCandidates,
  observeNpmVersion,
  selectNpmCliForVersion,
} from "./assert-workflow-runtime.mjs";
import { artifactProducingAttempt } from "../tooling/artifact-transport/identity.mjs";
import { prepareRecipientMaterial } from "../util/third-party-evidence/recipient-material.mjs";

const maximumProofBytes = 4 * 1024 * 1024;
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const parse = (bytes) =>
  JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
const hash = (value) => sha256Buffer(Buffer.from(stableJson(value)));
const producerPlatform = Object.freeze({
  os: "linux",
  cpu: "x64",
  libc: "glibc",
  node: CANONICAL_NODE,
});

function validateRun(run, source, workflow, candidate) {
  assert.ok(["CI", "Release"].includes(workflow));
  assert.ok(positive(source.runId) && positive(source.attempt));
  assert.match(source.commit, /^[a-f0-9]{40}$/u);
  assert.equal(run.id, source.runId);
  assert.equal(run.run_attempt, source.attempt);
  assert.equal(run.path, `.github/workflows/${workflow.toLowerCase()}.yml`);
  for (const repo of [run.repository, run.head_repository]) {
    assert.equal(repo?.full_name, REPOSITORY);
    assert.equal(repo.id, REPOSITORY_ID);
  }
  assert.match(run.head_sha, /^[a-f0-9]{40}$/u);
  // A CI pull-request job has a synthetic tested merge checkout. The trusted
  // CI receipt pins that commit separately from the REST run's branch head.
  if (workflow === "Release" || run.event !== "pull_request")
    assert.equal(run.head_sha, source.commit);
  assert.ok(
    (run.status === "in_progress" && workflow === "Release") ||
      (run.status === "completed" && run.conclusion === "success"),
    "Recipient run is outside the admitted release execution",
  );
  assert.ok(positive(candidate.id));
  assert.match(candidate.digest, /^sha256:[a-f0-9]{64}$/u);
  assert.ok(Buffer.isBuffer(candidate.tarball));
  assert.equal(sha256Buffer(candidate.tarball), candidate.tarballSha256);
}

function observationRoster(workflow, runId, matrix) {
  const name = (id) => CI_JOB_NAMES[id].replace(/^CI /u, `${workflow} `);
  return [
    ...matrix.include.map((lane) => ({
      name: `${name("consumer_runtimes")} / Consumer / ${lane.runner} / Node ${lane.node}`,
      prefix: `consumer-runtime-${lane.runner}-${lane.node}-attempt-`,
      step: "Retain the actual consumer lane evidence",
      runner: lane.runner,
      lane,
      platform: {
        os: lane.os,
        cpu: lane.arch,
        node: lane.node,
        ...(lane.os === "linux" ? { libc: "glibc" } : {}),
      },
      npm: CI_RUNTIME.consumerNpm,
    })),
    ...Object.entries(standalonePortabilityRuntimes).map(([id, runtime]) => ({
      ...runtime,
      name: name(id),
      prefix: `standalone-portability-${id}-${runId}-`,
      step: STANDALONE_PORTABILITY_UPLOAD,
      standalone: id,
    })),
    ...BROWSER_PROJECTS.map((project) => ({
      name: name(`browser_${project}`),
      prefix: `browser-consumer-${project}-${runId}-`,
      step: "Retain exact browser consumer qualification",
      runner: UBUNTU.label,
      project,
      platform: producerPlatform,
      npm: CI_RUNTIME.npm,
    })),
    {
      name: name("owl_contract"),
      prefix: `owl-contract-${runId}-`,
      step: "Retain exact installed OWL contract proof",
      runner: UBUNTU.label,
      platform: producerPlatform,
      npm: CI_RUNTIME.npm,
    },
  ];
}

function indexNativeJobs(jobs, run) {
  const relevant = new Map();
  for (const job of jobs) {
    assert.ok(
      positive(job.id) &&
        positive(job.run_attempt) &&
        job.run_attempt <= run.run_attempt,
    );
    assert.equal(job.run_id, run.id);
    assert.equal(job.head_sha, run.head_sha);
    assert.ok(!relevant.has(job.name), "Duplicate native recipient job name");
    relevant.set(job.name, job);
  }
  return relevant;
}

function requireJob(job, item) {
  assert.ok(
    job && job.status === "completed" && job.conclusion === "success",
    `Missing original recipient job ${item.name}`,
  );
  assert.ok(
    jsonEquals(job.labels, [item.runner]),
    `Unexpected recipient runner for ${item.name}`,
  );
}

function selectCli(version) {
  return selectNpmCliForVersion({
    expectedNpm: version,
    candidates: findNpmCliCandidates(),
    observeVersion: observeNpmVersion,
  }).npmCli;
}

/** Resolve only trusted native jobs and their exact disclosed ZIP members. No
 * advisory request is made here. `checkpoint` may carry an authorized exact
 * original ZIP when Actions storage has expired. The artifact metadata and
 * native producing execution still have to authenticate the same original. */
export async function readCiRecipientAuditInputs({
  client,
  run,
  workflow,
  matrix,
  candidate,
  source,
  checkpoint,
  now = Date.now(),
  npmCliForVersion = selectCli,
  materialOptions,
  qualifiedResolutions = [],
  download = (artifact, maximum) =>
    downloadReleaseArtifact(client, artifact, maximum),
}) {
  validateRun(run, source, workflow, candidate);
  validateFrozenMatrix(matrix);
  const roster = observationRoster(workflow, run.id, matrix);
  const latest = indexNativeJobs(await releaseJobs(client, run.id), run);
  for (const item of roster) requireJob(latest.get(item.name), item);
  const inventory = await readRunArtifacts((path) => client.read(path), run.id);
  const attempts = new Map();
  const tools = new Map();
  const reports = [];
  const originalAttempts = new Map();
  const results = [];
  const resolutions = [];
  let material;
  const candidateArtifact = { id: candidate.id, digest: candidate.digest };
  for (const item of roster) {
    const finalJob = latest.get(item.name);
    const matches = [];
    for (const listed of inventory) {
      const attempt = artifactProducingAttempt(listed.name, item.prefix, {
        run: run.id,
        attempt: run.run_attempt,
        legacy: false,
      });
      if (attempt === null) continue;
      if (!attempts.has(attempt))
        attempts.set(
          attempt,
          indexNativeJobs(await releaseJobs(client, run.id, attempt), run),
        );
      const job = attempts.get(attempt).get(item.name);
      if (
        job?.run_attempt === attempt &&
        job.status === "completed" &&
        job.conclusion === "success" &&
        sameJobExecution(job, finalJob)
      )
        matches.push({ listed, job, attempt });
    }
    assert.equal(
      matches.length,
      1,
      `Missing or ambiguous original recipient artifact for ${item.name}`,
    );
    const [{ listed, job, attempt }] = matches;
    requireJob(job, item);
    const artifact = await client.read(`/actions/artifacts/${listed.id}`, {
      retryArtifact404: true,
    });
    for (const key of ["id", "name", "size_in_bytes", "digest", "created_at"])
      assert.equal(
        artifact[key],
        listed[key],
        "Original recipient artifact metadata changed",
      );
    const archivedBytes = checkpoint?.files?.get(`artifact-${artifact.id}.zip`);
    requireSameUpload(artifact, run, job, item.step, now, { archivedBytes });
    const members = await readQualifiedZip(
      archivedBytes ? async () => archivedBytes : download,
      artifact,
      maximumProofBytes,
    );
    const readback = new Set();
    const original = (name) => {
      const bytes = members.get(name);
      assert.ok(Buffer.isBuffer(bytes), `Missing retained ${name}`);
      readback.add(name);
      return bytes;
    };
    const identity = {
      workflow,
      commit: source.commit,
      runId: run.id,
      runAttempt: attempt,
    };
    let installed;
    let eligibilityMembers = members;
    if (item.lane) {
      const report = parse(original("lane.json"));
      assert.ok(
        jsonEquals(report.lane, item.lane),
        "Original lane belongs to another frozen runtime",
      );
      assert.ok(
        jsonEquals(report.origin, { workflow, job: "consumer_runtime" }),
      );
      assert.equal(report.portability.tarball.sha256, candidate.tarballSha256);
      reports.push(report);
      originalAttempts.set(`${item.lane.runner}/${item.lane.node}`, attempt);
      installed = ["alias", "scoped"].map((mode) => [
        `portability-${mode}`,
        report.portability.consumers[mode].attribution,
      ]);
      for (const mode of ["alias", "scoped"]) {
        const { afterExecutionSha256, attribution } =
          report.portability.consumers[mode];
        assert.equal(
          afterExecutionSha256,
          attribution.decision.resolutionSha256,
          "Runtime tests exercised a different installed graph",
        );
      }
    } else if (item.standalone) {
      const proof = readStandalonePortabilityProof(
        parse(original(STANDALONE_PORTABILITY_PROOF)),
        {
          identity: { ...identity, job: item.standalone },
          candidateArtifact,
          tarballSha256: candidate.tarballSha256,
        },
      );
      installed = proof.installed;
      eligibilityMembers = proof.decisions;
    } else if (item.project) {
      const proof = parse(original(BROWSER_QUALIFICATION_NAME));
      assertBrowserQualification(proof, {
        identity: { ...identity, job: `browser_${item.project}` },
        candidateArtifact,
        projects: [item.project],
        tarballSha256: candidate.tarballSha256,
      });
      const prepared = JSON.parse(proof.preparation);
      installed = BROWSER_CONSUMER_MODES.map((mode) => [
        mode === "import-map" ? "browser-import-map-input" : `browser-${mode}`,
        browserNpmAttribution(prepared, mode),
      ]);
    } else {
      const legacyOrCurrent = parse(original("qualification.json"));
      const report =
        workflow === "Release"
          ? parse(original("attributed-qualification.json"))
          : legacyOrCurrent;
      if (workflow === "Release") {
        const { attribution, ...facts } = report;
        assert.ok(
          attribution &&
            jsonEquals(legacyOrCurrent, { ...facts, schemaVersion: 1 }),
          "OWL contract reports cover different native tests",
        );
      }
      assertNativeOwlContractReport(
        report,
        original("native.ndjson").toString("utf8"),
        {
          schemaVersion: 2,
          identity,
          artifact: candidateArtifact,
          candidateSha256: candidate.tarballSha256,
        },
      );
      installed = [["owl-contract", report.attribution]];
    }
    if (!tools.has(item.npm)) {
      const npmCli = await npmCliForVersion(item.npm);
      assert.equal(
        createRequire(npmCli)("../package.json").version,
        item.npm,
        "Recipient native replay uses another npm version",
      );
      tools.set(item.npm, npmCli);
    }
    const npmCli = tools.get(item.npm);
    material ??= await prepareRecipientMaterial({ ...materialOptions, npmCli });
    for (const [role, attribution] of installed) {
      const resolution = await replayCiConsumerAttribution(attribution, {
        role,
        tarball: candidate.tarball,
        npmCli,
        observedNpm: item.npm,
        platform: item.platform,
      });
      const { decision, materialBytes, paths } = readCiConsumerDecisionMembers(
        eligibilityMembers,
        attribution,
      );
      if (eligibilityMembers === members)
        for (const name of paths) readback.add(name);
      const manifestBytes = Buffer.from(attribution.evidence.manifest);
      const lockBytes = Buffer.from(attribution.evidence.lock);
      const verified = await verifyQualifiedRecipientMaterial(
        material,
        {
          recordBytes: materialBytes,
          recordSha256: decision.materialSha256,
          resolution,
          lockfileBytes: lockBytes,
          requireDirectNovel: materialOptions?.requireDirectNovel,
        },
        {
          client,
          npmCli,
          rights: decision.rights,
          scope: {
            evidence: attribution.evidence,
            role,
            sourceCommit: source.commit,
          },
        },
      );
      if (decision.archiveMeasurements) {
        const { verifyRecoveredMacMeasurement } =
          await import("./macos-material-readmission.mjs");
        await verifyRecoveredMacMeasurement({
          client,
          checkpoint: decision.archiveMeasurements.checkpoint,
          tarball: candidate.tarball,
          npmCli,
          scope: {
            commit: source.commit,
            tarballSha256: candidate.tarballSha256,
            job: item.standalone ?? "consumer_runtime",
            role,
            platform: { ...item.platform, npm: item.npm },
          },
          proof: decision.archiveMeasurements,
          evidence: attribution.evidence,
          record: verified.record,
        });
      } else
        assert.ok(
          !verified.record.artifacts.some(
            (artifact) => artifact.measurementOrigin,
          ),
          "Recipient measurements require an authorized scanner receipt",
        );
      resolutions.push(resolution);
      results.push({
        input: {
          manifestBytes,
          lockBytes,
          tarballSha256: candidate.tarballSha256,
          graphSha256: hash(resolution.graph),
          role: "candidate",
          scope: "production",
          platform: { ...item.platform, npm: item.npm },
        },
        source: {
          repositoryId: REPOSITORY_ID,
          commit: source.commit,
          runId: run.id,
          attempt,
          jobId: job.id,
          artifactSha256: artifact.digest.slice(7),
        },
      });
    }
    assert.equal(
      canonicalJson([...readback].sort()),
      canonicalJson([...members.keys()].sort()),
      "Unexpected retained recipient ZIP member",
    );
  }
  validateRuntimeReports(
    matrix,
    reports,
    { ...source, candidateArtifact, runAttempt: source.attempt },
    { schemaVersion: 2, originalAttempts },
  );
  assertConsistentArchives([...qualifiedResolutions, ...resolutions]);
  return results;
}
