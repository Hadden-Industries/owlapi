import { expect, test } from "@jest/globals";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalJson, stableJson } from "./canonical-json.mjs";
import { sha256Buffer, isStrictDescendantPath } from "./release-file-utils.mjs";
import { assertChannelCompletionEvidence } from "./release-channel-operation.mjs";
import { validateStagedReleaseEvidence } from "./staged-evidence.mjs";
import {
  readStagedArchive,
  reconcilePublishedSeal,
} from "./staged-release-followup.mjs";
import {
  PACKAGE_FILE_STEM,
  PACKAGE_NAME,
  REPOSITORY_ID,
} from "./release-identity.mjs";
import { PACKAGE_VERSION } from "./package-identity.mjs";
import { qualificationMatrix } from "./consumer-runtime-matrix.mjs";
import { CI_RUNTIME } from "./runtime-policy.mjs";
import { captureResolutionEvidence } from "./release-consumer-evidence.mjs";
import { publicRecipientInput } from "./release-public-proof.mjs";
import { publicLaneKey } from "./public-reconciliation-proof.mjs";
import {
  PUBLIC_CONSUMERS,
  packPublicObservation,
  publicIdentity,
  publicPlatform,
  publicResolutionDigest,
} from "./public-recipient-observation.mjs";
import { INSTALLED_TEST_SCRIPTS } from "./installed-consumer-fixtures.mjs";
import { physicalName } from "../tooling/artifact-transport/identity.mjs";
import { readArchivedPublicInputs } from "./public-archive-verification.mjs";
import { validateReleaseEvidence } from "./validate-release-evidence.mjs";
import { prepareRecipientMaterial } from "../util/third-party-evidence/recipient-material.mjs";
import { readCanonicalMaterialFromGit } from "./recipient-material-git-source.mjs";

const source = "a".repeat(40),
  tagObject = "b".repeat(40);
const hash = "a".repeat(64);
const stem = `${PACKAGE_FILE_STEM}-${PACKAGE_VERSION}`;
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
  const files = names.map((name) => {
    const bytes = Buffer.from("fixture");
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
});

