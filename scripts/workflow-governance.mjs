import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { REQUIRED_JOB_IDS } from "./require-job-success.mjs";

/* eslint-disable no-regex-spaces -- These expressions intentionally describe
 * exact YAML indentation; replacing visible spaces with counters would obscure
 * the policy boundary the validator is meant to make reviewable. */

const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const WORKFLOW_DIRECTORY = join(REPOSITORY_ROOT, ".github", "workflows");
const ISSUE_FORM_DIRECTORY = join(REPOSITORY_ROOT, ".github", "ISSUE_TEMPLATE");
const EXPECTED_WORKFLOWS = Object.freeze([
  "ci.yml",
  "extended-tests.yml",
  "maintenance.yml",
  "release.yml",
]);
const EXPECTED_ISSUE_FORMS = Object.freeze([
  "bug.yml",
  "conformance.yml",
  "documentation.yml",
  "feature.yml",
  "java-compatibility.yml",
  "other.yml",
]);
const ACTIONS = Object.freeze({
  "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1": "v7.0.1",
  "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020": "v7.0.0",
  "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a": "v7.0.1",
  "actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c":
    "v8.0.1",
  "actions/dependency-review-action@a1d282b36b6f3519aa1f3fc636f609c47dddb294":
    "v5.0.0",
});

const sortedYamlFiles = (directory, { exclude = [] } = {}) =>
  existsSync(directory)
    ? readdirSync(directory)
        .filter((name) => /\.ya?ml$/u.test(name) && !exclude.includes(name))
        .sort()
    : [];

const add = (violations, condition, message) => {
  if (!condition) {
    violations.push(message);
  }
};

const jobIds = (source) => {
  const jobsIndex = source.indexOf("\njobs:\n");
  if (jobsIndex === -1) {
    return [];
  }
  return [
    ...source.slice(jobsIndex).matchAll(/^  ([a-z][a-z0-9_]*):\r?$/gmu),
  ].map(([, id]) => id);
};

const jobBlock = (source, id) => {
  const startMatch = new RegExp(`^  ${id}:\\r?$`, "mu").exec(source);
  if (!startMatch) {
    return "";
  }
  const remainder = source.slice(startMatch.index + startMatch[0].length);
  const nextMatch = /^  [a-z][a-z0-9_]*:\r?$/mu.exec(remainder);
  const end = nextMatch
    ? startMatch.index + startMatch[0].length + nextMatch.index
    : source.length;
  return source.slice(startMatch.index, end);
};

const listNeeds = (block) => {
  const list = block.match(/^    needs:\r?\n((?:      - [a-z0-9_]+\r?\n?)+)/mu);
  if (list) {
    return [...list[1].matchAll(/^      - ([a-z0-9_]+)$/gmu)].map(
      ([, id]) => id,
    );
  }
  const scalar = block.match(/^    needs: ([a-z0-9_]+)$/mu);
  return scalar ? [scalar[1]] : [];
};

const stepBlockAt = (lines, index) => {
  let end = index + 1;
  while (end < lines.length && !/^      - name:/u.test(lines[end])) {
    end += 1;
  }
  return lines.slice(index, end).join("\n");
};

