/** Repository-owned workflow policy; YAML and GitHub grammar belong to yaml and actionlint. */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parseDocument } from "yaml";
import { REQUIRED_JOB_IDS } from "./require-job-success.mjs";
import { CI_JOB_NAMES } from "./ci-qualification.mjs";

const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const WORKFLOW_DIRECTORY = join(REPOSITORY_ROOT, ".github", "workflows");
const ISSUE_FORM_DIRECTORY = join(REPOSITORY_ROOT, ".github", "ISSUE_TEMPLATE");
const EXPECTED_WORKFLOWS = [
  "ci.yml",
  "extended-tests.yml",
  "maintenance.yml",
  "markdown-quality.yml",
  "release-reconciliation.yml",
  "release.yml",
];
const EXPECTED_ISSUE_FORMS = [
  "bug.yml",
  "conformance.yml",
  "documentation.yml",
  "feature.yml",
  "java-compatibility.yml",
  "other.yml",
];
const ACTIONS = Object.freeze({
  "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1": "v7.0.1",
  "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020": "v7.0.0",
  "actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97": "v7.0.0",
  "actions/setup-java@de7274f081f381c8f8158605e0321c36c376e2e6": "v6.0.1",
  "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a": "v7.0.1",
  "actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c":
    "v8.0.1",
  "actions/dependency-review-action@a1d282b36b6f3519aa1f3fc636f609c47dddb294":
    "v5.0.0",
});
const DOWNLOAD_INPUTS = {
  "merge-multiple": false,
  "skip-decompress": false,
  "digest-mismatch": "error",
};
const UPLOAD_INPUTS = {
  "if-no-files-found": "error",
  "compression-level": 0,
  "include-hidden-files": false,
  archive: true,
};
const SOURCE_DOWNLOAD_INPUTS = {
  "github-token": "${{ github.token }}",
  repository: "Hadden-Industries/owlapi",
  "run-id": "${{ steps.metadata.outputs.source_run_id }}",
};
const RECONCILIATION_JOB_IDS = [
  "source_verification",
  "accepted",
  "draft_release",
  "npm_release",
  "registry_verification",
  "release_evidence",
  "finalize_release",
  "immutable_verification",
];
const PUBLISH_COMMAND =
  "npm publish hadden-industries-owlapi-0.1.0-rc.1.tgz --provenance --tag next --access public --registry=https://registry.npmjs.org/";
const ALPHA_RECONCILIATION_PUBLISH_COMMAND =
  "npm publish owlapi-0.1.0-alpha.0.tgz --provenance --tag next --access public --registry=https://registry.npmjs.org/";
const REGISTRY_KEYS_COMMAND =
  "node util/snapshot-npm-registry-keys.mjs --output=.release/registry-keys/npm-registry-keys.json";
const PREPARE_SCANCODE_COMMAND =
  "node util/prepare-scancode.mjs --platform-env=SCANCODE_PLATFORM --output=.release/tools/scancode --python-env=SCANCODE_PYTHON";
const ACQUIRE_EVIDENCE_COMMAND =
  "node util/acquire-npm-package-evidence.mjs --shard-count=32 --shard-index-env=EVIDENCE_SHARD_INDEX --output=.release/evidence-shard --scancode-env=SCANCODE_COMMAND --registry-keys=.release/registry-keys/npm-registry-keys.json";
const MERGE_EVIDENCE_COMMAND =
  "node util/merge-npm-package-evidence.mjs --input=.release/evidence-shards --output=.release/evidence-aggregate";
const SHARD_COORDINATES = Array.from({ length: 32 }, (_, index) => index);
const SCANCODE_LINUX_COMMAND =
  ".release/tools/scancode/scancode-toolkit-v32.5.0/venv/bin/scancode";
const EVIDENCE_OS_MATRIX = [
  {
    id: "ubuntu",
    runner: "ubuntu-24.04",
    shell: "bash",
    platform: "linux",
    scancode_command: SCANCODE_LINUX_COMMAND,
  },
  {
    id: "windows",
    runner: "windows-2025",
    shell: "pwsh",
    platform: "windows",
    scancode_command:
      ".release/tools/scancode/scancode-toolkit-v32.5.0/venv/Scripts/scancode.exe",
  },
];

const add = (violations, condition, message) => {
  if (!condition) violations.push(message);
};
const sortedYamlFiles = (directory, { exclude = [] } = {}) =>
  existsSync(directory)
    ? readdirSync(directory)
        .filter((name) => /\.ya?ml$/u.test(name) && !exclude.includes(name))
        .sort()
    : [];
const entries = (value) => Object.entries(value ?? {});
const steps = (job) => (Array.isArray(job?.steps) ? job.steps : []);
const jobs = (workflow) => Object.values(workflow?.jobs ?? {});
const allSteps = (workflow) => jobs(workflow).flatMap(steps);
const actionSteps = (job, action) =>
  steps(job).filter((step) => step?.uses?.startsWith(`${action}@`));
const needs = (job) =>
  typeof job?.needs === "string" ? [job.needs] : (job?.needs ?? []);
const sameInventory = (actual, expected) =>
  Array.isArray(actual) &&
  isDeepStrictEqual([...actual].sort(), [...expected].sort());
const fieldsMatch = (actual, expected) =>
  entries(expected).every(([key, value]) =>
    isDeepStrictEqual(actual?.[key], value),
  );
const lacksKeys = (value, keys) =>
  keys.every((key) => !Object.hasOwn(value ?? {}, key));
const requireFields = (actual, expected, context, violations) => {
  for (const [key, value] of entries(expected))
    add(
      violations,
      isDeepStrictEqual(actual?.[key], value),
      `${context} is missing ${key}: ${JSON.stringify(value)}`,
    );
};
const hasRun = (job, command) =>
  steps(job).some(
    (step) => typeof step?.run === "string" && step.run.includes(command),
  );
const requireRun = (job, command, context, violations) =>
  add(violations, hasRun(job, command), `${context} is missing ${command}`);

/** Inspect resolved values, excluding YAML comments and presentation. */
const stringValues = (value) =>
  typeof value === "string"
    ? [value]
    : value && typeof value === "object"
      ? Object.values(value).flatMap(stringValues)
      : [];
const occurrences = (value, token) =>
  stringValues(value).reduce(
    (count, text) => count + text.split(token).length - 1,
    0,
  );

/** Parse once, retain nodes for adjacent version comments, and report native diagnostics. */
const parseControlYaml = (fileName, source, violations) => {
  const document = parseDocument(source, { version: "1.2", uniqueKeys: true });
  try {
    if (document.errors.length) throw document.errors[0];
    const value = document.toJS({ maxAliasCount: 100 });
    // A workflow/control file is a mapping. Full GitHub syntax is actionlint's job.
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new TypeError("Expected a mapping");
    return { value, document };
  } catch (error) {
    violations.push(`${fileName}: invalid YAML: ${error.message}`);
    return { value: {}, document };
  }
};

const validateActionUses = (fileName, workflow, document, violations) => {
  for (const [jobId, job] of entries(workflow.jobs)) {
    for (const [index, step] of steps(job).entries()) {
      if (!step.uses) continue;
      const expectedTag = ACTIONS[step.uses];
      add(
        violations,
        Boolean(expectedTag),
        `${fileName}: unapproved Action ${step.uses}`,
      );
      if (!expectedTag) continue;
      const comment = document.getIn(
        ["jobs", jobId, "steps", index, "uses"],
        true,
      )?.comment;
      add(
        violations,
        comment?.trim() === expectedTag,
        `${fileName}: ${step.uses} must retain adjacent ${expectedTag}`,
      );
      const inputs = step.with;
      if (step.uses.startsWith("actions/checkout@"))
        add(
          violations,
          inputs?.["persist-credentials"] === false,
          `${fileName}: checkout must disable persisted credentials`,
        );
      if (step.uses.startsWith("actions/setup-node@")) {
        add(
          violations,
          ["22.23.3", "24.21.0"].includes(inputs?.["node-version"]),
          `${fileName}: setup-node must select an approved exact Node patch`,
        );
        requireFields(
          inputs,
          { "check-latest": false, cache: "", "package-manager-cache": false },
          `${fileName}: setup-node`,
          violations,
        );
        const isBootstrap =
          ["release.yml", "release-reconciliation.yml"].includes(fileName) &&
          jobId === "npm_release";
        if (isBootstrap)
          requireFields(
            inputs,
            { "registry-url": "https://registry.npmjs.org/" },
            `${fileName}: bootstrap setup-node`,
            violations,
          );
        add(
          violations,
          lacksKeys(
            inputs,
            isBootstrap
              ? ["always-auth", "mirror", "token"]
              : ["registry-url", "always-auth", "mirror", "token"],
          ),
          `${fileName}: setup-node broadens registry authority`,
        );
      }
      if (step.uses.startsWith("actions/setup-python@")) {
        add(
          violations,
          isDeepStrictEqual(inputs, {
            "python-version": "3.14.7",
            architecture: "x64",
            "check-latest": false,
            "update-environment": false,
            cache: "",
          }),
          `${fileName}: setup-python inputs must match the exact approved surface`,
        );
      }
    }
  }
};

const isOptionalCiEvidenceStep = (fileName, jobId, step) =>
  fileName === "ci.yml" &&
  ((jobId === "verification" &&
    step.id === "seed_tools" &&
    typeof step.run === "string" &&
    !step.uses) ||
    (jobId === "verification" &&
      ["proof", "seed_download"].includes(step.id) &&
      step.uses ===
        "actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c") ||
    (jobId === "source_node_24" &&
      ["reference_download", "reference_index_download"].includes(step.id) &&
      step.uses ===
        "actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c") ||
    (jobId === "source_node_24" &&
      step.id === "reference_upload" &&
      step.uses ===
        "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a") ||
    (jobId === "required" &&
      ["receipt_upload", "main_receipt_upload"].includes(step.id) &&
      step.uses ===
        "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a"));

