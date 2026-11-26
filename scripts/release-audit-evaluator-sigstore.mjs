/** Keyless identity for the single trusted job in the reusable OwlAPI audit evaluator. */
import { createRequire } from "node:module";
import { readControllerBlob } from "./release-controller-blob.mjs";
import {
  REPOSITORY,
  REPOSITORY_ID,
  REPOSITORY_URL,
  githubWorkflowIdentityPattern,
} from "./release-identity.mjs";
import { assertAuditNpm } from "./release-audit-evaluator-private.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";

export const auditSigstoreRootPath =
  "docs/release/npm-audit-sigstore-root.json";
const main = "refs/heads/main";
const issuer = "https://token.actions.githubusercontent.com";
const signer = ".github/workflows/release-audit-evaluator.yml";
const callers = [
  ".github/workflows/release.yml",
  ".github/workflows/release-registry.yml",
];
const signatureNetwork = { timeout: 5000, retry: { retries: 0 } };
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const workflowRef = (path, ref = main) => `${REPOSITORY}/${path}@${ref}`;
const workloadUri = (path, ref = main) => `${REPOSITORY_URL}/${path}@${ref}`;

export function assertAuditEvaluatorIdentity(identity) {
  const keys = ["workflow", "controller", "runId", "attempt", "checkRunId"];
  if (
    !identity ||
    typeof identity !== "object" ||
    Array.isArray(identity) ||
    Object.keys(identity).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(identity, key)) ||
    !callers.includes(identity.workflow) ||
    typeof identity.controller !== "string" ||
    !/^[0-9a-f]{40}$/u.test(identity.controller) ||
    ![identity.runId, identity.attempt, identity.checkRunId].every(positive)
  )
    throw new Error("Approved audit evaluator identity is required");
}

/** Enforce the selected source independently of all dispatch input and evidence. */
export function assertAuditIssuerContext(identity, env = process.env) {
  assertAuditEvaluatorIdentity(identity);
  if (
    env.GITHUB_REPOSITORY !== REPOSITORY ||
    env.GITHUB_REPOSITORY_ID !== String(REPOSITORY_ID) ||
    env.GITHUB_REF !== main ||
    env.GITHUB_REF_PROTECTED !== "true" ||
    env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
    env.GITHUB_WORKFLOW_REF !== workflowRef(identity.workflow) ||
    env.GITHUB_WORKFLOW_SHA !== identity.controller ||
    env.GITHUB_SHA !== identity.controller ||
    env.GITHUB_RUN_ID !== String(identity.runId) ||
    env.GITHUB_RUN_ATTEMPT !== String(identity.attempt) ||
    env.GITHUB_JOB !== "evaluate" ||
    env.RUNNER_ENVIRONMENT !== "github-hosted" ||
    !env.ACTIONS_ID_TOKEN_REQUEST_URL ||
    !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN ||
    env.SIGSTORE_ID_TOKEN
  )
    throw new Error("The approved protected audit job is unavailable");
}

export function assertAuditTokenClaims(claims, identity) {
  assertAuditEvaluatorIdentity(identity);
  if (
    claims?.iss !== issuer ||
    claims.aud !== "sigstore" ||
    claims.repository !== REPOSITORY ||
    String(claims.repository_id) !== String(REPOSITORY_ID) ||
    claims.ref !== main ||
    claims.event_name !== "workflow_dispatch" ||
    claims.workflow_ref !== workflowRef(identity.workflow) ||
    claims.workflow_sha !== identity.controller ||
    claims.sha !== identity.controller ||
    ![workflowRef(signer), workflowRef(signer, identity.controller)].includes(
      claims.job_workflow_ref,
    ) ||
    claims.job_workflow_sha !== identity.controller ||
    claims.runner_environment !== "github-hosted" ||
    String(claims.run_id) !== String(identity.runId) ||
    String(claims.run_attempt) !== String(identity.attempt) ||
    String(claims.check_run_id) !== String(identity.checkRunId)
  )
    throw new Error("The OIDC token does not identify the approved audit job");
}

