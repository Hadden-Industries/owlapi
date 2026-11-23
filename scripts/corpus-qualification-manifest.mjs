import assert from "node:assert/strict";

export const qualificationBaseSchema = (manifest) =>
  manifest.schemaVersion === 3
    ? manifest.corpus?.baseSchemaVersion
    : manifest.schemaVersion;

export function parseCorpusArtifactLocator(value) {
  const match = /^([1-9]\d{0,14}):([a-f0-9]{64})$/u.exec(value);
  assert.ok(match, "Invalid corpus evidence artifact ID or SHA-256");
  return { id: Number(match[1]), sha256: match[2] };
}

const pick = (object, keys) =>
  Object.fromEntries(keys.map((key) => [key, object[key]]));

async function authenticateHosted(input, env, packageVersion) {
  const { readHostedCorpus } = await import("./release-corpus-artifacts.mjs");
  return readHostedCorpus(input, env, packageVersion);
}

/** Bind the descriptor to the subject admitted by qualification. */
function assertCandidateBinding(manifest, input) {
  const base = qualificationBaseSchema(manifest);
  assert.ok([1, 2].includes(base), "Unknown corpus qualification base schema");
  const { source, subject } = input;
  const build = base === 2 ? manifest.ci.build : undefined;
  assert.equal(source.route, build ? "promoted" : "fresh");
  assert.equal(
    source.commit,
    manifest.commit,
    "Corpus qualification commit differs",
  );
  assert.deepEqual(
    [source.candidateRunId, source.candidateAttempt, source.candidateCommit],
    [
      Number(build?.runId ?? manifest.runId),
      Number(build?.producingAttempt ?? manifest.attempt),
      build?.providerHead ?? manifest.commit,
    ],
    "Corpus candidate origin differs from qualification",
  );
  if (build) assert.equal(source.candidateJobId, build.producerJob);
  if (input.schemaVersion === 2 && build) {
    assert.deepEqual(
      [source.candidateProofId, `sha256:${source.candidateProofSha256}`],
      [manifest.ci.packageProof.id, manifest.ci.packageProof.digest],
      "Corpus consumer lock differs from the admitted CI package proof",
    );
  }
  assert.deepEqual(
    [
      subject.artifactId,
      subject.artifactSha256,
      subject.tarballSha256,
      subject.integrity,
    ],
    [
      manifest.candidateId,
      manifest.candidateDigest,
      manifest.assets.tarball.sha256,
      manifest.integrity,
    ],
    "Corpus artifact or tarball differs from qualification",
  );
}

/** Check the retained corpus subject and roster identity without opening live artifacts. */
export function assertCorpusQualificationBinding(manifest) {
  assert.equal(
    manifest.schemaVersion,
    3,
    "A corpus-bound qualification manifest is required",
  );
  const { corpus } = manifest;
  assertCandidateBinding(manifest, corpus.input);
  assert.ok(
    Number.isSafeInteger(corpus.requiredCount) &&
      corpus.requiredCount > 0 &&
      /^[0-9a-f]{64}$/u.test(corpus.rosterSha256),
    "Invalid retained corpus coverage identity",
  );
}

async function authenticateCompleteCorpus(
  manifest,
  input,
  { authenticate = authenticateHosted, env },
) {
  const result = await authenticate(input, env, manifest.package.version);
  assert.ok(
    result.status === "complete" &&
      result.missing.length === 0 &&
      result.rejected.length === 0 &&
      Number.isSafeInteger(result.requiredCount) &&
      result.requiredCount > 0 &&
      /^[0-9a-f]{64}$/u.test(result.rosterSha256),
    "Release corpus evidence does not cover the required roster",
  );
  return result;
}

/** Record a fully covered subject while the hosted producer is in shadow. */
export async function sealCorpusQualification(manifest, input, options = {}) {
  assert.ok([1, 2].includes(manifest.schemaVersion));
  assert.equal(typeof options.readCurrentMain, "function");
  assertCandidateBinding(manifest, input);
  const result = await authenticateCompleteCorpus(manifest, input, options);
  assert.equal(
    await options.readCurrentMain(),
    manifest.commit,
    "Protected main changed during corpus qualification",
  );
  return {
    ...manifest,
    schemaVersion: 3,
    corpus: {
      baseSchemaVersion: manifest.schemaVersion,
      rosterSha256: result.rosterSha256,
      requiredCount: result.requiredCount,
      input: {
        schemaVersion: input.schemaVersion,
        source: pick(input.source, [
          "route",
          "repositoryId",
          "runId",
          "attempt",
          "commit",
          "candidateRunId",
          "candidateAttempt",
          "candidateJobId",
          "candidateCommit",
          ...(input.schemaVersion === 2
            ? ["candidateProofId", "candidateProofSha256"]
            : []),
        ]),
        subject: pick(input.subject, [
          "artifactId",
          "artifactSha256",
          "tarballSha256",
          "integrity",
          "dependencyGraphSha256",
          "importMapSha256",
          input.schemaVersion === 2 ? "contentsByPlatform" : "contentSha256",
        ]),
        oracle: pick(input.oracle, ["version", "lockSha256"]),
        artifacts: input.artifacts.map((artifact) =>
          pick(artifact, ["id", "sha256", "shardId", "jobId"]),
        ),
      },
    },
  };
}

/** Recheck the original corpus artifacts at the staging boundary. */
export async function verifyCorpusQualification(manifest, options = {}) {
  assertCorpusQualificationBinding(manifest);
  const { corpus } = manifest;
  const result = await authenticateCompleteCorpus(
    manifest,
    corpus.input,
    options,
  );
  assert.deepEqual(
    [corpus.rosterSha256, corpus.requiredCount],
    [result.rosterSha256, result.requiredCount],
    "Corpus qualification coverage changed at staging",
  );
  return result;
}