const validateJobs = (fileName, workflow, violations) => {
  // Commands can reach a script indirectly through env, matrix or action inputs.
  // Preserve the workflow-wide policy over resolved values, never YAML comments.
  for (const forbidden of ["npm exec --package", "npx ", "|| true"])
    add(
      violations,
      occurrences(workflow, forbidden) === 0,
      `${fileName}: forbidden workflow construct ${forbidden}`,
    );
  for (const [id, job] of entries(workflow.jobs)) {
    const runner = job?.["runs-on"];
    const isEvidenceMatrix =
      fileName === "extended-tests.yml" && id === "third_party_evidence_shard";
    add(
      violations,
      isEvidenceMatrix
        ? runner === "${{ matrix.os.runner }}"
        : ["ubuntu-24.04", "windows-2025", "macos-15"].includes(runner),
      `${fileName}:${id} must use an approved explicit runner or closed runner matrix`,
    );
    add(
      violations,
      Number.isInteger(job?.["timeout-minutes"]) && job["timeout-minutes"] > 0,
      `${fileName}:${id} must have an explicit job timeout`,
    );
    add(
      violations,
      job?.permissions &&
        typeof job.permissions === "object" &&
        !Array.isArray(job.permissions),
      `${fileName}:${id} must declare job-minimal permissions`,
    );
    const shell = isEvidenceMatrix
      ? "${{ matrix.os.shell }}"
      : runner === "windows-2025"
        ? "pwsh"
        : "bash";
    add(
      violations,
      job?.defaults?.run?.shell === shell,
      `${fileName}:${id} must select ${shell}`,
    );
    for (const key of ["continue-on-error", "container"])
      add(
        violations,
        !Object.hasOwn(job ?? {}, key),
        `${fileName}: forbidden workflow construct ${key}`,
      );
    // The documented actionlint queue diagnostic is suppressed only in release
    // files; this repository permits queuing only at their shared root boundary.
    add(
      violations,
      !Object.hasOwn(job?.concurrency ?? {}, "queue"),
      `${fileName}:${id} queue is allowed only at the workflow release boundary`,
    );
    for (const step of steps(job)) {
      add(
        violations,
        !Object.hasOwn(step, "continue-on-error") ||
          isOptionalCiEvidenceStep(fileName, id, step),
        `${fileName}: forbidden workflow construct continue-on-error`,
      );
      add(
        violations,
        typeof step.run !== "string" || !step.run.includes("${{"),
        `${fileName}: workflow expressions must cross into scripts through env/with data, not run text`,
      );
    }
  }
};

const validateAggregate = (fileName, workflow, registry, violations) => {
  const job = workflow.jobs?.required;
  const name = registry === "ci" ? "CI / required" : "Release / qualified";
  add(
    violations,
    job?.name === name,
    `${fileName}: missing stable aggregate name ${name}`,
  );
  requireFields(
    job,
    { if: registry === "ci" ? "${{ always() }}" : "${{ !cancelled() }}" },
    `${fileName}: aggregate`,
    violations,
  );
  add(
    violations,
    sameInventory(needs(job), REQUIRED_JOB_IDS[registry]),
    `${fileName}: aggregate needs inventory differs from the executable registry`,
  );
};

/** Require all candidate-upload settings on one actual upload step, not scattered in a job. */
const validateCandidateUpload = (fileName, job, directory, violations) => {
  const uploads = actionSteps(job, "actions/upload-artifact");
  const candidate = uploads.find(
    (step) =>
      typeof step.with?.path === "string" &&
      step.with.path.startsWith(`${directory}/`),
  );
  requireFields(
    candidate?.with,
    { ...UPLOAD_INPUTS, "retention-days": 90, overwrite: false },
    `${fileName}: candidate upload`,
    violations,
  );
  const paths = candidate?.with?.path?.trim().split(/\r?\n/u) ?? [];
  add(
    violations,
    paths.length === 3 &&
      new Set(paths).size === 3 &&
      paths.every(
        (path) => path.startsWith(`${directory}/`) && !/[*!?]/u.test(path),
      ),
    `${fileName}: candidate upload must name exactly three explicit paths`,
  );
};

const validateCandidateTransport = (fileName, workflow, violations) => {
  if (!["ci.yml", "release.yml", "extended-tests.yml"].includes(fileName))
    return;
  if (fileName !== "extended-tests.yml")
    validateCandidateUpload(
      fileName,
      workflow.jobs?.candidate,
      ".release/candidate",
      violations,
    );
  const reportSelectors = [
    "publication_preflight",
    "tag_accepted",
    "draft_release",
    "registry_verification",
    "release_evidence",
  ].map((id) => `\u0024{{ needs.${id}.outputs.artifact_id }}`);
  for (const step of allSteps(workflow).filter((item) =>
    item.uses?.startsWith("actions/download-artifact@"),
  )) {
    if (
      fileName === "ci.yml" &&
      steps(workflow.jobs?.verification).includes(step) &&
      ["proof", "seed_download"].includes(step.id)
    ) {
      // This single cross-run receipt selector has its own exact policy below.
      continue;
    }
    if (
      fileName === "ci.yml" &&
      steps(workflow.jobs?.source_node_24).includes(step) &&
      ["reference_download", "reference_index_download"].includes(step.id)
    )
      continue;
    const inputs = step.with ?? {};
    const isCandidate =
      inputs["artifact-ids"] === "${{ needs.candidate.outputs.artifact_id }}";
    const isReport =
      fileName === "release.yml" &&
      reportSelectors.includes(inputs["artifact-ids"]);
    const isKeys = inputs.name === "npm-evidence-registry-keys";
    const isPattern = [
      "npm-evidence-release-*",
      "npm-evidence-aggregate-*",
      "npm-evidence-${{ matrix.os }}-*",
    ].includes(inputs.pattern);
    add(
      violations,
      isCandidate || isReport || isKeys || isPattern,
      `${fileName}: download-artifact must use an approved closed selector`,
    );
    requireFields(
      inputs,
      DOWNLOAD_INPUTS,
      `${fileName}: artifact download`,
      violations,
    );
    const excluded =
      isCandidate || isReport
        ? ["name", "pattern"]
        : isKeys
          ? ["artifact-ids", "pattern"]
          : ["artifact-ids", "name"];
    add(
      violations,
      lacksKeys(inputs, [...excluded, "github-token", "repository", "run-id"]),
      `${fileName}: artifact download broadens same-run artifact selection`,
    );
  }
};

