import { pathToFileURL } from "node:url";

export const FULL_CI_JOB_IDS = Object.freeze([
  "metadata",
  "source_node_22",
  "source_node_24",
  "dependency_review",
  "candidate",
  "portability_windows_node_22",
  "portability_windows_node_24",
  "portability_macos_node_22",
  "portability_macos_node_24",
  "browser_chromium",
  "browser_firefox",
  "browser_webkit",
  "webvowl",
]);

export const REQUIRED_JOB_IDS = Object.freeze({
  ci: Object.freeze(["verification", ...FULL_CI_JOB_IDS]),
  release: Object.freeze([
    "release_preflight",
    "metadata",
    "source_node_22",
    "source_node_24",
    "dependency_review",
    "third_party_evidence",
    "candidate",
    "portability_windows_node_22",
    "portability_windows_node_24",
    "portability_macos_node_22",
    "portability_macos_node_24",
    "browser_chromium",
    "browser_firefox",
    "browser_webkit",
    "webvowl",
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

export const requireCiJobs = (needs, { eventName, ref } = {}) => {
  if (needs?.verification?.outputs?.reuse !== "true") {
    return { mode: "FULL", requiredJobs: requireSuccessfulJobs("ci", needs) };
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
  return {
    mode: "REUSED",
    source,
    requiredJobs: ["verification"],
    reusedJobs: [...FULL_CI_JOB_IDS],
  };
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
        })
      : { requiredJobs: requireSuccessfulJobs(workflow, needs) };
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
