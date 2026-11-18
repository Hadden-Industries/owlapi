import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  PACKAGE_NAME,
  PACKAGE_VERSION,
  NPM_REGISTRY,
} from "./package-identity.mjs";
import {
  readPublicRegistry,
  RegistryReadError,
} from "./public-registry-read.mjs";
import { FROZEN_RUNTIME_MATRIX } from "./ci-qualification.mjs";
import { runtimeDigest } from "./consumer-runtime-matrix.mjs";
import { assertPromotedCi } from "./promoted-release-proof.mjs";
import {
  createRepositoryReader,
  readAcknowledgedInventory,
} from "./github-evidence-reader.mjs";

export const repository = "Hadden-Industries/owlapi";
const main = "refs/heads/main";
const categories = ["/language:actions", "/language:javascript-typescript"];
const digest = (bytes, algorithm = "sha256", encoding = "hex") =>
  createHash(algorithm).update(bytes).digest(encoding);
const qualificationWorkflow = ".github/workflows/release.yml";
const sourcePaths = [
  "package-lock.json",
  "tooling/artifact-transport/package-lock.json",
  "tooling/artifact-transport/rights-review.json",
  "docs/provenance/third-party-material.json",
  "docs/provenance/rights-inventory.json",
  "docs/provenance/scoped-package-name-review.json",
];
const inputHashes = () =>
  Object.fromEntries(
    sourcePaths.map((path) => [path, digest(readFileSync(path))]),
  );

/** Qualification can precede tag signing and must target an unused coordinate. */
export async function validateReleaseCoordinate({
  read,
  registryRead = readPublicRegistry,
  commit,
}) {
  assert.match(commit, /^[a-f0-9]{40}$/u);
  const branch = await read("/branches/main");
  assert.ok(
    branch.name === "main" &&
      branch.protected === true &&
      branch.commit?.sha === commit,
    "Qualification subject must be current protected main",
  );
  try {
    await read(`/git/ref/tags/v${PACKAGE_VERSION}`);
    throw new Error("A release tag already exists for the selected coordinate");
  } catch (error) {
    if (error.httpStatus !== 404) throw error;
  }
  const url = new URL(
    `${encodeURIComponent(PACKAGE_NAME)}/${encodeURIComponent(PACKAGE_VERSION)}`,
    NPM_REGISTRY,
  );
  try {
    await registryRead(url, { attempts: 1, timeoutMs: 10_000 });
    throw new Error("The selected package version already exists on npm");
  } catch (error) {
    if (!(error instanceof RegistryReadError && error.status === 404))
      throw error;
  }
}

function writeQualification(manifest) {
  mkdirSync(".release/qualification-manifest", { recursive: true });
  writeFileSync(
    ".release/qualification-manifest/manifest.json",
    JSON.stringify(manifest, null, 2) + "\n",
    { flag: "wx" },
  );
}