const validateJavaReferenceBoundary = (job, violations) => {
  const label = "ci.yml: Java reference boundary";
  requireFields(
    job,
    {
      permissions: { contents: "read", actions: "read" },
    },
    label,
    violations,
  );
  requireFields(
    job?.outputs,
    { reference: "${{ steps.reference_publication.outputs.reference }}" },
    label,
    violations,
  );
  const observed = steps(job);
  const costScreens = observed.filter(
    (step) =>
      step.run === "node util/owlapi-reference/reference-cost-observation.mjs",
  );
  const costScreen = costScreens[0];
  add(
    violations,
    costScreens.length === 1 &&
      costScreen["timeout-minutes"] === 4 &&
      !Object.hasOwn(costScreen, "if") &&
      !Object.hasOwn(costScreen, "continue-on-error") &&
      !Object.hasOwn(costScreen, "env") &&
      observed.indexOf(costScreen) <
        observed.findIndex(
          (step) =>
            step.run === "node scripts/java-reference-command.mjs prepare",
        ),
    `${label}: isolated cost screen must precede key preparation without API credentials`,
  );
  let previous = -1;
  for (const [mode, timeout] of [
    ["prepare", 10],
    ["index", 1],
    ["select", 1],
    ["admit", 1],
    ["build", 10],
    ["package", 5],
    ["publication", 1],
  ]) {
    const matches = observed.filter(
      (step) => step.run === `node scripts/java-reference-command.mjs ${mode}`,
    );
    const step = matches[0];
    const index = observed.indexOf(step);
    add(
      violations,
      matches.length === 1 &&
        index > previous &&
        step["timeout-minutes"] === timeout &&
        !Object.hasOwn(step, "if") &&
        !Object.hasOwn(step, "continue-on-error"),
      `${label}: ${mode} must execute once in order with bounded failure semantics`,
    );
    previous = index;
    const env =
      mode === "index"
        ? { GH_TOKEN: "${{ github.token }}" }
        : mode === "select"
          ? {
              GH_TOKEN: "${{ github.token }}",
              REFERENCE_INDEX_DOWNLOAD_OUTCOME:
                "${{ steps.reference_index_download.outcome }}",
            }
          : mode === "admit"
            ? {
                GH_TOKEN: "${{ github.token }}",
                REFERENCE_DOWNLOAD_OUTCOME:
                  "${{ steps.reference_download.outcome }}",
              }
            : mode === "publication"
              ? {
                  REFERENCE_UPLOAD_OUTCOME:
                    "${{ steps.reference_upload.outcome }}",
                  REFERENCE_ARTIFACT_ID:
                    "${{ steps.reference_upload.outputs.artifact-id }}",
                  REFERENCE_ARTIFACT_DIGEST:
                    "${{ steps.reference_upload.outputs.artifact-digest }}",
                }
              : undefined;
    add(
      violations,
      isDeepStrictEqual(step?.env, env),
      `${label}: ${mode} credential scope changed`,
    );
  }
  add(
    violations,
    !Object.hasOwn(job?.env ?? {}, "GH_TOKEN") &&
      !Object.hasOwn(job?.env ?? {}, "GITHUB_TOKEN"),
    `${label}: job-level API credentials are forbidden`,
  );
  const jdks = observed.filter((step) =>
    step.uses?.startsWith("actions/setup-java@"),
  );
  add(
    violations,
    jdks.length === 1,
    `${label}: reference JDK selection is ambiguous`,
  );
  requireFields(
    jdks[0],
    {
      with: {
        distribution: "temurin",
        "java-version": "25.0.4+101.0.LTS",
        "check-latest": false,
        "overwrite-settings": false,
        cache: "",
        "cache-jdk": false,
      },
    },
    label,
    violations,
  );
  const download = observed.find((step) => step.id === "reference_download");
  const indexDownload = observed.filter(
    (step) => step.id === "reference_index_download",
  );
  requireFields(
    indexDownload[0],
    {
      uses: "actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c",
      if: "steps.reference_index.outputs.available == 'true'",
      "continue-on-error": true,
      "timeout-minutes": 1,
      with: {
        ...DOWNLOAD_INPUTS,
        "artifact-ids": "${{ steps.reference_index.outputs.artifact_id }}",
        "run-id": "${{ steps.reference_index.outputs.run_id }}",
        repository: "Hadden-Industries/owlapi",
        "github-token": "${{ github.token }}",
        path: ".release/java-reference-reuse/index-download",
      },
    },
    `${label}: exact discovery index transport`,
    violations,
  );
  add(
    violations,
    indexDownload.length === 1 &&
      lacksKeys(indexDownload[0].with, ["name", "pattern"]) &&
      observed.indexOf(indexDownload[0]) >
        observed.findIndex((step) => step.id === "reference_index") &&
      observed.indexOf(indexDownload[0]) <
        observed.findIndex((step) => step.id === "reference_select"),
    `${label}: discovery index must precede direct product selection`,
  );
  const upload = observed.filter((step) => step.id === "reference_upload");
  requireFields(
    upload[0],
    {
      uses: "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
      if: "github.event_name == 'push' && github.ref == 'refs/heads/main' && steps.reference_package.outputs.publish == 'true'",
      "continue-on-error": true,
      "timeout-minutes": 1,
      with: {
        name: "${{ steps.reference_package.outputs.artifact_name }}",
        path: ".release/java-reference-reuse/publication",
        "retention-days": 90,
        "if-no-files-found": "error",
        "compression-level": 0,
        "include-hidden-files": false,
        overwrite: false,
        archive: true,
      },
    },
    `${label}: main-only reference transport`,
    violations,
  );
  add(
    violations,
    upload.length === 1 &&
      observed.indexOf(upload[0]) >
        observed.findIndex((step) =>
          step.run?.startsWith("npm run test:universal-ontology --"),
        ) &&
      observed.indexOf(upload[0]) <
        observed.findIndex((step) => step.id === "reference_publication"),
    `${label}: publication must follow all live Java qualification`,
  );
  requireFields(
    download,
    {
      uses: "actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c",
      if: "steps.reference_select.outputs.available == 'true'",
      "continue-on-error": true,
      "timeout-minutes": 1,
      with: {
        ...DOWNLOAD_INPUTS,
        "artifact-ids": "${{ steps.reference_select.outputs.artifact_ids }}",
        "run-id": "${{ steps.reference_select.outputs.run_id }}",
        repository: "Hadden-Industries/owlapi",
        "github-token": "${{ github.token }}",
        path: ".release/java-reference-reuse/download",
      },
    },
    label,
    violations,
  );
  add(
    violations,
    download &&
      lacksKeys(download.with, ["name", "pattern"]) &&
      observed.indexOf(download) >
        observed.findIndex((step) => step.id === "reference_select") &&
      observed.indexOf(download) <
        observed.findIndex(
          (step) =>
            step.run === "node scripts/java-reference-command.mjs admit",
        ),
    `${label}: exact dual-product download must precede admission`,
  );
};

