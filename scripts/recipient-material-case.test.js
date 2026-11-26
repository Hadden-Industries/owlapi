import { readFileSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, jest, test } from "@jest/globals";
import { stableJson } from "./canonical-json.mjs";
import { isStrictDescendantPath, sha256Buffer } from "./release-file-utils.mjs";
import {
  openRecipientMaterialCase,
  recipientCaseOrigin,
  recipientMaterialDisposition,
  recipientMaterialMember,
} from "./recipient-material-case.mjs";
import {
  assertAuthorizedRecipientMaterialReplay,
  assertRecipientMaterialDisposition,
} from "./recipient-material-case-authority.mjs";
import { priorDisposition } from "./release-history-checkpoint.mjs";

const hash = (text) => sha256Buffer(Buffer.from(text));
const manifest =
  '{"name":"fixture","private":true,"dependencies":{"owlapi":"npm:@hadden-industries/owlapi@0.1.0"}}\n';
const lock = '{"lockfileVersion":3,"packages":{"":{"name":"fixture"}}}\n';
const tarball = Buffer.from("fixture candidate bytes");
const resolution = {
  schemaVersion: 1,
  dependencyName: "owlapi",
  manifestSha256: hash(manifest),
  lockSha256: hash(lock),
  tarballSha256: sha256Buffer(tarball),
  platform: { os: "linux", cpu: "x64", node: "26.13.1" },
  npm: "10.9.8",
  graph: { nodes: [], edges: [] },
};
const evidence = { schemaVersion: 1, manifest, lock, resolution };
const material = {
  schemaVersion: 1,
  status: "REQUIRES_HUMAN_REVIEW",
  policy: "DEC-004-2026-11-26-v1",
  archivePolicySha256: "9".repeat(64),
  registryKeysSha256: "8".repeat(64),
  canonicalEvidence: { corpusRoot: "7".repeat(64) },
  subject: {
    resolutionSha256: hash(stableJson(resolution)),
    lockSha256: resolution.lockSha256,
    tarballSha256: resolution.tarballSha256,
  },
  artifacts: [
    {
      artifactId: "example-archive",
      name: "example-runtime",
      version: "1.2.3",
      resolved:
        "https://registry.npmjs.org/example-runtime/-/example-runtime-1.2.3.tgz",
      integrity: "sha512-fixture",
      tarball: { sha256: "c".repeat(64) },
      archive: { evidence: { sha256: "d".repeat(64) } },
      scan: { evidence: { sha256: "e".repeat(64) } },
    },
  ],
  decisions: [
    {
      artifactId: "example-archive",
      archiveMember: "package/package.json",
      location: "node_modules/example-runtime",
      scope: "SEPARATELY_INSTALLED_EXTERNAL_RUNTIME",
      installedManifestSha256: "b".repeat(64),
      disposition: "REQUIRES_HUMAN_REVIEW",
      reasons: ["DECLARATION_OUTSIDE_STANDING_RULE"],
      legalFiles: [
        {
          path: "package/NOTICE",
          kind: "NOTICE",
          blob: { sha256: "f".repeat(64) },
        },
      ],
    },
  ],
};
const collect = jest.fn(async ({ directory }) => {
  await mkdir(directory);
  await writeFile(
    join(directory, "recipient-material.json"),
    stableJson(material),
  );
  return material;
});

const hosted = recipientCaseOrigin({
  GITHUB_ACTIONS: "true",
  GITHUB_REPOSITORY: "Hadden-Industries/owlapi",
  GITHUB_WORKFLOW_REF:
    "Hadden-Industries/owlapi/.github/workflows/release-registry.yml@refs/heads/main",
  GITHUB_JOB: "material",
  GITHUB_RUN_ID: "781",
  GITHUB_RUN_ATTEMPT: "2",
  GITHUB_SHA: "c".repeat(40),
});
const packet = {
  schemaVersion: 1,
  status: "REQUIRES_HUMAN_REVIEW",
  role: "public-alias",
  origin: hosted,
  context: {
    kind: "PUBLIC_OBSERVATION",
    stage: { stageId: "fixture-stage" },
    lane: "ubuntu-26.04-26.13.1",
    observation: { artifact: { id: 311 }, source: { jobId: 210 } },
  },
  evidence,
  material: {
    sha256: hash(stableJson(material)),
    original: stableJson(material),
  },
};
const openPacket = (value) => {
  const original = stableJson(value);
  return openRecipientMaterialCase(Buffer.from(original), hash(original));
};