test("reopens the complete staged public matrix and original material after Actions expiry", async () => {
  const npmCli = process.env.OWLAPI_CONSUMER_NPM ?? process.env.npm_execpath;
  const temp = realpathSync(tmpdir());
  const root = mkdtempSync(join(temp, "owlapi-archive-native-test-"));
  expect(isStrictDescendantPath(temp, root)).toBe(true);
  try {
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
      dependencies: { [leafName]: leaf.version },
    };
    mkdirSync(join(root, "package"));
    writeFileSync(join(root, "package/package.json"), stableJson(firstParty));
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
    const registryTarball = `https://registry.npmjs.org/${PACKAGE_NAME}/-/owlapi-${PACKAGE_VERSION}.tgz`;
    const integrity =
      "sha512-" + createHash("sha512").update(tarball).digest("base64");
    const { evidence: published } = fixture(8);
    published.source = sourceCommit;
    published.stage.commit = sourceCommit;
    published.publicAdvisory = {
      ...published.publicAdvisory,
      controller: sourceCommit,
    };
    published.assets.tarball.sha256 = sha256Buffer(tarball);
    published.publicVerification.tarballSha256 =
      published.assets.tarball.sha256;
    published.publicVerification.tarballUrl = registryTarball;
    published.publicVerification.provenance.sourceCommit = sourceCommit;
    const originalPolicy = { ...CI_RUNTIME, npmMinimum: "10.0.0" };
    const versions = [
      ...new Set([...CI_RUNTIME.minimums, ...Object.values(CI_RUNTIME.node)]),
    ].map((version) => ({ version: `v${version}` }));
    const matrix = qualificationMatrix(versions, originalPolicy);
    expect(matrix.policySha256).not.toBe(
      qualificationMatrix(versions).policySha256,
    );
    const manifest = {
      schemaVersion: 1,
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
    const origin = {
      commit: sourceCommit,
      run: advisory.runId,
      attempt: advisory.attempt,
    };
    const operation = {
      type: "seal",
      source: sourceCommit,
      tagObject,
      releaseId: published.releaseId,
      manifestSha256: sha256Buffer(originals.get("manifest.json")),
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
      writeFileSync(join(installed, "package.json"), stableJson(firstParty));
      mkdirSync(join(directory, leafPath), { recursive: true });
      writeFileSync(join(directory, leafPath, "package.json"), leafManifest);
      const identity = publicIdentity(mode, input, registryTarball);
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
    const native = (logical) => {
      const id = ++nextId;
      return {
        source: {
          repositoryId: REPOSITORY_ID,
          commit: origin.commit,
          runId: Number(origin.run),
          attempt: Number(origin.attempt),
          jobId: id,
          artifactSha256: hash,
        },
        artifact: {
          id,
          bytes: 12,
          digest: `sha256:${hash}`,
          name: physicalName({
            logical,
            run: origin.run,
            attempt: origin.attempt,
            producer: "a".repeat(16),
            invocation: "b".repeat(32),
            ordinal: 0,
          }),
        },
      };
    };
    const index = {
      schemaVersion: 2,
      registry: native(`release-registry-${origin.run}-${origin.attempt}`),
      material: native(`public-material-${origin.run}-${origin.attempt}`),
      lanes: {},
      originals: {},
    };
    const material = {
      schemaVersion: 2,
      origin,
      input,
      lanes: {},
      originals: {},
    };
    const tests = new Map();
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
                npm: CI_RUNTIME.consumerNpm,
              },
            },
          },
        ]),
      );
      const packed = packPublicObservation({
        lane,
        input,
        origin,
        consumers: observed,
      });
      const observation = native(
        `public-observation-${laneKey}-${origin.attempt}`,
      );
      const tested = native(`public-recipient-${laneKey}-${origin.attempt}`);
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
        const decision = stableJson({
          schemaVersion: 1,
          result: "PASS",
          role: `public-${mode}`,
          observedAt: "2026-11-26T12:00:00Z",
          resolutionSha256,
          materialSha256,
          subject: {
            tarballSha256: resolution.tarballSha256,
            manifestSha256: resolution.manifestSha256,
            lockSha256: resolution.lockSha256,
            graphSha256: publicResolutionDigest(resolution.graph),
            role: "recipient",
            scope: "production",
            platform: { ...platform, npm: CI_RUNTIME.consumerNpm },
          },
        });
        material.originals[materialSha256] = savedMaterial;
        const decisionSha256 = sha256Buffer(Buffer.from(decision));
        material.originals[decisionSha256] = decision;
        decisions[mode] = decisionSha256;
        testedConsumers[mode] = {
          resolutionSha256,
          decisionSha256,
          installedTests: INSTALLED_TEST_SCRIPTS,
        };
      }
      material.lanes[laneKey] = { ...observation, decisions };
      tests.set(laneKey, {
        schemaVersion: 2,
        lane,
        input,
        origin,
        observation: observation.artifact,
        consumers: testedConsumers,
        advisory: published.publicAdvisory.descriptor,
      });
    }
    put("public-native.json", index);
    const publishMaterial = () => {
      put("public-material.json", material);
      const materialSha256 = sha256Buffer(
        originals.get("public-material.json"),
      );
      for (const [key, proof] of tests)
        put(`public-recipient-${key}.json`, { ...proof, materialSha256 });
    };
    publishMaterial();
    const client = {
      async read() {
        throw new Error("Actions artifacts have expired");
      },
    };
    const accepted = await readArchivedPublicInputs(originals, published, {
      tarball,
      npmCli,
      client,
    });
    expect(accepted.entries).toHaveLength(matrix.include.length * 2);
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
    publishMaterial();
    await expect(
      readArchivedPublicInputs(originals, published, { tarball, npmCli }),
    ).rejects.toThrow(/material decision differs/u);
    delete material.originals[changedHash];
    publishMaterial();
    await expect(
      readArchivedPublicInputs(originals, published, { tarball, npmCli }),
    ).rejects.toThrow();
    material.originals[decision.materialSha256] = saved;
    material.originals[decisionSha256] = stableJson(decision);
    delete material.originals[changedHash];
    delete material.originals[changedDecisionHash];
    material.lanes[firstLane].decisions.alias = decisionSha256;
    tests.get(firstLane).consumers.alias.decisionSha256 = decisionSha256;
    publishMaterial();
    originals.delete(
      `public-recipient-${publicLaneKey(matrix.include[0])}.json`,
    );
    await expect(
      readArchivedPublicInputs(originals, published, { tarball, npmCli }),
    ).rejects.toThrow();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
