import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  createRepositoryReader,
  readAcknowledgedInventory,
} from "./github-evidence-reader.mjs";

export const repository = "Hadden-Industries/owlapi";
const main = "refs/heads/main";
const categories = ["/language:actions", "/language:javascript-typescript"];
const digest = (bytes, algorithm = "sha256", encoding = "hex") =>
  createHash(algorithm).update(bytes).digest(encoding);

async function pages(read, path) {
  const records = [];
  for (let page = 1; page <= 10; page++) {
    const items = await read(path + "&per_page=100&page=" + page);
    assert.ok(
      Array.isArray(items) && items.length <= 100,
      "Invalid GitHub page",
    );
    records.push(...items);
    if (items.length < 100) return records;
  }
  throw new Error("Incomplete code-scanning inventory");
}

export async function readReleaseSecurity({ read, commit, now = Date.now() }) {
  assert.match(commit, /^[0-9a-f]{40}$/u);
  async function checkHead() {
    assert.equal(
      (await read("/git/ref/heads/main")).object.sha,
      commit,
      "Protected main moved",
    );
  }
  await checkHead();
  const rules = await read("/rulesets/21687258");
  assert.equal(rules.enforcement, "active");
  assert.equal(rules.target, "branch");
  assert.ok(
    rules.conditions.ref_name.include.some(
      (ref) => ref === "~DEFAULT_BRANCH" || ref === main,
    ),
  );
  assert.deepEqual(rules.conditions.ref_name.exclude, []);
  const tools = rules.rules
    .filter((r) => r.type === "code_scanning")
    .flatMap((r) => r.parameters.code_scanning_tools);
  assert.deepEqual(
    tools,
    [
      {
        tool: "CodeQL",
        alerts_threshold: "none",
        security_alerts_threshold: "high_or_higher",
      },
    ],
    "Release security rules changed",
  );
  const query = "?ref=refs%2Fheads%2Fmain&tool_name=CodeQL";
  const analyses = [];
  for (let page = 1; page <= 10; page++) {
    const items = await read(
      "/code-scanning/analyses" + query + "&per_page=100&page=" + page,
    );
    assert.ok(Array.isArray(items) && items.length <= 100);
    analyses.push(...items);
    if (
      categories.every((c) =>
        analyses.some(
          (a) =>
            a.commit_sha === commit &&
            a.category === c &&
            a.analysis_key === "dynamic/github-code-scanning/codeql:analyze",
        ),
      ) ||
      items.length < 100
    )
      break;
  }
  const scans = categories.map((category) => {
    const matches = analyses.filter(
      (item) =>
        item.commit_sha === commit &&
        item.ref === main &&
        item.category === category &&
        item.tool?.name === "CodeQL" &&
        item.analysis_key === "dynamic/github-code-scanning/codeql:analyze",
    );
    // Multiple managed rescans of this SHA are legitimate. Never fall back from a failed newer analysis.
    matches.sort((a, b) => b.id - a.id);
    const item = matches[0];
    assert.ok(
      Number.isSafeInteger(item?.id) &&
        item.id > 0 &&
        item.error === "" &&
        !item.warning &&
        Date.parse(item.created_at) <= now &&
        now - Date.parse(item.created_at) <= 7 * 24 * 60 * 60 * 1000 &&
        item.tool.version,
      "Missing or incomplete exact-commit CodeQL analysis for " + category,
    );
    return {
      id: item.id,
      category,
      toolVersion: item.tool.version,
      analyzedAt: item.created_at,
    };
  });
  const alerts = await pages(
    read,
    "/code-scanning/alerts" + query + "&state=open",
  );
  for (const alert of alerts) {
    assert.ok(
      alert.tool?.name === "CodeQL" && alert.state === "open",
      "Unexpected alert scope",
    );
    const severity = alert.rule?.security_severity_level;
    assert.ok(
      [null, "low", "medium"].includes(severity),
      "Blocking or unknown CodeQL alert severity",
    );
  }
  await checkHead();
  return {
    repository,
    ref: main,
    commit,
    scans,
    ruleset: rules.id,
    thresholds: tools,
    openAlerts: alerts.map((a) => a.number),
    observedAt: new Date(now).toISOString(),
  };
}