test("reopens the exact retained material and refuses changed originals even with a new transport digest", () => {
  const opened = openPacket(packet);
  expect(opened.packet.origin).toEqual({
    scope: "GITHUB_ACTIONS",
    job: "material",
    workflow: ".github/workflows/release-registry.yml",
    runId: 781,
    attempt: 2,
    commit: "c".repeat(40),
  });
  expect(opened.record.decisions[0].scope).toBe(
    "SEPARATELY_INSTALLED_EXTERNAL_RUNTIME",
  );
  expect(() =>
    openPacket({
      ...packet,
      evidence: { ...evidence, lock: lock.replace("fixture", "different") },
    }),
  ).toThrow(/Original recipient lock changed/u);
  expect(() =>
    openPacket({ ...packet, material: { ...packet.material, original: "{}" } }),
  ).toThrow(/Original recipient material changed/u);
  const changedMaterial = stableJson({
    ...material,
    advisory: { report: "private" },
  });
  expect(() =>
    openPacket({
      ...packet,
      material: { sha256: hash(changedMaterial), original: changedMaterial },
    }),
  ).toThrow();
});

test("the checkpoint signer needs actual rights authority and an exact case-specific disposition", () => {
  const opened = openPacket(packet);
  const rights = JSON.parse(
    readFileSync(
      new URL("../docs/provenance/rights-inventory.json", import.meta.url),
    ),
  );
  const signers = JSON.parse(
    readFileSync(
      new URL("../docs/provenance/release-signers.json", import.meta.url),
    ),
  );
  const owner = signers.signers.find(
    ({ githubIdentity }) => githubIdentity === "MaksymShostak",
  );
  const date = owner.validFrom;
  const authority = {
    capacity: "PROJECT_RIGHTS_OWNER",
    signerId: owner.id,
    fingerprint: owner.fingerprint,
    identity: "https://github.com/MaksymShostak",
    rightsFactsSha256: rights.review.factsSha256,
  };
  const accepted = recipientMaterialDisposition(opened, authority);
  expect(accepted.exceptions).toMatchObject([
    {
      name: "example-runtime",
      version: "1.2.3",
      integrity: "sha512-fixture",
      scanSha256: "e".repeat(64),
      occurrence: {
        scope: "SEPARATELY_INSTALLED_EXTERNAL_RUNTIME",
        legalFiles: [{ blob: { sha256: "f".repeat(64) } }],
      },
    },
  ]);
  const name = `recipient-material-${opened.caseSha256}.json`;
  const checkpoint = {
    objectId: "b".repeat(40),
    signer: { signerId: owner.id, fingerprint: owner.fingerprint },
    files: new Map([[name, Buffer.from(stableJson(accepted))]]),
  };
  expect(
    assertRecipientMaterialDisposition(opened, checkpoint, {
      rights,
      signers,
      date,
    }),
  ).toEqual({ checkpoint: checkpoint.objectId, name, authority });
  expect(() =>
    assertAuthorizedRecipientMaterialReplay(
      { checkpoint: checkpoint.objectId, name, authority },
      opened,
    ),
  ).toThrow(/authenticated/u);
  for (const change of [
    { decision: "REJECT" },
    { materialSha256: "f".repeat(64) },
    { policy: "retired" },
    { origin: { ...accepted.origin, attempt: 1 } },
    {
      subject: {
        ...accepted.subject,
        context: { ...packet.context, stage: { stageId: "foreign" } },
      },
    },
    { exceptions: [{ ...accepted.exceptions[0], scanSha256: "f".repeat(64) }] },
    {
      exceptions: [
        { ...accepted.exceptions[0], integrity: "sha512-different" },
      ],
    },
    {
      exceptions: [
        {
          ...accepted.exceptions[0],
          occurrence: {
            ...accepted.exceptions[0].occurrence,
            scope: "BUNDLED_IN_EXTERNAL_RUNTIME_ARCHIVE",
          },
        },
      ],
    },
  ]) {
    const foreignCase = {
      ...checkpoint,
      files: new Map([
        [name, Buffer.from(stableJson({ ...accepted, ...change }))],
      ]),
    };
    expect(() =>
      assertRecipientMaterialDisposition(opened, foreignCase, {
        rights,
        signers,
        date,
      }),
    ).toThrow(/exact recipient material case/u);
  }
  const other = {
    ...owner,
    id: "other-key",
    githubIdentity: "OtherMaintainer",
    naturalPersonName: "Other Maintainer",
    fingerprint: "SHA256:other",
  };
  const unrelatedSigner = {
    ...checkpoint,
    signer: { signerId: other.id, fingerprint: other.fingerprint },
  };
  expect(() =>
    assertRecipientMaterialDisposition(opened, unrelatedSigner, {
      rights,
      signers: { signers: [other] },
      date,
    }),
  ).toThrow(/no established recipient material rights authority/u);
  expect(() =>
    assertRecipientMaterialDisposition(
      openPacket({ ...packet, origin: { scope: "LOCAL_DIAGNOSTIC" } }),
      checkpoint,
      { rights, signers, date },
    ),
  ).toThrow();
});
// The fixture controls the material-owner response. The actual gate owns its
// treatment, persistence and whether audit or product execution may follow.
const readRetained = jest.fn(async ({ recordBytes }) => {
  expect(recordBytes.toString("utf8")).toBe(stableJson(material));
  return { record: material };
});
jest.unstable_mockModule(
  "../util/third-party-evidence/recipient-material.mjs",
  () => ({
    RECIPIENT_MATERIAL_NAME: "recipient-material.json",
    prepareRecipientMaterial: async () => ({
      collect,
      missingArchiveMeasurements: () => [],
      verifyRetained: readRetained,
    }),
  }),
);
const audit = jest.fn();
jest.unstable_mockModule("./release-audit-evaluator.mjs", () => ({
  preflightReleaseAudit: audit,
}));
// Mock only GitHub custody and native npm. The actual caller, scope, commitment,
// material retention, decision binding and independent readback still run.
const checkpointRead = jest.fn();
jest.unstable_mockModule("./release-history-checkpoint.mjs", () => ({
  priorDisposition,
  readCheckpoint: checkpointRead,
}));
const originalRead = jest.fn(async (_client, env) => {
  const original = openPacket(packet);
  expect(env.RECIPIENT_CASE_SHA256).toBe(original.caseSha256);
  expect(env.RECIPIENT_OBSERVATION).toBe(`1234:${"1".repeat(64)}`);
  return { original };
});
jest.unstable_mockModule("./recipient-material-case-replay.mjs", () => ({
  reopenOriginalRecipientMaterialCase: originalRead,
  reopenOriginalRecipientMaterialSubject: async () => ({ tarball }),
}));
const nativeReplay = jest.fn(async (observed) => {
  expect(observed).toEqual(evidence);
  return resolution;
});
jest.unstable_mockModule("./release-consumer-evidence.mjs", () => ({
  verifyResolutionEvidence: nativeReplay,
}));
const { verifyCiConsumerEvidence } =
  await import("./ci-consumer-evidence-verification.mjs");

