import {
  afterAll,
  beforeAll,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";
import { gzipSync } from "node:zlib";
import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { canonicalJson, stableJson } from "./canonical-json.mjs";
import { sha256Buffer, isStrictDescendantPath } from "./release-file-utils.mjs";
import { validateStagedReleaseEvidence } from "./staged-evidence.mjs";
import {
  PACKAGE_FILE_STEM,
  PACKAGE_NAME,
  REPOSITORY,
  REPOSITORY_ID,
} from "./release-identity.mjs";
import { PACKAGE_VERSION, PUBLIC_SUBPATHS } from "./package-identity.mjs";
import { qualificationMatrix } from "./consumer-runtime-matrix.mjs";
import { CI_RUNTIME } from "./runtime-policy.mjs";
import { captureResolutionEvidence } from "./release-consumer-evidence.mjs";
import { physicalName } from "../tooling/artifact-transport/identity.mjs";
import { zipArchive } from "./fixtures/zip-archive.mjs";
import { validateReleaseEvidence } from "./validate-release-evidence.mjs";
import { prepareRecipientMaterial } from "../util/third-party-evidence/recipient-material.mjs";
import { readCanonicalMaterialFromGit } from "./recipient-material-git-source.mjs";
import { qualificationAdvisoryMarker } from "./qualification-advisory-binding.mjs";

// Keep the original v2 policy and model the later public controller with its own immutable registry.
const advisoryCasePath = "docs/release/dependency-advisory-cases.json";
const operationBoundController = "e".repeat(40);
let operationControllerFixture;
const { readControllerBlob } = await import("./release-controller-blob.mjs");
jest.unstable_mockModule("./release-controller-blob.mjs", () => ({
  readControllerBlob: (controller, path) => {
    if (controller === operationBoundController) {
      const { sourceCommit, registry } = operationControllerFixture;
      return path === advisoryCasePath
        ? registry
        : readControllerBlob(sourceCommit, path);
    }
    return path === advisoryCasePath
      ? Buffer.from(stableJson({ schemaVersion: 1, cases: [] }))
      : readControllerBlob(controller, path);
  },
}));

// This test has no GitHub OIDC identity. Keep content binding and archived
// authority selection real, with a local key at the Sigstore boundary.
const sigstore = await import("./release-audit-evaluator-sigstore.mjs");
const testKeys = generateKeyPairSync("ed25519");
jest.unstable_mockModule("./release-audit-evaluator-sigstore.mjs", () => ({
  ...sigstore,
  verifyAuditStatement: async (signature, statement) => {
    if (!verify(null, statement, testKeys.publicKey, signature))
      throw new Error("The archived test signature is invalid");
  },
}));
const { archiveAdvisory, auditPolicySha256 } =
  await import("./release-audit-job.mjs");
const { buildReleaseAuditSubject } =
  await import("./release-audit-evaluator.mjs");
const { readArchivedPublicInputs, verifyArchivedPublicRelease } =
  await import("./public-archive-verification.mjs");
const { readStagedArchive, reconcilePublishedSeal } =
  await import("./staged-release-followup.mjs");
const { assertChannelCompletionEvidence } =
  await import("./release-channel-operation.mjs");
const { publicRecipientInput } = await import("./release-public-proof.mjs");
const { publicLaneKey } = await import("./public-reconciliation-proof.mjs");
const {
  PUBLIC_CONSUMERS,
  packPublicObservation,
  publicIdentity,
  publicPlatform,
  publicResolutionDigest,
} = await import("./public-recipient-observation.mjs");

const source = "a".repeat(40),
  tagObject = "b".repeat(40);
const hash = "a".repeat(64);
const stem = `${PACKAGE_FILE_STEM}-${PACKAGE_VERSION}`;
const archivedFixtureScripts = [
  "installed-package-smoke.mjs",
  "installed-package-boundary.mjs",
  "installed-package-import-purity.mjs",
  "installed-package-no-network.mjs",
  "installed-package-import-closure.mjs",
  "installed-node-transport.mjs",
  "installed-documentation.mjs",
];
const member = (name) => ({ name, bytes: 12, sha256: hash });
const descriptor = {
  artifactDigest: `sha256:${hash}`,
  artifactId: 82,
  jobId: 942,
  signatureSha256: "c".repeat(64),
  statementSha256: "b".repeat(64),
};
const advisory = {
  descriptor,
  policySha256: "d".repeat(64),
  runId: "812",
  attempt: "2",
  controller: source,
};

test("the published evidence schema verifies both current signed decisions", () => {
  const { evidence } = fixture(8);
  expect(() => validateReleaseEvidence(evidence)).not.toThrow();
  const truncated = structuredClone(evidence);
  truncated.stage.stageId = "invalid-uuid";
  truncated.publicVerification.publication.stageId = "invalid-uuid";
  expect(() => validateReleaseEvidence(truncated)).toThrow();
});

function fixture(schemaVersion) {
  const evidence = {
    schemaVersion,
    releaseId: 552,
    source,
    tagObject,
    stage: {
      state: "STAGED",
      ...(schemaVersion === 8
        ? {
            qualificationAdvisory: {
              descriptor,
              policySha256: hash,
              subjectsSha256: hash,
              verifiedAt: "2026-11-26T12:00:00.000Z",
            },
          }
        : {}),
      package: PACKAGE_NAME,
      commit: source,
      version: PACKAGE_VERSION,
      stageId: "00000000-0000-4000-8000-000000000042",
      runId: "42",
      attempt: "1",
    },
    assets: {
      tarball: member(stem + ".tgz"),
      sbom: member(stem + ".cdx.json"),
      checksums: member("SHA256SUMS"),
    },
    archive: member(stem + ".evidence.json.gz"),
    publicVerification: {
      schemaVersion: schemaVersion === 8 ? 2 : 1,
      result: "PASS",
      coordinate: `${PACKAGE_NAME}@${PACKAGE_VERSION}`,
      tarballSha256: hash,
      publication: { stageId: "00000000-0000-4000-8000-000000000042" },
      provenance: {
        workflow: ".github/workflows/stage-release.yml",
        sourceCommit: source,
        runId: "42",
        runAttempt: 1,
      },
    },
    ...(schemaVersion === 8 ? { publicAdvisory: advisory } : {}),
  };
  const completion = {
    releaseId: evidence.releaseId,
    source,
    tagObject,
    version: PACKAGE_VERSION,
    assets: [evidence.archive, ...Object.values(evidence.assets)],
    releaseEvidenceSchema: schemaVersion,
    ...(schemaVersion === 8 ? { publicAdvisory: advisory } : {}),
  };
  return { evidence, completion };
}

test("channel admission follows immutable v8 evidence and refuses a deleted or downgraded advisory marker", () => {
  const { evidence, completion } = fixture(8);
  expect(() =>
    assertChannelCompletionEvidence(completion, evidence),
  ).not.toThrow();
  expect(() =>
    assertChannelCompletionEvidence(
      { ...completion, releaseEvidenceSchema: undefined },
      evidence,
    ),
  ).toThrow("different immutable evidence format");
  expect(() =>
    assertChannelCompletionEvidence(
      { ...completion, publicAdvisory: undefined },
      evidence,
    ),
  ).toThrow("does not bind the admitted public advisory evidence");
  expect(() =>
    validateStagedReleaseEvidence({
      ...evidence,
      schemaVersion: 7,
      publicAdvisory: undefined,
    }),
  ).toThrow();
  const old = fixture(7);
  expect(() =>
    assertChannelCompletionEvidence(old.completion, old.evidence),
  ).not.toThrow();
});

function indexed(version, names) {
  const files = names.map((entry) => {
    const [name, bytes] =
      typeof entry === "string" ? [entry, Buffer.from("fixture")] : entry;
    return {
      name,
      bytes: bytes.length,
      sha256: sha256Buffer(bytes),
      base64: bytes.toString("base64"),
    };
  });
  return gzipSync(
    Buffer.from(
      canonicalJson({ schemaVersion: version, checkpoint: source, files }),
    ),
  );
}

/** Create a signed test receipt with its original evaluator upload identity. */
function signedAdvisory({
  workflow,
  job,
  entries,
  observedAt,
  decidedAt,
  schemaVersion = 2,
  selectedCase,
}) {
  const decision = {
    schemaVersion,
    evaluator: {
      workflow,
      controller: job.head_sha,
      runId: job.run_id,
      attempt: job.run_attempt,
      checkRunId: Number(job.check_run_url.split("/").at(-1)),
    },
    policySha256: auditPolicySha256(job.head_sha),
    subjects: entries
      .map(canonicalJson)
      .sort()
      .map((entry, index) => {
        const original = JSON.parse(entry);
        const result = { ...original, observedAt };
        if (selectedCase?.lockSha256 === original.subject.lockSha256) {
          result.caseEvidence = {
            id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`,
            caseIds: [selectedCase.id],
            expiresAt: selectedCase.expiresAt,
          };
        }
        return result;
      }),
    decidedAt,
    decision: "ACCEPTED",
  };
  const statement = Buffer.from(canonicalJson(decision) + "\n");
  const signature = sign(null, statement, testKeys.privateKey);
  const zip = zipArchive([
    { path: "receipt.json", content: statement },
    { path: "receipt.sigstore.json", content: signature },
  ]);
  const descriptor = {
    artifactDigest: `sha256:${sha256Buffer(zip)}`,
    artifactId: job.id + 2500,
    jobId: job.id,
    signatureSha256: sha256Buffer(signature),
    statementSha256: sha256Buffer(statement),
  };
  return { descriptor, decision, job, statement, signature };
}

function evaluatorJob(controller, runId, id, runner, startedAt, completedAt) {
  return {
    id,
    name: "Release advisory / Evaluate",
    run_id: Number(runId),
    run_attempt: 1,
    head_sha: controller,
    runner_id: 12,
    labels: [runner],
    check_run_url: `https://api.github.com/repos/${REPOSITORY}/check-runs/${id + 1500}`,
    status: "completed",
    conclusion: "success",
    started_at: startedAt,
    completed_at: completedAt,
  };
}

test("reconciled indexed archives require native and signed originals and cannot carry obsolete raw audits", () => {
  const names = [
    "public-native.json",
    "public-material.json",
    "public-advisory.json",
    "public-advisory.sigstore.json",
    "public-advisory-job.json",
    "qualified-runtime-policy.json",
    "qualification-advisory.json",
    "qualification-advisory.sigstore.json",
    "qualification-advisory-job.json",
    "recipient-input.json",
  ];
  expect(readStagedArchive(indexed(3, names)).schemaVersion).toBe(3);
  expect(() => readStagedArchive(indexed(3, names.slice(1)))).toThrow(
    "Missing reconciled public archive evidence",
  );
  expect(() =>
    readStagedArchive(indexed(3, [...names, "npm-audit-full.json"])),
  ).toThrow("Raw npm audit output");
  const unapprovedZip = zipArchive([
    { path: "nested/npm-audit-full.json", content: Buffer.from("fixture") },
  ]);
  expect(() =>
    readStagedArchive(indexed(3, [...names, ["extra.zip", unapprovedZip]])),
  ).toThrow(/qualification ZIP roster/u);
  expect(() =>
    readStagedArchive(indexed(3, [...names, ["extra.json", unapprovedZip]])),
  ).toThrow(/qualification ZIP roster/u);
  const nativeZip = zipArchive([
    { path: "manifest.json", content: Buffer.from("{}") },
  ]);
  const qualification = (zip) => [
    "manifest.json",
    Buffer.from(
      stableJson({
        schemaVersion: 1,
        artifacts: [
          { id: 42, bytes: zip.length, digest: `sha256:${sha256Buffer(zip)}` },
        ],
      }),
    ),
  ];
  expect(
    readStagedArchive(
      indexed(3, [
        ...names,
        qualification(nativeZip),
        ["artifact-42.zip", nativeZip],
      ]),
    ).files.get("artifact-42.zip"),
  ).toEqual(nativeZip);
  expect(() =>
    readStagedArchive(
      indexed(3, [
        ...names,
        qualification(unapprovedZip),
        ["artifact-42.zip", unapprovedZip],
      ]),
    ),
  ).toThrow(/raw npm audit output/u);
  expect(
    readStagedArchive(
      indexed(2, [["artifact-42.zip", unapprovedZip]]),
    ).files.get("artifact-42.zip"),
  ).toEqual(unapprovedZip);
  expect(
    readStagedArchive(indexed(2, ["recipient-input.json"])).schemaVersion,
  ).toBe(2);
});

test("a lost seal acknowledgement preserves the exact admitted advisory marker during reconciliation", async () => {
  const { completion } = fixture(8);
  const notes = "Reviewed staged release";
  const request = {
    ...completion,
    state: "SEAL_REQUESTED",
    authorizedAt: "2026-11-26T12:35:00.500Z",
    prerelease: true,
    notesSha256: sha256Buffer(Buffer.from(notes)),
  };
  const client = {
    async read(path) {
      expect(path).toBe(`/releases/${request.releaseId}`);
      return {
        id: request.releaseId,
        tag_name: `v${PACKAGE_VERSION}`,
        immutable: true,
        draft: false,
        published_at: "2026-11-26T12:35:00Z",
        prerelease: true,
        name: `owlapi ${PACKAGE_VERSION}`,
        body: notes,
        assets: request.assets.map((item, index) => ({
          id: index + 1,
          name: item.name,
          size: item.bytes,
          digest: `sha256:${item.sha256}`,
        })),
      };
    },
  };
  await expect(reconcilePublishedSeal(client, request)).resolves.toMatchObject({
    state: "SEALED",
    releaseEvidenceSchema: 8,
    publicAdvisory: advisory,
  });
  await expect(
    reconcilePublishedSeal(client, {
      ...request,
      authorizedAt: "2026-11-26T12:35:01.000Z",
    }),
  ).rejects.toThrow("postdates provider publication");
});

async function prepareArchivedPublicFixture(root, { caseExpiresAt } = {}) {
  const npmCli = process.env.npm_execpath;
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
    windowsHide: true,
  }).trim();
  expect(() =>
    readCanonicalMaterialFromGit(sourceCommit)("package-lock.json", 16),
  ).toThrow(/unavailable or oversized/u);
  expect(() =>
    readCanonicalMaterialFromGit("0".repeat(40))(
      "package-lock.json",
      2 * 1024 * 1024,
    ),
  ).toThrow(/unavailable or oversized/u);
  const leafName = "@rdfjs/data-model";
  const leafPath = `node_modules/${leafName}`;
  const sourceLock = JSON.parse(
    execFileSync(
      "git",
      ["cat-file", "blob", `${sourceCommit}:package-lock.json`],
      {
        cwd: new URL("../", import.meta.url),
        windowsHide: true,
        maxBuffer: 2 * 1024 * 1024,
      },
    ),
  );
  const leaf = sourceLock.packages[leafPath];
  const leafManifest = readFileSync(
    new URL(`../${leafPath}/package.json`, import.meta.url),
  );
  expect(JSON.parse(leafManifest)).toMatchObject({
    name: leafName,
    version: leaf.version,
    license: "MIT",
  });
  const firstParty = {
    name: PACKAGE_NAME,
    version: PACKAGE_VERSION,
    type: "module",
    exports: {
      ".": "./index.js",
      "./model/legacy": "./model/legacy/index.js",
      "./io/node": "./io/node/index.js",
    },
    dependencies: { [leafName]: leaf.version },
  };
  mkdirSync(join(root, "package"));
  writeFileSync(join(root, "package/package.json"), stableJson(firstParty));
  for (const target of Object.values(firstParty.exports)) {
    const path = join(root, "package", target);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "export {};\n");
  }
  const archivePath = join(root, "candidate.tgz");
  await createRequire(npmCli)("tar").c(
    {
      file: archivePath,
      cwd: root,
      gzip: true,
      portable: true,
      noMtime: true,
    },
    ["package"],
  );
  const tarball = readFileSync(archivePath);
  const archivedSubpaths = ["", "/model/legacy", "/io/node"];
  expect(archivedSubpaths).not.toEqual(PUBLIC_SUBPATHS);
  const registryTarball = `https://registry.npmjs.org/${PACKAGE_NAME}/-/owlapi-${PACKAGE_VERSION}.tgz`;
  const integrity =
    "sha512-" + createHash("sha512").update(tarball).digest("base64");
  const publicController = caseExpiresAt
    ? operationBoundController
    : sourceCommit;
  const { evidence: published } = fixture(8);
  published.source = sourceCommit;
  published.stage.commit = sourceCommit;
  published.publicAdvisory = {
    ...published.publicAdvisory,
    controller: publicController,
  };
  published.assets.tarball.bytes = tarball.length;
  published.assets.tarball.sha256 = sha256Buffer(tarball);
  published.publicVerification.tarballSha256 = published.assets.tarball.sha256;
  published.publicVerification.tarballUrl = registryTarball;
  published.publicVerification.integrity = integrity;
  published.publicVerification.provenance.sourceCommit = sourceCommit;
  // Use the available native producer npm for a historical fixture policy
  // that covers its Node family on every retained platform without provisioning.
  const family = CI_RUNTIME.canonicalNodeMajor;
  const originalPolicy = {
    ...CI_RUNTIME,
    minimums: CI_RUNTIME.minimums.filter((version) =>
      version.startsWith(`${family}.`),
    ),
    node: { [family]: CI_RUNTIME.node[family] },
    consumerNpm: CI_RUNTIME.npm,
  };
  const versions = [
    ...new Set([...CI_RUNTIME.minimums, ...Object.values(CI_RUNTIME.node)]),
  ].map((version) => ({ version: `v${version}` }));
  const matrix = qualificationMatrix(versions, originalPolicy);
  expect(matrix.policySha256).not.toBe(
    qualificationMatrix(versions).policySha256,
  );
  const manifest = {
    schemaVersion: 1,
    consumerResolutionPolicy: 2,
    package: { name: PACKAGE_NAME, version: PACKAGE_VERSION },
    integrity,
    assets: published.assets,
    commit: published.source,
    runId: "514",
    attempt: "1",
    runtimeMatrix: matrix,
  };
  const originals = new Map();
  const put = (name, value) =>
    originals.set(name, Buffer.from(stableJson(value)));
  put("manifest.json", manifest);
  put("qualified-runtime-policy.json", originalPolicy);
  const producerDirectory = join(root, "qualification-producer");
  cpSync(join(root, "package"), producerDirectory, { recursive: true });
  mkdirSync(join(producerDirectory, leafPath), { recursive: true });
  writeFileSync(
    join(producerDirectory, leafPath, "package.json"),
    leafManifest,
  );
  writeFileSync(
    join(producerDirectory, "package-lock.json"),
    stableJson({
      lockfileVersion: 3,
      packages: { "": firstParty, [leafPath]: leaf },
    }),
  );
  const qualification = await captureResolutionEvidence(producerDirectory, {
    tarball,
    npmCli,
  });
  const qualificationSubject = buildReleaseAuditSubject({
    tarballSha256: published.assets.tarball.sha256,
    manifestBytes: Buffer.from(qualification.manifest),
    lockBytes: Buffer.from(qualification.lock),
    graphSha256: publicResolutionDigest(qualification.resolution.graph),
    role: "producer",
    scope: "production",
    platform: {
      ...qualification.resolution.platform,
      npm: qualification.resolution.npm,
    },
  });
  const runner = CI_RUNTIME.consumerPlatforms.find(
    ({ os }) => os === "linux",
  ).runner;
  const qualified = signedAdvisory({
    workflow: ".github/workflows/release.yml",
    job: evaluatorJob(
      sourceCommit,
      manifest.runId,
      560,
      runner,
      "2026-11-24T12:00:00Z",
      "2026-11-24T12:05:00Z",
    ),
    entries: [
      {
        subject: qualificationSubject,
        source: {
          repositoryId: REPOSITORY_ID,
          commit: sourceCommit,
          runId: Number(manifest.runId),
          attempt: Number(manifest.attempt),
          jobId: 556,
          artifactSha256: "e".repeat(64),
        },
      },
    ],
    observedAt: "2026-11-24T12:02:00.000Z",
    decidedAt: "2026-11-24T12:03:00.000Z",
  });
  archiveAdvisory(originals, "qualification", qualified);
  const { state, stageId, ...stage } = published.stage;
  const stageRequest = {
    ...stage,
    schemaVersion: 1,
    workflow: ".github/workflows/stage-release.yml",
    manifestSha256: sha256Buffer(originals.get("manifest.json")),
    qualificationRun: manifest.runId,
    qualificationAttempt: manifest.attempt,
    channel: "pilot",
    controller: sourceCommit,
    qualificationAdvisory: qualificationAdvisoryMarker({
      ...qualified,
      verificationTime: Date.parse("2026-11-24T12:06:00.000Z"),
    }),
  };
  published.stage = { ...stageRequest, state, stageId };
  originals.set(
    "stage-journal.jsonl",
    Buffer.from(
      [{ ...stageRequest, state: "REQUESTED" }, published.stage]
        .map((row) => JSON.stringify(row) + "\n")
        .join(""),
    ),
  );
  const origin = {
    commit: publicController,
    run: advisory.runId,
    attempt: advisory.attempt,
  };
  const operation = {
    type: "seal",
    source: sourceCommit,
    tagObject,
    releaseId: published.releaseId,
    manifestSha256: stageRequest.manifestSha256,
    stageRun: stageRequest.runId,
    stageAttempt: stageRequest.attempt,
    stageController: stageRequest.controller,
    publicRun: origin.run,
    publicAttempt: origin.attempt,
    publicController: origin.commit,
  };
  const input = publicRecipientInput(
    { operation, manifest, receipt: published.stage },
    matrix,
    { reconciled: true },
  );
  put("operation.json", operation);
  put("recipient-input.json", input);
  put("public.json", published.publicVerification);
  const consumers = {};
  for (const [mode, dependencyName] of Object.entries(PUBLIC_CONSUMERS)) {
    const directory = join(root, mode);
    const installed = join(directory, `node_modules/${dependencyName}`);
    mkdirSync(installed, { recursive: true });
    cpSync(join(root, "package"), installed, { recursive: true });
    mkdirSync(join(directory, leafPath), { recursive: true });
    writeFileSync(join(directory, leafPath, "package.json"), leafManifest);
    const identity = {
      ...publicIdentity(mode, input, registryTarball),
      importSpecifiers: archivedSubpaths.map((path) => dependencyName + path),
    };
    const consumer = {
      name: "owlapi-registry-consumer",
      private: true,
      dependencies: { [dependencyName]: identity.specifier },
    };
    writeFileSync(join(directory, "package.json"), stableJson(consumer));
    writeFileSync(
      join(directory, "package-lock.json"),
      stableJson({
        lockfileVersion: 3,
        packages: {
          "": consumer,
          [`node_modules/${dependencyName}`]: {
            name: PACKAGE_NAME,
            version: PACKAGE_VERSION,
            dependencies: firstParty.dependencies,
            resolved: registryTarball,
            integrity,
          },
          [leafPath]: leaf,
        },
      }),
    );
    consumers[mode] = {
      identity,
      evidence: await captureResolutionEvidence(directory, {
        tarball,
        dependencyName,
        npmCli,
        registryTarball,
      }),
    };
  }
  let nextId = 0;
  const native = (prefix, attempt = Number(origin.attempt)) => {
    const id = ++nextId;
    return {
      source: {
        repositoryId: REPOSITORY_ID,
        commit: origin.commit,
        runId: Number(origin.run),
        attempt,
        jobId: id,
        artifactSha256: hash,
      },
      artifact: {
        id,
        bytes: 12,
        digest: `sha256:${hash}`,
        name: physicalName({
          logical: `${prefix}-${attempt}`,
          run: origin.run,
          attempt: String(attempt),
          producer: "a".repeat(16),
          invocation: "b".repeat(32),
          ordinal: 0,
        }),
      },
    };
  };
  const index = {
    schemaVersion: 3,
    registry: native(`release-registry-${origin.run}`, 1),
    material: {
      ...native(`public-material-${origin.run}`, 1),
      execution: {
        startedAt: "2026-11-26T11:59:59Z",
        completedAt: "2026-11-26T12:00:01Z",
      },
    },
    lanes: {},
    originals: {},
  };
  const material = {
    schemaVersion: 2,
    origin: { ...origin, attempt: "1" },
    input,
    lanes: {},
    originals: {},
  };
  const tests = new Map();
  const publicEntries = [];
  const evaluator = evaluatorJob(
    origin.commit,
    origin.run,
    published.publicAdvisory.descriptor.jobId,
    runner,
    "2026-11-26T12:00:02Z",
    "2026-11-26T12:00:04Z",
  );
  const materialWriter = await prepareRecipientMaterial({ npmCli });
  for (const lane of matrix.include) {
    const laneKey = publicLaneKey(lane);
    const platform = publicPlatform(lane);
    const observed = Object.fromEntries(
      Object.entries(consumers).map(([mode, consumer]) => [
        mode,
        {
          ...consumer,
          evidence: {
            ...consumer.evidence,
            resolution: {
              ...consumer.evidence.resolution,
              platform,
              npm: originalPolicy.consumerNpm,
            },
          },
        },
      ]),
    );
    const packed = packPublicObservation({
      lane,
      input,
      origin: { ...origin, attempt: "1" },
      consumers: observed,
    });
    const observation = native(`public-observation-${laneKey}`, 1);
    const testAttempt = lane === matrix.include[0] ? 1 : 2;
    const tested = {
      ...native(`public-recipient-${laneKey}`, testAttempt),
      execution:
        testAttempt === 1
          ? {
              startedAt: "2026-11-26T12:00:04Z",
              completedAt: "2026-11-26T12:01:04Z",
            }
          : {
              startedAt: "2026-11-26T12:05:00Z",
              completedAt: "2026-11-26T12:06:00Z",
            },
    };
    index.lanes[laneKey] = {
      ...observation,
      packet: packed.index,
      tests: tested,
    };
    Object.assign(index.originals, packed.originals);
    const decisions = {},
      testedConsumers = {};
    for (const [
      mode,
      {
        evidence: { resolution, lock },
      },
    ] of Object.entries(observed)) {
      const resolutionSha256 = packed.index[mode].resolution;
      const materialDirectory = join(root, `material-${laneKey}-${mode}`);
      const nativeMaterial = await materialWriter.collect({
        directory: materialDirectory,
        resolution,
        lockfileBytes: Buffer.from(lock),
      });
      expect(nativeMaterial.status).toBe("PASSED");
      expect(nativeMaterial.artifacts).toMatchObject([
        {
          name: leafName,
          integrity: leaf.integrity,
          source: "CANONICAL_CORPUS",
        },
      ]);
      const savedMaterial = readFileSync(
        join(materialDirectory, "recipient-material.json"),
        "utf8",
      );
      const materialSha256 = sha256Buffer(Buffer.from(savedMaterial));
      const subject = {
        tarballSha256: resolution.tarballSha256,
        manifestSha256: resolution.manifestSha256,
        lockSha256: resolution.lockSha256,
        graphSha256: publicResolutionDigest(resolution.graph),
        role: "recipient",
        scope: "production",
        platform: { ...platform, npm: originalPolicy.consumerNpm },
      };
      const decision = stableJson({
        schemaVersion: 1,
        result: "PASS",
        role: `public-${mode}`,
        observedAt: "2026-11-26T12:00:00Z",
        resolutionSha256,
        materialSha256,
        subject,
      });
      publicEntries.push({ subject, source: observation.source });
      material.originals[materialSha256] = savedMaterial;
      const decisionSha256 = sha256Buffer(Buffer.from(decision));
      material.originals[decisionSha256] = decision;
      decisions[mode] = decisionSha256;
      testedConsumers[mode] = {
        resolutionSha256,
        decisionSha256,
        installedTests: archivedFixtureScripts,
      };
    }
    material.lanes[laneKey] = { ...observation, decisions };
    tests.set(laneKey, {
      schemaVersion: 2,
      lane,
      input,
      origin: { ...origin, attempt: String(testAttempt) },
      observation: observation.artifact,
      consumers: testedConsumers,
    });
  }
  let selectedCase;
  if (caseExpiresAt) {
    selectedCase = {
      id: "public-retain-original",
      kind: "RETAIN_ORIGINAL",
      role: "recipient",
      scope: "production",
      lockSha256: publicEntries[0].subject.lockSha256,
      owner: "fixture-owner",
      review: "GHSA-2222-3333-4444",
      approvedAt: "2026-11-26T11:00:00.000Z",
      expiresAt: caseExpiresAt,
    };
    operationControllerFixture = {
      sourceCommit,
      registry: Buffer.from(
        stableJson({
          schemaVersion: 2,
          receiptSchemaVersion: 3,
          cases: [selectedCase],
        }),
      ),
    };
  }
  const cleared = signedAdvisory({
    workflow: ".github/workflows/release-registry.yml",
    job: evaluator,
    entries: publicEntries,
    observedAt: "2026-11-26T12:00:02.000Z",
    decidedAt: "2026-11-26T12:00:03.500Z",
    schemaVersion: selectedCase ? 3 : 2,
    selectedCase,
  });
  archiveAdvisory(originals, "public", cleared);
  published.publicAdvisory.descriptor = cleared.descriptor;
  published.publicAdvisory.policySha256 = cleared.decision.policySha256;
  put("public-native.json", index);
  const publishMaterial = (files, material, tests) => {
    const materialBytes = Buffer.from(stableJson(material));
    files.set("public-material.json", materialBytes);
    const materialSha256 = sha256Buffer(materialBytes);
    for (const [key, proof] of tests)
      files.set(
        `public-recipient-${key}.json`,
        Buffer.from(
          stableJson({
            ...proof,
            materialSha256,
            advisory: published.publicAdvisory.descriptor,
          }),
        ),
      );
  };
  publishMaterial(originals, material, tests);
  const client = {
    async read() {
      throw Object.assign(new Error("Actions artifacts have expired"), {
        httpStatus: 410,
      });
    },
  };
  const archiveBytes = indexed(3, [...originals]);
  published.archive.bytes = archiveBytes.length;
  published.archive.sha256 = sha256Buffer(archiveBytes);
  validateStagedReleaseEvidence(published);
  const archive = readStagedArchive(archiveBytes);
  const recovered = {
    tarball,
    npmCli,
    client,
    sealAuthorizedAt: "2026-11-26T12:06:01.000Z",
    publishedAt: "2026-11-27T13:00:00Z",
  };
  return {
    originals: archive.files,
    published,
    recovered,
    stageRequest,
    matrix,
    index,
    evaluator,
    leafPath,
    leafName,
    material,
    tests,
    publishMaterial,
  };
}

describe("archived native public release", () => {
  let root, fixture;
  beforeAll(async () => {
    const temp = realpathSync(tmpdir());
    root = mkdtempSync(join(temp, "owlapi-archive-native-test-"));
    expect(isStrictDescendantPath(temp, root)).toBe(true);
    fixture = await prepareArchivedPublicFixture(root);
  });
  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  test("reopens the complete staged public matrix and both decisions after Actions expiry", async () => {
    const { originals, published, recovered, stageRequest } = fixture;
    await expect(
      verifyArchivedPublicRelease(originals, published, recovered),
    ).resolves.toEqual(published.publicAdvisory);
    await expect(
      verifyArchivedPublicRelease(originals, published, {
        ...recovered,
        sealAuthorizedAt: "2026-11-27T12:30:00.000Z",
      }),
    ).rejects.toThrow("Release audit observation is stale or inconsistent");
    const changedStage = new Map(originals);
    const alteredAck = { ...published.stage, channel: "latest" };
    changedStage.set(
      "stage-journal.jsonl",
      Buffer.from(
        `${JSON.stringify({ ...stageRequest, state: "REQUESTED" })}\n${JSON.stringify(alteredAck)}\n`,
      ),
    );
    await expect(
      verifyArchivedPublicRelease(changedStage, published, recovered),
    ).rejects.toThrow(
      "Staging acknowledgement differs from its original request",
    );
  });

  const expectInvalidIndex = async (mutate, expected) => {
    const { originals, published, recovered, index } = fixture;
    const invalid = structuredClone(index);
    mutate(invalid);
    const changed = new Map(originals).set(
      "public-native.json",
      Buffer.from(stableJson(invalid)),
    );
    await expect(
      readArchivedPublicInputs(changed, published, recovered),
    ).rejects.toThrow(expected);
  };
  test("replays the original runtime, export and archive identities", async () => {
    const { originals, published, recovered, matrix, leafPath, leafName } =
      fixture;
    const firstLane = publicLaneKey(matrix.include[0]);
    const accepted = await readArchivedPublicInputs(
      originals,
      published,
      recovered,
    );
    expect(accepted.entries).toHaveLength(matrix.include.length * 2);
    expect(accepted.lastTestCompletion).toBe(
      Date.parse("2026-11-26T12:06:00Z"),
    );
    const contradictoryReport = {
      ...published.publicVerification,
      integrity: "sha512-" + Buffer.alloc(64).toString("base64"),
    };
    const changedReport = new Map(originals).set(
      "public.json",
      Buffer.from(stableJson(contradictoryReport)),
    );
    await expect(
      readArchivedPublicInputs(
        changedReport,
        { ...published, publicVerification: contradictoryReport },
        recovered,
      ),
    ).rejects.toThrow("Archived registry SRI differs");
    await expectInvalidIndex((invalid) => {
      invalid.lanes[firstLane].packet.alias.identity.importSpecifiers = [
        "owlapi",
        "owlapi/io/node",
        "owlapi/io/node",
      ];
    }, "Archived public identity differs from the published package");
    await expectInvalidIndex((invalid) => {
      const packet = invalid.lanes[firstLane].packet.alias;
      const lock = JSON.parse(invalid.originals[packet.lock]);
      const resolution = JSON.parse(invalid.originals[packet.resolution]);
      const integrity =
        "sha512-" +
        createHash("sha512")
          .update("contradictory registry occurrence")
          .digest("base64");
      lock.packages[leafPath].integrity = integrity;
      const lockBytes = stableJson(lock);
      packet.lock = sha256Buffer(Buffer.from(lockBytes));
      invalid.originals[packet.lock] = lockBytes;
      resolution.lockSha256 = packet.lock;
      resolution.graph.nodes.find(
        ({ location }) => location === leafPath,
      ).integrity = integrity;
      const resolutionBytes = stableJson(resolution);
      delete invalid.originals[packet.resolution];
      packet.resolution = sha256Buffer(Buffer.from(resolutionBytes));
      invalid.originals[packet.resolution] = resolutionBytes;
    }, "Inconsistent observed archive for " + leafName);
  });

  test("checks the material and advisory timeline for each original attempt", async () => {
    const { originals, published, recovered, matrix, evaluator } = fixture;
    const firstLane = publicLaneKey(matrix.include[0]);
    await expectInvalidIndex((invalid) => {
      invalid.material.execution.startedAt = "2026-11-26T12:00:01Z";
    }, "Public material decision is outside its original execution");
    await expectInvalidIndex((invalid) => {
      invalid.lanes[firstLane].tests.execution.startedAt =
        "2026-11-26T12:00:00Z";
    }, "Public replay preceded the original material job");
    await expectInvalidIndex((invalid) => {
      invalid.lanes[firstLane].tests.execution.startedAt =
        "2026-11-26T12:00:03Z";
    }, "Public replay preceded the original advisory job");
    const changed = new Map(originals).set(
      "public-advisory-job.json",
      Buffer.from(stableJson({ ...evaluator, run_attempt: 2 })),
    );
    await expect(
      readArchivedPublicInputs(changed, published, recovered),
    ).rejects.toThrow("earlier attempt than its advisory");
  });

  test("requires every original material decision and the original fixture roster", async () => {
    const { originals, published, recovered, matrix, publishMaterial } =
      fixture;
    const material = structuredClone(fixture.material);
    const tests = structuredClone(fixture.tests);
    const changedFiles = new Map(originals);
    const firstLane = publicLaneKey(matrix.include[0]);
    const decisionSha256 = material.lanes[firstLane].decisions.alias;
    const decision = JSON.parse(material.originals[decisionSha256]);
    const saved = material.originals[decision.materialSha256];
    const changed = JSON.parse(saved);
    changed.artifacts[0].scan.evidence.sha256 = "f".repeat(64);
    const changedBytes = stableJson(changed);
    const changedHash = sha256Buffer(Buffer.from(changedBytes));
    const changedDecision = stableJson({
      ...decision,
      materialSha256: changedHash,
    });
    const changedDecisionHash = sha256Buffer(Buffer.from(changedDecision));
    delete material.originals[decision.materialSha256];
    delete material.originals[decisionSha256];
    material.originals[changedHash] = changedBytes;
    material.originals[changedDecisionHash] = changedDecision;
    material.lanes[firstLane].decisions.alias = changedDecisionHash;
    tests.get(firstLane).consumers.alias.decisionSha256 = changedDecisionHash;
    publishMaterial(changedFiles, material, tests);
    await expect(
      readArchivedPublicInputs(changedFiles, published, recovered),
    ).rejects.toThrow(/material decision differs/u);
    delete material.originals[changedHash];
    publishMaterial(changedFiles, material, tests);
    await expect(
      readArchivedPublicInputs(changedFiles, published, recovered),
    ).rejects.toThrow();
    const testName = `public-recipient-${firstLane}.json`;
    const missingTest = new Map(originals);
    missingTest.delete(testName);
    await expect(
      readArchivedPublicInputs(missingTest, published, recovered),
    ).rejects.toThrow();
    const alteredTests = JSON.parse(originals.get(testName));
    alteredTests.consumers.scoped.installedTests.pop();
    const alteredRoster = new Map(originals).set(
      testName,
      Buffer.from(stableJson(alteredTests)),
    );
    await expect(
      readArchivedPublicInputs(alteredRoster, published, recovered),
    ).rejects.toThrow(
      "Public tests did not use the required fixtures and inputs",
    );
  });
});

test("an archived v3 public advisory survives 24 hours and respects its selected case deadline", async () => {
  const temp = realpathSync(tmpdir());
  const root = mkdtempSync(join(temp, "owlapi-archive-v3-test-"));
  expect(isStrictDescendantPath(temp, root)).toBe(true);
  try {
    const caseExpiresAt = "2026-11-28T12:00:02.000Z";
    const { originals, published, recovered, evaluator } =
      await prepareArchivedPublicFixture(root, { caseExpiresAt });
    const decision = JSON.parse(originals.get("public-advisory.json"));
    expect(decision.schemaVersion).toBe(3);
    expect(published.publicAdvisory.controller).toBe(operationBoundController);
    expect(JSON.parse(originals.get("public-advisory-job.json"))).toEqual(
      evaluator,
    );
    expect(decision.subjects).toContainEqual(
      expect.objectContaining({
        caseEvidence: expect.objectContaining({
          caseIds: ["public-retain-original"],
          expiresAt: caseExpiresAt,
        }),
      }),
    );
    const sealAuthorizedAt = "2026-11-28T12:00:01.999Z";
    expect(
      Date.parse(sealAuthorizedAt) - Date.parse(decision.decidedAt),
    ).toBeGreaterThan(24 * 60 * 60_000);
    const release = { ...recovered, publishedAt: "2026-11-28T12:00:10Z" };
    await expect(
      verifyArchivedPublicRelease(originals, published, {
        ...release,
        sealAuthorizedAt,
      }),
    ).resolves.toEqual(published.publicAdvisory);
    await expect(
      verifyArchivedPublicRelease(originals, published, {
        ...release,
        sealAuthorizedAt: caseExpiresAt,
      }),
    ).rejects.toThrow("Private advisory case evidence is invalid or expired");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