/** Recheck compact admission references after the release-only jobs finish. */
export async function verifyPromotedAdmission({
  read,
  ci,
  commit,
  matrixSha256,
  now,
}) {
  assertPromotedCi(ci, { commit, matrixSha256, now });
  for (const source of new Map(
    [ci.main, ci.build].map((origin) => [origin.runId, origin]),
  ).values()) {
    const run = await read(`/actions/runs/${source.runId}`);
    assert.ok(
      run.id === source.runId &&
        run.run_attempt === source.attempt &&
        run.path === ".github/workflows/ci.yml" &&
        run.event === source.event &&
        run.head_sha === source.providerHead &&
        run.status === "completed" &&
        run.conclusion === "success" &&
        run.repository?.full_name === repository &&
        run.repository.id === ci.repositoryId &&
        run.head_repository?.full_name === repository &&
        run.head_repository.id === ci.repositoryId,
      "The original CI execution changed after release admission",
    );
  }
  const originals = [
    [ci.main.receipt, ci.main],
    [ci.build.receipt, ci.build],
    [ci.candidate, ci.build],
    [ci.packageProof, ci.build],
  ];
  for (const [artifact, source] of new Map(
    originals.map((pair) => [pair[0].id, pair]),
  ).values()) {
    const live = await read(`/actions/artifacts/${artifact.id}`);
    assert.ok(
      live.id === artifact.id &&
        live.name === artifact.name &&
        live.digest === artifact.digest &&
        live.size_in_bytes === artifact.bytes &&
        live.expires_at === artifact.expiresAt &&
        live.expired === false &&
        live.workflow_run?.id === source.runId &&
        live.workflow_run.head_sha === source.providerHead &&
        live.workflow_run.repository_id === ci.repositoryId &&
        live.workflow_run.head_repository_id === ci.repositoryId,
      "A required CI artifact changed or expired after admission",
    );
  }
  return ci;
}

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
  for (const key of ["GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT"])
    assert.match(env[key], /^[1-9][0-9]*$/u);
  const needs = JSON.parse(env.REQUIRED_JOB_RESULTS_JSON);
  const read = createRepositoryReader({
    repository,
    token: env.GH_TOKEN,
    requestLimit: 96,
  });
  const mode = needs.release_admission?.outputs?.mode;
  if (mode === "reuse") {
    assert.ok(FROZEN_RUNTIME_MATRIX, "Missing release runtime matrix");
    const ci = JSON.parse(needs.release_admission.outputs.evidence);
    const inputs = inputHashes();
    assert.equal(
      ci.advisoryObservations.root.lockSha256,
      inputs["package-lock.json"],
    );
    assert.equal(
      ci.advisoryObservations.transport.lockSha256,
      inputs["tooling/artifact-transport/package-lock.json"],
    );
    const security = await readReleaseSecurity({
      commit: env.GITHUB_SHA,
      read,
    });
    await validateReleaseCoordinate({ read, commit: env.GITHUB_SHA });
    await verifyPromotedAdmission({
      read,
      ci,
      commit: env.GITHUB_SHA,
      matrixSha256: runtimeDigest(FROZEN_RUNTIME_MATRIX),
    });
    assert.equal(
      (await read("/git/ref/heads/main")).object.sha,
      env.GITHUB_SHA,
    );
    return writeQualification({
      schemaVersion: 2,
      repository,
      workflow: qualificationWorkflow,
      commit: env.GITHUB_SHA,
      runId: env.GITHUB_RUN_ID,
      attempt: env.GITHUB_RUN_ATTEMPT,
      candidateId: String(ci.candidate.id),
      candidateDigest: ci.candidate.digest.slice("sha256:".length),
      package: ci.package,
      assets: ci.assets,
      integrity: ci.integrity,
      packedConfig: ci.packedConfig,
      ci,
      security,
      inputs,
      qualification: Object.fromEntries(
        Object.entries(needs).map(([name, value]) => [name, value.result]),
      ),
    });
  }
  assert.ok(
    ["fresh", "legacy"].includes(mode),
    "Unknown release qualification mode",
  );
  assert.match(env.CANDIDATE_ID, /^[1-9][0-9]*$/u);
  assert.match(env.CANDIDATE_DIGEST, /^[a-f0-9]{64}$/u);
  const { readCandidateBundleSnapshot } =
    await import("./candidate-bundle.mjs");
  const { candidate, contents } = readCandidateBundleSnapshot(
    ".release/manifest-candidate",
  );
  const security = await readReleaseSecurity({
    commit: env.GITHUB_SHA,
    read,
  });
  if (mode === "fresh")
    await validateReleaseCoordinate({ read, commit: env.GITHUB_SHA });
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
    workflow: qualificationWorkflow,
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
    inputs: inputHashes(),
    qualification: needs,
  };
  writeQualification(manifest);
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
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv[2] === "preflight") {
    await validateReleaseCoordinate({
      read: createRepositoryReader({ repository, token: process.env.GH_TOKEN }),
      commit: process.env.GITHUB_SHA,
    });
  } else {
    assert.equal(process.argv.length, 2);
    await recordQualification();
  }
}
