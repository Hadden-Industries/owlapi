/** Open the same original qualification subjects at protected issuance and stage. */
import assert from "node:assert/strict";
import { readControllerBlob } from "./release-controller-blob.mjs";
import { createHash } from "node:crypto";

import { canonicalJson, jsonEquals, stableJson } from "./canonical-json.mjs";
import {
  validateFrozenMatrix,
  runtimeDigest,
} from "./consumer-runtime-matrix.mjs";
import { verifyDownloadedCandidateBundle } from "./candidate-bundle.mjs";
import {
  QUALIFICATION_POLICY_SHA256,
  assertQualificationRecord,
} from "./ci-qualification.mjs";
import { verifyReleaseCi } from "./ci-verification.mjs";
import { qualificationBaseSchema } from "./corpus-qualification-manifest.mjs";
import { readRunArtifacts } from "./github-evidence-reader.mjs";
import { sameJobExecution } from "./github-job-execution.mjs";
import { downloadReleaseArtifact } from "./release-approvals.mjs";
import { buildReleaseAuditSubject } from "./release-audit-evaluator.mjs";
import {
  assertProtectedReleaseRun,
  assertTimedUpload,
  checkedNativeJob,
  releaseJobs,
} from "./release-audit-job.mjs";
import {
  readProducerPackageProof,
  readQualifiedZip,
  verifyReleaseCiPackage,
} from "./release-ci-package.mjs";
import { readCiRecipientAuditInputs } from "./release-ci-recipient-audits.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";
import { REPOSITORY, REPOSITORY_ID } from "./release-identity.mjs";
import { producerResolutionUploadStep } from "./release-resolution-proof.mjs";
import { CANONICAL_NODE, CI_RUNTIME } from "./runtime-policy.mjs";
import { UBUNTU } from "./ubuntu-runner.mjs";
import { artifactProducingAttempt } from "../tooling/artifact-transport/identity.mjs";

const workflow = ".github/workflows/release.yml";
const hex = /^[a-f0-9]{64}$/u;
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const decode = (bytes) =>
  JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
const maximumCandidateBytes = 64 * 1024 * 1024;
const maximumManifestBytes = 1024 * 1024;
const platform = Object.freeze({
  os: "linux",
  cpu: "x64",
  libc: "glibc",
  node: CANONICAL_NODE,
  npm: CI_RUNTIME.npm,
});

const digest = (value) => sha256Buffer(Buffer.from(stableJson(value)));

function dispatchMode(manifest) {
  const schema = qualificationBaseSchema(manifest);
  assert.ok(
    [1, 2].includes(schema),
    "Unsupported release qualification schema",
  );
  const mode = schema === 2 ? "reuse" : "fresh";
  if (manifest.qualificationMode !== undefined)
    assert.equal(manifest.qualificationMode, mode);
  if (mode === "fresh") {
    assert.equal(
      manifest.qualification?.release_dispatch?.outputs?.mode,
      "fresh",
      "Protected advisory issuance requires a fresh or reused qualification-only dispatch",
    );
    assert.equal(
      manifest.qualification.release_admission?.outputs?.mode,
      "fresh",
    );
  } else {
    assert.equal(manifest.qualification?.release_dispatch, "success");
    assert.equal(manifest.qualification.release_admission, "success");
    assert.equal(
      manifest.ci?.schemaVersion,
      2,
      "Promoted qualification requires current CI evidence",
    );
    assert.equal(manifest.ci.policySha256, QUALIFICATION_POLICY_SHA256);
  }
  return mode;
}

function expectedOrigin(job, artifact, commit) {
  return {
    repositoryId: REPOSITORY_ID,
    commit,
    runId: job.run_id,
    attempt: job.run_attempt,
    jobId: job.id,
    artifactSha256: artifact.digest.slice(7),
  };
}

