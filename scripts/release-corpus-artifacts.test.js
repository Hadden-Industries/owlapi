import { expect, test } from "@jest/globals";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  readCorpusQualificationInput,
  reconcileHostedCorpus,
} from "./release-corpus-artifacts.mjs";
import {
  qualificationBaseSchema,
  sealCorpusQualification,
  verifyCorpusQualification,
} from "./corpus-qualification-manifest.mjs";
import { zipArchive } from "./fixtures/zip-archive.mjs";
import { REPOSITORY, REPOSITORY_ID } from "./release-identity.mjs";
import {
  PACKAGE_FILE_STEM,
  PACKAGE_NAME,
  PACKAGE_VERSION,
  PACKAGE_SBOM_PURL,
} from "./package-identity.mjs";
import { UBUNTU } from "./ubuntu-runner.mjs";
import { CI_JOB_NAMES } from "./ci-qualification.mjs";
import { comparisonCases } from "../util/owlapi-reference/compare-java-js.mjs";
import {
  comparisonIdentity,
  sha256,
} from "../util/owlapi-reference/comparison-evidence.mjs";
import {
  oracleVersion,
  oracleLockPath,
} from "../util/owlapi-reference/comparison-oracle.mjs";
import {
  corpusQualificationRoster,
  corpusQualificationShards,
  retainedDependencyGraphIdentity,
} from "../util/owlapi-reference/comparison-release-evidence.mjs";

const now = Date.parse("2026-11-23T04:00:04Z");
const hex = (character) => character.repeat(64);
const roster = corpusQualificationRoster(comparisonCases);
const plannedShards = corpusQualificationShards(comparisonCases, roster);
const shard = plannedShards
  .filter(
    ({ platform, selection }) =>
      platform === "win32" && selection.suite === "public-api-behavior",
  )
  .at(-1);

test("the release corpus artifact reader loads before npm dependencies are installed", () => {
  const program = `
    import { registerHooks } from "node:module";
    const dependencies = new URL("./node_modules/", import.meta.url).href;
    registerHooks({ resolve(specifier, context, resolve) {
      const result = resolve(specifier, context);
      if (result.url.startsWith(dependencies))
        throw new Error("Cold corpus reader imported a project dependency: " + specifier);
      return result;
    } });
    await import("./scripts/release-corpus-artifacts.mjs");
  `;
  expect(() =>
    execFileSync(process.execPath, ["--input-type=module", "--eval", program], {
      cwd: new URL("../", import.meta.url),
      stdio: "pipe",
      timeout: 10_000,
    }),
  ).not.toThrow();
});

test("the exact descriptor archive must match the selected locator and closed inventory", async () => {
  const input = { schemaVersion: 1, artifacts: [] };
  const archive = zipArchive([
    {
      path: "corpus-qualification-input.json",
      content: JSON.stringify(input),
    },
  ]);
  const locator = { id: 25, sha256: sha256(archive) };
  const artifact = {
    id: locator.id,
    digest: "sha256:" + locator.sha256,
    size_in_bytes: archive.length,
    expired: false,
    expires_at: "2027-02-01T00:00:00Z",
    workflow_run: {
      repository_id: REPOSITORY_ID,
      head_repository_id: REPOSITORY_ID,
    },
  };
  const options = {
    now,
    read: async () => artifact,
    download: async () => archive,
  };
  await expect(readCorpusQualificationInput(locator, options)).resolves.toEqual(
    input,
  );
  await expect(
    readCorpusQualificationInput({ ...locator, sha256: hex("b") }, options),
  ).rejects.toThrow("does not match the retained artifact");
});

