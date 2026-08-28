import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { verifyDownloadedCandidateBundle } from "./candidate-bundle.mjs";
import { GitHubReleaseClient } from "./github-release.mjs";
import { isStrictDescendantPath } from "./release-artifacts.mjs";
import { classifyReleaseState } from "./release-state.mjs";

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));

const requireExactJob = (jobs, name, conclusion) => {
  const matches = jobs.filter((job) => job.name === name);
  if (matches.length !== 1 || matches[0].conclusion !== conclusion) {
    throw new Error(
      `Required source job ${name} must occur exactly once with conclusion ${conclusion}.`,
    );
  }
  return matches[0];
};

const jobEvidence = (job) => ({
  name: job.name,
  conclusion: job.conclusion,
  url: job.html_url,
});

const assertArtifact = ({ artifact, expected, source }) => {
  if (
    artifact?.id !== expected.id ||
    artifact.name !== expected.name ||
    artifact.digest !== expected.digest ||
    artifact.expired !== false ||
    artifact.expires_at !== expected.expiresAt ||
    artifact.workflow_run?.id !== source.runId ||
    artifact.workflow_run?.head_sha !== source.commit
  ) {
    throw new Error(
      `Source artifact ${expected.name} does not match its reviewed identity.`,
    );
  }
  return {
    id: String(artifact.id),
    digest: artifact.digest,
    name: artifact.name,
  };
};

export const deriveReconciliationMetadata = ({ control, manifest }) => {
  const reconciliation = control?.reconciliation;
  const source = reconciliation?.source;
  const version = manifest?.version;
  const coordinate = `${manifest?.name}@${version}`;
  if (
    control?.schemaVersion !== 2 ||
    control.enabled !== true ||
    control.mode !== "DIRECT_BOOTSTRAP" ||
    control.coordinate !== coordinate ||
    control.channel !== "next" ||
    manifest?.name !== "owlapi" ||
    manifest.publishConfig?.access !== "public" ||
    manifest.publishConfig?.registry !== "https://registry.npmjs.org/" ||
    manifest.publishConfig?.tag !== "next" ||
    reconciliation?.enabled !== true ||
    reconciliation.mode !== "EXACT_ARTIFACT_RECONCILIATION" ||
    reconciliation.failureClass !==
      "POST_QUALIFICATION_EVIDENCE_PERSISTENCE_FAILURE" ||
    reconciliation.packageReproduction !== "BYTE_IDENTICAL" ||
    source?.repository !== "Hadden-Industries/owlapi" ||
    source.workflow !== ".github/workflows/release.yml" ||
    !Number.isSafeInteger(source.runId) ||
    source.runId < 1 ||
    !Number.isInteger(source.runAttempt) ||
    source.runAttempt < 1 ||
    !COMMIT_PATTERN.test(source.commit ?? "") ||
    source.tag !== `v${version}` ||
    source.failedJob !== "Release / tag accepted" ||
    !Number.isSafeInteger(reconciliation.candidateArtifact?.id) ||
    !SHA256_PATTERN.test(reconciliation.candidateArtifact?.digest ?? "") ||
    !Number.isSafeInteger(reconciliation.publicationPreflightArtifact?.id) ||
    !SHA256_PATTERN.test(
      reconciliation.publicationPreflightArtifact?.digest ?? "",
    )
  ) {
    throw new Error(
      "Release reconciliation metadata is not the exact reviewed direct-bootstrap continuation.",
    );
  }
  return {
    version,
    coordinate,
    channel: control.channel,
    tag: source.tag,
    sourceCommit: source.commit,
    sourceRunId: String(source.runId),
    sourceRunAttempt: String(source.runAttempt),
    candidateArtifactId: String(reconciliation.candidateArtifact.id),
    candidateArtifactDigest: reconciliation.candidateArtifact.digest,
    publicationPreflightArtifactId: String(
      reconciliation.publicationPreflightArtifact.id,
    ),
    publicationPreflightArtifactDigest:
      reconciliation.publicationPreflightArtifact.digest,
  };
};