const validateCiVerification = (workflow, violations) => {
  const label = "ci.yml: CI verification";
  const jobs = workflow.jobs ?? {};
  validateJavaReferenceBoundary(jobs.source_node_24, violations);
  add(
    violations,
    sameInventory(Object.keys(jobs), Object.keys(CI_JOB_NAMES)) &&
      Object.entries(CI_JOB_NAMES).every(
        ([id, name]) => jobs[id]?.name === name,
      ),
    `${label} job identities changed`,
  );
  const strategy = jobs.verification;
  const observation = steps(jobs.source_node_24).find(
    (step) =>
      step.name ===
      "Observe integration applicability while retaining full qualification",
  );
  add(
    violations,
    observation?.run === "node scripts/ci-check-applicability.mjs" &&
      observation["timeout-minutes"] === 1 &&
      !Object.hasOwn(observation, "if") &&
      !Object.hasOwn(observation, "continue-on-error"),
    `${label} applicability observation must remain bounded and cannot condition qualification`,
  );
  const dependencyCommands = steps(jobs.dependency_review)
    .map((step) => step.run)
    .filter(Boolean);
  add(
    violations,
    JSON.stringify(dependencyCommands) ===
      JSON.stringify([
        "npm install --global npm@12.1.0 --ignore-scripts --no-audit --no-fund",
        "node scripts/assert-workflow-runtime.mjs --node 24.21.0 --npm 12.1.0",
        "npm run workflow:runner-record -- --expected-os Linux --expected-arch X64 --label ubuntu-24.04 --shell bash",
        "npm run workflow:dependency-review-applicability",
      ]),
    `${label} dependency review must retain its no-installation npm entry points`,
  );
  add(
    violations,
    !Object.hasOwn(strategy ?? {}, "if") &&
      !Object.hasOwn(strategy ?? {}, "needs"),
    `${label} strategy must always run`,
  );
  requireFields(
    strategy,
    {
      "timeout-minutes": 12,
      permissions: {
        contents: "read",
        actions: "read",
        "pull-requests": "read",
      },
    },
    label,
    violations,
  );
  const outputKeys = [
    "reuse",
    "source_run_id",
    "source_run_attempt",
    "source_commit",
    "candidate_artifact_id",
    "candidate_artifact_digest",
    "source_receipt_id",
    "source_receipt_digest",
    "qualification",
  ];
  requireFields(
    strategy,
    {
      outputs: Object.fromEntries(
        outputKeys.map((key) => [
          key,
          `\u0024{{ steps.seed_strategy.outputs.${key} }}`,
        ]),
      ),
    },
    label,
    violations,
  );
  const roots = [
    "metadata",
    "source_node_22",
    "source_node_24",
    "quality_windows",
    "dependency_review",
  ];
  for (const id of roots) {
    add(
      violations,
      sameInventory(needs(jobs[id]), ["verification"]) &&
        jobs[id]?.if === "needs.verification.outputs.reuse != 'true'",
      `${label} full root gate changed: ${id}`,
    );
  }
  add(
    violations,
    sameInventory(needs(jobs.candidate), roots) &&
      !Object.hasOwn(jobs.candidate ?? {}, "if"),
    `${label} candidate dependency gate changed`,
  );
  for (const id of Object.keys(CI_JOB_NAMES).filter(
    (id) => ![...roots, "verification", "candidate", "required"].includes(id),
  )) {
    add(
      violations,
      sameInventory(needs(jobs[id]), ["candidate"]) &&
        !Object.hasOwn(jobs[id] ?? {}, "if"),
      `${label} consumer gate changed: ${id}`,
    );
  }
  const select = steps(strategy).find((step) => step.id === "select");
  const strategySteps = steps(strategy);
  let previousSeedStep = strategySteps.findIndex(
    (step) => step.id === "verify",
  );
  for (const [id, mode, timeout, env] of [
    [
      "seed_select",
      "select",
      1,
      {
        GH_TOKEN: "${{ github.token }}",
        VERIFICATION_OUTPUTS_JSON: "${{ toJSON(steps.verify.outputs) }}",
      },
    ],
    [
      "seed_admit",
      "admit",
      1,
      {
        GH_TOKEN: "${{ github.token }}",
        VERIFICATION_OUTPUTS_JSON: "${{ toJSON(steps.verify.outputs) }}",
        REFERENCE_SEED_DOWNLOAD_OUTCOME: "${{ steps.seed_download.outcome }}",
        REFERENCE_SEED_TOOLS_OUTCOME: "${{ steps.seed_tools.outcome }}",
      },
    ],
    [
      "seed_strategy",
      "strategy",
      1,
      {
        VERIFICATION_OUTPUTS_JSON: "${{ toJSON(steps.verify.outputs) }}",
      },
    ],
  ]) {
    const matches = strategySteps.filter((step) => step.id === id);
    const step = matches[0];
    requireFields(
      step,
      {
        run: `node scripts/java-reference-seed-command.mjs ${mode}`,
        "timeout-minutes": timeout,
        env,
      },
      `${label}: bounded seed decision`,
      violations,
    );
    add(
      violations,
      matches.length === 1 &&
        strategySteps.indexOf(step) > previousSeedStep &&
        !Object.hasOwn(step ?? {}, "if") &&
        !Object.hasOwn(step ?? {}, "continue-on-error") &&
        isDeepStrictEqual(step.env, env),
      `${label}: seed decision order and credential boundary changed`,
    );
    previousSeedStep = strategySteps.indexOf(step);
  }
  const seedDownload = strategySteps.filter(
    (step) => step.id === "seed_download",
  );
  requireFields(
    seedDownload[0],
    {
      uses: "actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c",
      if: "steps.seed_select.outputs.available == 'true'",
      "continue-on-error": true,
      "timeout-minutes": 1,
      with: {
        ...DOWNLOAD_INPUTS,
        "artifact-ids": "${{ steps.seed_select.outputs.artifact_ids }}",
        "run-id": "${{ steps.seed_select.outputs.run_id }}",
        repository: "Hadden-Industries/owlapi",
        "github-token": "${{ github.token }}",
        path: ".release/java-reference-seed/download",
      },
    },
    `${label}: concurrent seed transport`,
    violations,
  );
  const tools = strategySteps.filter((step) => step.id === "seed_tools");
  requireFields(
    tools[0],
    {
      if: "steps.seed_download.outcome == 'success'",
      "continue-on-error": true,
      "timeout-minutes": 2,
      env: { npm_config_fetch_retries: "0", npm_config_fetch_timeout: "30000" },
      run: "npm install --global npm@12.1.0 --ignore-scripts --no-audit --no-fund\nnode scripts/assert-workflow-runtime.mjs --node 24.21.0 --npm 12.1.0\nnpm ci --ignore-scripts --no-audit --no-fund\n",
    },
    `${label}: conditional locked seed verifier`,
    violations,
  );
  add(
    violations,
    seedDownload.length === 1 &&
      tools.length === 1 &&
      lacksKeys(seedDownload[0].with, ["name", "pattern"]) &&
      strategySteps.indexOf(seedDownload[0]) >
        strategySteps.findIndex((step) => step.id === "seed_select") &&
      strategySteps.indexOf(tools[0]) >
        strategySteps.indexOf(seedDownload[0]) &&
      strategySteps.indexOf(tools[0]) <
        strategySteps.findIndex((step) => step.id === "seed_admit") &&
      isDeepStrictEqual(tools[0].env, {
        npm_config_fetch_retries: "0",
        npm_config_fetch_timeout: "30000",
      }) &&
      tools[0]["continue-on-error"] === true,
    `${label}: seed transport/verifier order or authority changed`,
  );
  const proof = steps(strategy).find((step) => step.id === "proof");
  const verify = steps(strategy).find((step) => step.id === "verify");
  requireFields(
    select,
    {
      run: "node scripts/ci-verification-command.mjs select",
      env: { GH_TOKEN: "${{ github.token }}" },
    },
    label,
    violations,
  );
  requireFields(
    verify,
    {
      run: "node scripts/ci-verification-command.mjs verify",
      env: {
        GH_TOKEN: "${{ github.token }}",
        PROOF_DOWNLOAD_OUTCOME: "${{ steps.proof.outcome }}",
      },
    },
    label,
    violations,
  );
  add(
    violations,
    !Object.hasOwn(select ?? {}, "if") && !Object.hasOwn(verify ?? {}, "if"),
    `${label} selection and verification cannot be skipped`,
  );
  requireFields(
    proof,
    {
      uses: "actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c",
      if: "steps.select.outputs.available == 'true'",
      "continue-on-error": true,
      "timeout-minutes": 1,
      with: {
        ...DOWNLOAD_INPUTS,
        "artifact-ids": "${{ steps.select.outputs.artifact_id }}",
        "run-id": "${{ steps.select.outputs.run_id }}",
        repository: "Hadden-Industries/owlapi",
        "github-token": "${{ github.token }}",
        path: ".release/ci-reuse/download",
      },
    },
    label,
    violations,
  );
  const aggregate = steps(jobs.required).find(
    (step) => step.run === "node scripts/require-job-success.mjs --workflow ci",
  );
  requireFields(
    aggregate,
    { env: { REQUIRED_JOB_RESULTS_JSON: "${{ toJSON(needs) }}" } },
    label,
    violations,
  );
  add(
    violations,
    !!aggregate && !Object.hasOwn(aggregate, "if"),
    `${label} aggregate evaluator cannot be skipped`,
  );
  const receipt = steps(jobs.required).find((step) => step.id === "receipt");
  for (const [id, command] of [
    [
      "source_node_24",
      "node scripts/ci-check-coverage-command.mjs java .release/java-qualification/jest.json",
    ],
    [
      "webvowl",
      "node scripts/ci-check-coverage-command.mjs webvowl .release/webvowl-result/qualification.json",
    ],
  ]) {
    requireFields(
      jobs[id]?.outputs,
      { coverage: "${{ steps.coverage.outputs.coverage }}" },
      `${label}:${id} coverage output`,
      violations,
    );
    const accounting = steps(jobs[id]).find((step) => step.id === "coverage");
    requireFields(
      accounting,
      { run: command, "timeout-minutes": 1 },
      `${label}:${id} native coverage`,
      violations,
    );
    add(
      violations,
      !!accounting &&
        !Object.hasOwn(accounting, "if") &&
        !Object.hasOwn(accounting, "continue-on-error"),
      `${label}:${id} native coverage cannot be skipped or ignored`,
    );
  }
  const liveSuite = steps(jobs.source_node_24).find(
    (step) => step.name === "Run the full package suite",
  );
  requireFields(
    liveSuite,
    {
      run: "mkdir -p .release/java-qualification\nnpm test -- --runInBand --json --outputFile=.release/java-qualification/jest.json\n",
      env: {
        OWLAPI_REFERENCE_CHECKOUT:
          "${{ github.workspace }}/.release/java-owlapi",
      },
    },
    `${label} selected live Java suite`,
    violations,
  );
  add(
    violations,
    !!liveSuite &&
      !Object.hasOwn(liveSuite, "if") &&
      !Object.hasOwn(liveSuite, "continue-on-error"),
    `${label} selected live Java suite cannot be skipped or ignored`,
  );
  requireFields(
    receipt,
    {
      run: "node scripts/ci-verification-command.mjs record",
      if: "github.event_name == 'pull_request'",
      env: { REQUIRED_JOB_RESULTS_JSON: "${{ toJSON(needs) }}" },
    },
    label,
    violations,
  );
  const upload = steps(jobs.required).find(
    (step) => step.id === "receipt_upload",
  );
  requireFields(
    upload,
    {
      uses: "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
      if: "steps.receipt.outputs.recorded == 'true'",
      "continue-on-error": true,
      "timeout-minutes": 1,
      with: {
        ...UPLOAD_INPUTS,
        name: "ci-verification-${{ github.run_id }}-${{ github.run_attempt }}",
        path: ".release/ci-verification/verification.json",
        "retention-days": 90,
        overwrite: false,
      },
    },
    label,
    violations,
  );
  const mainReceipt = steps(jobs.required).find(
    (step) => step.id === "main_receipt",
  );
  requireFields(
    mainReceipt,
    {
      run: "node scripts/ci-verification-command.mjs record-main",
      if: "github.event_name == 'push'",
      env: { REQUIRED_JOB_RESULTS_JSON: "${{ toJSON(needs) }}" },
      "timeout-minutes": 1,
    },
    `${label} main qualification`,
    violations,
  );
  requireFields(
    steps(jobs.required).find((step) => step.id === "main_receipt_upload"),
    {
      uses: "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
      if: "steps.main_receipt.outputs.recorded == 'true'",
      "continue-on-error": true,
      "timeout-minutes": 1,
      with: {
        ...UPLOAD_INPUTS,
        name: "ci-main-qualification-${{ github.run_id }}-${{ github.run_attempt }}",
        path: ".release/ci-main-qualification/verification.json",
        "retention-days": 90,
        overwrite: false,
      },
    },
    `${label} main qualification transport`,
    violations,
  );
};

/** This policy pins the reviewed guard; actionlint/ShellCheck own shell syntax, not its business intent. */
const hasBootstrapCredentialGuard = (job, publishCommand) =>
  steps(job).some((step) => {
    if (
      typeof step.run !== "string" ||
      step.env?.NODE_AUTH_TOKEN !== "${{ secrets.NPM_BOOTSTRAP_TOKEN }}"
    )
      return false;
    const guardIndex = step.run.indexOf('if [[ -z "$NODE_AUTH_TOKEN" ]]; then');
    const publishIndex = step.run.indexOf(publishCommand);
    return (
      guardIndex !== -1 &&
      publishIndex > guardIndex &&
      step.run.slice(guardIndex, publishIndex).includes("exit 1")
    );
  });

const validateReadOnlyJob = (fileName, id, job, violations, permissions) => {
  add(
    violations,
    Boolean(job) &&
      (!permissions || isDeepStrictEqual(job.permissions, permissions)),
    `${fileName}:${id} must exist and remain read-only`,
  );
  for (const permission of ["contents", "id-token"])
    add(
      violations,
      job?.permissions?.[permission] !== "write",
      `${fileName}:${id} contains forbidden authority ${permission}: write`,
    );
  for (const token of ["NPM_BOOTSTRAP_TOKEN", "npm publish"])
    add(
      violations,
      occurrences(job, token) === 0,
      `${fileName}:${id} contains forbidden authority ${token}`,
    );
};

const validateManualRelease = (fileName, workflow, violations) => {
  add(
    violations,
    isDeepStrictEqual(workflow.on, { workflow_dispatch: null }),
    `${fileName}: workflow_dispatch must be the sole trigger`,
  );
  requireFields(
    workflow.concurrency,
    { group: "owlapi-release", "cancel-in-progress": false, queue: "max" },
    `${fileName}: concurrency`,
    violations,
  );
};