const validateActionUses = (fileName, source, violations) => {
  const lines = source.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s+uses: ([^\s#]+)(?: # (v[^\s]+))?$/u);
    if (!match) {
      continue;
    }
    const [, identity, comment] = match;
    const expectedTag = ACTIONS[identity];
    add(
      violations,
      Boolean(expectedTag),
      `${fileName}: unapproved Action ${identity}`,
    );
    if (!expectedTag) {
      continue;
    }
    add(
      violations,
      comment === expectedTag,
      `${fileName}: ${identity} must retain adjacent ${expectedTag}`,
    );
    const block = stepBlockAt(lines, index);
    if (identity.startsWith("actions/checkout@")) {
      add(
        violations,
        /persist-credentials: false/u.test(block),
        `${fileName}: checkout must disable persisted credentials`,
      );
    }
    if (identity.startsWith("actions/setup-node@")) {
      add(
        violations,
        /node-version: "(?:22\.23\.2|24\.19\.0)"/u.test(block),
        `${fileName}: setup-node must select an approved exact Node patch`,
      );
      for (const setting of [
        "check-latest: false",
        'cache: ""',
        "package-manager-cache: false",
      ]) {
        add(
          violations,
          block.includes(setting),
          `${fileName}: setup-node is missing ${setting}`,
        );
      }
      add(
        violations,
        !/(?:registry-url|always-auth|mirror|token):/u.test(block),
        `${fileName}: ordinary setup-node block broadens registry authority`,
      );
    }
  }
};

const validateJobs = (fileName, source, violations) => {
  const allowedRunners = new Set(["ubuntu-24.04", "windows-2025", "macos-15"]);
  for (const id of jobIds(source)) {
    const block = jobBlock(source, id);
    const runner = block.match(/^    runs-on: ([^\s]+)$/mu)?.[1];
    add(
      violations,
      allowedRunners.has(runner),
      `${fileName}:${id} must use an approved explicit runner`,
    );
    add(
      violations,
      /^    timeout-minutes: \d+$/mu.test(block),
      `${fileName}:${id} must have an explicit job timeout`,
    );
    add(
      violations,
      /^    permissions:\r?$/mu.test(block),
      `${fileName}:${id} must declare job-minimal permissions`,
    );
    const expectedShell = runner === "windows-2025" ? "pwsh" : "bash";
    add(
      violations,
      new RegExp(`^        shell: ${expectedShell}$`, "mu").test(block),
      `${fileName}:${id} must select ${expectedShell}`,
    );
  }
};

const validateAggregate = (fileName, source, workflow, violations) => {
  const id = "required";
  const block = jobBlock(source, id);
  const expectedName =
    workflow === "ci" ? "CI / required" : "Release / qualified";
  add(
    violations,
    block.includes(`name: ${expectedName}`),
    `${fileName}: missing stable aggregate name ${expectedName}`,
  );
  add(
    violations,
    block.includes("if: ${{ always() }}"),
    `${fileName}: aggregate must evaluate every required conclusion`,
  );
  const observed = listNeeds(block);
  add(
    violations,
    JSON.stringify(observed) === JSON.stringify(REQUIRED_JOB_IDS[workflow]),
    `${fileName}: aggregate needs inventory differs from the executable registry`,
  );
};

const validateCandidateTransport = (fileName, source, violations) => {
  if (!/^(?:ci|release)\.yml$/u.test(fileName)) {
    return;
  }
  const candidate = jobBlock(source, "candidate");
  for (const setting of [
    "if-no-files-found: error",
    "retention-days: 90",
    "compression-level: 0",
    "overwrite: false",
    "include-hidden-files: false",
    "archive: true",
  ]) {
    add(
      violations,
      candidate.includes(setting),
      `${fileName}: candidate upload is missing ${setting}`,
    );
  }
  add(
    violations,
    (candidate.match(/^            \.release\/candidate\/.+$/gmu) ?? [])
      .length === 3,
    `${fileName}: candidate upload must name exactly three explicit paths`,
  );
  const lines = source.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].includes("actions/download-artifact@")) {
      continue;
    }
    const block = stepBlockAt(lines, index);
    for (const setting of [
      "artifact-ids: ${{ needs.candidate.outputs.artifact_id }}",
      "merge-multiple: false",
      "skip-decompress: false",
      "digest-mismatch: error",
    ]) {
      add(
        violations,
        block.includes(setting),
        `${fileName}: candidate download is missing ${setting}`,
      );
    }
    add(
      violations,
      !/^\s+(?:name|pattern|github-token|repository|run-id):/mu.test(block),
      `${fileName}: candidate download broadens same-run artifact selection`,
    );
  }
};

