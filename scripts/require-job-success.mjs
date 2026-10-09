import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { assertCheckCoverage } from "./ci-check-coverage.mjs";
import {
  coverageFromNeeds,
  qualifiedSourceFromOutputs,
} from "./ci-qualification.mjs";

export const FULL_CI_JOB_IDS = Object.freeze([
  "metadata",
  "source_node_22",
  "source_node_24",
  "source_node_26",
  "quality_windows",
  "dependency_review",
  "candidate",
  "portability_windows_node_22",
  "portability_windows_node_24",
  "portability_macos_node_22",
  "portability_macos_node_24",
  "portability_ubuntu_node_26",
  "portability_windows_node_26",
  "portability_macos_node_26",
  "browser_chromium",
  "browser_firefox",
  "browser_webkit",
  "owl_contract",
]);

export const REQUIRED_JOB_IDS = Object.freeze({
  ci: Object.freeze(["verification", ...FULL_CI_JOB_IDS]),
  release: Object.freeze([
    "release_preflight",
    "metadata",
    "source_node_22",
    "source_node_24",
    "source_node_26",
    "quality_windows",
    "dependency_review",
    "third_party_evidence",
    "candidate",
    "portability_windows_node_22",
    "portability_windows_node_24",
    "portability_macos_node_22",
    "portability_macos_node_24",
    "portability_ubuntu_node_26",
    "portability_windows_node_26",
    "portability_macos_node_26",
    "browser_chromium",
    "browser_firefox",
    "browser_webkit",
    "owl_contract",
  ]),
});

export const requireSuccessfulJobs = (workflow, needs) => {
  const required = REQUIRED_JOB_IDS[workflow];
  if (
    !required ||
    !needs ||
    typeof needs !== "object" ||
    Array.isArray(needs)
  ) {
    throw new Error("Unknown workflow or invalid GitHub needs object.");
  }
  const observed = Object.keys(needs).sort();
  const missing = required.filter((jobId) => !observed.includes(jobId));
  const unexpected = observed.filter((jobId) => !required.includes(jobId));
  const unsuccessful = required
    .filter((jobId) => needs[jobId]?.result !== "success")
    .map((jobId) => `${jobId}=${needs[jobId]?.result ?? "missing"}`);
  if (missing.length || unexpected.length || unsuccessful.length) {
    throw new Error(
      `Required jobs did not close: missing=${missing.join(",") || "none"} unexpected=${unexpected.join(",") || "none"} unsuccessful=${unsuccessful.join(",") || "none"}.`,
    );
  }
  return [...required];
};

const assertCandidateContractBinding = (needs, evidence) => {
  const expected = {
    id: Number(needs.candidate?.outputs?.artifact_id),
    digest: `sha256:${needs.candidate?.outputs?.artifact_digest}`,
  };
  if (!isDeepStrictEqual(expected, evidence.candidateArtifact))
    throw new Error(
      "Installed OWL proof does not qualify the retained candidate artifact.",
    );
};

export const requireCiJobs = (
  needs,
  { eventName, ref, runId, runAttempt, sha } = {},
) => {
  if (needs?.verification?.outputs?.reuse !== "true") {
    const requiredJobs = requireSuccessfulJobs("ci", needs);
    // The receipt writer also binds these reports to its actual Git snapshot.
    const evidence = coverageFromNeeds(needs, {
      runId,
      runAttempt,
      commit: sha,
    });
    assertCandidateContractBinding(needs, evidence.owl_contract);
    return { mode: "FULL", requiredJobs };
  }
  const source = needs.verification.outputs;
  if (
    eventName !== "push" ||
    ref !== "refs/heads/main" ||
    needs.verification.result !== "success" ||
    !/^[1-9][0-9]*$/u.test(source.source_run_id ?? "") ||
    !/^[1-9][0-9]*$/u.test(source.source_run_attempt ?? "") ||
    !/^[a-f0-9]{40}$/u.test(source.source_commit ?? "") ||
    !/^[1-9][0-9]*$/u.test(source.candidate_artifact_id ?? "") ||
    !/^sha256:[a-f0-9]{64}$/u.test(source.candidate_artifact_digest ?? "") ||
    Object.keys(needs).length !== REQUIRED_JOB_IDS.ci.length ||
    FULL_CI_JOB_IDS.some((id) => needs[id]?.result !== "skipped")
  ) {
    throw new Error(
      "CI reuse requires verified main-push evidence and the exact skipped full-job inventory.",
    );
  }
  qualifiedSourceFromOutputs(source);
  return {
    mode: "REUSED",
    source,
    requiredJobs: ["verification"],
    reusedJobs: [...FULL_CI_JOB_IDS],
  };
};

export const requireReleaseJobs = (needs, { runId, runAttempt, sha }) => {
  const requiredJobs = requireSuccessfulJobs("release", needs);
  const java = JSON.parse(needs.source_node_24.outputs.coverage);
  if (
    !Number.isSafeInteger(java.runAttempt) ||
    java.runAttempt < 1 ||
    java.runAttempt > runAttempt
  )
    throw new Error("Java producing attempt is outside this release run.");
  assertCheckCoverage(java, "java", {
    runId,
    runAttempt: java.runAttempt,
    commit: sha,
  });
  const evidence = JSON.parse(needs.owl_contract.outputs.coverage);
  if (
    !Number.isSafeInteger(evidence.runAttempt) ||
    evidence.runAttempt < 1 ||
    evidence.runAttempt > runAttempt
  )
    throw new Error(
      "OWL contract producing attempt is outside this release run.",
    );
  assertCheckCoverage(evidence, "owl_contract", {
    runId,
    runAttempt: evidence.runAttempt,
    commit: sha,
  });
  assertCandidateContractBinding(needs, evidence);
  return { requiredJobs };
};

const valueAfter = (name) => {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) {
    throw new Error(`Missing required ${name} argument.`);
  }
  return process.argv[index + 1];
};

const main = () => {
  const workflow = valueAfter("--workflow");
  const rawNeeds = process.env.REQUIRED_JOB_RESULTS_JSON;
  if (!rawNeeds) {
    throw new Error("REQUIRED_JOB_RESULTS_JSON is required.");
  }
  const needs = JSON.parse(rawNeeds);
  const accepted =
    workflow === "ci"
      ? requireCiJobs(needs, {
          eventName: process.env.GITHUB_EVENT_NAME,
          ref: process.env.GITHUB_REF,
          runId: Number(process.env.GITHUB_RUN_ID),
          runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
          sha: process.env.GITHUB_SHA,
        })
      : requireReleaseJobs(needs, {
          runId: Number(process.env.GITHUB_RUN_ID),
          runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
          sha: process.env.GITHUB_SHA,
        });
  process.stdout.write(
    `${JSON.stringify({ workflow, result: "PASS", ...accepted }, null, 2)}\n`,
  );
};

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  main();
}