/** Shared authority boundary for initial publication and its closed recovery workflow. */
const validateReleaseMutationBoundary = (
  fileName,
  workflow,
  violations,
  reconciliation = false,
) => {
  const workflowJobs = workflow.jobs ?? {};
  const acceptedId = reconciliation ? "accepted" : "tag_accepted";
  const prefix = reconciliation ? "Release reconciliation" : "Release";
  const accepted = workflowJobs[acceptedId];
  requireFields(
    accepted,
    {
      name: `${prefix} / ${reconciliation ? "accepted" : "tag accepted"}`,
      environment: { name: "release-manual", deployment: false },
    },
    `${fileName}:${acceptedId}`,
    violations,
  );
  requireFields(
    accepted?.permissions,
    { contents: "read" },
    `${fileName}:${acceptedId} permissions`,
    violations,
  );
  requireRun(
    accepted,
    reconciliation
      ? "node scripts/verify-release-tag.mjs"
      : "npm run release:verify-tag",
    `${fileName}:${acceptedId}`,
    violations,
  );
  validateReadOnlyJob(fileName, acceptedId, accepted, violations);
  const draft = workflowJobs.draft_release;
  add(
    violations,
    isDeepStrictEqual(draft?.permissions, { contents: "write" }),
    `${fileName}:draft_release must have contents-write as its sole authority`,
  );
  requireRun(
    draft,
    "npm run release:draft-github",
    `${fileName}:draft_release`,
    violations,
  );
  if (reconciliation)
    add(
      violations,
      steps(draft).some(
        (step) =>
          step.env?.SOURCE_COMMIT ===
            "${{ needs.source_verification.outputs.source_commit }}" &&
          step.run?.includes("npm run release:draft-github"),
      ),
      `${fileName}:draft_release must bind the GitHub draft write to the source commit`,
    );
  else
    add(
      violations,
      ["tag_accepted", "candidate"].every((id) => needs(draft).includes(id)),
      `${fileName}:draft_release must need tag_accepted and candidate`,
    );

  const publication = workflowJobs.npm_release;
  requireFields(
    publication,
    {
      name: `${prefix} / npm direct bootstrap`,
      environment: { name: "npm-release" },
      permissions: { contents: "read", "id-token": "write" },
    },
    `${fileName}:npm_release`,
    violations,
  );
  const candidateSelector = reconciliation
    ? "${{ needs.source_verification.outputs.candidate_artifact_id }}"
    : "${{ needs.candidate.outputs.artifact_id }}";
  add(
    violations,
    actionSteps(publication, "actions/download-artifact").some(
      (step) => step.with?.["artifact-ids"] === candidateSelector,
    ),
    `${fileName}:npm_release must download the retained candidate by artifact ID`,
  );
  add(
    violations,
    actionSteps(publication, "actions/setup-node").some(
      (step) => step.with?.["registry-url"] === "https://registry.npmjs.org/",
    ),
    `${fileName}:npm_release must use the public npm registry`,
  );
  const publishCommand = reconciliation
    ? ALPHA_RECONCILIATION_PUBLISH_COMMAND
    : PUBLISH_COMMAND;
  if (!reconciliation)
    add(
      violations,
      steps(publication).find((step) => step.run?.includes(publishCommand))
        ?.if === "${{ github.run_attempt == 1 }}",
      `${fileName}:npm_release must restrict the sole write to the first run attempt`,
    );
  requireRun(
    publication,
    publishCommand,
    `${fileName}:npm_release`,
    violations,
  );
  add(
    violations,
    actionSteps(publication, "actions/checkout").length === 0 &&
      publication?.permissions?.contents !== "write" &&
      occurrences(publication, "NPM_BOOTSTRAP_TOKEN") === 1 &&
      occurrences(publication, "npm publish ") === 1,
    `${fileName}:npm_release must have no checkout/write expansion or duplicate token/publish authority`,
  );
  add(
    violations,
    hasBootstrapCredentialGuard(publication, publishCommand),
    `${fileName}:npm_release is missing bootstrap credential fail-closed behavior`,
  );

  const finalize = workflowJobs.finalize_release;
  add(
    violations,
    isDeepStrictEqual(finalize?.permissions, { contents: "write" }) &&
      hasRun(finalize, "npm run release:finalize-github") &&
      occurrences(finalize, "NPM_BOOTSTRAP_TOKEN") === 0 &&
      occurrences(finalize, "npm publish") === 0 &&
      (!reconciliation || hasRun(finalize, '--source-commit "$SOURCE_COMMIT"')),
    `${fileName}:finalize_release must isolate the final GitHub release write and retain source identity`,
  );
  const readOnlyIds = reconciliation
    ? ["registry_verification", "release_evidence", "immutable_verification"]
    : [
        "publication_preflight",
        "registry_verification",
        "release_evidence",
        "immutable_verification",
      ];
  for (const id of readOnlyIds)
    validateReadOnlyJob(
      fileName,
      id,
      workflowJobs[id],
      violations,
      reconciliation
        ? id === "release_evidence"
          ? { actions: "read", contents: "read" }
          : { contents: "read" }
        : undefined,
    );
  // Global cardinalities prevent a second authority elsewhere in an otherwise valid workflow.
  add(
    violations,
    jobs(workflow).filter((job) => job?.permissions?.contents === "write")
      .length === 2,
    `${fileName} must contain exactly two isolated contents writers`,
  );
  add(
    violations,
    jobs(workflow).filter((job) => job?.permissions?.["id-token"] === "write")
      .length === 1,
    `${fileName} must contain exactly one id-token writer`,
  );
  add(
    violations,
    occurrences(workflow, "NPM_BOOTSTRAP_TOKEN") === 1,
    `${fileName} must contain exactly one bootstrap-token reference`,
  );
  add(
    violations,
    occurrences(workflow, "npm publish ") === 1 &&
      occurrences(workflow, "npm stage publish") === 0,
    `${fileName} must contain exactly one direct publish and no staged publish`,
  );
  add(
    violations,
    jobs(workflow).filter((job) => job?.environment?.name === "release-manual")
      .length === 1 &&
      jobs(workflow).filter((job) => job?.environment?.name === "npm-release")
        .length === 1 &&
      jobs(workflow).filter((job) => job?.environment?.deployment === false)
        .length === 1,
    `${fileName} must use each reviewed environment exactly once and suppress only the manual gate deployment`,
  );
};

const validateReleaseReconciliationTransport = (workflow, violations) => {
  const fileName = "release-reconciliation.yml";
  const source = workflow.jobs?.source_verification;
  const sourceSelectors = [
    "${{ steps.metadata.outputs.candidate_artifact_id }}",
    "${{ steps.metadata.outputs.publication_preflight_artifact_id }}",
  ];
  for (const [index, selector] of sourceSelectors.entries())
    add(
      violations,
      actionSteps(source, "actions/download-artifact").some((step) =>
        fieldsMatch(step.with, {
          ...SOURCE_DOWNLOAD_INPUTS,
          "artifact-ids": selector,
          path:
            index === 0
              ? ".release/source-candidate"
              : ".release/source-preflight",
        }),
      ),
      `${fileName}: both retained artifacts must use the same closed source-run selector`,
    );
  validateCandidateUpload(
    fileName,
    source,
    ".release/source-candidate",
    violations,
  );
  const sameRunSelectors = [
    "${{ needs.source_verification.outputs.candidate_artifact_id }}",
    "${{ needs.source_verification.outputs.reconciliation_artifact_id }}",
    ...[
      "accepted",
      "draft_release",
      "registry_verification",
      "release_evidence",
    ].map((id) => `\u0024{{ needs.${id}.outputs.artifact_id }}`),
  ];
  const downloads = allSteps(workflow).filter((step) =>
    step.uses?.startsWith("actions/download-artifact@"),
  );
  for (const step of downloads) {
    const inputs = step.with ?? {};
    const fromSource = sourceSelectors.includes(inputs["artifact-ids"]);
    add(
      violations,
      fromSource || sameRunSelectors.includes(inputs["artifact-ids"]),
      `${fileName}: download-artifact must use a closed artifact-ID selector`,
    );
    requireFields(
      inputs,
      DOWNLOAD_INPUTS,
      `${fileName}: artifact download`,
      violations,
    );
    add(
      violations,
      lacksKeys(inputs, ["name", "pattern"]),
      `${fileName}: artifact download broadens selection`,
    );
    if (fromSource)
      requireFields(
        inputs,
        SOURCE_DOWNLOAD_INPUTS,
        `${fileName}: cross-run artifact download`,
        violations,
      );
    else
      add(
        violations,
        lacksKeys(inputs, ["github-token", "repository", "run-id"]),
        `${fileName}: same-run artifact download broadens selection`,
      );
  }
  add(
    violations,
    downloads.length === 11,
    `${fileName}: expected exactly eleven closed artifact downloads`,
  );
};

const validateReleaseReconciliation = (workflow, violations) => {
  const fileName = "release-reconciliation.yml";
  add(
    violations,
    sameInventory(Object.keys(workflow.jobs ?? {}), RECONCILIATION_JOB_IDS),
    `${fileName}: job inventory differs from the closed recovery design`,
  );
  validateManualRelease(fileName, workflow, violations);
  const source = workflow.jobs?.source_verification;
  requireFields(
    source,
    { name: "Release reconciliation / source verified" },
    `${fileName}:source_verification`,
    violations,
  );
  requireFields(
    source?.outputs,
    {
      candidate_artifact_name:
        "owlapi-${{ steps.metadata.outputs.version }}-reconciled-candidate-${{ github.run_id }}-${{ github.run_attempt }}",
    },
    `${fileName}:source_verification outputs`,
    violations,
  );
  requireFields(
    source?.permissions,
    { actions: "read", contents: "read" },
    `${fileName}:source_verification permissions`,
    violations,
  );
  for (const command of [
    "node scripts/release-reconciliation.mjs --emit-metadata",
    "node scripts/verify-release-tag.mjs",
    "node scripts/release-reconciliation.mjs --candidate",
  ])
    requireRun(source, command, `${fileName}:source_verification`, violations);
  validateReadOnlyJob(fileName, "source_verification", source, violations);
  add(
    violations,
    steps(workflow.jobs?.release_evidence).some(
      (step) =>
        step.env?.CANDIDATE_ARTIFACT_NAME ===
        "${{ needs.source_verification.outputs.candidate_artifact_name }}",
    ),
    `${fileName}:release_evidence must inherit the source job's immutable transport name`,
  );
  add(
    violations,
    !allSteps(workflow).some((step) =>
      /(?:scancode|playwright|universal-ontology|webvowl|benchmark|npm test|npm run (?:test|lint|build))/iu.test(
        step.run ?? "",
      ),
    ),
    `${fileName} must not repeat completed qualification workloads`,
  );
  validateReleaseMutationBoundary(fileName, workflow, violations, true);
  validateReleaseReconciliationTransport(workflow, violations);
};

