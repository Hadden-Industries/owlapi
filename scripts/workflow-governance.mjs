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
  "release-reconciliation.yml",
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
  "actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97": "v7.0.0",
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

const hasBootstrapCredentialGuard = (block) => {
  const guardIndex = block.indexOf('if [[ -z "$NODE_AUTH_TOKEN" ]]; then');
  const publishIndex = block.indexOf("npm publish ");
  if (guardIndex === -1 || publishIndex === -1 || guardIndex >= publishIndex) {
    return false;
  }

  // The guard must terminate the credential-bearing step before its only npm
  // mutation. A mere warning would still spend the authorized publish attempt.
  return block.slice(guardIndex, publishIndex).includes("exit 1");
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
      const isBootstrapSetupNode =
        ["release-reconciliation.yml", "release.yml"].includes(fileName) &&
        block.includes("registry-url: https://registry.npmjs.org/");
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
      if (isBootstrapSetupNode) {
        add(
          violations,
          block.includes("registry-url: https://registry.npmjs.org/") &&
            !/(?:always-auth|mirror|token):/u.test(block),
          `${fileName}: bootstrap setup-node must configure only the public npm registry`,
        );
      } else {
        add(
          violations,
          !/(?:registry-url|always-auth|mirror|token):/u.test(block),
          `${fileName}: ordinary setup-node block broadens registry authority`,
        );
      }
    }
    if (identity.startsWith("actions/setup-python@")) {
      const inputKeys = [
        ...block.matchAll(/^          ([a-z][a-z0-9-]*):/gmu),
      ].map(([, key]) => key);
      add(
        violations,
        JSON.stringify(inputKeys) ===
          JSON.stringify([
            "python-version",
            "architecture",
            "check-latest",
            "update-environment",
            "cache",
          ]),
        `${fileName}: setup-python inputs must match the exact approved surface`,
      );
      for (const setting of [
        'python-version: "3.14.7"',
        'architecture: "x64"',
        "check-latest: false",
        "update-environment: false",
        'cache: ""',
      ]) {
        add(
          violations,
          block.includes(setting),
          `${fileName}: setup-python is missing ${setting}`,
        );
      }
      add(
        violations,
        !/(?:token|registry-url|mirror):/u.test(block),
        `${fileName}: setup-python broadens download authority`,
      );
    }
  }
};

const validateReleaseMutationBoundary = (source, violations) => {
  const tagAccepted = jobBlock(source, "tag_accepted");
  for (const setting of [
    "name: Release / tag accepted",
    "name: release-manual",
    "deployment: false",
    "contents: read",
    "npm run release:verify-tag",
  ]) {
    add(
      violations,
      tagAccepted.includes(setting),
      `release.yml:tag_accepted is missing ${setting}`,
    );
  }
  for (const forbidden of [
    "id-token: write",
    "contents: write",
    "NPM_BOOTSTRAP_TOKEN",
    "npm publish",
  ]) {
    add(
      violations,
      !tagAccepted.includes(forbidden),
      `release.yml:tag_accepted contains forbidden authority ${forbidden}`,
    );
  }

  const draft = jobBlock(source, "draft_release");
  add(
    violations,
    /^    permissions:\r?\n      contents: write\r?\n    defaults:/mu.test(
      draft,
    ),
    "release.yml:draft_release must have contents-write as its sole authority",
  );
  for (const setting of [
    "needs:",
    "- tag_accepted",
    "- candidate",
    "npm run release:draft-github",
  ]) {
    add(
      violations,
      draft.includes(setting),
      `release.yml:draft_release is missing ${setting}`,
    );
  }

  const publication = jobBlock(source, "npm_release");
  for (const setting of [
    "name: Release / npm direct bootstrap",
    "name: npm-release",
    "contents: read",
    "id-token: write",
    "artifact-ids: ${{ needs.candidate.outputs.artifact_id }}",
    "registry-url: https://registry.npmjs.org/",
    "NODE_AUTH_TOKEN: ${{ secrets.NPM_BOOTSTRAP_TOKEN }}",
    "npm publish owlapi-0.1.0-alpha.0.tgz --provenance --tag next --access public --registry=https://registry.npmjs.org/",
  ]) {
    add(
      violations,
      publication.includes(setting),
      `release.yml:npm_release is missing ${setting}`,
    );
  }
  add(
    violations,
    !publication.includes("actions/checkout@") &&
      !publication.includes("contents: write") &&
      (publication.match(/NPM_BOOTSTRAP_TOKEN/gu) ?? []).length === 1 &&
      (publication.match(/npm publish /gu) ?? []).length === 1,
    "release.yml:npm_release must have no checkout/write expansion or duplicate token/publish authority",
  );
  add(
    violations,
    hasBootstrapCredentialGuard(publication),
    "release.yml:npm_release is missing bootstrap credential fail-closed behavior",
  );

  const finalize = jobBlock(source, "finalize_release");
  add(
    violations,
    /^    permissions:\r?\n      contents: write\r?\n    defaults:/mu.test(
      finalize,
    ) &&
      finalize.includes("npm run release:finalize-github") &&
      !finalize.includes("id-token: write") &&
      !finalize.includes("NPM_BOOTSTRAP_TOKEN") &&
      !finalize.includes("npm publish"),
    "release.yml:finalize_release must isolate the final GitHub release write",
  );

  for (const id of [
    "publication_preflight",
    "registry_verification",
    "release_evidence",
    "immutable_verification",
  ]) {
    const block = jobBlock(source, id);
    add(
      violations,
      block.length > 0 &&
        !block.includes("contents: write") &&
        !block.includes("id-token: write") &&
        !block.includes("NPM_BOOTSTRAP_TOKEN") &&
        !block.includes("npm publish"),
      `release.yml:${id} must exist and remain read-only`,
    );
  }

  // These global cardinalities prevent a locally valid-looking job from
  // coexisting with a second, less visible release authority elsewhere.
  add(
    violations,
    (source.match(/^      contents: write\r?$/gmu) ?? []).length === 2,
    "release.yml must contain exactly two isolated contents writers",
  );
  add(
    violations,
    (source.match(/^      id-token: write\r?$/gmu) ?? []).length === 1,
    "release.yml must contain exactly one id-token writer",
  );
  add(
    violations,
    (source.match(/NPM_BOOTSTRAP_TOKEN/gu) ?? []).length === 1,
    "release.yml must contain exactly one bootstrap-token reference",
  );
  add(
    violations,
    (source.match(/npm publish /gu) ?? []).length === 1 &&
      !source.includes("npm stage publish"),
    "release.yml must contain exactly one direct publish and no staged publish",
  );
  add(
    violations,
    (source.match(/^      name: release-manual\r?$/gmu) ?? []).length === 1 &&
      (source.match(/^      deployment: false\r?$/gmu) ?? []).length === 1 &&
      (source.match(/^      name: npm-release\r?$/gmu) ?? []).length === 1,
    "release.yml must use each reviewed environment exactly once and suppress only the manual gate deployment",
  );
};

