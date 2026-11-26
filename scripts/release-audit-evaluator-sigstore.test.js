import { expect, test } from "@jest/globals";
import {
  assertAuditIssuerContext,
  assertAuditTokenClaims,
  auditSignaturePolicy,
  signAuditStatement,
  verifyAuditStatement,
} from "./release-audit-evaluator-sigstore.mjs";

const repository = "Hadden-Industries/owlapi";
const ref = "refs/heads/main";
const workflow = ".github/workflows/release.yml";
const reusable = ".github/workflows/release-audit-evaluator.yml";
const evaluator = {
  workflow,
  controller: "a".repeat(40),
  runId: 81,
  attempt: 2,
  checkRunId: 551,
};
const gh = (path, at = ref) => `${repository}/${path}@${at}`;
const context = {
  GITHUB_REPOSITORY: repository,
  GITHUB_REPOSITORY_ID: "1347610640",
  GITHUB_REF: ref,
  GITHUB_REF_PROTECTED: "true",
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_WORKFLOW_REF: gh(workflow),
  GITHUB_WORKFLOW_SHA: evaluator.controller,
  GITHUB_SHA: evaluator.controller,
  GITHUB_RUN_ID: "81",
  GITHUB_RUN_ATTEMPT: "2",
  GITHUB_JOB: "evaluate",
  RUNNER_ENVIRONMENT: "github-hosted",
  ACTIONS_ID_TOKEN_REQUEST_URL:
    "https://token.actions.githubusercontent.com/fixture",
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: "fixture only",
};
const claims = {
  iss: "https://token.actions.githubusercontent.com",
  aud: "sigstore",
  repository,
  repository_id: "1347610640",
  ref,
  event_name: "workflow_dispatch",
  workflow_ref: gh(workflow),
  workflow_sha: evaluator.controller,
  job_workflow_ref: gh(reusable),
  job_workflow_sha: evaluator.controller,
  sha: evaluator.controller,
  runner_environment: "github-hosted",
  run_id: "81",
  run_attempt: "2",
  check_run_id: "551",
};

test("only the selected protected job can request a signing identity", () => {
  expect(() => assertAuditIssuerContext(evaluator, context)).not.toThrow();
  for (const changed of [
    { GITHUB_JOB: "npm-publish" },
    { GITHUB_REF_PROTECTED: "false" },
    { GITHUB_EVENT_NAME: "pull_request" },
    { GITHUB_RUN_ATTEMPT: "1" },
    { RUNNER_ENVIRONMENT: "self-hosted" },
    { SIGSTORE_ID_TOKEN: "unapproved injected assertion" },
  ]) {
    expect(() =>
      assertAuditIssuerContext(evaluator, { ...context, ...changed }),
    ).toThrow("approved protected audit job");
  }
  expect(() => assertAuditTokenClaims(claims, evaluator)).not.toThrow();
  expect(() =>
    assertAuditTokenClaims(
      { ...claims, job_workflow_ref: gh(reusable, evaluator.controller) },
      evaluator,
    ),
  ).not.toThrow();
  for (const changed of [
    { check_run_id: "552" },
    { job_workflow_ref: gh(workflow) },
    { job_workflow_sha: "b".repeat(40) },
    { repository_id: "42" },
    { iss: "https://unrelated.example" },
  ]) {
    expect(() =>
      assertAuditTokenClaims({ ...claims, ...changed }, evaluator),
    ).toThrow("does not identify the approved audit job");
  }
});

test("the verifier pins the reusable signer separately from the exact release caller and run", () => {
  const policy = auditSignaturePolicy(evaluator);
  expect(policy.certificateIssuer).toBe(claims.iss);
  expect(policy.ctLogThreshold).toBe(1);
  expect(policy.tlogThreshold).toBe(1);
  const allowed = new RegExp(policy.certificateIdentityURI, "u");
  expect(allowed.test("https://github.com/" + gh(reusable))).toBe(true);
  expect(
    allowed.test("https://github.com/" + gh(reusable, evaluator.controller)),
  ).toBe(true);
  expect(allowed.test("https://github.com/" + gh(workflow))).toBe(false);
  expect(
    allowed.test("https://github.com/" + gh(reusable, "refs/heads/unreviewed")),
  ).toBe(false);
  const extension = (suffix) =>
    policy.certificateOIDs["1.3.6.1.4.1.57264.1." + suffix]
      .subarray(2)
      .toString();
  expect(extension(11)).toBe("github-hosted");
  expect(extension(15)).toBe("1347610640");
  expect(extension(18)).toBe("https://github.com/" + gh(workflow));
  expect(extension(19)).toBe(evaluator.controller);
  expect(extension(21)).toBe(
    `https://github.com/${repository}/actions/runs/81/attempts/2`,
  );
  expect(() =>
    auditSignaturePolicy({
      ...evaluator,
      workflow: ".github/workflows/ci.yml",
    }),
  ).toThrow("Approved audit evaluator identity");
});

test("rejects local signing attempts and non-provider signatures before invoking npm", async () => {
  await expect(
    signAuditStatement(Buffer.from("receipt"), { evaluator }),
  ).rejects.toThrow(
    "Approved audit signing authority could not issue a receipt",
  );
  await expect(
    verifyAuditStatement(Buffer.from("{}"), Buffer.from("receipt"), {
      evaluator,
    }),
  ).rejects.toThrow("Public audit receipt signer could not be authenticated");
});