function assertPointer(actual, expected) {
  assert.equal(
    actual.id,
    expected.id,
    "Qualification selected a different native artifact",
  );
  assert.equal(
    actual.digest,
    expected.digest,
    "Qualification selected different native artifact bytes",
  );
  if (expected.name !== undefined) assert.equal(actual.name, expected.name);
  if (expected.bytes !== undefined)
    assert.equal(actual.size_in_bytes, expected.bytes);
}

function makeUploadReader(client, run, latest, inventory) {
  const attempts = new Map();
  return async (jobName, prefix, step, expected) => {
    const latestJob = checkedNativeJob(latest, jobName, run);
    assert.ok(
      jsonEquals(latestJob.labels, [UBUNTU.label]),
      "Unexpected release qualification runner",
    );
    const matches = [];
    for (const artifact of inventory) {
      const attempt = artifactProducingAttempt(artifact.name, prefix, {
        run: run.id,
        attempt: run.run_attempt,
        legacy: false,
      });
      if (attempt === null) continue;
      if (!attempts.has(attempt))
        attempts.set(attempt, await releaseJobs(client, run.id, attempt));
      const jobs = attempts.get(attempt);
      if (
        !jobs.some(
          (job) =>
            job.name === jobName &&
            job.status === "completed" &&
            job.conclusion === "success",
        )
      )
        continue;
      const job = checkedNativeJob(jobs, jobName, run);
      if (job.run_attempt === attempt && sameJobExecution(job, latestJob))
        matches.push({ job, artifact });
    }
    assert.equal(
      matches.length,
      1,
      `Missing or ambiguous original ${jobName} upload`,
    );
    const [{ job, artifact: listed }] = matches;
    assert.ok(jsonEquals(job.labels, [UBUNTU.label]));
    const artifact = await client.read(`/actions/artifacts/${listed.id}`, {
      retryArtifact404: true,
    });
    assertPointer(artifact, { ...listed, bytes: listed.size_in_bytes });
    assert.equal(artifact.created_at, listed.created_at);
    if (expected) assertPointer(artifact, expected);
    assertTimedUpload(artifact, run, job, prefix + job.run_attempt, step);
    return { job, artifact };
  };
}

function manifestMatrix(manifest, mode) {
  const matrix = validateFrozenMatrix(
    manifest.runtimeMatrix ??
      JSON.parse(manifest.qualification.runtime_matrix.outputs.matrix),
  );
  if (mode === "reuse")
    assert.equal(runtimeDigest(matrix), manifest.ci.matrixSha256);
  return matrix;
}

function assertCandidateBinding(manifest, verified, tarball, artifact) {
  assertPointer(artifact, {
    id: Number(manifest.candidateId),
    digest: `sha256:${manifest.candidateDigest}`,
  });
  assert.ok(
    jsonEquals(manifest.package, verified.package),
    "Qualification package identity differs from original tarball",
  );
  assert.ok(
    jsonEquals(manifest.assets, verified.assets),
    "Qualification asset digests differ from the original bundle",
  );
  assert.equal(
    manifest.integrity,
    `sha512-${createHash("sha512").update(tarball).digest("base64")}`,
  );
  assert.ok(
    jsonEquals(
      manifest.packedConfig ?? null,
      verified.packageManifest.publishConfig ?? null,
    ),
    "Qualified packed registry settings differ",
  );
}

async function readNativeBundle(readZip, artifact, assets) {
  const names = [assets.tarball.name, assets.sbom.name, "SHA256SUMS"];
  const files = await readZip(artifact, maximumCandidateBytes, names);
  const tarball = files.get(names[0]),
    sbom = files.get(names[1]);
  const verified = verifyDownloadedCandidateBundle({
    fileNames: [...files.keys()],
    checksumText: files.get("SHA256SUMS"),
    sbomText: sbom,
    tarball,
  });
  return { tarball, sbom, verified };
}