export const auditReleaseMutationBoundary = (source) => {
  const violations = [];
  validateReleaseMutationBoundary(source, violations);
  return violations;
};

const RECONCILIATION_JOB_IDS = Object.freeze([
  "source_verification",
  "accepted",
  "draft_release",
  "npm_release",
  "registry_verification",
  "release_evidence",
  "finalize_release",
  "immutable_verification",
]);

const validateReleaseReconciliationTransport = (source, violations) => {
  const sourceVerification = jobBlock(source, "source_verification");
  for (const setting of [
    "artifact-ids: ${{ steps.metadata.outputs.candidate_artifact_id }}",
    "github-token: ${{ github.token }}",
    "repository: Hadden-Industries/owlapi",
    "run-id: ${{ steps.metadata.outputs.source_run_id }}",
    "path: .release/source-candidate",
  ]) {
    add(
      violations,
      sourceVerification.includes(setting),
      `release-reconciliation.yml: retained candidate selector is missing ${setting}`,
    );
  }
  for (const setting of [
    "artifact-ids: ${{ steps.metadata.outputs.publication_preflight_artifact_id }}",
    "path: .release/source-preflight",
  ]) {
    add(
      violations,
      sourceVerification.includes(setting),
      `release-reconciliation.yml: retained preflight selector is missing ${setting}`,
    );
  }
  add(
    violations,
    (
      sourceVerification.match(/github-token: \$\{\{ github\.token \}\}/gu) ??
      []
    ).length === 2 &&
      (
        sourceVerification.match(/repository: Hadden-Industries\/owlapi/gu) ??
        []
      ).length === 2 &&
      (
        sourceVerification.match(
          /run-id: \$\{\{ steps\.metadata\.outputs\.source_run_id \}\}/gu,
        ) ?? []
      ).length === 2,
    "release-reconciliation.yml: both retained artifacts must use the same closed source-run selector",
  );
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
      sourceVerification.includes(setting),
      `release-reconciliation.yml: reconciled candidate upload is missing ${setting}`,
    );
  }
  add(
    violations,
    (
      sourceVerification.match(
        /^            \.release\/source-candidate\/.+$/gmu,
      ) ?? []
    ).length === 3,
    "release-reconciliation.yml: reconciled candidate upload must name exactly three explicit paths",
  );

  const approvedSameRunSelectors = new Set([
    "${{ needs.source_verification.outputs.candidate_artifact_id }}",
    "${{ needs.source_verification.outputs.reconciliation_artifact_id }}",
    "${{ needs.accepted.outputs.artifact_id }}",
    "${{ needs.draft_release.outputs.artifact_id }}",
    "${{ needs.registry_verification.outputs.artifact_id }}",
    "${{ needs.release_evidence.outputs.artifact_id }}",
  ]);
  const lines = source.split(/\r?\n/u);
  let downloadCount = 0;
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].includes("actions/download-artifact@")) {
      continue;
    }
    downloadCount += 1;
    const block = stepBlockAt(lines, index);
    const selector = block.match(/^          artifact-ids: (.+)$/mu)?.[1];
    const isPinnedSourceDownload =
      selector === "${{ steps.metadata.outputs.candidate_artifact_id }}" ||
      selector ===
        "${{ steps.metadata.outputs.publication_preflight_artifact_id }}";
    const isApprovedSameRunDownload = approvedSameRunSelectors.has(selector);
    add(
      violations,
      isPinnedSourceDownload || isApprovedSameRunDownload,
      "release-reconciliation.yml: download-artifact must use a closed artifact-ID selector",
    );
    for (const setting of [
      "merge-multiple: false",
      "skip-decompress: false",
      "digest-mismatch: error",
    ]) {
      add(
        violations,
        block.includes(setting),
        `release-reconciliation.yml: artifact download is missing ${setting}`,
      );
    }
    if (isPinnedSourceDownload) {
      for (const setting of [
        "github-token: ${{ github.token }}",
        "repository: Hadden-Industries/owlapi",
        "run-id: ${{ steps.metadata.outputs.source_run_id }}",
      ]) {
        add(
          violations,
          block.includes(setting),
          `release-reconciliation.yml: cross-run artifact download is missing ${setting}`,
        );
      }
    }
    if (isApprovedSameRunDownload) {
      add(
        violations,
        !/^          (?:name|pattern|github-token|repository|run-id):/mu.test(
          block,
        ),
        "release-reconciliation.yml: same-run artifact download broadens selection",
      );
    }
  }
  add(
    violations,
    downloadCount === 11,
    "release-reconciliation.yml: expected exactly eleven closed artifact downloads",
  );
};

