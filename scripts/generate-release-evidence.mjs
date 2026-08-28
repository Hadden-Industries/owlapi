import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { GitHubReleaseClient } from "./github-release.mjs";
import { buildReleaseEvidence } from "./release-evidence.mjs";
import { sha256File } from "./release-artifacts.mjs";
import { validateReleaseEvidence } from "./validate-release-evidence.mjs";

const version = "0.1.0-alpha.0";

const argumentValue = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const candidateAsset = (directory, name) => {
  const path = join(directory, name);
  return { name, bytes: statSync(path).size, sha256: sha256File(path) };
};

const readCandidate = (directory) => {
  const names = [
    "SHA256SUMS",
    `owlapi-${version}.cdx.json`,
    `owlapi-${version}.tgz`,
  ];
  if (
    JSON.stringify(readdirSync(directory).sort()) !==
    JSON.stringify([...names].sort())
  ) {
    throw new Error(
      "Release-evidence generation requires the closed candidate bundle.",
    );
  }
  return {
    tarball: candidateAsset(directory, `owlapi-${version}.tgz`),
    sbom: candidateAsset(directory, `owlapi-${version}.cdx.json`),
    checksums: candidateAsset(directory, "SHA256SUMS"),
  };
};

const flattenApprovals = (history, observedAt) =>
  history.flatMap((review) =>
    (review.environments ?? []).map(({ name }) => ({
      environment: name,
      reviewer: review.user?.login,
      state: review.state,
      observedAt,
    })),
  );

const requiredSuccessfulJobs = (jobs) => {
  const requiredNames = [
    "Release / qualified",
    "Release / tag accepted",
    "Release / GitHub draft",
    "Release / npm direct bootstrap",
    "Release / fresh public registry",
  ];
  return requiredNames.map((name) => {
    const matches = jobs.filter((job) => job.name === name);
    if (matches.length !== 1 || matches[0].conclusion !== "success") {
      throw new Error(
        `Required release job ${name} did not succeed exactly once.`,
      );
    }
    return {
      name,
      conclusion: matches[0].conclusion,
      url: matches[0].html_url,
    };
  });
};

const main = async () => {
  const candidateDirectory = resolve(argumentValue("--candidate") ?? "");
  const reportPaths = {
    publicationPreflight: resolve(
      argumentValue("--publication-preflight") ?? "",
    ),
    tag: resolve(argumentValue("--tag-verification") ?? ""),
    draft: resolve(argumentValue("--draft-release") ?? ""),
    registry: resolve(argumentValue("--registry-verification") ?? ""),
  };
  const output = argumentValue("--output");
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const runId = process.env.GITHUB_RUN_ID;
  const runAttempt = Number(process.env.GITHUB_RUN_ATTEMPT);
  const commit = process.env.GITHUB_SHA;
  const artifactId = process.env.CANDIDATE_ARTIFACT_ID;
  const rawArtifactDigest = process.env.CANDIDATE_ARTIFACT_DIGEST;
  if (
    !output ||
    repository !== "Hadden-Industries/owlapi" ||
    !token ||
    !/^[1-9][0-9]*$/u.test(runId ?? "") ||
    !Number.isInteger(runAttempt) ||
    !/^[0-9a-f]{40}$/u.test(commit ?? "") ||
    !/^[1-9][0-9]*$/u.test(artifactId ?? "") ||
    !/^(?:sha256:)?[0-9a-f]{64}$/u.test(rawArtifactDigest ?? "")
  ) {
    throw new Error(
      "Release-evidence generation received incomplete workflow identity.",
    );
  }
  const generatedAt = new Date().toISOString();
  const client = new GitHubReleaseClient({ repository, token });
  const [approvalHistory, jobsResponse] = await Promise.all([
    client.read(`/actions/runs/${runId}/approvals`),
    client.read(`/actions/runs/${runId}/jobs?filter=latest&per_page=100`),
  ]);
  const reports = Object.fromEntries(
    Object.entries(reportPaths).map(([name, path]) => [name, readJson(path)]),
  );
  if (
    reports.publicationPreflight.result !== "PASS" ||
    reports.tag.result !== "PASS" ||
    reports.draft.result !== "PASS" ||
    reports.registry.result !== "PASS"
  ) {
    throw new Error("A required release evidence input is not PASS.");
  }
  const candidate = readCandidate(candidateDirectory);
  const artifactDigest = rawArtifactDigest.startsWith("sha256:")
    ? rawArtifactDigest
    : `sha256:${rawArtifactDigest}`;
  const evidence = buildReleaseEvidence({
    generatedAt,
    source: {
      repository,
      ref: process.env.GITHUB_REF,
      commit,
      tag: `v${version}`,
    },
    workflow: {
      name: "Release",
      runId,
      runAttempt,
      url: `https://github.com/${repository}/actions/runs/${runId}`,
      actor: process.env.GITHUB_TRIGGERING_ACTOR ?? process.env.GITHUB_ACTOR,
    },
    candidate: { artifactId, artifactDigest, ...candidate },
    publication: {
      mode: "DIRECT_BOOTSTRAP",
      registry: "https://registry.npmjs.org/",
      coordinate: `owlapi@${version}`,
      channel: "next",
      integrity: reports.registry.integrity,
      tarballUrl: reports.registry.tarballUrl,
      verifiedAt: reports.registry.verifiedAt,
      next: version,
      latestPresent: false,
      signatureAuditResult: "PASS",
    },
    signing: {
      signerId: reports.tag.signerId,
      signerPrincipal: reports.tag.signerPrincipal,
      fingerprint: reports.tag.fingerprint,
      githubVerifiedAt: reports.tag.githubVerifiedAt,
    },
    githubRelease: {
      id: reports.draft.releaseId,
      url: reports.draft.releaseUrl,
      draft: true,
      assets: reports.draft.assets,
    },
    approvals: flattenApprovals(approvalHistory, generatedAt),
    requiredJobs: requiredSuccessfulJobs(jobsResponse.jobs ?? []),
    extendedTests: [
      {
        environment: "branded-safari",
        result: "NOT_RUN",
        reason: "NO_BRANDED_PROVIDER_CONFIGURED",
      },
      {
        environment: "historical-browsers",
        result: "NOT_RUN",
        reason: "NO_HISTORICAL_PROVIDER_CONFIGURED",
      },
      {
        environment: "hosted-browser-service",
        result: "NOT_RUN",
        reason: "NO_HOSTED_PROVIDER_CONFIGURED",
      },
      {
        environment: "physical-real-devices",
        result: "NOT_RUN",
        reason: "NO_DEVICE_LAB_CONFIGURED",
      },
    ],
    inputEvidence: Object.values(reportPaths).map((path) => ({
      name: basename(path),
      sha256: sha256File(path),
    })),
  });
  validateReleaseEvidence(evidence);
  writeFileSync(
    resolve(output),
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(`${resolve(output)}\n`);
};

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  await main();
}