async function freshProducer({
  client,
  upload,
  readZip,
  manifest,
  run,
  npmCli,
  download,
  materialOptions,
}) {
  const candidateAck = manifest.qualification.candidate?.outputs;
  assert.equal(manifest.qualification.candidate?.result, "success");
  assert.equal(candidateAck?.artifact_id, manifest.candidateId);
  assert.equal(candidateAck.artifact_digest, manifest.candidateDigest);
  assert.match(candidateAck.proof_id, /^[1-9]\d*$/u);
  assert.match(candidateAck.proof_digest, hex);
  const jobName = "Release / retained candidate / Produce";
  const candidate = await upload(
    jobName,
    `${manifest.assets.tarball.name.slice(0, -4)}-candidate-${run.id}-`,
    "Upload the exact same-run candidate",
    {
      id: Number(candidateAck.artifact_id),
      digest: `sha256:${candidateAck.artifact_digest}`,
    },
  );
  const proof = await upload(
    jobName,
    `package-proof-${run.id}-`,
    producerResolutionUploadStep,
    {
      id: Number(candidateAck.proof_id),
      digest: `sha256:${candidateAck.proof_digest}`,
    },
  );
  assert.equal(
    proof.job.id,
    candidate.job.id,
    "Candidate and package proof came from different native jobs",
  );
  const { tarball, sbom, verified } = await readNativeBundle(
    readZip,
    candidate.artifact,
    manifest.assets,
  );
  assertCandidateBinding(manifest, verified, tarball, candidate.artifact);
  const { subjects } = await readProducerPackageProof({
    download,
    artifact: proof.artifact,
    tarball,
    sbom,
    candidate: verified,
    expectedProofVersion: 2,
    expectedSourceLockSha256: manifest.inputs["package-lock.json"],
    npmCli,
    materialOptions,
    rightsReader: { client, commit: manifest.commit },
  });
  return {
    run,
    workflow: "Release",
    testedCommit: manifest.commit,
    tarball,
    subjects,
    candidateArtifact: candidate.artifact,
    producerSource: expectedOrigin(proof.job, proof.artifact, manifest.commit),
  };
}

async function reusedProducer({
  client,
  readZip,
  manifest,
  releaseRun,
  npmCli,
  download,
  materialOptions,
  now,
}) {
  const { ci } = manifest;
  const read = (path, options) => client.read(path, options);
  const mainArtifact = await read(`/actions/artifacts/${ci.main.receipt.id}`);
  assertPointer(mainArtifact, ci.main.receipt);
  const downloadReceipt = async ({ artifact }) =>
    decode(
      (await readZip(artifact, 64 * 1024, ["verification.json"])).get(
        "verification.json",
      ),
    );
  const mainReceipt = assertQualificationRecord(
    await downloadReceipt({ artifact: mainArtifact }),
  );
  const result = await verifyReleaseCi({
    context: {
      eventName: "workflow_dispatch",
      ref: "refs/heads/main",
      repository: REPOSITORY,
      repositoryId: REPOSITORY_ID,
      event: { repository: releaseRun.repository },
      sha: manifest.commit,
      snapshot: ci.landed,
      host: mainReceipt.host,
      version: manifest.package.version,
    },
    read,
    downloadReceipt,
    now,
    verifyPackage: (source) =>
      verifyReleaseCiPackage({
        source,
        client,
        read,
        download,
        npmCli,
        materialOptions,
        expectedSourceLockSha256: manifest.inputs["package-lock.json"],
        now,
      }),
  });
  const { source, qualifiedPackage: pack } = result;
  assert.ok(jsonEquals(result.landed, ci.landed));
  assertPointer(result.main.artifact, ci.main.receipt);
  assertPointer(source.artifact, ci.build.receipt);
  assert.ok(
    jsonEquals(
      [
        result.main.run.id,
        result.main.run.run_attempt,
        source.run.id,
        source.run.run_attempt,
        source.run.head_sha,
        pack.attempt,
        pack.producerJob,
      ],
      [
        ci.main.runId,
        ci.main.attempt,
        ci.build.runId,
        ci.build.attempt,
        ci.build.providerHead,
        ci.build.producingAttempt,
        ci.build.producerJob,
      ],
    ),
    "Promoted CI execution differs from qualification",
  );
  assert.ok(jsonEquals(source.receipt.snapshot, ci.build.snapshot));
  for (const [check, { original }] of Object.entries(source.receipt.checks))
    assert.ok(
      jsonEquals(original, ci.build.checks[check]),
      "Original CI check differs from qualification",
    );
  assertPointer(pack.candidate, ci.candidate);
  assertPointer(pack.proof, ci.packageProof);
  const { tarball, verified } = await readNativeBundle(
    readZip,
    pack.candidate,
    manifest.assets,
  );
  assertCandidateBinding(manifest, verified, tarball, pack.candidate);
  return {
    run: source.run,
    workflow: "CI",
    testedCommit: source.receipt.snapshot.commit,
    tarball,
    subjects: pack.subjects,
    candidateArtifact: pack.candidate,
    producerSource: {
      repositoryId: REPOSITORY_ID,
      commit: source.receipt.snapshot.commit,
      runId: source.run.id,
      attempt: pack.attempt,
      jobId: pack.producerJob,
      artifactSha256: pack.proof.digest.slice(7),
    },
  };
}