export async function recordQualification(env = process.env) {
  assert.equal(env.GITHUB_REPOSITORY, repository);
  assert.equal(env.GITHUB_REF, main);
  assert.equal(env.GITHUB_EVENT_NAME, "workflow_dispatch");
  for (const key of ["GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT", "CANDIDATE_ID"])
    assert.match(env[key], /^[1-9][0-9]*$/u);
  assert.match(env.CANDIDATE_DIGEST, /^[a-f0-9]{64}$/u);
  const { readCandidateBundleSnapshot } =
    await import("./candidate-bundle.mjs");
  const { candidate, contents } = readCandidateBundleSnapshot(
    ".release/manifest-candidate",
  );
  const security = await readReleaseSecurity({
    commit: env.GITHUB_SHA,
    read: createRepositoryReader({ repository, token: env.GH_TOKEN }),
  });
  const sources = [
    "package-lock.json",
    "tooling/artifact-transport/package-lock.json",
    "tooling/artifact-transport/rights-review.json",
    "docs/provenance/third-party-material.json",
    "docs/provenance/rights-inventory.json",
    "docs/provenance/scoped-package-name-review.json",
  ];
  const needs = JSON.parse(env.REQUIRED_JOB_RESULTS_JSON);
  const artifactList = await readAcknowledgedInventory(
    createRepositoryReader({
      repository,
      token: env.GH_TOKEN,
      now: () => performance.now(),
    }),
    env.GITHUB_RUN_ID,
    [env.CANDIDATE_ID, needs.candidate.outputs.proof_id],
  );
  const artifacts = artifactList.map((a) => ({
    id: a.id,
    name: a.name,
    digest: a.digest,
    bytes: a.size_in_bytes,
  }));
  assertQualificationCandidate(
    artifactList,
    env.CANDIDATE_ID,
    env.CANDIDATE_DIGEST,
  );
  const manifest = {
    artifacts,
    schemaVersion: 1,
    repository,
    workflow: ".github/workflows/release.yml",
    commit: env.GITHUB_SHA,
    runId: env.GITHUB_RUN_ID,
    attempt: env.GITHUB_RUN_ATTEMPT,
    candidateId: env.CANDIDATE_ID,
    candidateDigest: env.CANDIDATE_DIGEST,
    package: candidate.package,
    assets: candidate.assets,
    integrity:
      "sha512-" +
      digest(contents[candidate.assets.tarball.name], "sha512", "base64"),
    packedConfig: candidate.packageManifest.publishConfig,
    security,
    inputs: Object.fromEntries(
      sources.map((path) => [path, digest(readFileSync(path))]),
    ),
    qualification: JSON.parse(env.REQUIRED_JOB_RESULTS_JSON),
  };
  mkdirSync(".release/qualification-manifest", { recursive: true });
  writeFileSync(
    ".release/qualification-manifest/manifest.json",
    JSON.stringify(manifest, null, 2) + "\n",
    { flag: "wx" },
  );
}

/** The upload action returns hex while the GitHub artifact record includes its algorithm. */
export function assertQualificationCandidate(artifacts, id, uploadDigest) {
  assert.match(uploadDigest, /^[a-f0-9]{64}$/u);
  const matches = artifacts.filter((a) => String(a.id) === id);
  assert.equal(matches.length, 1, "Missing or ambiguous uploaded candidate");
  assert.equal(matches[0].expired, false);
  assert.equal(
    matches[0].digest,
    "sha256:" + uploadDigest,
    "Candidate upload and REST digests disagree",
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await recordQualification();
