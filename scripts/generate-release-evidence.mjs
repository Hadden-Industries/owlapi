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

export const requiredSuccessfulJobs = ({ sourceJobs, currentJobs }) => {
  const sourceNames = [
    "Release / qualified",
    "Release / publication preflight",
  ];
  const currentNames = [
    "Release reconciliation / source verified",
    "Release reconciliation / accepted",
    "Release reconciliation / GitHub draft",
    "Release reconciliation / npm direct bootstrap",
    "Release reconciliation / fresh public registry",
  ];
  const acceptedSource = sourceNames.map((name) => {
    const matches = sourceJobs.filter((job) => job.name === name);
    if (
      matches.length !== 1 ||
      matches[0].conclusion !== "success" ||
      !matches[0].url
    ) {
      throw new Error(
        `Required source qualification job ${name} did not succeed exactly once.`,
      );
    }
    return matches[0];
  });
  const acceptedCurrent = currentNames.map((name) => {
    const matches = currentJobs.filter((job) => job.name === name);
    if (
      matches.length !== 1 ||
      matches[0].conclusion !== "success" ||
      !matches[0].html_url
    ) {
      throw new Error(
        `Required reconciliation job ${name} did not succeed exactly once.`,
      );
    }
    return {
      name,
      conclusion: matches[0].conclusion,
      url: matches[0].html_url,
    };
  });
  return [...acceptedSource, ...acceptedCurrent];
};

const main = async () => {
  const candidateDirectory = resolve(argumentValue("--candidate") ?? "");
  const reportPaths = {
    reconciliation: resolve(argumentValue("--reconciliation") ?? ""),
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
  const artifactName = process.env.CANDIDATE_ARTIFACT_NAME;
  if (
    !output ||
    repository !== "Hadden-Industries/owlapi" ||
    !token ||
    !/^[1-9][0-9]*$/u.test(runId ?? "") ||
    !Number.isInteger(runAttempt) ||
    !/^[0-9a-f]{40}$/u.test(commit ?? "") ||
    !/^[1-9][0-9]*$/u.test(artifactId ?? "") ||
    !/^(?:sha256:)?[0-9a-f]{64}$/u.test(rawArtifactDigest ?? "") ||
    !new RegExp(
      `^owlapi-${version.replaceAll(".", "\\.")}-reconciled-candidate-${runId}-[1-9][0-9]*$`,
      "u",
    ).test(artifactName ?? "")
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
    reports.reconciliation.result !== "PASS" ||
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
  const sourceVerification = reports.reconciliation.source;
  const qualificationSource = sourceVerification.source;
  const sourceJobs = sourceVerification.requiredJobs.map((job) => ({
    name: job.name,
    conclusion: job.conclusion,
    url: job.url,
  }));
  const evidence = buildReleaseEvidence({
    generatedAt,
    source: {
      repository,
      ref: `refs/tags/${qualificationSource.tag}`,
      commit: qualificationSource.commit,
      tag: qualificationSource.tag,
    },
    workflow: {
      name: "Release reconciliation",
      commit,
      runId,
      runAttempt,
      url: `https://github.com/${repository}/actions/runs/${runId}`,
      actor: process.env.GITHUB_TRIGGERING_ACTOR ?? process.env.GITHUB_ACTOR,
    },
    qualificationWorkflow: {
      name: "Release",
      commit: qualificationSource.commit,
      runId: qualificationSource.runId,
      runAttempt: qualificationSource.runAttempt,
      url: qualificationSource.url,
      actor: qualificationSource.actor,
    },
    candidate: {
      artifactId: sourceVerification.candidateArtifact.id,
      artifactDigest: sourceVerification.candidateArtifact.digest,
      ...candidate,
    },
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
      provenance: {
        sourceCommit: commit,
        sourceRef: process.env.GITHUB_REF,
        workflow: ".github/workflows/release-reconciliation.yml",
        subjectSha256: candidate.tarball.sha256,
      },
    },
    reconciliation: {
      failureClass: sourceVerification.failureClass,
      sourceFailureJob: {
        name: sourceVerification.failedJob.name,
        conclusion: sourceVerification.failedJob.conclusion,
        url: sourceVerification.failedJob.url,
      },
      publicationPreflightArtifact:
        sourceVerification.publicationPreflightArtifact,
      transportArtifact: {
        id: artifactId,
        name: artifactName,
        digest: artifactDigest,
      },
      packageReproduction: reports.reconciliation.packageReproduction,
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
    requiredJobs: requiredSuccessfulJobs({
      sourceJobs,
      currentJobs: jobsResponse.jobs ?? [],
    }),
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
