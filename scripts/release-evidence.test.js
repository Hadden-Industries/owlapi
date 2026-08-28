import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { buildReleaseEvidence } from "./release-evidence.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const sha = (character) => character.repeat(64);

const facts = {
  generatedAt: "2026-08-28T12:00:00.000Z",
  source: {
    repository: "Hadden-Industries/owlapi",
    ref: "refs/heads/main",
    commit: "a".repeat(40),
    tag: "v0.1.0-alpha.0",
  },
  workflow: {
    name: "Release",
    runId: "12345",
    runAttempt: 1,
    url: "https://github.com/Hadden-Industries/owlapi/actions/runs/12345",
    actor: "MaksymShostak",
  },
  candidate: {
    artifactId: "67890",
    artifactDigest: `sha256:${sha("d")}`,
    tarball: { name: "owlapi-0.1.0-alpha.0.tgz", bytes: 900, sha256: sha("a") },
    sbom: {
      name: "owlapi-0.1.0-alpha.0.cdx.json",
      bytes: 700,
      sha256: sha("b"),
    },
    checksums: { name: "SHA256SUMS", bytes: 190, sha256: sha("c") },
  },
  publication: {
    mode: "DIRECT_BOOTSTRAP",
    registry: "https://registry.npmjs.org/",
    coordinate: "owlapi@0.1.0-alpha.0",
    channel: "next",
    integrity: "sha512-example",
    tarballUrl: "https://registry.npmjs.org/owlapi/-/owlapi-0.1.0-alpha.0.tgz",
    verifiedAt: "2026-08-28T11:55:00.000Z",
    next: "0.1.0-alpha.0",
    latestPresent: false,
    signatureAuditResult: "PASS",
  },
  signing: {
    signerId: "maksym-shostak-github-ssh-2026",
    signerPrincipal: "MaksymShostak",
    fingerprint: "SHA256:0lELaqBbgGHdSctv4GOpPmROX56wNCaii2PLZI5pXCU",
    githubVerifiedAt: "2026-08-28T11:00:00Z",
  },
  githubRelease: {
    id: 42,
    url: "https://github.com/Hadden-Industries/owlapi/releases/tag/v0.1.0-alpha.0",
    draft: true,
    assets: [
      { name: "SHA256SUMS", bytes: 190, sha256: sha("c") },
      { name: "owlapi-0.1.0-alpha.0.cdx.json", bytes: 700, sha256: sha("b") },
      { name: "owlapi-0.1.0-alpha.0.tgz", bytes: 900, sha256: sha("a") },
    ],
  },
  approvals: [
    {
      environment: "release-manual",
      reviewer: "MaksymShostak",
      state: "approved",
      observedAt: "2026-08-28T12:00:00.000Z",
    },
    {
      environment: "npm-release",
      reviewer: "MaksymShostak",
      state: "approved",
      observedAt: "2026-08-28T12:00:00.000Z",
    },
  ],
  requiredJobs: [
    {
      name: "Release / qualified",
      conclusion: "success",
      url: "https://github.com/Hadden-Industries/owlapi/actions/runs/12345/job/1",
    },
  ],
  extendedTests: [
    {
      environment: "physical-real-devices",
      result: "NOT_RUN",
      reason: "NO_DEVICE_LAB_CONFIGURED",
    },
  ],
  inputEvidence: [{ name: "registry-verification.json", sha256: sha("e") }],
};

describe("release evidence", () => {
  test("builds a strict Draft 2020-12 release-evidence asset", () => {
    const schema = JSON.parse(
      readFileSync(
        join(repositoryRoot, "docs", "release", "release-evidence.schema.json"),
        "utf8",
      ),
    );
    const evidence = buildReleaseEvidence(facts);
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);

    expect(validate(evidence)).toBe(true);
    expect(validate.errors).toBeNull();
  });

  test("rejects disagreement between the source tag and package version", () => {
    expect(() =>
      buildReleaseEvidence({
        ...facts,
        source: { ...facts.source, tag: "v0.1.0-alpha.1" },
      }),
    ).toThrow(/tag/u);
  });

  test("normalizes unordered API-derived evidence deterministically", () => {
    const evidence = buildReleaseEvidence({
      ...facts,
      approvals: [...facts.approvals].reverse(),
      requiredJobs: [
        {
          name: "Release / tag accepted",
          conclusion: "success",
          url: "https://github.com/Hadden-Industries/owlapi/actions/runs/12345/job/2",
        },
        ...facts.requiredJobs,
      ],
      extendedTests: [...facts.extendedTests].reverse(),
      inputEvidence: [
        { name: "tag-verification.json", sha256: sha("f") },
        ...facts.inputEvidence,
      ],
    });

    expect(evidence.approvals.map(({ environment }) => environment)).toEqual([
      "npm-release",
      "release-manual",
    ]);
    expect(evidence.requiredJobs.map(({ name }) => name)).toEqual([
      "Release / qualified",
      "Release / tag accepted",
    ]);
    expect(evidence.inputEvidence.map(({ name }) => name)).toEqual([
      "registry-verification.json",
      "tag-verification.json",
    ]);
  });
});