const validateMaintenanceReporter = (source, violations) => {
  add(
    violations,
    JSON.stringify(jobIds(source)) === JSON.stringify(["health", "reporter"]),
    "maintenance.yml: expected exactly the read-only health and write-only reporter jobs",
  );
  const health = jobBlock(source, "health");
  for (const setting of [
    "reporter_artifact_id: ${{ steps.reporter_bundle.outputs.artifact-id }}",
    "if-no-files-found: error",
    "retention-days: 1",
    "compression-level: 0",
    "overwrite: false",
    "include-hidden-files: false",
    "path: scripts/report-maintenance-failure.mjs",
  ]) {
    add(
      violations,
      health.includes(setting),
      `maintenance.yml: reporter source transport is missing ${setting}`,
    );
  }

  const reporter = jobBlock(source, "reporter");
  for (const setting of [
    "needs: health",
    "if: ${{ !cancelled() && needs.health.outputs.reporter_artifact_id != '' }}",
    "issues: write",
    "artifact-ids: ${{ needs.health.outputs.reporter_artifact_id }}",
    "merge-multiple: false",
    "skip-decompress: false",
    "digest-mismatch: error",
    "MAINTENANCE_HEALTH_RESULT: ${{ needs.health.result }}",
    "run: node .maintenance-reporter/report-maintenance-failure.mjs",
  ]) {
    add(
      violations,
      reporter.includes(setting),
      `maintenance.yml: isolated reporter is missing ${setting}`,
    );
  }
  for (const forbidden of [
    "contents: read",
    "actions: read",
    "id-token: write",
    "actions/checkout@",
  ]) {
    add(
      violations,
      !reporter.includes(forbidden),
      `maintenance.yml: write-only reporter contains forbidden authority ${forbidden}`,
    );
  }
};

