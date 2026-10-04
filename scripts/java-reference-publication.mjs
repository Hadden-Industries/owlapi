/** Main-only publication state. Qualification and service authentication remain
 * separate from this constructor; a successful upload is never a test verdict. */
import { evidenceFingerprint } from "./ci-check-coverage.mjs";
import {
  createJavaReferenceStateValidator,
  JAVA_REFERENCE_POLICY,
} from "./java-reference-state.mjs";
import { CI_WORKFLOW } from "./ci-verification.mjs";

const fact = (condition, message) => {
  if (!condition) throw new Error(`Java publication: ${message}`);
};
export function referencePublicationProvenance({
  environment,
  event,
  snapshot,
  state,
  now = new Date().toISOString(),
  policy = JAVA_REFERENCE_POLICY,
}) {
  fact(policy.enabled, "operating activation has not been accepted");
  const runId = Number(environment.GITHUB_RUN_ID);
  const runAttempt = Number(environment.GITHUB_RUN_ATTEMPT);
  const identity = {
    role: "MAIN",
    mode: "FULL",
    runId,
    runAttempt,
    commit: snapshot.commit,
  };
  createJavaReferenceStateValidator(policy)(state, identity);
  fact(
    environment.GITHUB_EVENT_NAME === "push" &&
      environment.GITHUB_REF === "refs/heads/main" &&
      environment.GITHUB_REPOSITORY === policy.repository &&
      Number(environment.GITHUB_REPOSITORY_ID) === policy.repositoryId &&
      environment.GITHUB_SHA === snapshot.commit &&
      event?.ref === "refs/heads/main" &&
      event.after === snapshot.commit &&
      event.repository?.id === policy.repositoryId &&
      event.repository.full_name === policy.repository &&
      !event.deleted &&
      /^[a-f0-9]{40}$/u.test(snapshot.tree ?? "") &&
      /^[a-f0-9]{40}$/u.test(snapshot.workflow ?? "") &&
      state.materialization === "FRESH" &&
      state.inputs !== null &&
      state.execution.runAttempt === runAttempt &&
      state.publication === null &&
      typeof now === "string" &&
      now.length <= 32 &&
      Number.isFinite(Date.parse(now)),
    "only the current fresh qualified main build can produce a product",
  );
  return {
    repository: policy.repository,
    repositoryId: policy.repositoryId,
    workflow: CI_WORKFLOW,
    commit: snapshot.commit,
    tree: snapshot.tree,
    runId,
    runAttempt,
    event: "push",
    ref: "refs/heads/main",
    createdAt: now,
  };
}

export function referencePublicationState({
  state,
  product,
  artifactId,
  artifactDigest,
  policy = JAVA_REFERENCE_POLICY,
}) {
  const provenance = product.provenance;
  const identity = {
    role: "MAIN",
    mode: "FULL",
    runId: provenance.runId,
    runAttempt: provenance.runAttempt,
    commit: provenance.commit,
  };
  createJavaReferenceStateValidator(policy)(state, identity);
  fact(
    product.expected.inputKeySha256 === state.inputs?.keySha256 &&
      product.expected.inputRecordSha256 === state.inputs.inputRecordSha256 &&
      product.expected.runtimeGraphSha256 === state.inputs.runtimeGraphSha256 &&
      product.expected.rightsSha256 === policy.rightsSha256 &&
      product.expected.provenanceSha256 === evidenceFingerprint(provenance) &&
      Number.isSafeInteger(product.payloadBytes) &&
      product.payloadBytes > 0 &&
      product.payloadBytes <= policy.payloadLimit,
    "upload does not match the executed build and accepted source closure",
  );
  const result = {
    ...state,
    publication: {
      artifactId,
      artifactDigest,
      manifestSha256: product.expected.manifestSha256,
      inventorySha256: product.expected.inventorySha256,
      provenanceSha256: product.expected.provenanceSha256,
      rightsSha256: product.expected.rightsSha256,
      createdAt: provenance.createdAt,
    },
  };
  return createJavaReferenceStateValidator(policy)(result, identity);
}