export const formatReconciliationOutputs = (metadata) => {
  const outputs = {
    candidate_artifact_digest: metadata.candidateArtifactDigest,
    candidate_artifact_id: metadata.candidateArtifactId,
    channel: metadata.channel,
    coordinate: metadata.coordinate,
    publication_preflight_artifact_digest:
      metadata.publicationPreflightArtifactDigest,
    publication_preflight_artifact_id: metadata.publicationPreflightArtifactId,
    source_commit: metadata.sourceCommit,
    source_run_attempt: metadata.sourceRunAttempt,
    source_run_id: metadata.sourceRunId,
    tag: metadata.tag,
    version: metadata.version,
  };
  for (const [name, value] of Object.entries(outputs)) {
    if (
      !/^[a-z][a-z0-9_]*$/u.test(name) ||
      !/^[A-Za-z0-9@._+:/-]+$/u.test(value)
    ) {
      throw new Error(
        `Release reconciliation output ${name} is not a safe scalar.`,
      );
    }
  }
  return `${Object.entries(outputs)
    .map(([name, value]) => `${name}=${value}`)
    .join("\n")}\n`;
};

export const assertPromotionContext = ({
  repository,
  ref,
  promotionCommit,
  sourceCommit,
}) => {
  if (
    repository !== "Hadden-Industries/owlapi" ||
    ref !== "refs/heads/main" ||
    !COMMIT_PATTERN.test(promotionCommit ?? "") ||
    !COMMIT_PATTERN.test(sourceCommit ?? "")
  ) {
    throw new Error(
      "Release reconciliation must run at an accepted protected-main commit.",
    );
  }
  if (promotionCommit === sourceCommit) {
    throw new Error(
      "Release reconciliation must run from the later repair commit containing the corrected tooling.",
    );
  }
  return { repository, ref, promotionCommit };
};

export const assertPromotionLineage = ({
  sourceCommit,
  promotionCommit,
  sourceIsAncestor,
}) => {
  if (
    !COMMIT_PATTERN.test(sourceCommit ?? "") ||
    !COMMIT_PATTERN.test(promotionCommit ?? "") ||
    sourceIsAncestor !== true
  ) {
    throw new Error(
      "The release-reconciliation promotion commit must descend from the reviewed source commit.",
    );
  }
  return { sourceCommit, promotionCommit };
};

export const assertReconciliationSourceFacts = ({
  control,
  sourceRun,
  sourceJobs,
  candidateArtifact,
  publicationPreflightArtifact,
  publicationPreflight,
  tagVerification,
  githubRelease,
  registryVersion,
}) => {
  const reconciliation = control.reconciliation;
  const source = reconciliation.source;
  if (
    sourceRun?.id !== source.runId ||
    sourceRun.run_attempt !== source.runAttempt ||
    sourceRun.event !== "workflow_dispatch" ||
    sourceRun.status !== "completed" ||
    sourceRun.conclusion !== "failure" ||
    sourceRun.head_branch !== "main" ||
    sourceRun.head_sha !== source.commit ||
    sourceRun.path !== source.workflow ||
    sourceRun.head_repository?.full_name !== source.repository ||
    !sourceRun.actor?.login
  ) {
    throw new Error(
      "The source workflow run does not match the reviewed failed release attempt.",
    );
  }
  const requiredJobs = reconciliation.requiredSuccessfulJobs.map((name) =>
    jobEvidence(requireExactJob(sourceJobs, name, "success")),
  );
  const failedJob = jobEvidence(
    requireExactJob(sourceJobs, source.failedJob, "failure"),
  );
  const acceptedCandidate = assertArtifact({
    artifact: candidateArtifact,
    expected: reconciliation.candidateArtifact,
    source,
  });
  const acceptedPreflightArtifact = assertArtifact({
    artifact: publicationPreflightArtifact,
    expected: reconciliation.publicationPreflightArtifact,
    source,
  });
  if (
    publicationPreflight?.result !== "PASS" ||
    publicationPreflight.sourceCommit !== source.commit ||
    publicationPreflight.sourceRef !== "refs/heads/main" ||
    publicationPreflight.canonicalTagAbsent !== source.tag ||
    publicationPreflight.publicationEnabled !== true ||
    publicationPreflight.publicationMode !== "DIRECT_BOOTSTRAP" ||
    publicationPreflight.coordinate !== control.coordinate ||
    publicationPreflight.channel !== control.channel
  ) {
    throw new Error(
      "The retained publication-preflight report is not the reviewed PASS result.",
    );
  }
  if (
    tagVerification?.result !== "PASS" ||
    tagVerification.tag !== source.tag ||
    tagVerification.sourceCommit !== source.commit
  ) {
    throw new Error(
      "The signed-tag verification does not bind the reviewed source commit.",
    );
  }
  if (githubRelease !== null) {
    throw new Error(
      "Exact-artifact reconciliation requires the GitHub release to remain absent.",
    );
  }
  if (registryVersion !== null) {
    throw new Error(
      "Exact-artifact reconciliation requires the npm coordinate to remain absent.",
    );
  }
  return {
    result: "PASS",
    failureClass: reconciliation.failureClass,
    source: {
      repository: source.repository,
      workflow: source.workflow,
      runId: String(source.runId),
      runAttempt: source.runAttempt,
      url: sourceRun.html_url,
      commit: source.commit,
      tag: source.tag,
      actor: sourceRun.actor.login,
    },
    requiredJobs,
    failedJob,
    candidateArtifact: acceptedCandidate,
    publicationPreflightArtifact: acceptedPreflightArtifact,
    publicationPreflightResult: publicationPreflight.result,
    tagVerificationResult: tagVerification.result,
    githubReleaseAbsent: true,
    registryCoordinateAbsent: true,
  };
};

