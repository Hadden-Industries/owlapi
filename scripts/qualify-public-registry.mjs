import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { verifyDownloadedCandidateBundle } from "./candidate-bundle.mjs";
import { sha256Buffer } from "./release-artifacts.mjs";
import {
  PACKAGE_NAME,
  PACKAGE_VERSION,
  assertRegistryTarballUrl,
} from "./package-identity.mjs";
import { installRegistryConsumer } from "./public-registry-consumer.mjs";
import { verifyRegistryProvenance } from "./registry-provenance.mjs";
import { waitForReleaseAvailability } from "./release-availability.mjs";
import { GitHubReleaseClient } from "./github-release.mjs";
import {
  INSTALLED_TEST_SCRIPTS,
  writeInstalledConsumerFixtures,
} from "./installed-consumer-fixtures.mjs";

import { NPM_REGISTRY as registry } from "./package-identity.mjs";

/** A successful read-only rerun must not hide an original pre-publication failure. */
export const readPublicationAttempt = async ({ client, env = process.env }) => {
  const runId = env.GITHUB_RUN_ID,
    commit = env.GITHUB_SHA;
  if (
    env.GITHUB_REPOSITORY !== "Hadden-Industries/owlapi" ||
    env.GITHUB_REF !== "refs/heads/main" ||
    !/^[1-9][0-9]*$/u.test(runId ?? "") ||
    !/^[0-9a-f]{40}$/u.test(commit ?? "")
  )
    throw new Error(
      "Publication observation requires the canonical workflow identity.",
    );
  const [run, result] = await Promise.all([
    client.read(`/actions/runs/${runId}`),
    client.read(`/actions/runs/${runId}/attempts/1/jobs?per_page=100`),
  ]);
  if (
    run.head_sha !== commit ||
    run.path !== ".github/workflows/release.yml" ||
    !Array.isArray(result.jobs) ||
    result.jobs.length >= 100
  )
    throw new Error(
      "Publication observation workflow identity differs or jobs are incomplete.",
    );
  const publishers = result.jobs.filter(
    (job) => job.name === "Release / npm trusted publisher",
  );
  const publisher = publishers[0];
  const writes =
    publisher?.steps?.filter(
      (step) =>
        step.name ===
        "Perform the authorized publication and exact-version channel writes",
    ) ?? [];
  const write = writes[0];
  if (
    publishers.length !== 1 ||
    String(publisher.run_id) !== runId ||
    publisher.head_sha !== commit ||
    publisher.run_attempt !== 1 ||
    publisher.status !== "completed" ||
    !["success", "failure"].includes(publisher.conclusion) ||
    writes.length !== 1 ||
    write.status !== "completed" ||
    !["success", "failure"].includes(write.conclusion) ||
    !Number.isFinite(Date.parse(write.completed_at))
  )
    throw new Error(
      "No completed publication attempt is established in this run. Inspect the original publisher job; do not replay possible writes.",
    );
  return {
    state:
      write.conclusion === "success"
        ? "PUBLICATION_ACCEPTED"
        : "PUBLICATION_ATTEMPTED",
    runId,
    runAttempt: 1,
    jobId: publisher.id,
    conclusion: write.conclusion,
    completedAt: write.completed_at,
    acceptedAt: write.conclusion === "success" ? write.completed_at : null,
  };
};

