import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { GitHubReleaseClient } from "./github-release.mjs";
import {
  buildReleaseEvidence,
  SCOPED_RELEASE_JOB_NAMES,
} from "./release-evidence.mjs";
import { sha256File } from "./release-artifacts.mjs";
import { validateReleaseEvidence } from "./validate-release-evidence.mjs";
import {
  PACKAGE_NAME,
  PACKAGE_VERSION,
  PACKAGE_FILE_STEM,
} from "./package-identity.mjs";
import { verifyDownloadedCandidateBundle } from "./candidate-bundle.mjs";

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

const readCandidate = (directory, selectedVersion = version) => {
  const stem =
    selectedVersion === PACKAGE_VERSION ? PACKAGE_FILE_STEM : "owlapi";
  const names = [
    "SHA256SUMS",
    `${stem}-${selectedVersion}.cdx.json`,
    `${stem}-${selectedVersion}.tgz`,
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
    tarball: candidateAsset(directory, `${stem}-${selectedVersion}.tgz`),
    sbom: candidateAsset(directory, `${stem}-${selectedVersion}.cdx.json`),
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

/** Choose each required job's latest authenticated execution, including successful predecessors of a partial rerun. */
export const scopedWorkflowJobs = ({
  jobs,
  runId,
  runAttempt,
  commit,
  provenance,
}) => {
  const matchesRun = (job) =>
    String(job.run_id) === runId &&
    job.head_sha === commit &&
    Number.isSafeInteger(job.run_attempt) &&
    job.run_attempt >= 1 &&
    job.run_attempt <= runAttempt;
  if (
    jobs.some(
      (job) => SCOPED_RELEASE_JOB_NAMES.includes(job.name) && !matchesRun(job),
    )
  )
    throw new Error(
      "Required job inventory contains another workflow execution identity.",
    );
  let qualificationRunAttempt;
  const requiredJobs = SCOPED_RELEASE_JOB_NAMES.map((name) => {
    const matches = jobs.filter((job) => job.name === name && matchesRun(job));
    const latestAttempt = Math.max(...matches.map((job) => job.run_attempt));
    const latest = matches.filter((job) => job.run_attempt === latestAttempt);
    if (
      latest.length !== 1 ||
      latest[0].status !== "completed" ||
      latest[0].conclusion !== "success" ||
      !latest[0].html_url
    )
      throw new Error(
        `Required scoped release job ${name} did not succeed exactly once in its latest execution.`,
      );
    if (name === "Release / qualified") qualificationRunAttempt = latestAttempt;
    return { name, conclusion: "success", url: latest[0].html_url };
  });
  const publishers = jobs.filter(
    (job) =>
      job.name === "Release / npm direct bootstrap" &&
      matchesRun(job) &&
      job.run_attempt === provenance.runAttempt,
  );
  const publisher = publishers[0];
  const write = publisher?.steps?.find(
    (step) =>
      step.name === "Perform the single authorized direct-bootstrap write",
  );
  if (
    provenance.runId !== runId ||
    publishers.length !== 1 ||
    publisher.status !== "completed" ||
    !["success", "failure"].includes(publisher.conclusion) ||
    write?.status !== "completed" ||
    !["success", "failure"].includes(write.conclusion) ||
    !publisher.html_url
  )
    throw new Error(
      "Signed publication attempt has no matching authenticated publisher job.",
    );
  // A failed original write may have completed remotely. Cryptographic registry
  // verification and the successful, read-only rerun reconcile it without hiding its failure.
  return {
    requiredJobs,
    qualificationRunAttempt,
    publisherJob: {
      url: publisher.html_url,
      runAttempt: publisher.run_attempt,
      conclusion: publisher.conclusion,
    },
  };
};

const readAllJobs = async (client, runId) => {
  const jobs = [];
  for (let page = 1; page <= 100; page += 1) {
    const response = await client.read(
      `/actions/runs/${runId}/jobs?filter=all&per_page=100&page=${page}`,
    );
    jobs.push(...response.jobs);
    if (jobs.length >= response.total_count) return jobs;
  }
  throw new Error("Workflow job inventory exceeds the bounded evidence read.");
};

/** Fresh RC records bind the same-run retained bundle, preflight, signed tag and registry readback. */
const generateScopedEvidence = async () => {
  const names = [
    "candidate",
    "publication-preflight",
    "tag-verification",
    "draft-release",
    "registry-verification",
    "output",
  ];
  const paths = Object.fromEntries(
    names.map((name) => {
      const value = argumentValue(`--${name}`);
      if (!value) throw new Error(`Scoped evidence requires --${name}.`);
      return [name, resolve(value)];
    }),
  );
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const runId = process.env.GITHUB_RUN_ID;
  const runAttempt = Number(process.env.GITHUB_RUN_ATTEMPT);
  const commit = process.env.GITHUB_SHA;
  const artifactId = process.env.CANDIDATE_ARTIFACT_ID;
  const rawDigest = process.env.CANDIDATE_ARTIFACT_DIGEST;
  if (
    repository !== "Hadden-Industries/owlapi" ||
    !token ||
    !/^[1-9][0-9]*$/u.test(runId ?? "") ||
    !Number.isSafeInteger(runAttempt) ||
    runAttempt < 1 ||
    !/^[0-9a-f]{40}$/u.test(commit ?? "") ||
    !/^[1-9][0-9]*$/u.test(artifactId ?? "") ||
    !/^(?:sha256:)?[0-9a-f]{64}$/u.test(rawDigest ?? "") ||
    process.env.GITHUB_REF !== "refs/heads/main"
  ) {
    throw new Error(
      "Scoped evidence received incomplete canonical workflow identity.",
    );
  }
  const generatedAt = new Date().toISOString();
  const client = new GitHubReleaseClient({ repository, token });
  const [approvals, jobs, run, artifact] = await Promise.all([
    client.read(`/actions/runs/${runId}/approvals`),
    readAllJobs(client, runId),
    client.read(`/actions/runs/${runId}`),
    client.read(`/actions/artifacts/${artifactId}`),
  ]);
  const digest = rawDigest.startsWith("sha256:")
    ? rawDigest
    : `sha256:${rawDigest}`;
  if (
    run.head_sha !== commit ||
    run.run_attempt !== runAttempt ||
    run.path !== ".github/workflows/release.yml" ||
    String(artifact.workflow_run?.id) !== runId ||
    artifact.workflow_run?.head_sha !== commit ||
    artifact.digest !== digest ||
    artifact.expired ||
    !new RegExp(
      `^${PACKAGE_FILE_STEM}-0\\.1\\.0-rc\\.1-candidate-${runId}-[1-9][0-9]*$`,
      "u",
    ).test(artifact.name ?? "") ||
    Number(artifact.name.split("-").at(-1)) > runAttempt
  )
    throw new Error(
      "Scoped artifact or workflow server identity differs from the current run.",
    );
  const preflight = readJson(paths["publication-preflight"]);
  if (preflight.schemaVersion !== 2)
    throw new Error(
      "Current release evidence requires producer-contract preflight version 2.",
    );
  const tag = readJson(paths["tag-verification"]);
  const draft = readJson(paths["draft-release"]);
  const registry = readJson(paths["registry-verification"]);
  const candidate = readCandidate(paths.candidate, PACKAGE_VERSION);
  verifyDownloadedCandidateBundle({
    fileNames: readdirSync(paths.candidate),
    checksumText: readFileSync(join(paths.candidate, "SHA256SUMS"), "utf8"),
    sbomText: readFileSync(join(paths.candidate, candidate.sbom.name), "utf8"),
    tarball: readFileSync(join(paths.candidate, candidate.tarball.name)),
  });
  const coordinate = `${PACKAGE_NAME}@${PACKAGE_VERSION}`;
  if (
    [preflight, tag, draft, registry].some(
      (report) => report.result !== "PASS",
    ) ||
    preflight.candidate?.coordinate !== coordinate ||
    preflight.candidate.sha256 !== candidate.tarball.sha256 ||
    preflight.candidate.bytes !== candidate.tarball.bytes ||
    preflight.candidate.fileName !== candidate.tarball.name ||
    preflight.registryState !== "DIRECT_BOOTSTRAP_READY" ||
    tag.sourceCommit !== commit ||
    tag.tag !== `v${PACKAGE_VERSION}` ||
    registry.coordinate !== coordinate ||
    registry.next !== PACKAGE_VERSION ||
    registry.latest !== PACKAGE_VERSION ||
    registry.tarballSha256 !== candidate.tarball.sha256 ||
    ["alias", "scoped"].some(
      (mode) =>
        registry.consumer?.[mode]?.package?.name !== PACKAGE_NAME ||
        registry.consumer[mode].package.version !== PACKAGE_VERSION ||
        registry.consumer[mode].integrity !== registry.integrity,
    )
  ) {
    throw new Error(
      "Scoped release inputs do not qualify the same artifact and source.",
    );
  }
  const { requiredJobs, qualificationRunAttempt, publisherJob } =
    scopedWorkflowJobs({
      jobs,
      runId,
      runAttempt,
      commit,
      provenance: registry.provenance,
    });
  const workflow = {
    name: "Release",
    commit,
    runId,
    runAttempt,
    url: `https://github.com/${repository}/actions/runs/${runId}`,
    actor: process.env.GITHUB_TRIGGERING_ACTOR ?? process.env.GITHUB_ACTOR,
  };
  const evidence = buildReleaseEvidence({
    producerContract: preflight.producerContract,
    generatedAt,
    source: {
      repository,
      ref: `refs/tags/v${PACKAGE_VERSION}`,
      commit,
      tag: `v${PACKAGE_VERSION}`,
    },
    workflow,
    qualificationWorkflow: {
      ...workflow,
      runAttempt: qualificationRunAttempt,
      actor: run.actor?.login,
    },
    candidate: { artifactId, artifactDigest: digest, ...candidate },
    publication: {
      mode: "DIRECT_BOOTSTRAP",
      registry: "https://registry.npmjs.org/",
      coordinate,
      channel: "next",
      integrity: registry.integrity,
      tarballUrl: registry.tarballUrl,
      verifiedAt: registry.verifiedAt,
      next: PACKAGE_VERSION,
      latest: registry.latest,
      latestPresent: true,
      signatureAuditResult: "PASS",
      provenance: registry.provenance,
      publisherJob,
    },
    reconciliation: null,
    signing: {
      signerId: tag.signerId,
      signerPrincipal: tag.signerPrincipal,
      fingerprint: tag.fingerprint,
      githubVerifiedAt: tag.githubVerifiedAt,
    },
    githubRelease: {
      id: draft.releaseId,
      url: draft.releaseUrl,
      draft: true,
      assets: draft.assets,
    },
    approvals: flattenApprovals(approvals, generatedAt),
    requiredJobs,
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
    inputEvidence: names
      .filter((name) => name !== "candidate" && name !== "output")
      .map((name) => ({
        name: basename(paths[name]),
        sha256: sha256File(paths[name]),
      })),
  });
  validateReleaseEvidence(evidence);
  writeFileSync(paths.output, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${paths.output}\n`);
};

const main = async () => {
  if (argumentValue("--publication-preflight")) return generateScopedEvidence();
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