export const assertByteIdenticalTarball = ({ retained, reproduced }) => {
  if (
    !Buffer.isBuffer(retained) ||
    !Buffer.isBuffer(reproduced) ||
    !retained.equals(reproduced)
  ) {
    throw new Error(
      "The package produced by the repair commit is not byte-identical to the retained candidate.",
    );
  }
  return {
    result: "BYTE_IDENTICAL",
    bytes: retained.length,
    sha256: createHash("sha256").update(retained).digest("hex"),
  };
};

export const buildReconciliationReport = ({
  verifiedAt,
  promotionCommit,
  sourceFacts,
  reproduction,
}) => {
  if (
    !COMMIT_PATTERN.test(promotionCommit ?? "") ||
    sourceFacts?.result !== "PASS" ||
    reproduction?.result !== "BYTE_IDENTICAL"
  ) {
    throw new Error(
      "Release reconciliation cannot report success without source and byte-identity proof.",
    );
  }
  return {
    schemaVersion: 1,
    result: "PASS",
    verifiedAt,
    promotionCommit,
    source: sourceFacts,
    packageReproduction: reproduction,
  };
};

const argumentValue = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const readReviewedControl = () => {
  const directory = join(REPOSITORY_ROOT, "docs", "release");
  const control = readJson(join(directory, "publication-control.json"));
  const schema = readJson(join(directory, "publication-control.schema.json"));
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  if (!validate(control)) {
    throw new Error(
      `Publication control violates its strict schema: ${ajv.errorsText(validate.errors)}`,
    );
  }
  return control;
};

const runGit = (arguments_) => {
  const result = spawnSync("git", arguments_, {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `git ${arguments_.join(" ")} failed: ${result.stdout}${result.stderr}`,
    );
  }
  return result.stdout.trim();
};

const assertCheckedOutPromotionCommit = (promotionCommit) => {
  const checkoutHead = runGit(["rev-parse", "HEAD"]);
  const remoteMain = runGit(["rev-parse", "refs/remotes/origin/main"]);
  if (checkoutHead !== promotionCommit || remoteMain !== promotionCommit) {
    throw new Error(
      "Release reconciliation is not checked out at the captured origin/main commit.",
    );
  }
};

const sourceIsAncestorOfPromotion = (sourceCommit, promotionCommit) => {
  const result = spawnSync(
    "git",
    ["merge-base", "--is-ancestor", sourceCommit, promotionCommit],
    {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
    },
  );
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error(
    `git merge-base ancestry check failed: ${result.stdout}${result.stderr}`,
  );
};