function loadFrozenInputs(manifest, tarballSha256, measured, readBlob) {
  function load(prefix) {
    const manifestBytes = readBlob(manifest.commit, `${prefix}package.json`);
    const lockPath = `${prefix}package-lock.json`;
    const lockBytes = readBlob(manifest.commit, lockPath);
    assert.equal(
      sha256Buffer(lockBytes),
      manifest.inputs[lockPath],
      `Frozen source lock differs at ${lockPath}`,
    );
    return { manifestBytes, lockBytes, tarballSha256, platform };
  }
  const source = load("");
  assert.ok(
    source.manifestBytes.equals(Buffer.from(measured.evidence.manifest)) &&
      source.lockBytes.equals(Buffer.from(measured.evidence.lock)),
    "Original producer graph did not use the frozen source files",
  );
  const transport = load("tooling/artifact-transport/");
  const transportPackages = decode(transport.lockBytes).packages;
  const rootProduction = {
    ...source,
    role: "producer",
    scope: "production",
    graphSha256: digest(measured.evidence.resolution.graph),
  };
  const rootFull = {
    ...rootProduction,
    scope: "full",
    graphSha256: digest(decode(source.lockBytes).packages),
  };
  const transportFull = {
    ...transport,
    role: "transport",
    scope: "full",
    graphSha256: digest(transportPackages),
  };
  const transportProduction = {
    ...transportFull,
    scope: "production",
    graphSha256: digest(
      Object.fromEntries(
        Object.entries(transportPackages).filter(
          ([, entry]) => entry.dev !== true,
        ),
      ),
    ),
  };
  assert.ok(
    jsonEquals(
      buildReleaseAuditSubject(rootProduction),
      measured.decision.subject,
    ),
    "Frozen producer audit subject differs from original eligibility record",
  );
  return { rootProduction, rootFull, transportFull, transportProduction };
}

function batchInputs(records) {
  const byEntry = new Map();
  for (const { input, source } of records) {
    const entry = { subject: buildReleaseAuditSubject(input), source };
    const key = canonicalJson(entry);
    if (!byEntry.has(key)) byEntry.set(key, { entry, input });
  }
  return {
    entries: [...byEntry.keys()]
      .sort()
      .map((key) => structuredClone(byEntry.get(key).entry)),
    async authenticate(entry) {
      const original = byEntry.get(canonicalJson(entry));
      assert.ok(
        original,
        "Audit requested an observation outside the authenticated qualification",
      );
      const { input } = original;
      return {
        ...input,
        manifestBytes: Buffer.from(input.manifestBytes),
        lockBytes: Buffer.from(input.lockBytes),
        platform: { ...input.platform },
        source: { ...original.entry.source },
      };
    },
  };
}

