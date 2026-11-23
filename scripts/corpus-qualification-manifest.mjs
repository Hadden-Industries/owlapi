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

async function authenticateHosted(input, env) {
  const { readHostedCorpus } = await import("./release-corpus-artifacts.mjs");
  return readHostedCorpus(input, env);
}

/** Reconcile the original artifacts under the subject admitted by qualification. */
async function authenticateQualification(
  manifest,
  input,
  { authenticate = authenticateHosted, env },
) {
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
  const result = await authenticate(input, env);
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
  const result = await authenticateQualification(manifest, input, options);
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
        ]),
        subject: pick(input.subject, [
          "artifactId",
          "artifactSha256",
          "tarballSha256",
          "integrity",
          "dependencyGraphSha256",
          "importMapSha256",
          "contentSha256",
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
  assert.equal(
    manifest.schemaVersion,
    3,
    "A corpus-bound qualification manifest is required",
  );
  const { corpus } = manifest;
  const result = await authenticateQualification(
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