const readCandidate = (directory, version) => {
  const expectedNames = [
    "SHA256SUMS",
    `owlapi-${version}.cdx.json`,
    `owlapi-${version}.tgz`,
  ].sort();
  const names = readdirSync(directory).sort();
  if (JSON.stringify(names) !== JSON.stringify(expectedNames)) {
    throw new Error(
      "The source candidate artifact is not the closed three-file bundle.",
    );
  }
  const tarball = readFileSync(join(directory, `owlapi-${version}.tgz`));
  const verified = verifyDownloadedCandidateBundle({
    checksumText: readFileSync(join(directory, "SHA256SUMS"), "utf8"),
    fileNames: names,
    sbomText: readFileSync(
      join(directory, `owlapi-${version}.cdx.json`),
      "utf8",
    ),
    tarball,
  });
  if (
    verified.package.name !== "owlapi" ||
    verified.package.version !== version
  ) {
    throw new Error("The retained candidate has a different package identity.");
  }
  return { ...verified, tarballBuffer: tarball };
};

const firstPackResult = (value) =>
  Array.isArray(value) ? value[0] : value[Object.keys(value)[0]];

const reproduceTarball = (version) => {
  if (process.env.NODE_AUTH_TOKEN || process.env.NPM_TOKEN) {
    throw new Error(
      "Read-only package reproduction must not receive npm credentials.",
    );
  }
  const temporaryRoot = mkdtempSync(
    join(tmpdir(), "owlapi-release-reconciliation-"),
  );
  const resolvedTemporaryRoot = resolve(temporaryRoot);
  if (!isStrictDescendantPath(resolve(tmpdir()), resolvedTemporaryRoot)) {
    throw new Error(
      `Refusing to use unexpected reconciliation path ${temporaryRoot}.`,
    );
  }
  try {
    // npm's tarball is the actual reproducibility boundary. Comparing the
    // complete bytes also detects packed metadata or timestamp drift that a
    // source-path allowlist could miss.
    const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
    const result = spawnSync(
      npmExecutable,
      [
        "pack",
        "--ignore-scripts",
        "--json",
        "--pack-destination",
        resolvedTemporaryRoot,
      ],
      {
        cwd: REPOSITORY_ROOT,
        encoding: "utf8",
        maxBuffer: 128 * 1024 * 1024,
      },
    );
    if (result.status !== 0) {
      throw new Error(
        `npm pack reproduction failed: ${result.stdout}${result.stderr}`,
      );
    }
    const packed = firstPackResult(JSON.parse(result.stdout));
    if (packed?.filename !== `owlapi-${version}.tgz`) {
      throw new Error("npm pack reproduced a different package coordinate.");
    }
    return readFileSync(join(resolvedTemporaryRoot, packed.filename));
  } finally {
    rmSync(resolvedTemporaryRoot, { recursive: true, force: true });
  }
};

const fetchRegistryVersion = async (coordinate) => {
  const url = new URL(coordinate, "https://registry.npmjs.org/");
  url.searchParams.set("owlapi-read", String(Date.now()));
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });
      if (response.status === 404) return null;
      if (response.ok) return response.json();
      if (response.status < 500 && response.status !== 429) {
        throw new Error(`npm registry read returned HTTP ${response.status}.`);
      }
      lastError = new Error(
        `npm registry read returned HTTP ${response.status}.`,
      );
    } catch (error) {
      lastError = error;
    }
    if (attempt < 3) {
      await new Promise((resolvePromise) =>
        setTimeout(resolvePromise, attempt * 1000),
      );
    }
  }
  throw lastError;
};