/** Accept only native, independently selected qualification evidence. The
 * evaluator owns the advisory execution and signing after this read-only step. */
export async function loadQualificationAuditBatch(
  client,
  env,
  npmCli,
  {
    issuing = false,
    checkpoint,
    expectedManifestSha256,
    manifest: expectedManifest,
    candidateArtifact,
    now = Date.now(),
    materialOptions,
    npmCliForVersion,
    readBlob = readControllerBlob,
    downloadArtifact = (artifact, maximum) =>
      downloadReleaseArtifact(client, artifact, maximum),
  } = {},
) {
  if (!issuing)
    assert.match(
      expectedManifestSha256 ?? "",
      hex,
      "Stage requires the exact qualification manifest digest",
    );
  const ids = {
    runId: env.QUALIFICATION_RUN || env.GITHUB_RUN_ID,
    attempt: env.QUALIFICATION_ATTEMPT || env.GITHUB_RUN_ATTEMPT,
    controller: env.QUALIFIED_COMMIT || env.GITHUB_SHA,
    workflow,
  };
  assert.match(String(ids.runId), /^[1-9]\d*$/u);
  assert.match(String(ids.attempt), /^[1-9]\d*$/u);
  assert.ok(positive(Number(ids.runId)) && positive(Number(ids.attempt)));
  const runPath = `/actions/runs/${ids.runId}`;
  const run = await client.read(runPath);
  assertProtectedReleaseRun(run, ids, issuing);
  const main = await client.read("/branches/main");
  assert.ok(
    main.name === "main" && main.protected === true,
    "Release advisory inputs require protected main",
  );
  if (issuing)
    assert.equal(
      main.commit?.sha,
      ids.controller,
      "Protected main moved before audit issuance",
    );
  const latest = await releaseJobs(client, run.id);
  const dispatch = checkedNativeJob(latest, "Release / validate dispatch", run);
  assert.ok(jsonEquals(dispatch.labels, [UBUNTU.label]));
  const dispatchSteps = dispatch.steps.filter(
    (step) => step.name === "Validate the native release inputs",
  );
  assert.equal(dispatchSteps.length, 1);
  assert.equal(dispatchSteps[0].status, "completed");
  assert.equal(dispatchSteps[0].conclusion, "success");
  const inventory = await readRunArtifacts((path) => client.read(path), run.id);
  const upload = makeUploadReader(client, run, latest, inventory);
  const { job: qualificationJob, artifact: manifestArtifact } = await upload(
    "Release / qualified",
    `release-qualification-${run.id}-`,
    "Retain release qualification manifest",
  );
  const archiveByIdentity = new Map();
  const download = async (artifact, limit) => {
    assert.ok(artifact.size_in_bytes <= limit);
    const key = `${artifact.id}/${artifact.digest}`;
    if (!archiveByIdentity.has(key)) {
      const retained = checkpoint?.files?.get(`artifact-${artifact.id}.zip`);
      if (!retained)
        assert.ok(
          artifact.expired === false && Date.parse(artifact.expires_at) > now,
          "Original qualification artifact is unavailable or expired",
        );
      archiveByIdentity.set(
        key,
        retained ?? (await downloadArtifact(artifact, limit)),
      );
    }
    return archiveByIdentity.get(key);
  };
  const readZip = (artifact, limit, names) =>
    readQualifiedZip(download, artifact, limit, names);
  const manifestBytes = (
    await readZip(manifestArtifact, maximumManifestBytes, ["manifest.json"])
  ).get("manifest.json");
  const manifestSha256 = sha256Buffer(manifestBytes);
  if (expectedManifestSha256 !== undefined)
    assert.equal(
      manifestSha256,
      expectedManifestSha256,
      "Original release qualification manifest bytes differ",
    );
  const manifest = decode(manifestBytes);
  if (expectedManifest)
    assert.ok(
      jsonEquals(manifest, expectedManifest),
      "Supplied qualification manifest differs from the timed original",
    );
  assert.ok(
    jsonEquals(
      [
        manifest.repository,
        manifest.workflow,
        manifest.commit,
        manifest.runId,
        manifest.attempt,
      ],
      [
        REPOSITORY,
        workflow,
        ids.controller,
        String(run.id),
        String(qualificationJob.run_attempt),
      ],
    ),
    "Release qualification manifest belongs to a different run or attempt",
  );
  const mode = dispatchMode(manifest);
  const matrix = manifestMatrix(manifest, mode);
  const original =
    mode === "fresh"
      ? await freshProducer({
          client,
          upload,
          readZip,
          manifest,
          run,
          npmCli,
          download,
          materialOptions,
        })
      : await reusedProducer({
          client,
          readZip,
          manifest,
          releaseRun: run,
          npmCli,
          download,
          materialOptions,
          now,
        });
  if (candidateArtifact)
    assertPointer(original.candidateArtifact, candidateArtifact);
  const candidate = {
    id: original.candidateArtifact.id,
    digest: original.candidateArtifact.digest,
    tarballSha256: manifest.assets.tarball.sha256,
    tarball: original.tarball,
  };
  const frozen = loadFrozenInputs(
    manifest,
    candidate.tarballSha256,
    original.subjects.producer,
    readBlob,
  );
  const transportSource = expectedOrigin(
    qualificationJob,
    manifestArtifact,
    manifest.commit,
  );
  const records = [
    ...[frozen.rootFull, frozen.rootProduction].map((input) => ({
      input,
      source: original.producerSource,
    })),
    ...[frozen.transportFull, frozen.transportProduction].map((input) => ({
      input,
      source: transportSource,
    })),
  ];
  for (const mode of ["inspection", "normal", "scoped"]) {
    const { evidence, decision } = original.subjects[mode];
    records.push({
      input: {
        ...decision.subject,
        manifestBytes: Buffer.from(evidence.manifest),
        lockBytes: Buffer.from(evidence.lock),
      },
      source: original.producerSource,
    });
  }
  records.push(
    ...(await readCiRecipientAuditInputs({
      client,
      run: original.run,
      workflow: original.workflow,
      matrix,
      candidate,
      source: {
        runId: original.run.id,
        attempt: original.run.run_attempt,
        commit: original.testedCommit,
      },
      checkpoint,
      now,
      materialOptions,
      qualifiedResolutions: Object.values(original.subjects).map(
        ({ evidence }) => evidence.resolution,
      ),
      npmCliForVersion:
        npmCliForVersion ??
        (env.OWLAPI_CONSUMER_NPM
          ? (version) =>
              version === CI_RUNTIME.npm ? npmCli : env.OWLAPI_CONSUMER_NPM
          : undefined),
      download,
    })),
  );
  if (original.run.id !== run.id) {
    const current = await client.read(`/actions/runs/${original.run.id}`);
    for (const key of [
      "id",
      "run_attempt",
      "head_sha",
      "path",
      "event",
      "status",
      "conclusion",
    ])
      assert.equal(
        current[key],
        original.run[key],
        "Original CI run changed while reopening recipient evidence",
      );
  }
  assertProtectedReleaseRun(await client.read(runPath), ids, issuing);
  if (issuing)
    assert.equal(
      (await client.read("/branches/main")).commit?.sha,
      ids.controller,
      "Protected main moved during audit issuance",
    );
  return {
    ...batchInputs(records),
    manifest,
    manifestBytes,
    manifestArtifact,
    manifestSha256,
    candidate,
    run,
  };
}