function fixture(
  route,
  selectedShards = [shard],
  packageVersion = PACKAGE_VERSION,
  locked = false,
) {
  const repo = { id: REPOSITORY_ID, full_name: REPOSITORY };
  const run = {
    id: 84,
    run_attempt: 2,
    head_sha: "a".repeat(40),
    repository: repo,
    head_repository: repo,
    path: ".github/workflows/release.yml",
  };
  const origin =
    route === "fresh"
      ? run
      : {
          ...run,
          id: 82,
          run_attempt: 3,
          head_sha: "b".repeat(40),
          path: ".github/workflows/ci.yml",
        };
  const metadata = (producer) => ({
    expired: false,
    expires_at: "2027-02-01T00:00:00Z",
    workflow_run: {
      id: producer.id,
      head_sha: producer.head_sha,
      repository_id: repo.id,
      head_repository_id: repo.id,
    },
  });
  const stem = `${PACKAGE_FILE_STEM}-${packageVersion}`;
  const candidateAttempt = route === "fresh" ? run.run_attempt : 1;
  const tarball = Buffer.from("exact retained candidate bytes");
  const packageFacts = { name: PACKAGE_NAME, version: packageVersion };
  const sbom = JSON.stringify({
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    metadata: {
      component: { ...packageFacts, type: "library", purl: PACKAGE_SBOM_PURL },
    },
    components: [],
  });
  const original = zipArchive([
    { path: "SHA256SUMS", content: "fixture inventory" },
    { path: `${stem}.cdx.json`, content: sbom },
    { path: `${stem}.tgz`, content: tarball },
  ]);
  const candidate = {
    ...metadata(origin),
    id: 14,
    digest: "sha256:" + sha256(original),
    size_in_bytes: original.length,
    name: `${stem}-candidate-${origin.id}-${candidateAttempt}`,
    created_at: "2026-11-23T04:00:01Z",
  };
  const candidateJob = {
    id: 18,
    run_id: origin.id,
    run_attempt: candidateAttempt,
    head_sha: origin.head_sha,
    name:
      (route === "fresh"
        ? "Release / retained candidate"
        : CI_JOB_NAMES.candidate) + " / Produce",
    status: "completed",
    conclusion: "success",
    labels: [UBUNTU.label],
    steps: [
      {
        name: "Upload the exact same-run candidate",
        status: "completed",
        conclusion: "success",
        started_at: "2026-11-23T04:00:00Z",
        completed_at: "2026-11-23T04:00:03Z",
      },
    ],
  };
  const subject = {
    artifactId: "14",
    artifactSha256: sha256(original),
    tarballSha256: sha256(tarball),
    dependencyGraphSha256: hex("3"),
    importMapSha256: hex("4"),
    integrity:
      "sha512-" + createHash("sha512").update(tarball).digest("base64"),
    contentSha256: hex("7"),
  };
  const lock = {
    lockfileVersion: 3,
    packages: {
      "": {
        name: "owlapi-release-consumer",
        version: "0.0.0",
        dependencies: { owlapi: "file:/original/candidate.tgz" },
      },
      "node_modules/owlapi": {
        version: packageVersion,
        resolved: "file:/original/candidate.tgz",
        integrity: subject.integrity,
      },
    },
  };
  const proofBytes = zipArchive(
    Object.entries({
      "candidate-manifest.json": {
        package: packageFacts,
        tarball: {
          fileName: `${stem}.tgz`,
          bytes: tarball.length,
          sha256: subject.tarballSha256,
        },
      },
      "locked-production-graph.json": packageFacts,
      "sbom-subject-production-graph.json": packageFacts,
      "lockless-consumer-production-graph.json": {
        dependencies: { owlapi: packageFacts },
      },
      "lockless-consumer-package-lock.json": lock,
      "transport-audit.json": {},
      "npm-audit-full.json": {},
      "npm-audit-production.json": {},
      "normal-consumer-npm-audit-production.json": {},
      "inspection-consumer-production-graph.json": {},
    }).map(([path, value]) => ({ path, content: JSON.stringify(value) })),
  );
  const packageProof = {
    ...metadata(origin),
    id: 15,
    digest: "sha256:" + sha256(proofBytes),
    size_in_bytes: proofBytes.length,
    name: `package-proof-${origin.id}-${candidateAttempt}`,
    created_at: candidate.created_at,
  };
  if (locked) {
    candidateJob.steps.push({
      ...candidateJob.steps[0],
      name: "Retain the producer's native audit and consumer inventories",
    });
    subject.dependencyGraphSha256 = retainedDependencyGraphIdentity(
      lock,
      subject,
    );
    subject.importMapSha256 = sha256(
      readFileSync(
        new URL(
          "../test/consumers/browser/import-map/reference-import-map.json",
          import.meta.url,
        ),
      ),
    );
    subject.contentsByPlatform = {};
    delete subject.contentSha256;
  }
  const oracle = {
    version: oracleVersion,
    lockSha256: sha256(readFileSync(oracleLockPath)),
  };
  const rosterSha256 = comparisonIdentity(roster);
  const producers = selectedShards.map((shard, index) => {
    const cells = roster.cells.filter(
      (cell) => cell.platform === shard.platform,
    );
    const cases = shard.caseIds.map((caseId) => {
      const required = cells.filter((cell) => cell.caseId === caseId);
      const structure = required.find(
        ({ measurement }) => measurement === "structure",
      );
      const rules = structure?.expectedDifferenceRules;
      return {
        caseId,
        input: required[0].input,
        measures: {
          behavior: "observed",
          ...(structure ? { structure: rules ? "reconciled" : "match" } : {}),
        },
        ...(rules ? { reconciledRuleIds: rules } : {}),
        status: "passed",
        receipt: { sha256: hex("6") },
      };
    });
    const pinned = cells.find(
      (cell) => cell.caseId === shard.caseIds[0],
    )?.oracle;
    const report = {
      schemaVersion: 2,
      action: "run",
      executionId: sha256(shard.shardId),
      cases,
    };
    const reportBytes = Buffer.from(JSON.stringify(report));
    const proof = {
      ...report,
      action: "verify",
      shard,
      rosterSha256,
      reportSha256: sha256(reportBytes),
      candidate: {
        mode: "INSTALLED_CANDIDATE",
        ...subject,
        ...(locked
          ? { contentSha256: hex(shard.platform === "linux" ? "a" : "b") }
          : {}),
      },
      ...(locked
        ? {
            jdk: {
              vendor: "Eclipse Adoptium",
              version: "25.0.5.1",
              runtime: "25.0.5.1+2-LTS",
              setupJavaVersion: "25.0.5+1.2",
              executableSha256: hex("a"),
              compilerSha256: hex("b"),
              releaseSha256: hex("c"),
            },
          }
        : {}),
      oracle: pinned
        ? {
            ...pinned,
            classpathSha256: hex("a"),
            jars: [{ file: "owlapi.jar", byteLength: 37, sha256: hex("b") }],
          }
        : oracle,
      cases: [...cases],
    };
    const job = {
      id: 19 + index * 2,
      name: `Corpus shadow / ${shard.shardId}`,
      run_id: 84,
      run_attempt: 2,
      head_sha: run.head_sha,
      status: "completed",
      conclusion: "success",
      labels: [
        shard.platform === "linux" ? UBUNTU.label : "windows-2025-vs2026",
      ],
      steps: [
        { ...candidateJob.steps[0], name: "Upload the verified corpus shard" },
      ],
    };
    const artifact = {
      ...metadata(run),
      id: 20 + index * 2,
      name: `corpus-84-2-${shard.shardId}`,
      created_at: "2026-11-23T04:00:02Z",
    };
    return { shard, job, artifact, proof, reportBytes };
  });
  const { proof, job } = producers[0];
  const request = () => {
    const archives = new Map([[candidate.id, original]]);
    if (locked) archives.set(packageProof.id, proofBytes);
    const artifacts = producers.map(({ artifact, job, proof, reportBytes }) => {
      const archive = zipArchive([
        { path: "verification.json", content: JSON.stringify(proof) },
        { path: "report.json", content: reportBytes },
      ]);
      const sha = sha256(archive);
      artifact.size_in_bytes = archive.length;
      artifact.digest = "sha256:" + sha;
      archives.set(artifact.id, archive);
      return {
        id: artifact.id,
        sha256: sha,
        shardId: proof.shard.shardId,
        jobId: job.id,
      };
    });
    const input = {
      schemaVersion: locked ? 2 : 1,
      subject,
      oracle,
      source: {
        route,
        repositoryId: repo.id,
        runId: run.id,
        attempt: run.run_attempt,
        commit: run.head_sha,
        candidateRunId: origin.id,
        candidateAttempt,
        candidateJobId: candidateJob.id,
        candidateCommit: origin.head_sha,
        ...(locked
          ? {
              candidateProofId: packageProof.id,
              candidateProofSha256: sha256(proofBytes),
            }
          : {}),
      },
      artifacts,
    };
    const responses = {
      "/actions/runs/84": run,
      "/actions/runs/82": origin,
      "/actions/artifacts/14": candidate,
      "/actions/artifacts/15": packageProof,
      "/actions/jobs/18": candidateJob,
      ...Object.fromEntries(
        producers.map(({ job }) => [`/actions/jobs/${job.id}`, job]),
      ),
    };
    return {
      input,
      now,
      packageVersion,
      read: async (path) => {
        const page =
          /^\/actions\/runs\/84\/artifacts\?per_page=100&page=(\d+)$/u.exec(
            path,
          );
        if (!page) return responses[path];
        const start = 100 * (Number(page[1]) - 1);
        return {
          total_count: producers.length,
          artifacts: producers
            .slice(start, start + 100)
            .map(({ artifact }) => artifact),
        };
      },
      download: async ({ id }) => archives.get(id),
    };
  };
  return {
    proof,
    job,
    subject,
    candidateJob,
    request,
    verify: () => reconcileHostedCorpus(request()),
  };
}

