import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import * as evidenceGenerator from "./generate-release-evidence.mjs";
import * as releaseEvidence from "./release-evidence.mjs";

const { buildReleaseEvidence } = releaseEvidence;

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const sha = (character) => character.repeat(64);
const requiredJobNames = [
  "Release / qualified",
  "Release / publication preflight",
  "Release reconciliation / source verified",
  "Release reconciliation / accepted",
  "Release reconciliation / GitHub draft",
  "Release reconciliation / npm direct bootstrap",
  "Release reconciliation / fresh public registry",
];

const facts = {
  generatedAt: "2026-08-28T12:00:00.000Z",
  source: {
    repository: "Hadden-Industries/owlapi",
    ref: "refs/tags/v0.1.0-alpha.0",
    commit: "a".repeat(40),
    tag: "v0.1.0-alpha.0",
  },
  workflow: {
    name: "Release reconciliation",
    commit: "d".repeat(40),
    runId: "54321",
    runAttempt: 1,
    url: "https://github.com/Hadden-Industries/owlapi/actions/runs/54321",
    actor: "MaksymShostak",
  },
  qualificationWorkflow: {
    name: "Release",
    commit: "a".repeat(40),
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
    provenance: {
      sourceCommit: "d".repeat(40),
      sourceRef: "refs/heads/main",
      workflow: ".github/workflows/release-reconciliation.yml",
      subjectSha256: sha("a"),
    },
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
  requiredJobs: requiredJobNames.map((name, index) => ({
    name,
    conclusion: "success",
    url: `https://github.com/Hadden-Industries/owlapi/actions/runs/12345/job/${index + 1}`,
  })),
  extendedTests: [
    {
      environment: "physical-real-devices",
      result: "NOT_RUN",
      reason: "NO_DEVICE_LAB_CONFIGURED",
    },
  ],
  inputEvidence: [{ name: "registry-verification.json", sha256: sha("e") }],
  reconciliation: {
    failureClass: "POST_QUALIFICATION_EVIDENCE_PERSISTENCE_FAILURE",
    sourceFailureJob: {
      name: "Release / tag accepted",
      conclusion: "failure",
      url: "https://github.com/Hadden-Industries/owlapi/actions/runs/12345/job/2",
    },
    publicationPreflightArtifact: {
      id: "9682247101",
      name: "release-publication-preflight-33160042447-1",
      digest: `sha256:${sha("f")}`,
    },
    transportArtifact: {
      id: "98765",
      name: "owlapi-0.1.0-alpha.0-reconciled-candidate-54321-1",
      digest: `sha256:${sha("0")}`,
    },
    packageReproduction: {
      result: "BYTE_IDENTICAL",
      bytes: 900,
      sha256: sha("a"),
    },
  },
};

describe("release evidence", () => {
  test("combines the successful qualification and promotion jobs", () => {
    const sourceJobs = [
      {
        name: "Release / qualified",
        conclusion: "success",
        url: "https://github.com/Hadden-Industries/owlapi/actions/runs/12345/job/1",
      },
      {
        name: "Release / publication preflight",
        conclusion: "success",
        url: "https://github.com/Hadden-Industries/owlapi/actions/runs/12345/job/2",
      },
    ];
    const currentJobs = [
      "Release reconciliation / source verified",
      "Release reconciliation / accepted",
      "Release reconciliation / GitHub draft",
      "Release reconciliation / npm direct bootstrap",
      "Release reconciliation / fresh public registry",
    ].map((name, index) => ({
      name,
      conclusion: "success",
      html_url: `https://github.com/Hadden-Industries/owlapi/actions/runs/54321/job/${index + 1}`,
    }));

    expect(typeof evidenceGenerator.requiredSuccessfulJobs).toBe("function");
    expect(
      evidenceGenerator.requiredSuccessfulJobs({ sourceJobs, currentJobs }),
    ).toEqual([
      ...sourceJobs,
      ...currentJobs.map(({ html_url: url, ...job }) => ({ ...job, url })),
    ]);
  });

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

  test("binds the evidence schema and provenance to the promotion commit", () => {
    const evidence = buildReleaseEvidence(facts);

    expect(evidence.$schema).toContain("d".repeat(40));
    expect(evidence.workflow.commit).toBe("d".repeat(40));
    expect(evidence.qualificationWorkflow.commit).toBe("a".repeat(40));
    expect(evidence.publication.provenance.sourceCommit).toBe("d".repeat(40));
  });

  test("verifies both the canonical source and current promotion identity", () => {
    const evidence = buildReleaseEvidence(facts);

    expect(typeof releaseEvidence.assertReleaseExecutionIdentity).toBe(
      "function",
    );
    expect(
      releaseEvidence.assertReleaseExecutionIdentity({
        evidence,
        promotionCommit: "d".repeat(40),
        sourceCommit: "a".repeat(40),
        tag: "v0.1.0-alpha.0",
      }),
    ).toEqual({
      promotionCommit: "d".repeat(40),
      sourceCommit: "a".repeat(40),
      tag: "v0.1.0-alpha.0",
    });
    expect(() =>
      releaseEvidence.assertReleaseExecutionIdentity({
        evidence,
        promotionCommit: "e".repeat(40),
        sourceCommit: "a".repeat(40),
        tag: "v0.1.0-alpha.0",
      }),
    ).toThrow(/promotion workflow/u);
  });

  test("rejects reconciliation when the package reproduction digest differs", () => {
    expect(() =>
      buildReleaseEvidence({
        ...facts,
        reconciliation: {
          ...facts.reconciliation,
          packageReproduction: {
            ...facts.reconciliation.packageReproduction,
            sha256: sha("b"),
          },
        },
      }),
    ).toThrow(/reproduction/u);
  });

  test("rejects release evidence with an incomplete required-job set", () => {
    expect(() =>
      buildReleaseEvidence({
        ...facts,
        requiredJobs: facts.requiredJobs.slice(0, -1),
      }),
    ).toThrow(/required job inventory/u);
  });

  test("normalizes unordered API-derived evidence deterministically", () => {
    const evidence = buildReleaseEvidence({
      ...facts,
      approvals: [...facts.approvals].reverse(),
      requiredJobs: [...facts.requiredJobs].reverse(),
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
    expect(evidence.requiredJobs.map(({ name }) => name)).toEqual(
      [...requiredJobNames].sort(),
    );
    expect(evidence.inputEvidence.map(({ name }) => name)).toEqual([
      "registry-verification.json",
      "tag-verification.json",
    ]);
  });
});