export const assertPublicRegistryFacts = ({
  expectedVersion,
  retainedSha256,
  metadata,
  distTags,
  registryTarballSha256,
}) => {
  if (
    metadata?.name !== PACKAGE_NAME ||
    expectedVersion !== PACKAGE_VERSION ||
    metadata.version !== expectedVersion
  ) {
    throw new Error(
      "Public registry metadata has the wrong package coordinate.",
    );
  }
  if (
    distTags?.next !== expectedVersion ||
    distTags?.latest !== expectedVersion
  ) {
    throw new Error(
      "Both next and latest must identify the exact qualified rc.2 version.",
    );
  }
  if (registryTarballSha256 !== retainedSha256) {
    throw new Error(
      "Public registry bytes differ from the retained candidate.",
    );
  }
  if (
    !metadata.dist?.integrity ||
    !assertRegistryTarballUrl(metadata.dist.tarball)
  ) {
    throw new Error("Public registry distribution metadata is incomplete.");
  }
  return {
    coordinate: `${PACKAGE_NAME}@${expectedVersion}`,
    channel: "next",
    next: expectedVersion,
    latest: expectedVersion,
    integrity: metadata.dist.integrity,
    tarballSha256: registryTarballSha256,
  };
};

const verifyIntegrity = (buffer, integrity) => {
  const match = /^sha512-(?<digest>[A-Za-z0-9+/]+={0,2})$/u.exec(integrity);
  if (!match?.groups) {
    throw new Error("Registry integrity is not an exact sha512 SRI value.");
  }
  const actual = createHash("sha512").update(buffer).digest("base64");
  if (actual !== match.groups.digest) {
    throw new Error("Registry tarball fails its published sha512 integrity.");
  }
};

const readCandidate = (directory) => {
  const fileNames = readdirSync(directory);
  const tarballName = fileNames.find((name) =>
    /^hadden-industries-owlapi-.+\.tgz$/u.test(name),
  );
  const sbomName = fileNames.find((name) =>
    /^hadden-industries-owlapi-.+\.cdx\.json$/u.test(name),
  );
  if (!tarballName || !sbomName) {
    throw new Error("The retained candidate bundle is incomplete.");
  }
  return verifyDownloadedCandidateBundle({
    checksumText: readFileSync(join(directory, "SHA256SUMS"), "utf8"),
    fileNames,
    sbomText: readFileSync(join(directory, sbomName), "utf8"),
    tarball: readFileSync(join(directory, tarballName)),
  });
};

const run = (command, arguments_, options = {}) => {
  const result = spawnSync(command, arguments_, {
    encoding: "utf8",
    shell: process.platform === "win32" && command === "npm",
    ...options,
  });
  return result;
};