test("the aggregate derives platform byte identities only under the independently retained lock", async () => {
  const pair = plannedShards
    .filter(({ selection }) => selection.suite === "public-api-behavior")
    .slice(-2);
  const replay = fixture("promoted", pair, PACKAGE_VERSION, true).request();
  const collected = await reconcileHostedCorpus({
    ...replay,
    collectPlatformContents: true,
  });
  expect(collected.candidate.contentsByPlatform).toEqual({
    linux: hex("a"),
    win32: hex("b"),
  });
  expect(collected.rejected).toEqual([]);
  const sealed = { ...replay.input, subject: collected.candidate };
  await expect(
    reconcileHostedCorpus({ ...replay, input: sealed }),
  ).resolves.toMatchObject({ rejected: [] });
  await expect(
    reconcileHostedCorpus({
      ...replay,
      input: {
        ...sealed,
        subject: { ...sealed.subject, dependencyGraphSha256: hex("9") },
      },
    }),
  ).rejects.toThrow("retained package proof");
});

test("a locked shard must attest the exact Java runtime and compiler", async () => {
  const model = fixture("promoted", [shard], PACKAGE_VERSION, true);
  model.proof.jdk.runtime = "25.0.5+8-LTS";
  await expect(
    reconcileHostedCorpus({
      ...model.request(),
      collectPlatformContents: true,
    }),
  ).rejects.toThrow("selected Java build");
});