/** Audit the initial publication boundary, reporting YAML errors as violations. */
export const auditReleaseMutationBoundary = (source) => {
  const violations = [];
  const { value } = parseControlYaml("release.yml", source, violations);
  if (!violations.length)
    validateReleaseMutationBoundary("release.yml", value, violations);
  return violations;
};
/** Audit the recovery publication boundary without running or publishing it. */
export const auditReleaseReconciliationMutationBoundary = (source) => {
  const violations = [];
  const { value } = parseControlYaml(
    "release-reconciliation.yml",
    source,
    violations,
  );
  if (!violations.length) validateReleaseReconciliation(value, violations);
  return violations;
};

const validateEvidenceUpload = (fileName, id, job, inputs, violations) => {
  const uploads = actionSteps(job, "actions/upload-artifact");
  add(
    violations,
    uploads.length === 1,
    `${fileName}:${id} must contain exactly one evidence upload`,
  );
  requireFields(
    uploads[0]?.with,
    { ...UPLOAD_INPUTS, overwrite: true, "retention-days": 1, ...inputs },
    `${fileName}:${id} evidence upload`,
    violations,
  );
};
const validateEvidenceJob = (fileName, id, job, violations) =>
  add(
    violations,
    isDeepStrictEqual(job?.permissions, { contents: "read" }),
    `${fileName}:${id} must have contents-read as its sole authority`,
  );

const validateEvidenceWorkflows = (workflows, violations) => {
  for (const [fileName, isExtended] of [
    ["release.yml", false],
    ["extended-tests.yml", true],
  ]) {
    const workflow = workflows[fileName] ?? {};
    const prefix = isExtended ? "Extended tests" : "Release";
    const workflowJobs = workflow.jobs ?? {};
    const keysId = "third_party_evidence_registry_keys";
    const shardId = "third_party_evidence_shard";
    const aggregateId = isExtended
      ? "third_party_evidence_aggregate"
      : "third_party_evidence";
    const keys = workflowJobs[keysId];
    const shard = workflowJobs[shardId];
    const aggregate = workflowJobs[aggregateId];
    for (const [id, job] of [
      [keysId, keys],
      [shardId, shard],
      [aggregateId, aggregate],
    ])
      validateEvidenceJob(fileName, id, job, violations);
    requireFields(
      keys,
      { name: `${prefix} / third-party evidence / npm registry signing keys` },
      `${fileName}:${keysId}`,
      violations,
    );
    requireRun(
      keys,
      REGISTRY_KEYS_COMMAND,
      `${fileName}:${keysId}`,
      violations,
    );
    validateEvidenceUpload(
      fileName,
      keysId,
      keys,
      {
        name: "npm-evidence-registry-keys",
        path: ".release/registry-keys/npm-registry-keys.json",
      },
      violations,
    );
    if (isExtended) {
      requireFields(
        workflowJobs.extended_evidence,
        { if: "${{ github.event_name == 'schedule' }}" },
        `${fileName}:extended_evidence`,
        violations,
      );
      for (const [id, job] of [
        [keysId, keys],
        [shardId, shard],
      ])
        requireFields(
          job,
          { if: "${{ github.event_name == 'workflow_dispatch' }}" },
          `${fileName}:${id}`,
          violations,
        );
    } else
      add(
        violations,
        sameInventory(needs(keys), ["release_preflight"]),
        `${fileName}:${keysId} must wait for preflight`,
      );
    requireFields(
      shard,
      {
        name: `${prefix} / third-party evidence / ${isExtended ? "${{ matrix.os.id }} / " : ""}shard \u0024{{ matrix.shard }}`,
        ...(isExtended ? {} : { "timeout-minutes": 120 }),
      },
      `${fileName}:${shardId}`,
      violations,
    );
    requireFields(
      shard?.strategy,
      { "fail-fast": false, "max-parallel": 8 },
      `${fileName}:${shardId} strategy`,
      violations,
    );
    add(
      violations,
      sameInventory(
        needs(shard),
        isExtended ? [keysId] : ["release_preflight", keysId],
      ),
      `${fileName}:${shardId} must wait for preflight and the same-run signing-key snapshot`,
    );
    add(
      violations,
      isDeepStrictEqual(
        shard?.strategy?.matrix,
        isExtended
          ? { os: EVIDENCE_OS_MATRIX, shard: SHARD_COORDINATES }
          : { shard: SHARD_COORDINATES },
      ),
      `${fileName}:${shardId} matrix differs from the closed platform/shard contract`,
    );
    add(
      violations,
      actionSteps(shard, "actions/setup-python").length === 1,
      `${fileName}:${shardId} must select the approved Python action`,
    );
    add(
      violations,
      steps(shard).some(
        (step) =>
          step.run === PREPARE_SCANCODE_COMMAND &&
          fieldsMatch(step.env, {
            SCANCODE_PLATFORM: isExtended
              ? "${{ matrix.os.platform }}"
              : "linux",
            SCANCODE_PYTHON: "${{ steps.scancode_python.outputs.python-path }}",
          }),
      ),
      `${fileName}:${shardId} must prepare ScanCode with the reviewed runtime`,
    );
    add(
      violations,
      steps(shard).some(
        (step) =>
          step.run === ACQUIRE_EVIDENCE_COMMAND &&
          fieldsMatch(step.env, {
            EVIDENCE_SHARD_INDEX: "${{ matrix.shard }}",
            SCANCODE_COMMAND: isExtended
              ? "${{ matrix.os.scancode_command }}"
              : SCANCODE_LINUX_COMMAND,
          }),
      ),
      `${fileName}:${shardId} must acquire its exact evidence shard`,
    );
    add(
      violations,
      actionSteps(shard, "actions/download-artifact").some((step) =>
        fieldsMatch(step.with, {
          name: "npm-evidence-registry-keys",
          path: ".release/registry-keys",
        }),
      ),
      `${fileName}:${shardId} must download the same-run signing keys`,
    );
    validateEvidenceUpload(
      fileName,
      shardId,
      shard,
      {
        name: isExtended
          ? "npm-evidence-${{ matrix.os.id }}-${{ matrix.shard }}"
          : "npm-evidence-release-${{ matrix.shard }}",
        path: ".release/evidence-shard",
      },
      violations,
    );
    requireFields(
      aggregate,
      {
        name: isExtended
          ? "Extended tests / third-party evidence / ${{ matrix.os }} aggregate"
          : "Release / third-party evidence",
        if: isExtended
          ? "${{ !cancelled() && github.event_name == 'workflow_dispatch' }}"
          : "${{ !cancelled() }}",
      },
      `${fileName}:${aggregateId}`,
      violations,
    );
    add(
      violations,
      sameInventory(needs(aggregate), [shardId]),
      `${fileName}:${aggregateId} must wait for all shards`,
    );
    const downloads = actionSteps(aggregate, "actions/download-artifact");
    add(
      violations,
      downloads.length === 1 &&
        downloads[0].with?.pattern ===
          (isExtended
            ? "npm-evidence-${{ matrix.os }}-*"
            : "npm-evidence-release-*"),
      `${fileName}:${aggregateId} must contain exactly one shard download`,
    );
    requireRun(
      aggregate,
      `${MERGE_EVIDENCE_COMMAND}${isExtended ? "" : " --verify-committed"}`,
      `${fileName}:${aggregateId}`,
      violations,
    );
    if (!isExtended)
      add(
        violations,
        needs(workflowJobs.candidate).includes(aggregateId),
        `${fileName}:candidate must wait for the closed third-party evidence aggregate`,
      );
    else {
      requireFields(
        aggregate,
        {
          strategy: {
            "fail-fast": false,
            matrix: { os: ["ubuntu", "windows"] },
          },
        },
        `${fileName}:${aggregateId}`,
        violations,
      );
      validateEvidenceUpload(
        fileName,
        aggregateId,
        aggregate,
        {
          name: "npm-evidence-aggregate-${{ matrix.os }}",
          path: ".release/evidence-aggregate",
          "retention-days": 7,
        },
        violations,
      );
      const parityId = "third_party_evidence_parity";
      const parity = workflowJobs[parityId];
      validateEvidenceJob(fileName, parityId, parity, violations);
      requireFields(
        parity,
        {
          name: "Extended tests / third-party evidence / cross-platform parity",
          if: "${{ !cancelled() && github.event_name == 'workflow_dispatch' }}",
        },
        `${fileName}:${parityId}`,
        violations,
      );
      add(
        violations,
        sameInventory(needs(parity), [aggregateId]),
        `${fileName}:${parityId} must wait for both aggregates`,
      );
      const parityDownloads = actionSteps(parity, "actions/download-artifact");
      add(
        violations,
        parityDownloads.length === 1 &&
          parityDownloads[0].with?.pattern === "npm-evidence-aggregate-*",
        `${fileName}:${parityId} must contain exactly one aggregate download`,
      );
      requireRun(
        parity,
        "node util/verify-npm-package-evidence-parity.mjs --left=.release/evidence-aggregates/npm-evidence-aggregate-ubuntu --right=.release/evidence-aggregates/npm-evidence-aggregate-windows",
        `${fileName}:${parityId}`,
        violations,
      );
    }
  }
};