const validateJsonRecord = (schemaName, recordName, violations) => {
  const directory = join(REPOSITORY_ROOT, "docs", "release");
  const schema = JSON.parse(readFileSync(join(directory, schemaName), "utf8"));
  const record = JSON.parse(readFileSync(join(directory, recordName), "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  add(
    violations,
    validate(record),
    `${recordName}: ${ajv.errorsText(validate.errors)}`,
  );
};

export const auditRepositoryControls = () => {
  const violations = [];
  const workflowFiles = sortedYamlFiles(WORKFLOW_DIRECTORY);
  const issueFormFiles = sortedYamlFiles(ISSUE_FORM_DIRECTORY, {
    exclude: ["config.yml"],
  });
  add(
    violations,
    JSON.stringify(workflowFiles) === JSON.stringify(EXPECTED_WORKFLOWS),
    "The repository must contain exactly the four approved workflow files.",
  );
  add(
    violations,
    JSON.stringify(issueFormFiles) === JSON.stringify(EXPECTED_ISSUE_FORMS),
    "The repository must contain exactly the six approved issue forms.",
  );

  const sources = Object.fromEntries(
    workflowFiles.map((fileName) => [
      fileName,
      readFileSync(join(WORKFLOW_DIRECTORY, fileName), "utf8"),
    ]),
  );
  for (const [fileName, source] of Object.entries(sources)) {
    add(
      violations,
      /^permissions: \{\}$/mu.test(source),
      `${fileName}: root permissions must be empty`,
    );
    for (const forbidden of [
      "pull_request_target",
      "workflow_run",
      "continue-on-error",
      "actions/cache@",
      "npm exec --package",
      "npx ",
      "ubuntu-latest",
      "windows-latest",
      "macos-latest",
      "container:",
      "|| true",
    ]) {
      add(
        violations,
        !source.includes(forbidden),
        `${fileName}: forbidden workflow construct ${forbidden}`,
      );
    }
    add(
      violations,
      !/^\s+run:.*\$\{\{/mu.test(source),
      `${fileName}: workflow expressions must cross into scripts through env/with data, not run text`,
    );
    validateActionUses(fileName, source, violations);
    validateJobs(fileName, source, violations);
    validateCandidateTransport(fileName, source, violations);
  }

  const ci = sources["ci.yml"] ?? "";
  add(violations, ci.startsWith("name: CI\n"), "ci.yml: wrong workflow name");
  add(
    violations,
    /on:\r?\n  pull_request:\r?\n    branches: \[main\]\r?\n  push:\r?\n    branches: \[main\]/u.test(
      ci,
    ),
    "ci.yml: trigger must be pull_request and main push without path filters",
  );
  add(
    violations,
    ci.includes("cancel-in-progress: true"),
    "ci.yml: superseded work must cancel",
  );
  validateAggregate("ci.yml", ci, "ci", violations);

  const release = sources["release.yml"] ?? "";
  add(
    violations,
    /^on:\r?\n  workflow_dispatch:\s*$/mu.test(release),
    "release.yml: workflow_dispatch must be the sole trigger",
  );
  for (const setting of [
    "group: owlapi-release",
    "cancel-in-progress: false",
    "queue: max",
  ]) {
    add(
      violations,
      release.includes(setting),
      `release.yml: missing concurrency setting ${setting}`,
    );
  }
  validateAggregate("release.yml", release, "release", violations);
  for (const authority of [
    "id-token: write",
    "contents: write",
    "environment:",
    "npm publish",
    "npm stage publish",
  ]) {
    add(
      violations,
      !release.includes(authority),
      `release.yml: disabled Phase 19C boundary contains ${authority}`,
    );
  }

  for (const [fileName, group] of [
    ["maintenance.yml", "owlapi-maintenance"],
    ["extended-tests.yml", "owlapi-extended-tests"],
  ]) {
    const source = sources[fileName] ?? "";
    add(
      violations,
      source.includes("schedule:") && source.includes("workflow_dispatch:"),
      `${fileName}: scheduled and manual triggers are required`,
    );
    add(
      violations,
      source.includes(`group: ${group}`) &&
        source.includes("cancel-in-progress: false") &&
        !source.includes("queue: max"),
      `${fileName}: observational single-pending concurrency is incorrect`,
    );
  }
  validateMaintenanceReporter(sources["maintenance.yml"] ?? "", violations);

  const allSources = Object.values(sources).join("\n");
  add(
    violations,
    (allSources.match(/\$\{\{ always\(\) \}\}/gu) ?? []).length === 2,
    "always() is allowed only on the two fail-closed aggregates",
  );
  const webVowlControl = JSON.parse(
    readFileSync(
      join(REPOSITORY_ROOT, "docs", "release", "webvowl-consumer.json"),
      "utf8",
    ),
  );
  for (const identity of [
    webVowlControl.webvowl.repository,
    webVowlControl.webvowl.commit,
    webVowlControl.ontologyCorpus.repository,
    webVowlControl.ontologyCorpus.commit,
  ]) {
    add(
      violations,
      ci.includes(identity) && release.includes(identity),
      `WebVOWL qualification identity ${identity} is not bound in both workflows`,
    );
  }

  const issueConfig = readFileSync(
    join(ISSUE_FORM_DIRECTORY, "config.yml"),
    "utf8",
  );
  add(
    violations,
    issueConfig.includes("blank_issues_enabled: false") &&
      issueConfig.includes("security/advisories/new") &&
      issueConfig.includes("CODE_OF_CONDUCT.md"),
    "Issue routing must disable blanks and retain private security/conduct paths.",
  );
  const pullRequestTemplatePath = join(
    REPOSITORY_ROOT,
    ".github",
    "pull_request_template.md",
  );
  add(
    violations,
    existsSync(pullRequestTemplatePath) &&
      readFileSync(pullRequestTemplatePath, "utf8").includes(
        "not a contributor licence agreement",
      ),
    "The engineering pull-request template is absent or misstates its legal role.",
  );
  const dependabot = readFileSync(
    join(REPOSITORY_ROOT, ".github", "dependabot.yml"),
    "utf8",
  );
  add(
    violations,
    dependabot.includes("package-ecosystem: npm") &&
      dependabot.includes("package-ecosystem: github-actions") &&
      dependabot.includes("compatible-development-tools") &&
      dependabot.includes("compatible-action-updates") &&
      !/(?:auto-merge|renovate)/iu.test(dependabot),
    "Dependabot must propose isolated runtime and grouped compatible tooling/Action updates without auto-merge.",
  );

  validateJsonRecord(
    "publication-control.schema.json",
    "publication-control.json",
    violations,
  );
  validateJsonRecord(
    "webvowl-consumer.schema.json",
    "webvowl-consumer.json",
    violations,
  );
  return { workflowFiles, issueFormFiles, violations };
};

const main = () => {
  const report = auditRepositoryControls();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.violations.length > 0) {
    process.exitCode = 1;
  }
};

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  main();
}