const validateReleaseReconciliationMutationBoundary = (source, violations) => {
  add(
    violations,
    JSON.stringify(jobIds(source)) === JSON.stringify(RECONCILIATION_JOB_IDS),
    "release-reconciliation.yml: job inventory differs from the closed recovery design",
  );
  add(
    violations,
    /^on:\r?\n  workflow_dispatch:\s*$/mu.test(source),
    "release-reconciliation.yml: workflow_dispatch must be the sole trigger",
  );
  for (const setting of [
    "group: owlapi-release",
    "cancel-in-progress: false",
    "queue: max",
  ]) {
    add(
      violations,
      source.includes(setting),
      `release-reconciliation.yml: missing concurrency setting ${setting}`,
    );
  }

  const sourceVerification = jobBlock(source, "source_verification");
  for (const setting of [
    "name: Release reconciliation / source verified",
    "candidate_artifact_name: owlapi-${{ steps.metadata.outputs.version }}-reconciled-candidate-${{ github.run_id }}-${{ github.run_attempt }}",
    "actions: read",
    "contents: read",
    "node scripts/release-reconciliation.mjs --emit-metadata",
    "node scripts/verify-release-tag.mjs",
    "node scripts/release-reconciliation.mjs --candidate",
  ]) {
    add(
      violations,
      sourceVerification.includes(setting),
      `release-reconciliation.yml:source_verification is missing ${setting}`,
    );
  }
  for (const forbidden of [
    "id-token: write",
    "contents: write",
    "NPM_BOOTSTRAP_TOKEN",
    "npm publish",
  ]) {
    add(
      violations,
      !sourceVerification.includes(forbidden),
      `release-reconciliation.yml:source_verification contains forbidden authority ${forbidden}`,
    );
  }

  const accepted = jobBlock(source, "accepted");
  for (const setting of [
    "name: Release reconciliation / accepted",
    "name: release-manual",
    "deployment: false",
    "contents: read",
    "node scripts/verify-release-tag.mjs",
  ]) {
    add(
      violations,
      accepted.includes(setting),
      `release-reconciliation.yml:accepted is missing ${setting}`,
    );
  }
  for (const forbidden of [
    "id-token: write",
    "contents: write",
    "NPM_BOOTSTRAP_TOKEN",
    "npm publish",
  ]) {
    add(
      violations,
      !accepted.includes(forbidden),
      `release-reconciliation.yml:accepted contains forbidden authority ${forbidden}`,
    );
  }

  const draft = jobBlock(source, "draft_release");
  add(
    violations,
    /^    permissions:\r?\n      contents: write\r?\n    defaults:/mu.test(
      draft,
    ) &&
      draft.includes("npm run release:draft-github") &&
      draft.includes(
        "SOURCE_COMMIT: ${{ needs.source_verification.outputs.source_commit }}",
      ),
    "release-reconciliation.yml:draft_release must isolate the GitHub draft write and bind it to the source commit",
  );

  const publication = jobBlock(source, "npm_release");
  for (const setting of [
    "name: Release reconciliation / npm direct bootstrap",
    "name: npm-release",
    "contents: read",
    "id-token: write",
    "artifact-ids: ${{ needs.source_verification.outputs.candidate_artifact_id }}",
    "registry-url: https://registry.npmjs.org/",
    "NODE_AUTH_TOKEN: ${{ secrets.NPM_BOOTSTRAP_TOKEN }}",
    "npm publish owlapi-0.1.0-alpha.0.tgz --provenance --tag next --access public --registry=https://registry.npmjs.org/",
  ]) {
    add(
      violations,
      publication.includes(setting),
      `release-reconciliation.yml:npm_release is missing ${setting}`,
    );
  }
  add(
    violations,
    !publication.includes("actions/checkout@") &&
      !publication.includes("contents: write") &&
      (publication.match(/NPM_BOOTSTRAP_TOKEN/gu) ?? []).length === 1 &&
      (publication.match(/npm publish /gu) ?? []).length === 1,
    "release-reconciliation.yml:npm_release must have no checkout/write expansion or duplicate token/publish authority",
  );
  add(
    violations,
    hasBootstrapCredentialGuard(publication),
    "release-reconciliation.yml:npm_release is missing bootstrap credential fail-closed behavior",
  );

  const finalize = jobBlock(source, "finalize_release");
  add(
    violations,
    /^    permissions:\r?\n      contents: write\r?\n    defaults:/mu.test(
      finalize,
    ) &&
      finalize.includes("npm run release:finalize-github") &&
      finalize.includes('--source-commit "$SOURCE_COMMIT"') &&
      !finalize.includes("id-token: write") &&
      !finalize.includes("NPM_BOOTSTRAP_TOKEN") &&
      !finalize.includes("npm publish"),
    "release-reconciliation.yml:finalize_release must isolate the final GitHub release write and retain source identity",
  );

  const readOnlyPermissions = Object.freeze({
    registry_verification:
      /^    permissions:\r?\n      contents: read\r?\n    defaults:/mu,
    release_evidence:
      /^    permissions:\r?\n      actions: read\r?\n      contents: read\r?\n    defaults:/mu,
    immutable_verification:
      /^    permissions:\r?\n      contents: read\r?\n    defaults:/mu,
  });
  add(
    violations,
    jobBlock(source, "release_evidence").includes(
      "CANDIDATE_ARTIFACT_NAME: ${{ needs.source_verification.outputs.candidate_artifact_name }}",
    ),
    "release-reconciliation.yml:release_evidence must inherit the source job's immutable transport name",
  );
  for (const [id, permissionPattern] of Object.entries(readOnlyPermissions)) {
    const block = jobBlock(source, id);
    add(
      violations,
      permissionPattern.test(block) &&
        !block.includes("contents: write") &&
        !block.includes("id-token: write") &&
        !block.includes("NPM_BOOTSTRAP_TOKEN") &&
        !block.includes("npm publish"),
      `release-reconciliation.yml:${id} must exist and remain read-only`,
    );
  }

  add(
    violations,
    (source.match(/^      contents: write\r?$/gmu) ?? []).length === 2,
    "release-reconciliation.yml must contain exactly two isolated contents writers",
  );
  add(
    violations,
    (source.match(/^      id-token: write\r?$/gmu) ?? []).length === 1,
    "release-reconciliation.yml must contain exactly one id-token writer",
  );
  add(
    violations,
    (source.match(/NPM_BOOTSTRAP_TOKEN/gu) ?? []).length === 1,
    "release-reconciliation.yml must contain exactly one bootstrap-token reference",
  );
  add(
    violations,
    (source.match(/npm publish /gu) ?? []).length === 1 &&
      !source.includes("npm stage publish"),
    "release-reconciliation.yml must contain exactly one direct publish and no staged publish",
  );
  add(
    violations,
    (source.match(/^      name: release-manual\r?$/gmu) ?? []).length === 1 &&
      (source.match(/^      deployment: false\r?$/gmu) ?? []).length === 1 &&
      (source.match(/^      name: npm-release\r?$/gmu) ?? []).length === 1,
    "release-reconciliation.yml must use each reviewed environment exactly once and suppress only the manual gate deployment",
  );
  add(
    violations,
    !/(?:scancode|playwright|universal-ontology|webvowl|benchmark|npm test|npm run (?:test|lint|build))/iu.test(
      source,
    ),
    "release-reconciliation.yml must not repeat completed qualification workloads",
  );
  validateReleaseReconciliationTransport(source, violations);
};