// Setup is confined to the quality consumers and the existing evidence shards.
// A new caller of npm test/lint/format must explicitly adopt the locked tools.
const QUALITY_CONSUMERS = {
  "ci.yml": ["source_node_22", "source_node_24", "quality_windows"],
  "release.yml": ["source_node_22", "source_node_24", "quality_windows"],
  "extended-tests.yml": ["extended_evidence"],
  "maintenance.yml": ["health"],
};
const validateQualityTooling = (workflows, violations) => {
  for (const [file, workflow] of entries(workflows)) {
    for (const [id, job] of entries(workflow.jobs)) {
      const context = `${file}:${id} quality tooling`;
      const consumer = QUALITY_CONSUMERS[file]?.includes(id);
      const markdownObserver =
        file === "markdown-quality.yml" &&
        ["markdown_linux", "markdown_windows"].includes(id);
      const evidence =
        ["release.yml", "extended-tests.yml"].includes(file) &&
        id === "third_party_evidence_shard";
      const python = actionSteps(job, "actions/setup-python");
      add(
        violations,
        python.length === (consumer || evidence || markdownObserver ? 1 : 0),
        `${context} has an unexpected Python setup inventory`,
      );
      if (!consumer) continue;
      const list = steps(job);
      const setupIndex = list.indexOf(python[0]);
      const sync = list.filter((step) =>
        step.run?.startsWith("npm run tools:sync"),
      );
      const syncIndex = list.indexOf(sync[0]);
      const checkIndexes = list.flatMap((step, index) =>
        /^npm (test|run (format:check|format:source-python:check|lint|lint:source-python|test:quality|test:quality:source|tools:check))(?: |$)/u.test(
          step.run ?? "",
        )
          ? [index]
          : [],
      );
      add(
        violations,
        python[0]?.id === "quality_python" &&
          !python[0]?.if &&
          !python[0]?.["continue-on-error"],
        `${context} requires unconditional pinned Python selection`,
      );
      add(
        violations,
        sync.length === 1 &&
          sync[0].run === "npm run tools:sync -- --python-env QUALITY_PYTHON" &&
          isDeepStrictEqual(sync[0].env, {
            QUALITY_PYTHON: "${{ steps.quality_python.outputs.python-path }}",
          }) &&
          !sync[0].if &&
          !sync[0]["continue-on-error"] &&
          setupIndex >= 0 &&
          syncIndex > setupIndex &&
          checkIndexes.length > 0 &&
          checkIndexes.every((index) => index > syncIndex),
        `${context} requires locked synchronization before every consumer`,
      );
      if (["ci.yml", "release.yml"].includes(file)) {
        const markdownInstalls = list.filter(
          (step) => step.run === "npm run markdown:install",
        );
        if (id === "source_node_22") {
          add(
            violations,
            markdownInstalls.length === 0,
            `${context} Node 22 must retain its source-only floor`,
          );
          for (const command of [
            "npm run format:source-python:check",
            "npm run lint:source-python",
          ])
            requireRun(job, command, context, violations);
        } else {
          const markdownIndex = list.indexOf(markdownInstalls[0]);
          add(
            violations,
            markdownInstalls.length === 1 &&
              !markdownInstalls[0].if &&
              !markdownInstalls[0]["continue-on-error"] &&
              markdownIndex > syncIndex,
            `${context} requires unconditional isolated Markdown acquisition`,
          );
          const consumers = list.flatMap((step, index) =>
            [
              "npm run format:check",
              "npm run lint",
              "npm run test:quality",
            ].includes(step.run)
              ? [index]
              : [],
          );
          add(
            violations,
            consumers.length >= 2 &&
              consumers.every((index) => index > markdownIndex),
            `${context} requires Markdown setup before all canonical consumers`,
          );
          if (id === "source_node_24")
            requireRun(job, "npm run test:markdown", context, violations);
        }
      }
      if (id === "quality_windows") {
        requireFields(
          job,
          {
            "runs-on": "windows-2025",
            defaults: { run: { shell: "pwsh" } },
            permissions: { contents: "read" },
          },
          context,
          violations,
        );
        for (const command of [
          "npm run tools:check",
          "npm run format:check",
          "npm run lint",
          "npm run test:quality",
        ]) {
          const matches = list.filter((step) => step.run === command);
          add(
            violations,
            matches.length === 1 &&
              !matches[0].if &&
              !matches[0]["continue-on-error"],
            `${context} requires ${command}`,
          );
        }
      }
    }
  }
  const candidate = workflows["release.yml"]?.jobs?.candidate;
  add(
    violations,
    needs(candidate).includes("quality_windows"),
    "release.yml:candidate quality tooling must pass before packaging",
  );
};

const validateMaintenanceReporter = (workflow, violations) => {
  add(
    violations,
    sameInventory(Object.keys(workflow.jobs ?? {}), ["health", "reporter"]),
    "maintenance.yml: expected exactly the read-only health and write-only reporter jobs",
  );
  const health = workflow.jobs?.health;
  requireFields(
    health?.outputs,
    {
      reporter_artifact_id: "${{ steps.reporter_bundle.outputs.artifact-id }}",
    },
    "maintenance.yml: reporter source transport",
    violations,
  );
  add(
    violations,
    actionSteps(health, "actions/upload-artifact").some((step) =>
      fieldsMatch(step.with, {
        "if-no-files-found": "error",
        "retention-days": 1,
        "compression-level": 0,
        overwrite: false,
        "include-hidden-files": false,
        path: "scripts/report-maintenance-failure.mjs",
      }),
    ),
    "maintenance.yml: reporter source transport must retain the exact read-only reporter script",
  );
  const reporter = workflow.jobs?.reporter;
  requireFields(
    reporter,
    {
      if: "${{ !cancelled() && needs.health.outputs.reporter_artifact_id != '' }}",
      permissions: { issues: "write" },
    },
    "maintenance.yml: isolated reporter",
    violations,
  );
  add(
    violations,
    sameInventory(needs(reporter), ["health"]) &&
      actionSteps(reporter, "actions/checkout").length === 0,
    "maintenance.yml: write-only reporter must need health and have no checkout authority",
  );
  add(
    violations,
    actionSteps(reporter, "actions/download-artifact").some((step) =>
      fieldsMatch(step.with, {
        ...DOWNLOAD_INPUTS,
        "artifact-ids": "${{ needs.health.outputs.reporter_artifact_id }}",
      }),
    ),
    "maintenance.yml: isolated reporter must download its exact artifact",
  );
  add(
    violations,
    steps(reporter).some(
      (step) =>
        step.run ===
          "node .maintenance-reporter/report-maintenance-failure.mjs" &&
        step.env?.MAINTENANCE_HEALTH_RESULT === "${{ needs.health.result }}",
    ),
    "maintenance.yml: isolated reporter must bind the health result to the retained script",
  );
};

const validateSourceGovernanceHistory = (workflows, violations) => {
  for (const [fileName, id, name] of [
    ["ci.yml", "source_node_22", "Check out the proposed source"],
    ["ci.yml", "source_node_24", "Check out the proposed source"],
    ["release.yml", "source_node_22", "Check out the proposed source"],
    ["release.yml", "source_node_24", "Check out the proposed source"],
    ["maintenance.yml", "health", "Check out the default branch"],
    ["extended-tests.yml", "extended_evidence", "Check out the default branch"],
  ])
    add(
      violations,
      actionSteps(workflows[fileName]?.jobs?.[id], "actions/checkout").some(
        (step) => step.name === name && step.with?.["fetch-depth"] === 0,
      ),
      `${fileName}:${id} must retain complete owlapi history for governance tests`,
    );
};

const validateWebVowlCorpusMaterialization = (
  fileName,
  workflow,
  control,
  violations,
) => {
  const job = workflow.jobs?.webvowl;
  const checkout = actionSteps(job, "actions/checkout").find(
    (step) => step.name === "Check out the fixed WebVOWL consumer",
  );
  add(
    violations,
    fieldsMatch(checkout?.with, {
      repository: control.webvowl.repository,
      ref: control.webvowl.commit,
      "fetch-depth": 0,
    }),
    `${fileName}:webvowl must retain complete WebVOWL history for governance tests`,
  );
  add(
    violations,
    actionSteps(job, "actions/checkout").some((step) =>
      fieldsMatch(step.with, {
        repository: control.ontologyCorpus.repository,
        ref: control.ontologyCorpus.commit,
      }),
    ),
    `${fileName}:webvowl must bind the fixed ontology corpus identity`,
  );
  const jobSteps = steps(job);
  const install = jobSteps.findIndex((step) =>
    fieldsMatch(step, {
      name: "Install the fixed ontology corpus dependencies",
      "working-directory": "consumer-workspace/universal-ontology",
      run: "npm ci",
    }),
  );
  const materialize = jobSteps.findIndex((step) =>
    fieldsMatch(step, {
      name: "Materialize the fixed representative ontology corpus",
      "working-directory": "consumer-workspace/universal-ontology",
      run: "npm run build",
    }),
  );
  const qualify = jobSteps.findIndex(
    (step) =>
      step.name === "Qualify the retained package through isolated WebVOWL",
  );
  add(
    violations,
    install !== -1 && materialize > install && qualify > materialize,
    `${fileName}:webvowl must install and materialize the fixed ontology corpus before qualification`,
  );
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

/** Constrain the owner-dispatched checker without changing existing required CI floors. */
const validateTrustedMarkdownWorkflow = (workflow, violations) => {
  const label = "markdown-quality.yml: trusted data checker";
  add(
    violations,
    workflow?.name === "Trusted Markdown qualification" &&
      sameInventory(Object.keys(workflow?.on ?? {}), ["workflow_dispatch"]),
    `${label}: only owner dispatch is accepted`,
  );
  add(
    violations,
    sameInventory(Object.keys(workflow?.jobs ?? {}), [
      "markdown_linux",
      "markdown_windows",
    ]),
    `${label}: both qualified platforms are required`,
  );
  for (const [id, job] of entries(workflow?.jobs)) {
    const jobSteps = steps(job);
    add(
      violations,
      jobSteps.length === 8 &&
        isDeepStrictEqual(job.permissions, { contents: "read" }) &&
        !job.env,
      `${label}:${id}: least privilege and closed steps required`,
    );
    requireFields(
      jobSteps[2],
      {
        id: "markdown_python",
        uses: "actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97",
        with: {
          "python-version": "3.14.7",
          architecture: "x64",
          "check-latest": false,
          "update-environment": false,
          cache: "",
        },
      },
      `${label}: pinned resource observer`,
      violations,
    );
    add(
      violations,
      !jobSteps[2]?.if &&
        !jobSteps[2]?.["continue-on-error"] &&
        !jobSteps[6]?.if &&
        !jobSteps[6]?.["continue-on-error"],
      `${label}: window and resource setup must run unconditionally`,
    );
    requireFields(
      jobSteps[0]?.with,
      {
        ref: "${{ github.workflow_sha }}",
        path: "trusted",
        "fetch-depth": 1,
        "persist-credentials": false,
      },
      `${label}: exact trusted checkout`,
      violations,
    );
    requireFields(
      jobSteps[4]?.with,
      {
        repository: "${{ inputs.candidate_repository }}",
        ref: "${{ inputs.candidate_sha }}",
        path: "candidate",
        "fetch-depth": 1,
        "persist-credentials": false,
      },
      `${label}: separate candidate data checkout`,
      violations,
    );
    for (const checkout of [jobSteps[0], jobSteps[4]])
      add(
        violations,
        checkout?.uses ===
          "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1" &&
          lacksKeys(checkout.with, [
            "token",
            "ssh-key",
            "submodules",
            "lfs",
            "allow-unsafe-pr-checkout",
          ]),
        `${label}: checkout broadens execution or credentials`,
      );
    add(
      violations,
      jobSteps[3]?.["working-directory"] === "trusted/tooling/markdown" &&
        /npm ci --ignore-scripts --no-audit --no-fund --registry=https:\/\/registry\.npmjs\.org\//u.test(
          jobSteps[3]?.run ?? "",
        ) &&
        !/(?:candidate|npm install|npm exec|npx )/u.test(
          jobSteps[3]?.run ?? "",
        ),
      `${label}: acquire only the trusted locked graph`,
    );
    add(
      violations,
      isDeepStrictEqual(jobSteps[3]?.env, {
        NODE_AUTH_TOKEN: "",
        NPM_TOKEN: "",
        GH_TOKEN: "",
        GITHUB_TOKEN: "",
        NODE_OPTIONS: "",
        NODE_PATH: "",
      }),
      `${label}: neutral acquisition environment`,
    );
    add(
      violations,
      jobSteps[5]?.run ===
        "node --test trusted/scripts/check-markdown-candidate.probes.mjs" &&
        jobSteps[6]?.run === "node trusted/scripts/run-markdown-window.mjs",
      `${label}: execute trusted probes and checker only`,
    );
    add(
      violations,
      isDeepStrictEqual(jobSteps[5]?.env, {
        MARKDOWN_TEST_CLI:
          "${{ github.workspace }}/trusted/tooling/markdown/node_modules/@hadden-industries/markdown-quality/src/cli.js",
      }),
      `${label}: probes must use only the trusted installed CLI`,
    );
    add(
      violations,
      isDeepStrictEqual(jobSteps[6]?.env, {
        MARKDOWN_OBSERVER_PYTHON:
          "${{ steps.markdown_python.outputs.python-path }}",
        MARKDOWN_CANDIDATE_REPOSITORY: "${{ inputs.candidate_repository }}",
        MARKDOWN_CANDIDATE_SHA: "${{ inputs.candidate_sha }}",
        MARKDOWN_TRUSTED_SHA: "${{ github.workflow_sha }}",
      }),
      `${label}: bind exact candidate and trusted identities`,
    );
    requireFields(
      jobSteps[7],
      {
        if: "${{ !cancelled() }}",
        uses: "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
      },
      `${label}: retain failing evidence`,
      violations,
    );
  }
};