test.each(["fresh", "promoted"])(
  "authenticates %s shards and holds missing cells",
  async (route) => {
    const result = await fixture(route).verify();
    expect(result.status).toBe("incomplete");
    expect(result.route).toBe(route);
    expect(result.rejected).toEqual([]);
    expect(result.requiredCount - result.missing.length).toBe(
      shard.caseIds.length,
    );
  },
);

test.each([
  "mode",
  "tarballSha256",
  "dependencyGraphSha256",
  "importMapSha256",
  "contentSha256",
])("rejects changed %s", async (field) => {
  const model = fixture("promoted");
  model.proof.candidate[field] = hex("8");
  await expect(model.verify()).rejects.toThrow("different candidate");
});

test("compares the subject with the tarball member of the original artifact", async () => {
  const model = fixture("fresh");
  model.subject.tarballSha256 = hex("8");
  model.proof.candidate.tarballSha256 = hex("8");
  await expect(model.verify()).rejects.toThrow("different tarball bytes");
});

test("rejects a substituted case and a producer from a prior attempt", async () => {
  const replaced = fixture("fresh");
  replaced.proof.cases[0] = replaced.proof.cases[1];
  await expect(replaced.verify()).rejects.toThrow("substituted case");
  const stale = fixture("fresh");
  stale.job.run_attempt--;
  await expect(stale.verify()).rejects.toThrow(
    "outside the successful original attempt",
  );
});