export const auditReleaseReconciliationMutationBoundary = (source) => {
  const violations = [];
  validateReleaseReconciliationMutationBoundary(source, violations);
  return violations;
};

const validateJobs = (fileName, source, violations) => {
  const allowedRunners = new Set(["ubuntu-24.04", "windows-2025", "macos-15"]);
  for (const id of jobIds(source)) {
    const block = jobBlock(source, id);
    const runner = block.match(/^    runs-on: (.+)$/mu)?.[1];
    const isEvidencePlatformMatrix =
      fileName === "extended-tests.yml" && id === "third_party_evidence_shard";
    if (isEvidencePlatformMatrix) {
      add(
        violations,
        runner === "${{ matrix.os.runner }}",
        `${fileName}:${id} must select only its closed runner matrix`,
      );
    } else {
      add(
        violations,
        allowedRunners.has(runner),
        `${fileName}:${id} must use an approved explicit runner`,
      );
    }
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
    const expectedShell = isEvidencePlatformMatrix
      ? "${{ matrix.os.shell }}"
      : runner === "windows-2025"
        ? "pwsh"
        : "bash";
    const shell = block.match(/^        shell: (.+)$/mu)?.[1];
    add(
      violations,
      shell === expectedShell,
      `${fileName}:${id} must select ${expectedShell}`,
    );
  }
};

const validateAggregate = (fileName, source, workflow, violations) => {
  const id = "required";
  const block = jobBlock(source, id);
  const expectedName =
    workflow === "ci" ? "CI / required" : "Release / qualified";
  const expectedCondition =
    workflow === "ci" ? "if: ${{ always() }}" : "if: ${{ !cancelled() }}";
  add(
    violations,
    block.includes(`name: ${expectedName}`),
    `${fileName}: missing stable aggregate name ${expectedName}`,
  );
  add(
    violations,
    block.includes(expectedCondition),
    `${fileName}: aggregate must use ${expectedCondition}`,
  );
  const observed = listNeeds(block);
  add(
    violations,
    JSON.stringify(observed) === JSON.stringify(REQUIRED_JOB_IDS[workflow]),
    `${fileName}: aggregate needs inventory differs from the executable registry`,
  );
};