const main = async () => {
  const control = readReviewedControl();
  const manifest = readJson(join(REPOSITORY_ROOT, "package.json"));
  const metadata = deriveReconciliationMetadata({ control, manifest });
  const promotion = assertPromotionContext({
    repository: process.env.GITHUB_REPOSITORY,
    ref: process.env.GITHUB_REF,
    promotionCommit: process.env.GITHUB_SHA,
    sourceCommit: metadata.sourceCommit,
  });
  assertCheckedOutPromotionCommit(promotion.promotionCommit);
  assertPromotionLineage({
    sourceCommit: metadata.sourceCommit,
    promotionCommit: promotion.promotionCommit,
    sourceIsAncestor: sourceIsAncestorOfPromotion(
      metadata.sourceCommit,
      promotion.promotionCommit,
    ),
  });

  if (process.argv.includes("--emit-metadata")) {
    if (!process.env.GITHUB_OUTPUT) {
      throw new Error(
        "Workflow metadata emission requires the GitHub output file.",
      );
    }
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      formatReconciliationOutputs(metadata),
      "utf8",
    );
    process.stdout.write(`${JSON.stringify(metadata, null, 2)}\n`);
    return;
  }

  const candidatePath = argumentValue("--candidate");
  const publicationPreflightPath = argumentValue("--publication-preflight");
  const tagVerificationPath = argumentValue("--tag-verification");
  const outputPath = argumentValue("--output");
  const token = process.env.GITHUB_TOKEN;
  if (
    !candidatePath ||
    !publicationPreflightPath ||
    !tagVerificationPath ||
    !outputPath ||
    !token
  ) {
    throw new Error(
      "Release reconciliation requires candidate, preflight, tag, output, and GitHub token inputs.",
    );
  }
  const candidateDirectory = resolve(candidatePath);
  const retained = readCandidate(candidateDirectory, metadata.version);
  const reproduction = assertByteIdenticalTarball({
    retained: retained.tarballBuffer,
    reproduced: reproduceTarball(metadata.version),
  });
  const client = new GitHubReleaseClient({
    repository: promotion.repository,
    token,
  });
  const sourceRunId = control.reconciliation.source.runId;
  const sourceRunAttempt = control.reconciliation.source.runAttempt;
  const [
    sourceRun,
    sourceJobsResponse,
    candidateArtifact,
    publicationPreflightArtifact,
    githubRelease,
    registryVersion,
  ] = await Promise.all([
    client.read(`/actions/runs/${sourceRunId}/attempts/${sourceRunAttempt}`),
    client.read(
      `/actions/runs/${sourceRunId}/attempts/${sourceRunAttempt}/jobs?per_page=100`,
    ),
    client.read(
      `/actions/artifacts/${control.reconciliation.candidateArtifact.id}`,
    ),
    client.read(
      `/actions/artifacts/${control.reconciliation.publicationPreflightArtifact.id}`,
    ),
    client.getReleaseByTag(metadata.tag),
    fetchRegistryVersion(`owlapi/${encodeURIComponent(metadata.version)}`),
  ]);
  const sourceFacts = assertReconciliationSourceFacts({
    control,
    sourceRun,
    sourceJobs: sourceJobsResponse.jobs ?? [],
    candidateArtifact,
    publicationPreflightArtifact,
    publicationPreflight: readJson(resolve(publicationPreflightPath)),
    tagVerification: readJson(resolve(tagVerificationPath)),
    githubRelease,
    registryVersion,
  });
  const state = classifyReleaseState({
    canonicalTagExists: true,
    registryVersion,
    retainedSha256: reproduction.sha256,
    reconciliation: {
      enabled: control.reconciliation.enabled,
      sourceCommit: metadata.sourceCommit,
      tagTargetCommit: sourceFacts.source.commit,
      qualificationResult: sourceFacts.result,
      publicationPreflightResult: sourceFacts.publicationPreflightResult,
      candidateArtifactVerified: true,
      githubReleaseAbsent: sourceFacts.githubReleaseAbsent,
      reproducedSha256: reproduction.sha256,
    },
  });
  if (state.action !== "RECONCILE_QUALIFIED_CANDIDATE") {
    throw new Error(
      `Release state ${state.action} does not permit exact-artifact reconciliation.`,
    );
  }
  const report = buildReconciliationReport({
    verifiedAt: new Date().toISOString(),
    promotionCommit: promotion.promotionCommit,
    sourceFacts,
    reproduction,
  });
  const resolvedOutput = resolve(outputPath);
  mkdirSync(dirname(resolvedOutput), { recursive: true });
  writeFileSync(resolvedOutput, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
};

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  await main();
}