test("requires the candidate uploaded by its exact original producing job", async () => {
  const model = fixture("promoted");
  model.candidateJob.run_attempt = 3;
  await expect(model.verify()).rejects.toThrow("original producing attempt");
});

test("authenticates a complete simulated two-platform roster across inventory pages", async () => {
  const complete = await fixture("fresh", plannedShards).verify();
  expect(complete.status).toBe("complete");
  expect(complete.requiredCount).toBe(roster.cells.length);
  expect(complete.artifacts).toHaveLength(plannedShards.length);
  expect(complete.missing).toEqual([]);
  const missingLastShard = await fixture(
    "promoted",
    plannedShards.slice(0, -1),
  ).verify();
  expect(missingLastShard.status).toBe("incomplete");
  expect(missingLastShard.rejected).toEqual([]);
  expect(missingLastShard.missing.length).toBeGreaterThan(0);
});

test.each(["fresh", "promoted"])(
  "%s locked qualification seals and revalidates the complete roster at staging",
  async (route) => {
    const version = route === "promoted" ? "0.1.0-rc.7" : PACKAGE_VERSION;
    const replay = fixture(route, plannedShards, version, true).request();
    const collected = await reconcileHostedCorpus({
      ...replay,
      collectPlatformContents: true,
    });
    replay.input.subject = collected.candidate;
    const { source, subject } = replay.input;
    const baseManifest = {
      schemaVersion: route === "fresh" ? 1 : 2,
      package: { version },
      runId: String(source.runId),
      attempt: String(source.attempt),
      commit: source.commit,
      candidateId: subject.artifactId,
      candidateDigest: subject.artifactSha256,
      integrity: subject.integrity,
      assets: { tarball: { sha256: subject.tarballSha256 } },
      ...(route === "promoted"
        ? {
            ci: {
              build: {
                runId: source.candidateRunId,
                producingAttempt: source.candidateAttempt,
                providerHead: source.candidateCommit,
                producerJob: source.candidateJobId,
              },
              packageProof: {
                id: source.candidateProofId,
                digest: `sha256:${source.candidateProofSha256}`,
              },
            },
          }
        : {}),
    };
    const options = {
      authenticate: (input, _env, packageVersion) =>
        reconcileHostedCorpus({ ...replay, input, packageVersion }),
      readCurrentMain: async () => source.commit,
    };
    const manifest = await sealCorpusQualification(
      baseManifest,
      replay.input,
      options,
    );
    expect(manifest.schemaVersion).toBe(3);
    expect(qualificationBaseSchema(manifest)).toBe(baseManifest.schemaVersion);
    expect(manifest.corpus.requiredCount).toBe(roster.cells.length);
    expect(manifest.corpus.input.artifacts).toHaveLength(plannedShards.length);
    expect(manifest.corpus.input.subject.contentsByPlatform).toEqual({
      linux: hex("a"),
      win32: hex("b"),
    });
    const rechecked = await verifyCorpusQualification(manifest, options);
    expect(rechecked.status).toBe("complete");
    let head = source.commit;
    await expect(
      sealCorpusQualification(baseManifest, replay.input, {
        authenticate: async () => {
          head = "9".repeat(40);
          return rechecked;
        },
        readCurrentMain: async () => head,
      }),
    ).rejects.toThrow("Protected main changed");
    const changedCandidate = {
      ...manifest,
      assets: { tarball: { sha256: hex("9") } },
    };
    await expect(
      verifyCorpusQualification(changedCandidate, options),
    ).rejects.toThrow("tarball differs from qualification");
    await expect(
      verifyCorpusQualification(baseManifest, options),
    ).rejects.toThrow("corpus-bound qualification manifest is required");
  },
  15_000,
);