const validateCandidateTransport = (fileName, source, violations) => {
  const hasCandidateTransport = /^(?:ci|release)\.yml$/u.test(fileName);
  const hasEvidenceTransport = /^(?:extended-tests|release)\.yml$/u.test(
    fileName,
  );
  if (!hasCandidateTransport && !hasEvidenceTransport) {
    return;
  }
  if (hasCandidateTransport) {
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
  }
  const lines = source.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].includes("actions/download-artifact@")) {
      continue;
    }
    const block = stepBlockAt(lines, index);
    const isCandidateDownload = block.includes(
      "artifact-ids: ${{ needs.candidate.outputs.artifact_id }}",
    );
    const isReleaseReportDownload =
      fileName === "release.yml" &&
      /artifact-ids: \$\{\{ needs\.(?:publication_preflight|tag_accepted|draft_release|registry_verification|release_evidence)\.outputs\.artifact_id \}\}/u.test(
        block,
      );
    const isEvidencePatternDownload = /^\s+pattern: npm-evidence-/mu.test(
      block,
    );
    const isEvidenceKeyDownload =
      /^\s+name: npm-evidence-registry-keys$/mu.test(block);
    const isEvidenceDownload =
      isEvidencePatternDownload || isEvidenceKeyDownload;
    add(
      violations,
      isCandidateDownload || isReleaseReportDownload || isEvidenceDownload,
      `${fileName}: download-artifact must use an approved closed selector`,
    );
    if (
      !isCandidateDownload &&
      !isReleaseReportDownload &&
      !isEvidenceDownload
    ) {
      continue;
    }
    for (const setting of [
      "merge-multiple: false",
      "skip-decompress: false",
      "digest-mismatch: error",
    ]) {
      add(
        violations,
        block.includes(setting),
        `${fileName}: artifact download is missing ${setting}`,
      );
    }
    if (isCandidateDownload || isReleaseReportDownload) {
      add(
        violations,
        !/^\s+(?:name|pattern|github-token|repository|run-id):/mu.test(block),
        `${fileName}: candidate download broadens same-run artifact selection`,
      );
    } else {
      const usesApprovedPattern =
        /pattern: npm-evidence-(?:release-\*|aggregate-\*|\$\{\{ matrix\.os \}\}-\*)/u.test(
          block,
        );
      add(
        violations,
        usesApprovedPattern || isEvidenceKeyDownload,
        `${fileName}: evidence download uses an unapproved artifact selector`,
      );
      const forbiddenSelectorKeys = isEvidenceKeyDownload
        ? /^(?:\s+)(?:artifact-ids|pattern|github-token|repository|run-id):/mu
        : /^(?:\s+)(?:artifact-ids|name|github-token|repository|run-id):/mu;
      add(
        violations,
        !forbiddenSelectorKeys.test(block),
        `${fileName}: evidence download broadens same-run artifact selection`,
      );
    }
  }
};

const EXPECTED_SHARD_COORDINATES = Object.freeze(
  Array.from({ length: 32 }, (_, index) => index),
);

const shardCoordinates = (block) => {
  const match =
    /^        shard:\r?\n          \[\r?\n([\s\S]*?)^          \]\r?$/mu.exec(
      block,
    );
  return match
    ? [...match[1].matchAll(/^            (\d+),$/gmu)].map(([, value]) =>
        Number(value),
      )
    : [];
};

const matrixKeys = (block) => {
  const matrix = /^      matrix:\r?\n([\s\S]*?)^    steps:/mu.exec(block)?.[1];
  return matrix
    ? [...matrix.matchAll(/^        ([a-z][a-z0-9_]*):/gmu)].map(
        ([, key]) => key,
      )
    : [];
};

const validateEvidenceUpload = (
  fileName,
  jobId,
  block,
  { name, path, retentionDays = 1 },
  violations,
) => {
  for (const setting of [
    `name: ${name}`,
    `path: ${path}`,
    "if-no-files-found: error",
    `retention-days: ${retentionDays}`,
    "compression-level: 0",
    "overwrite: true",
    "include-hidden-files: false",
    "archive: true",
  ]) {
    add(
      violations,
      block.includes(setting),
      `${fileName}:${jobId} evidence upload is missing ${setting}`,
    );
  }
  add(
    violations,
    (block.match(/uses: actions\/upload-artifact@/gu) ?? []).length === 1,
    `${fileName}:${jobId} must contain exactly one evidence upload`,
  );
};

const validateReadOnlyEvidenceJob = (fileName, jobId, block, violations) => {
  add(
    violations,
    /^    permissions:\r?\n      contents: read\r?\n    defaults:/mu.test(
      block,
    ),
    `${fileName}:${jobId} must have contents-read as its sole authority`,
  );
  for (const forbidden of [
    "id-token: write",
    "contents: write",
    "actions: write",
    "issues: write",
  ]) {
    add(
      violations,
      !block.includes(forbidden),
      `${fileName}:${jobId} contains forbidden authority ${forbidden}`,
    );
  }
};

