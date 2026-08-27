import { pathToFileURL } from "node:url";

const COMMON_REQUIRED_JOB_IDS = Object.freeze([
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
  ci: COMMON_REQUIRED_JOB_IDS,
  release: Object.freeze(["release_preflight", ...COMMON_REQUIRED_JOB_IDS]),
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
  const accepted = requireSuccessfulJobs(workflow, JSON.parse(rawNeeds));
  process.stdout.write(
    `${JSON.stringify({ workflow, result: "PASS", requiredJobs: accepted }, null, 2)}\n`,
  );
};

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  main();
}