const requireSuccess = (result, label) => {
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${result.stdout}${result.stderr}`);
  }
  return result;
};

const exerciseFreshConsumers = async (metadata, tarball) => {
  const root = mkdtempSync(join(tmpdir(), "owlapi-public-registry-"));
  try {
    const results = {};
    for (const [mode, dependencyName] of [
      ["scoped", PACKAGE_NAME],
      ["alias", "owlapi"],
    ]) {
      const directory = join(root, mode);
      const { identity, environment, npmArguments } = installRegistryConsumer({
        directory,
        dependencyName,
        metadata,
      });
      writeInstalledConsumerFixtures(directory, dependencyName);
      for (const script of INSTALLED_TEST_SCRIPTS) {
        requireSuccess(
          run(process.execPath, [script], { cwd: directory, env: environment }),
          script,
        );
      }
      const graph = JSON.parse(
        requireSuccess(
          run(
            process.execPath,
            [process.env.npm_execpath, "ls", "--all", "--json"],
            { cwd: directory, env: environment },
          ),
          "Fresh dependency graph",
        ).stdout,
      );
      const signatures = JSON.parse(
        requireSuccess(
          run(
            process.execPath,
            [
              process.env.npm_execpath,
              "audit",
              "signatures",
              "--json",
              ...npmArguments,
            ],
            { cwd: directory, env: environment },
          ),
          "Registry signature and provenance audit",
        ).stdout,
      );
      results[mode] = {
        ...identity,
        installedTests: INSTALLED_TEST_SCRIPTS,
        dependencyGraph: graph,
        signatureAudit: signatures,
      };
    }
    const provenance = await verifyRegistryProvenance({
      metadata,
      tarball,
      cache: join(root, "provenance-cache"),
      commit: process.env.GITHUB_SHA,
      runId: process.env.GITHUB_RUN_ID,
      runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    });
    return { consumer: results, provenance };
  } finally {
    // The directory is a fresh mkdtemp child of the system temporary directory.
    rmSync(root, { recursive: true, force: true });
  }
};

const argumentValue = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

export const qualifyPublicRegistry = async ({
  candidate,
  outputPath,
  publication = () =>
    readPublicationAttempt({
      client: new GitHubReleaseClient({
        repository: "Hadden-Industries/owlapi",
        token: process.env.GITHUB_TOKEN,
      }),
    }),
  wait = waitForReleaseAvailability,
  verifyConsumers = exerciseFreshConsumers,
  now = () => new Date().toISOString(),
  log = (value) => process.stdout.write(`${JSON.stringify(value)}\n`),
}) => {
  const { version } = candidate.package;
  const observations = [];
  const pendingReport = {
    schemaVersion: 1,
    result: "AVAILABILITY_PENDING",
    coordinate: `${PACKAGE_NAME}@${version}`,
    sourceCommit: process.env.GITHUB_SHA ?? null,
    runId: process.env.GITHUB_RUN_ID ?? null,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
    retainedSha256: candidate.tarball.sha256,
    startedAt: now(),
    observations,
  };
  const retain = () =>
    writeFileSync(
      resolve(outputPath),
      `${JSON.stringify(pendingReport, null, 2)}\n`,
    );
  retain();
  try {
    pendingReport.publication = await publication();
    retain();
    const {
      metadata,
      distTags,
      tarball: registryTarball,
    } = await wait({
      retainedSha256: candidate.tarball.sha256,
      observe: (observation) => {
        observations.push(observation);
        pendingReport.result = observation.state;
        if (
          observation.state === "REGISTRY_AVAILABLE" &&
          pendingReport.publication.acceptedAt
        ) {
          pendingReport.acceptedToAvailableMs = Math.max(
            0,
            Date.parse(now()) -
              Date.parse(pendingReport.publication.acceptedAt),
          );
        }
        retain();
        log(observation);
      },
    });
    verifyIntegrity(registryTarball, metadata.dist?.integrity);
    const facts = assertPublicRegistryFacts({
      expectedVersion: version,
      retainedSha256: candidate.tarball.sha256,
      metadata,
      distTags,
      registryTarballSha256: sha256Buffer(registryTarball),
    });
    const { consumer, provenance } = await verifyConsumers(
      metadata,
      registryTarball,
    );
    observations.push({
      state: "VERIFICATION_PASSED",
      verifiedAt: now(),
    });
    const report = {
      schemaVersion: 1,
      result: "PASS",
      verifiedAt: now(),
      registry,
      ...facts,
      tarballUrl: metadata.dist.tarball,
      npmPublishedAt: metadata.time ?? null,
      consumer,
      provenance,
      publication: pendingReport.publication,
      availability: {
        startedAt: pendingReport.startedAt,
        acceptedToAvailableMs: pendingReport.acceptedToAvailableMs ?? null,
        observations,
      },
    };
    writeFileSync(
      resolve(outputPath),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );
    log(report);
    return report;
  } catch (error) {
    pendingReport.result =
      error.code === "AVAILABILITY_INCOMPLETE"
        ? "AVAILABILITY_INCOMPLETE"
        : "FAIL";
    pendingReport.error = error.message;
    pendingReport.finishedAt = now();
    retain();
    throw error;
  }
};

const main = async () => {
  const candidatePath = argumentValue("--candidate"),
    outputPath = argumentValue("--output");
  if (!candidatePath || !outputPath)
    throw new Error(
      "Registry qualification requires --candidate and --output.",
    );
  await qualifyPublicRegistry({
    candidate: readCandidate(resolve(candidatePath)),
    outputPath,
  });
};

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  await main();
}