const validateEvidenceWorkflows = (sources, violations) => {
  const release = sources["release.yml"] ?? "";
  const releaseRegistryKeys = jobBlock(
    release,
    "third_party_evidence_registry_keys",
  );
  const releaseShard = jobBlock(release, "third_party_evidence_shard");
  const releaseAggregate = jobBlock(release, "third_party_evidence");
  for (const setting of [
    "name: Release / third-party evidence / npm registry signing keys",
    "needs: release_preflight",
    "run: node util/snapshot-npm-registry-keys.mjs --output=.release/registry-keys/npm-registry-keys.json",
  ]) {
    add(
      violations,
      releaseRegistryKeys.includes(setting),
      `release.yml:third_party_evidence_registry_keys is missing ${setting}`,
    );
  }
  validateReadOnlyEvidenceJob(
    "release.yml",
    "third_party_evidence_registry_keys",
    releaseRegistryKeys,
    violations,
  );
  validateEvidenceUpload(
    "release.yml",
    "third_party_evidence_registry_keys",
    releaseRegistryKeys,
    {
      name: "npm-evidence-registry-keys",
      path: ".release/registry-keys/npm-registry-keys.json",
    },
    violations,
  );
  for (const setting of [
    "name: Release / third-party evidence / shard ${{ matrix.shard }}",
    "timeout-minutes: 120",
    "fail-fast: false",
    "max-parallel: 8",
    "uses: actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97 # v7.0.0",
    "SCANCODE_PLATFORM: linux",
    "SCANCODE_PYTHON: ${{ steps.scancode_python.outputs.python-path }}",
    "EVIDENCE_SHARD_INDEX: ${{ matrix.shard }}",
    "SCANCODE_COMMAND: .release/tools/scancode/scancode-toolkit-v32.5.0/venv/bin/scancode",
    "run: node util/prepare-scancode.mjs --platform-env=SCANCODE_PLATFORM --output=.release/tools/scancode --python-env=SCANCODE_PYTHON",
    "name: npm-evidence-registry-keys",
    "path: .release/registry-keys",
    "run: node util/acquire-npm-package-evidence.mjs --shard-count=32 --shard-index-env=EVIDENCE_SHARD_INDEX --output=.release/evidence-shard --scancode-env=SCANCODE_COMMAND --registry-keys=.release/registry-keys/npm-registry-keys.json",
  ]) {
    add(
      violations,
      releaseShard.includes(setting),
      `release.yml:third_party_evidence_shard is missing ${setting}`,
    );
  }
  add(
    violations,
    JSON.stringify(listNeeds(releaseShard)) ===
      JSON.stringify([
        "release_preflight",
        "third_party_evidence_registry_keys",
      ]),
    "release.yml:third_party_evidence_shard must wait for preflight and the same-run signing-key snapshot",
  );
  add(
    violations,
    JSON.stringify(shardCoordinates(releaseShard)) ===
      JSON.stringify(EXPECTED_SHARD_COORDINATES),
    "release.yml:third_party_evidence_shard must contain exactly indices 0..31",
  );
  add(
    violations,
    JSON.stringify(matrixKeys(releaseShard)) === JSON.stringify(["shard"]),
    "release.yml:third_party_evidence_shard must have only the shard matrix axis",
  );
  validateReadOnlyEvidenceJob(
    "release.yml",
    "third_party_evidence_shard",
    releaseShard,
    violations,
  );
  validateEvidenceUpload(
    "release.yml",
    "third_party_evidence_shard",
    releaseShard,
    {
      name: "npm-evidence-release-${{ matrix.shard }}",
      path: ".release/evidence-shard",
    },
    violations,
  );

  for (const setting of [
    "name: Release / third-party evidence",
    "if: ${{ !cancelled() }}",
    "needs: third_party_evidence_shard",
    "pattern: npm-evidence-release-*",
    "run: node util/merge-npm-package-evidence.mjs --input=.release/evidence-shards --output=.release/evidence-aggregate --verify-committed",
  ]) {
    add(
      violations,
      releaseAggregate.includes(setting),
      `release.yml:third_party_evidence is missing ${setting}`,
    );
  }
  add(
    violations,
    (releaseAggregate.match(/uses: actions\/download-artifact@/gu) ?? [])
      .length === 1,
    "release.yml:third_party_evidence must contain exactly one shard download",
  );
  validateReadOnlyEvidenceJob(
    "release.yml",
    "third_party_evidence",
    releaseAggregate,
    violations,
  );
  add(
    violations,
    listNeeds(jobBlock(release, "candidate")).includes("third_party_evidence"),
    "release.yml:candidate must wait for the closed third-party evidence aggregate",
  );

  const extended = sources["extended-tests.yml"] ?? "";
  const extendedEvidence = jobBlock(extended, "extended_evidence");
  add(
    violations,
    extendedEvidence.includes("if: ${{ github.event_name == 'schedule' }}"),
    "extended-tests.yml:extended_evidence must run only for scheduled observations",
  );
  const extendedRegistryKeys = jobBlock(
    extended,
    "third_party_evidence_registry_keys",
  );
  const extendedShard = jobBlock(extended, "third_party_evidence_shard");
  const extendedAggregate = jobBlock(
    extended,
    "third_party_evidence_aggregate",
  );
  const parity = jobBlock(extended, "third_party_evidence_parity");
  for (const setting of [
    "name: Extended tests / third-party evidence / npm registry signing keys",
    "if: ${{ github.event_name == 'workflow_dispatch' }}",
    "run: node util/snapshot-npm-registry-keys.mjs --output=.release/registry-keys/npm-registry-keys.json",
  ]) {
    add(
      violations,
      extendedRegistryKeys.includes(setting),
      `extended-tests.yml:third_party_evidence_registry_keys is missing ${setting}`,
    );
  }
  validateReadOnlyEvidenceJob(
    "extended-tests.yml",
    "third_party_evidence_registry_keys",
    extendedRegistryKeys,
    violations,
  );
  validateEvidenceUpload(
    "extended-tests.yml",
    "third_party_evidence_registry_keys",
    extendedRegistryKeys,
    {
      name: "npm-evidence-registry-keys",
      path: ".release/registry-keys/npm-registry-keys.json",
    },
    violations,
  );
  for (const setting of [
    "name: Extended tests / third-party evidence / ${{ matrix.os.id }} / shard ${{ matrix.shard }}",
    "if: ${{ github.event_name == 'workflow_dispatch' }}",
    "runs-on: ${{ matrix.os.runner }}",
    "shell: ${{ matrix.os.shell }}",
    "fail-fast: false",
    "max-parallel: 8",
    "uses: actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97 # v7.0.0",
    "SCANCODE_PLATFORM: ${{ matrix.os.platform }}",
    "SCANCODE_PYTHON: ${{ steps.scancode_python.outputs.python-path }}",
    "EVIDENCE_SHARD_INDEX: ${{ matrix.shard }}",
    "SCANCODE_COMMAND: ${{ matrix.os.scancode_command }}",
    "run: node util/prepare-scancode.mjs --platform-env=SCANCODE_PLATFORM --output=.release/tools/scancode --python-env=SCANCODE_PYTHON",
    "name: npm-evidence-registry-keys",
    "path: .release/registry-keys",
    "run: node util/acquire-npm-package-evidence.mjs --shard-count=32 --shard-index-env=EVIDENCE_SHARD_INDEX --output=.release/evidence-shard --scancode-env=SCANCODE_COMMAND --registry-keys=.release/registry-keys/npm-registry-keys.json",
  ]) {
    add(
      violations,
      extendedShard.includes(setting),
      `extended-tests.yml:third_party_evidence_shard is missing ${setting}`,
    );
  }
  add(
    violations,
    JSON.stringify(listNeeds(extendedShard)) ===
      JSON.stringify(["third_party_evidence_registry_keys"]),
    "extended-tests.yml:third_party_evidence_shard must wait for the same-run signing-key snapshot",
  );
  add(
    violations,
    JSON.stringify(shardCoordinates(extendedShard)) ===
      JSON.stringify(EXPECTED_SHARD_COORDINATES),
    "extended-tests.yml:third_party_evidence_shard must contain exactly indices 0..31",
  );
  add(
    violations,
    JSON.stringify(matrixKeys(extendedShard)) ===
      JSON.stringify(["os", "shard"]),
    "extended-tests.yml:third_party_evidence_shard must have only OS and shard matrix axes",
  );
  const expectedOperatingSystemMatrix = [
    "        os:",
    "          - id: ubuntu",
    "            runner: ubuntu-24.04",
    "            shell: bash",
    "            platform: linux",
    "            scancode_command: .release/tools/scancode/scancode-toolkit-v32.5.0/venv/bin/scancode",
    "          - id: windows",
    "            runner: windows-2025",
    "            shell: pwsh",
    "            platform: windows",
    "            scancode_command: .release/tools/scancode/scancode-toolkit-v32.5.0/venv/Scripts/scancode.exe",
    "        shard:",
  ].join("\n");
  add(
    violations,
    extendedShard
      .replaceAll("\r\n", "\n")
      .includes(expectedOperatingSystemMatrix),
    "extended-tests.yml:third_party_evidence_shard OS matrix differs from the closed platform contract",
  );
  validateReadOnlyEvidenceJob(
    "extended-tests.yml",
    "third_party_evidence_shard",
    extendedShard,
    violations,
  );
  validateEvidenceUpload(
    "extended-tests.yml",
    "third_party_evidence_shard",
    extendedShard,
    {
      name: "npm-evidence-${{ matrix.os.id }}-${{ matrix.shard }}",
      path: ".release/evidence-shard",
    },
    violations,
  );

  for (const setting of [
    "name: Extended tests / third-party evidence / ${{ matrix.os }} aggregate",
    "if: ${{ !cancelled() && github.event_name == 'workflow_dispatch' }}",
    "needs: third_party_evidence_shard",
    "fail-fast: false",
    "os: [ubuntu, windows]",
    "pattern: npm-evidence-${{ matrix.os }}-*",
    "run: node util/merge-npm-package-evidence.mjs --input=.release/evidence-shards --output=.release/evidence-aggregate",
  ]) {
    add(
      violations,
      extendedAggregate.includes(setting),
      `extended-tests.yml:third_party_evidence_aggregate is missing ${setting}`,
    );
  }
  add(
    violations,
    (extendedAggregate.match(/uses: actions\/download-artifact@/gu) ?? [])
      .length === 1,
    "extended-tests.yml:third_party_evidence_aggregate must contain exactly one shard download",
  );
  validateReadOnlyEvidenceJob(
    "extended-tests.yml",
    "third_party_evidence_aggregate",
    extendedAggregate,
    violations,
  );
  validateEvidenceUpload(
    "extended-tests.yml",
    "third_party_evidence_aggregate",
    extendedAggregate,
    {
      name: "npm-evidence-aggregate-${{ matrix.os }}",
      path: ".release/evidence-aggregate",
      retentionDays: 7,
    },
    violations,
  );

  for (const setting of [
    "name: Extended tests / third-party evidence / cross-platform parity",
    "if: ${{ !cancelled() && github.event_name == 'workflow_dispatch' }}",
    "needs: third_party_evidence_aggregate",
    "pattern: npm-evidence-aggregate-*",
    "run: node util/verify-npm-package-evidence-parity.mjs --left=.release/evidence-aggregates/npm-evidence-aggregate-ubuntu --right=.release/evidence-aggregates/npm-evidence-aggregate-windows",
  ]) {
    add(
      violations,
      parity.includes(setting),
      `extended-tests.yml:third_party_evidence_parity is missing ${setting}`,
    );
  }
  add(
    violations,
    (parity.match(/uses: actions\/download-artifact@/gu) ?? []).length === 1,
    "extended-tests.yml:third_party_evidence_parity must contain exactly one aggregate download",
  );
  validateReadOnlyEvidenceJob(
    "extended-tests.yml",
    "third_party_evidence_parity",
    parity,
    violations,
  );

  const setupPythonUses = Object.values(sources).reduce(
    (count, source) =>
      count + (source.match(/uses: actions\/setup-python@/gu) ?? []).length,
    0,
  );
  add(
    violations,
    setupPythonUses === 2,
    "setup-python is allowed exactly once in each evidence-shard job",
  );
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

const validateWebVowlCorpusMaterialization = (fileName, source, violations) => {
  const webVowl = jobBlock(source, "webvowl");
  const webVowlLines = webVowl.split(/\r?\n/u);
  const webVowlCheckoutIndex = webVowlLines.indexOf(
    "      - name: Check out the fixed WebVOWL consumer",
  );
  const webVowlCheckout =
    webVowlCheckoutIndex === -1
      ? ""
      : stepBlockAt(webVowlLines, webVowlCheckoutIndex);
  const webVowlCheckoutLines = webVowlCheckout.split(/\r?\n/u);
  const installStep = [
    "      - name: Install the fixed ontology corpus dependencies",
    "        working-directory: consumer-workspace/universal-ontology",
    "        run: npm ci",
  ].join("\n");
  const materializeStep = [
    "      - name: Materialize the fixed representative ontology corpus",
    "        working-directory: consumer-workspace/universal-ontology",
    "        run: npm run build",
  ].join("\n");
  const qualificationStep =
    "      - name: Qualify the retained package through isolated WebVOWL";
  const installIndex = webVowl.indexOf(installStep);
  const materializeIndex = webVowl.indexOf(materializeStep);
  const qualificationIndex = webVowl.indexOf(qualificationStep);

  add(
    violations,
    [
      "        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1",
      "          repository: Hadden-Industries/webvowl",
      "          ref: f7444ce3971621e6af6d38ebd4b5ce9b03f3e235",
      "          fetch-depth: 0",
    ].every((setting) => webVowlCheckoutLines.includes(setting)),
    `${fileName}:webvowl must retain complete WebVOWL history for governance tests`,
  );
  add(
    violations,
    installIndex !== -1 &&
      materializeIndex > installIndex &&
      qualificationIndex > materializeIndex,
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

export const auditRepositoryControls = () => {
  const violations = [];
  const workflowFiles = sortedYamlFiles(WORKFLOW_DIRECTORY);
  const issueFormFiles = sortedYamlFiles(ISSUE_FORM_DIRECTORY, {
    exclude: ["config.yml"],
  });
  add(
    violations,
    JSON.stringify(workflowFiles) === JSON.stringify(EXPECTED_WORKFLOWS),
    "The repository must contain exactly the five approved workflow files.",
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
  validateEvidenceWorkflows(sources, violations);

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
  validateReleaseMutationBoundary(release, violations);

  const releaseReconciliation = sources["release-reconciliation.yml"] ?? "";
  validateReleaseReconciliationMutationBoundary(
    releaseReconciliation,
    violations,
  );

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
  validateWebVowlCorpusMaterialization("ci.yml", ci, violations);
  validateWebVowlCorpusMaterialization("release.yml", release, violations);

  const alwaysJobs = [["ci.yml", "required"]];
  for (const [fileName, jobId] of alwaysJobs) {
    add(
      violations,
      jobBlock(sources[fileName] ?? "", jobId).includes("always()"),
      `${fileName}:${jobId} must retain the branch-protection always() evaluation`,
    );
  }
  const allSources = Object.values(sources).join("\n");
  add(
    violations,
    (allSources.match(/always\(\)/gu) ?? []).length === alwaysJobs.length,
    "always() is allowed only on CI / required",
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