export function auditSignaturePolicy(identity) {
  assertAuditEvaluatorIdentity(identity);
  // Fulcio maps the reusable signing workflow to the SAN and the initiating workflow to .18.
  const signerPatterns = [main, identity.controller].map((ref) =>
    githubWorkflowIdentityPattern(signer, ref).slice(1, -1),
  );
  const extensions = {
    10: identity.controller,
    11: "github-hosted",
    12: REPOSITORY_URL,
    13: identity.controller,
    14: main,
    15: String(REPOSITORY_ID),
    18: workloadUri(identity.workflow),
    19: identity.controller,
    20: "workflow_dispatch",
    21: `${REPOSITORY_URL}/actions/runs/${identity.runId}/attempts/${identity.attempt}`,
  };
  return {
    certificateIssuer: issuer,
    certificateIdentityURI: `^(?:${signerPatterns.join("|")})$`,
    certificateOIDs: Object.fromEntries(
      Object.entries(extensions).map(([suffix, text]) => {
        const payload = Buffer.from(text);
        if (payload.length >= 128)
          throw new Error("Unexpected audit identity extension size");
        return [
          `1.3.6.1.4.1.57264.1.${suffix}`,
          Buffer.concat([Buffer.from([0x0c, payload.length]), payload]),
        ];
      }),
    ),
    ctLogThreshold: 1,
    tlogThreshold: 1,
  };
}

/** Only the exact protected job obtains an OIDC token; that token never enters the npm audit subprocess. */
export async function signAuditStatement(statement, { npmCli, evaluator }) {
  try {
    assertAuditIssuerContext(evaluator);
    const native = createRequire(assertAuditNpm(npmCli));
    const { CIContextProvider } = native("@sigstore/sign");
    const token = await new CIContextProvider("sigstore").getToken();
    const parts = typeof token === "string" ? token.split(".") : [];
    if (
      parts.length !== 3 ||
      parts[1].length > 32 * 1024 ||
      !/^[A-Za-z0-9_-]+$/u.test(parts[1])
    )
      throw new Error("Invalid audit workload token");
    assertAuditTokenClaims(
      JSON.parse(Buffer.from(parts[1], "base64url")),
      evaluator,
    );
    const bundle = await native("sigstore").sign(statement, {
      ...signatureNetwork,
      identityToken: token,
    });
    return Buffer.from(JSON.stringify(bundle) + "\n");
  } catch {
    // Provider errors can contain credentials or local runtime diagnostics.
    throw new Error(
      "Approved audit signing authority could not issue a receipt",
    );
  }
}

/** Verify a direct message-signature bundle with the audited npm distribution's Sigstore client. */
export async function verifyAuditStatement(
  signature,
  statement,
  { npmCli, evaluator },
) {
  try {
    const bundle = JSON.parse(signature);
    const messageDigest = bundle?.messageSignature?.messageDigest;
    if (
      bundle.dsseEnvelope ||
      messageDigest?.algorithm !== "SHA2_256" ||
      messageDigest.digest !==
        Buffer.from(sha256Buffer(statement), "hex").toString("base64")
    )
      throw new Error("A direct signature of the audit statement is required");
    const native = createRequire(assertAuditNpm(npmCli));
    const root = native("@sigstore/protobuf-specs").TrustedRoot.fromJSON(
      JSON.parse(
        readControllerBlob(evaluator.controller, auditSigstoreRootPath),
      ),
    );
    const { Verifier, toTrustMaterial, toSignedEntity } =
      native("@sigstore/verify");
    const { bundleFromJSON } = native("@sigstore/bundle");
    const { createVerificationPolicy } = native("sigstore/dist/config.js");
    const options = auditSignaturePolicy(evaluator);
    // A trusted controller selects the public root before issuance. The native verifier checks the
    // included transparency proofs and certificate chain without needing live TUF or the issuing job.
    const verifier = new Verifier(toTrustMaterial(root), {
      ctlogThreshold: options.ctLogThreshold,
      tlogThreshold: options.tlogThreshold,
    });
    verifier.verify(
      toSignedEntity(bundleFromJSON(bundle), statement),
      createVerificationPolicy(options),
    );
  } catch {
    throw new Error("Public audit receipt signer could not be authenticated");
  }
}