test("the unresolved original survives the pre-execution gate with its actual scope", async () => {
  const root = await mkdtemp(join(tmpdir(), "owlapi-recipient-case-"));
  expect(isStrictDescendantPath(tmpdir(), root)).toBe(true);
  try {
    const directory = join(root, "consumer");
    await mkdir(directory);
    await writeFile(join(directory, "package.json"), manifest);
    await writeFile(join(directory, "package-lock.json"), lock);
    const fixture = jest.fn();
    const blocked = verifyCiConsumerEvidence({
      directory,
      evidence,
      role: "candidate-inspection",
      decisionDirectory: join(root, "eligibility"),
    }).then(fixture);
    await expect(blocked).rejects.toThrow(/rights disposition/iu);
    await expect(blocked).rejects.toHaveProperty(
      "code",
      "RECIPIENT_MATERIAL_RIGHTS_PENDING",
    );
    expect(collect).toHaveBeenCalledTimes(1);
    expect(audit).not.toHaveBeenCalled();
    expect(fixture).not.toHaveBeenCalled();
    const cases = join(root, "recipient-material-cases");
    const names = await readdir(cases);
    expect(names).toHaveLength(1);
    const original = await readFile(join(cases, names[0]), "utf8");
    expect(names[0]).toBe(`case-${hash(original)}.json`);
    expect(JSON.parse(original)).toMatchObject({
      status: "REQUIRES_HUMAN_REVIEW",
      role: "candidate-inspection",
      origin: { scope: "LOCAL_DIAGNOSTIC" },
      evidence,
      material: {
        sha256: hash(stableJson(material)),
        original: stableJson(material),
      },
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("normal qualification continues after reopening an exact approved rights case, and admission rechecks it", async () => {
  const root = await mkdtemp(join(tmpdir(), "owlapi-recipient-readmission-"));
  expect(isStrictDescendantPath(tmpdir(), root)).toBe(true);
  const original = openPacket(packet);
  const signers = JSON.parse(
    readFileSync(
      new URL("../docs/provenance/release-signers.json", import.meta.url),
    ),
  );
  const owner = signers.signers.find(
    ({ githubIdentity }) => githubIdentity === "MaksymShostak",
  );
  const rights = JSON.parse(
    readFileSync(
      new URL("../docs/provenance/rights-inventory.json", import.meta.url),
    ),
  );
  const objectId = "3".repeat(40);
  const selection = {
    role: packet.role,
    resolutionSha256: material.subject.resolutionSha256,
    caseSha256: original.caseSha256,
    artifactId: 1234,
    artifactSha256: "1".repeat(64),
  };
  const accepted = recipientMaterialDisposition(original, {
    capacity: "PROJECT_RIGHTS_OWNER",
    signerId: owner.id,
    fingerprint: owner.fingerprint,
    identity: "https://github.com/MaksymShostak",
    rightsFactsSha256: rights.review.factsSha256,
  });
  const decisionName = `recipient-material-${original.caseSha256}.json`;
  checkpointRead.mockResolvedValue({
    objectId,
    signer: { signerId: owner.id, fingerprint: owner.fingerprint },
    files: new Map([
      [
        "recipient-material-cases.json",
        Buffer.from(stableJson({ schemaVersion: 1, cases: [selection] })),
      ],
      [decisionName, Buffer.from(stableJson(accepted))],
    ]),
  });
  audit.mockResolvedValue({
    eligible: true,
    subject: { run: "read-only fixture" },
    observedAt: "2026-11-26T10:00:00.000Z",
  });
  const processEnvironment = jest.replaceProperty(process, "env", {
    ...process.env,
    GITHUB_ACTIONS: "true",
    GITHUB_REPOSITORY: "Hadden-Industries/owlapi",
    GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_SHA: hosted.commit,
    GITHUB_WORKFLOW_REF:
      "Hadden-Industries/owlapi/.github/workflows/release-registry.yml@refs/heads/main",
    GITHUB_JOB: "material",
    GITHUB_RUN_ID: "812",
    GITHUB_RUN_ATTEMPT: "1",
    RECIPIENT_MATERIAL_CHECKPOINT: objectId,
    GH_TOKEN: "test-transport-only",
  });
  try {
    const directory = join(root, "consumer");
    await mkdir(directory);
    await writeFile(join(directory, "package.json"), manifest);
    await writeFile(join(directory, "package-lock.json"), lock);
    const decisionDirectory = join(root, "eligibility");
    const input = {
      directory,
      evidence,
      role: packet.role,
      decisionDirectory,
      caseContext: packet.context,
    };
    const fixture = jest.fn();
    await expect(
      verifyCiConsumerEvidence({
        ...input,
        caseContext: { ...packet.context, stage: { stageId: "other-stage" } },
      }).then(fixture),
    ).rejects.toThrow(/different approved public stage/u);
    expect(fixture).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
    const decision = await verifyCiConsumerEvidence(input);
    fixture();
    expect(nativeReplay).toHaveBeenCalledWith(evidence, expect.any(Object));
    expect(audit.mock.invocationCallOrder.at(-1)).toBeLessThan(
      fixture.mock.invocationCallOrder[0],
    );
    expect(decision.result).toBe("PASS");
    const recorded = JSON.parse(
      await readFile(
        join(decisionDirectory, "decisions", `${decision.decisionSha256}.json`),
      ),
    );
    expect(recorded.schemaVersion).toBe(2);
    expect(recorded.rights).toMatchObject(selection);
    const recordBytes = await readFile(
      join(
        decisionDirectory,
        recipientMaterialMember(decision.resolutionSha256, recorded),
      ),
    );
    expect(JSON.parse(recordBytes).status).toBe("REQUIRES_HUMAN_REVIEW");

    const { verifyQualifiedRecipientMaterial } =
      await import("./recipient-material-case-readmission.mjs");
    const reader = { verifyRetained: readRetained };
    const retained = {
      recordBytes,
      recordSha256: recorded.materialSha256,
      resolution,
      lockfileBytes: Buffer.from(lock),
    };
    const scope = {
      evidence,
      role: packet.role,
      sourceCommit: hosted.commit,
      caseContext: packet.context,
    };
    await expect(
      verifyQualifiedRecipientMaterial(reader, retained, {
        scope,
        rights: recorded.rights,
      }),
    ).rejects.toThrow(/independent authenticated/iu);
    const readback = await verifyQualifiedRecipientMaterial(reader, retained, {
      client: {},
      scope,
      rights: recorded.rights,
    });
    expect(readback.rights).toMatchObject({
      checkpoint: objectId,
      name: decisionName,
    });
    await expect(
      verifyQualifiedRecipientMaterial(reader, retained, {
        client: {},
        scope,
        rights: { ...recorded.rights, artifactId: 1235 },
      }),
    ).rejects.toThrow(/unsigned case selection/u);
    await expect(
      verifyQualifiedRecipientMaterial(reader, retained, {
        client: {},
        rights: recorded.rights,
        scope: {
          ...scope,
          evidence: {
            ...evidence,
            resolution: {
              ...resolution,
              graph: {
                ...resolution.graph,
                nodes: [{ location: "node_modules/different-runtime" }],
              },
            },
          },
        },
      }),
    ).rejects.toThrow(/unsigned case selection/u);
    const openedBeforeArchive = originalRead.mock.calls.length;
    await expect(
      verifyQualifiedRecipientMaterial(reader, retained, {
        client: {},
        scope,
        rights: recorded.rights,
        archived: true,
      }),
    ).resolves.toMatchObject({ rights: { checkpoint: objectId } });
    expect(originalRead).toHaveBeenCalledTimes(openedBeforeArchive);

    originalRead.mockRejectedValueOnce(
      Object.assign(new Error("expired fixture custody"), {
        code: "RECIPIENT_ORIGINAL_EXPIRED",
      }),
    );
    await expect(
      verifyCiConsumerEvidence({
        ...input,
        decisionDirectory: join(root, "fresh-eligibility"),
      }).then(fixture),
    ).rejects.toThrow(/rights disposition/iu);
    expect(audit).toHaveBeenCalledTimes(1);
    expect(fixture).toHaveBeenCalledTimes(1);
    const caseRoot = join(root, "recipient-material-cases");
    const [name] = await readdir(caseRoot);
    const fresh = JSON.parse(await readFile(join(caseRoot, name)));
    expect(fresh.origin.runId).toBe(812);
    expect(fresh.evidence).toEqual(evidence);
    expect(fresh.status).toBe("REQUIRES_HUMAN_REVIEW");
  } finally {
    processEnvironment.restore();
    await rm(root, { recursive: true, force: true });
  }
});