/** Report repository policy violations; overrides are source strings for mutation tests. */
export const auditRepositoryControls = ({
  workflowSourceOverrides = {},
} = {}) => {
  const violations = [];
  const workflowFiles = sortedYamlFiles(WORKFLOW_DIRECTORY);
  const issueFormFiles = sortedYamlFiles(ISSUE_FORM_DIRECTORY, {
    exclude: ["config.yml"],
  });
  add(
    violations,
    sameInventory(workflowFiles, EXPECTED_WORKFLOWS),
    "The repository must contain exactly the six approved workflow files.",
  );
  add(
    violations,
    sameInventory(issueFormFiles, EXPECTED_ISSUE_FORMS),
    "The repository must contain exactly the six approved issue forms.",
  );
  const parsed = Object.fromEntries(
    workflowFiles.map((fileName) => [
      fileName,
      parseControlYaml(
        fileName,
        workflowSourceOverrides[fileName] ??
          readFileSync(join(WORKFLOW_DIRECTORY, fileName), "utf8"),
        violations,
      ),
    ]),
  );
  // Invalid syntax is a complete failure, not a partial policy pass or an exception in a later accessor.
  if (violations.some((message) => message.includes(": invalid YAML:")))
    return { workflowFiles, issueFormFiles, violations };
  const workflows = Object.fromEntries(
    entries(parsed).map(([fileName, { value }]) => [fileName, value]),
  );
  for (const [fileName, { value: workflow, document }] of entries(parsed)) {
    add(
      violations,
      isDeepStrictEqual(workflow.permissions, {}),
      `${fileName}: root permissions must be empty`,
    );
    for (const event of ["pull_request_target", "workflow_run"])
      add(
        violations,
        !Object.hasOwn(workflow.on ?? {}, event),
        `${fileName}: forbidden workflow construct ${event}`,
      );
    validateActionUses(fileName, workflow, document, violations);
    validateJobs(fileName, workflow, violations);
    validateCandidateTransport(fileName, workflow, violations);
  }
  validateEvidenceWorkflows(workflows, violations);
  validateTrustedMarkdownWorkflow(
    workflows["markdown-quality.yml"] ?? {},
    violations,
  );
  validateQualityTooling(workflows, violations);
  const ci = workflows["ci.yml"] ?? {};
  add(violations, ci.name === "CI", "ci.yml: wrong workflow name");
  add(
    violations,
    isDeepStrictEqual(ci.on, {
      pull_request: { branches: ["main"] },
      push: { branches: ["main"] },
    }),
    "ci.yml: trigger must be pull_request and main push without path filters",
  );
  add(
    violations,
    ci.concurrency?.["cancel-in-progress"] ===
      "${{ github.event_name == 'pull_request' }}",
    "ci.yml: superseded PR work must cancel while main producers serialize",
  );
  validateAggregate("ci.yml", ci, "ci", violations);
  validateCiVerification(ci, violations);
  const release = workflows["release.yml"] ?? {};
  validateManualRelease("release.yml", release, violations);
  validateAggregate("release.yml", release, "release", violations);
  validateReleaseMutationBoundary("release.yml", release, violations);
  validateReleaseReconciliation(
    workflows["release-reconciliation.yml"] ?? {},
    violations,
  );
  for (const [fileName, group] of [
    ["maintenance.yml", "owlapi-maintenance"],
    ["extended-tests.yml", "owlapi-extended-tests"],
  ]) {
    const workflow = workflows[fileName] ?? {};
    add(
      violations,
      Object.hasOwn(workflow.on ?? {}, "schedule") &&
        Object.hasOwn(workflow.on ?? {}, "workflow_dispatch"),
      `${fileName}: scheduled and manual triggers are required`,
    );
    add(
      violations,
      fieldsMatch(workflow.concurrency, {
        group,
        "cancel-in-progress": false,
      }) && !Object.hasOwn(workflow.concurrency ?? {}, "queue"),
      `${fileName}: observational single-pending concurrency is incorrect`,
    );
  }
  validateMaintenanceReporter(workflows["maintenance.yml"] ?? {}, violations);
  validateSourceGovernanceHistory(workflows, violations);
  add(
    violations,
    ci.jobs?.required?.if === "${{ always() }}",
    "ci.yml:required must retain the branch-protection always() evaluation",
  );
  add(
    violations,
    Object.values(workflows).reduce(
      (count, workflow) => count + occurrences(workflow, "always()"),
      0,
    ) === 1,
    "always() is allowed only on CI / required",
  );
  const webVowlControl = JSON.parse(
    readFileSync(
      join(REPOSITORY_ROOT, "docs", "release", "webvowl-consumer.json"),
      "utf8",
    ),
  );
  for (const fileName of ["ci.yml", "release.yml"])
    validateWebVowlCorpusMaterialization(
      fileName,
      workflows[fileName] ?? {},
      webVowlControl,
      violations,
    );

  const issueConfig = parseControlYaml(
    "ISSUE_TEMPLATE/config.yml",
    readFileSync(join(ISSUE_FORM_DIRECTORY, "config.yml"), "utf8"),
    violations,
  ).value;
  add(
    violations,
    issueConfig.blank_issues_enabled === false &&
      issueConfig.contact_links?.some((link) =>
        link.url?.includes("security/advisories/new"),
      ) &&
      issueConfig.contact_links?.some((link) =>
        link.url?.includes("CODE_OF_CONDUCT.md"),
      ),
    "Issue routing must disable blanks and retain private security/conduct paths.",
  );
  const templatePath = join(
    REPOSITORY_ROOT,
    ".github",
    "pull_request_template.md",
  );
  add(
    violations,
    existsSync(templatePath) &&
      readFileSync(templatePath, "utf8").includes(
        "not a contributor licence agreement",
      ),
    "The engineering pull-request template is absent or misstates its legal role.",
  );
  const dependabot = parseControlYaml(
    "dependabot.yml",
    readFileSync(join(REPOSITORY_ROOT, ".github", "dependabot.yml"), "utf8"),
    violations,
  ).value;
  const updates = Array.isArray(dependabot.updates) ? dependabot.updates : [];
  add(
    violations,
    updates.some(
      (update) =>
        update["package-ecosystem"] === "npm" &&
        Object.hasOwn(update.groups ?? {}, "compatible-development-tools"),
    ) &&
      updates.some(
        (update) =>
          update["package-ecosystem"] === "github-actions" &&
          Object.hasOwn(update.groups ?? {}, "compatible-action-updates"),
      ) &&
      !Object.hasOwn(dependabot, "auto-merge") &&
      updates.every((update) => !Object.hasOwn(update, "auto-merge")),
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

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const report = auditRepositoryControls();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.violations.length) process.exitCode = 1;
}
