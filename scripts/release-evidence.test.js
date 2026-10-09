import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import * as evidenceGenerator from "./generate-release-evidence.mjs";
import * as releaseEvidence from "./release-evidence.mjs";
import { contractReport } from "./fixtures/owl-contract-report.mjs";
import { validateReleaseEvidence } from "./validate-release-evidence.mjs";
import { sourceFingerprint } from "./consumer-source-snapshot.mjs";

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

const scopedFacts = () => {
  const candidate = structuredClone(facts);
  const rc = "0.1.0-rc.1";
  candidate.source.ref = `refs/tags/v${rc}`;
  candidate.source.tag = `v${rc}`;
  candidate.workflow = { ...candidate.qualificationWorkflow };
  candidate.publication.coordinate = `@hadden-industries/owlapi@${rc}`;
  candidate.publication.next = rc;
  candidate.publication.tarballUrl = `https://registry.npmjs.org/@hadden-industries/owlapi/-/owlapi-${rc}.tgz`;
  candidate.publication.provenance.sourceCommit = candidate.source.commit;
  candidate.publication.provenance.workflow = ".github/workflows/release.yml";
  candidate.publication.provenance.runId = candidate.workflow.runId;
  candidate.publication.provenance.runAttempt = candidate.workflow.runAttempt;
  candidate.publication.publisherJob = {
    url: `${candidate.workflow.url}/job/42`,
    runAttempt: candidate.workflow.runAttempt,
    conclusion: "success",
  };
  candidate.reconciliation = null;
  candidate.producerContract = contractReport(
    {
      runId: Number(candidate.workflow.runId),
      runAttempt: candidate.workflow.runAttempt,
      commit: candidate.source.commit,
    },
    {
      workflow: "Release",
      tarballSha256: candidate.candidate.tarball.sha256,
      artifact: {
        id: Number(candidate.candidate.artifactId),
        digest: candidate.candidate.artifactDigest,
      },
    },
  );
  candidate.requiredJobs = [
    "Release / installed OWL contract",
    "Release / protected-main preflight",
    "Release / qualified",
    "Release / publication preflight",
    "Release / tag accepted",
    "Release / GitHub draft",
    "Release / npm direct bootstrap",
    "Release / fresh public registry",
  ].map((name, index) => ({
    name,
    conclusion: "success",
    url: `https://github.com/Hadden-Industries/owlapi/actions/runs/12345/job/${index + 1}`,
  }));
  candidate.candidate.tarball.name = `hadden-industries-owlapi-${rc}.tgz`;
  candidate.candidate.sbom.name = `hadden-industries-owlapi-${rc}.cdx.json`;
  candidate.githubRelease.assets = [
    candidate.candidate.checksums,
    candidate.candidate.sbom,
    candidate.candidate.tarball,
  ];
  return candidate;
};

test("fresh scoped RC evidence binds one source and run without borrowing alpha reconciliation", () => {
  const evidence = buildReleaseEvidence(scopedFacts());
  expect(evidence.package).toEqual({
    name: "@hadden-industries/owlapi",
    version: "0.1.0-rc.1",
    coordinate: "@hadden-industries/owlapi@0.1.0-rc.1",
    channel: "next",
    registry: "https://registry.npmjs.org/",
  });
  expect(evidence.reconciliation).toBeNull();
  expect(evidence.schemaVersion).toBe(4);
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(
    JSON.parse(
      readFileSync(
        join(repositoryRoot, "docs/release/release-evidence.schema.json"),
        "utf8",
      ),
    ),
  );
  expect(validate(evidence)).toBe(true);
  expect(validate.errors).toBeNull();
});
test("historical consumer pins remain readable but cannot finalize a current release", () => {
  const evidence = JSON.parse(
    JSON.stringify(buildReleaseEvidence(scopedFacts())),
  );
  evidence.producerContract.consumerSources.snapshots[0].commit = "9".repeat(
    40,
  );
  expect(validateReleaseEvidence(evidence)).toBe(evidence);
  expect(() =>
    releaseEvidence.assertReleaseExecutionIdentity({
      evidence,
      promotionCommit: evidence.workflow.commit,
      sourceCommit: evidence.source.commit,
      tag: evidence.source.tag,
    }),
  ).toThrow(/pin/iu);
});

test("historical schema-4 evidence remains readable after oracle changes but cannot finalize a current release", () => {
  const evidence = JSON.parse(
    JSON.stringify(buildReleaseEvidence(scopedFacts())),
  );
  const report = evidence.producerContract;
  report.fixtureSha256 = "0".repeat(64);
  report.assertions[0].name = "previous interface assertion";
  report.consumerSources.snapshots[0].sources[0].blob = "9".repeat(40);
  report.consumerSources.snapshots[0].sourceSha256 = sourceFingerprint(
    report.consumerSources.snapshots[0].sources,
  );
  report.inventorySha256 = sourceFingerprint({
    assertions: report.assertions.map((row) => row.name),
    sourceScopes: report.consumerSources.snapshots.map(
      ({ repository, sources }) => ({ repository, sources }),
    ),
  });
  expect(validateReleaseEvidence(evidence)).toBe(evidence);
  expect(() =>
    releaseEvidence.assertReleaseExecutionIdentity({
      evidence,
      promotionCommit: evidence.workflow.commit,
      sourceCommit: evidence.source.commit,
      tag: evidence.source.tag,
    }),
  ).toThrow(/proof/u);
  report.assertions[0].skipped = true;
  expect(() => validateReleaseEvidence(evidence)).toThrow(/inconsistent/u);
});

test.each(["coordinate", "run", "reconciliation", "asset"])(
  "rejects substituted scoped release %s",
  (field) => {
    const candidate = scopedFacts();
    if (field === "coordinate")
      candidate.publication.coordinate = "owlapi@0.1.0-rc.1";
    if (field === "run") candidate.qualificationWorkflow.runId = "98765";
    if (field === "reconciliation")
      candidate.reconciliation = facts.reconciliation;
    if (field === "asset")
      candidate.candidate.tarball.name = "owlapi-0.1.0-rc.1.tgz";
    expect(() => buildReleaseEvidence(candidate)).toThrow();
  },
);

test.each([
  "tarball URL",
  "asset name",
  "GitHub asset name",
  "duplicate GitHub asset name",
])("schema rejects substituted scoped %s even without the builder", (field) => {
  // Validate a serialized asset, without shared object identities from the builder.
  const evidence = JSON.parse(
    JSON.stringify(buildReleaseEvidence(scopedFacts())),
  );
  if (field === "tarball URL")
    evidence.publication.tarballUrl =
      "https://registry.npmjs.org/owlapi/-/owlapi-0.1.0-rc.1.tgz";
  else if (field === "asset name")
    evidence.candidate.tarball.name = "owlapi-0.1.0-rc.1.tgz";
  else if (field === "GitHub asset name")
    evidence.githubRelease.assets[0].name = "unrelated.tgz";
  else
    evidence.githubRelease.assets[0].name =
      evidence.githubRelease.assets[1].name;
  expect(() => validateReleaseEvidence(evidence)).toThrow(/strict schema/u);
});

test("partial reruns retain successful prerequisites and the original publication attempt", () => {
  const candidate = scopedFacts();
  const { runId, commit } = candidate.workflow;
  const jobs = candidate.requiredJobs.map((job) => ({
    ...job,
    html_url: job.url,
    run_id: Number(runId),
    head_sha: commit,
    run_attempt: 1,
    status: "completed",
    steps: [],
  }));
  const publisher = jobs.find(
    (job) => job.name === "Release / npm direct bootstrap",
  );
  publisher.conclusion = "failure";
  publisher.steps = [
    {
      name: "Perform the single authorized direct-bootstrap write",
      status: "completed",
      conclusion: "failure",
    },
  ];
  jobs.push({
    ...publisher,
    run_attempt: 2,
    conclusion: "success",
    html_url: `${candidate.workflow.url}/job/99`,
    steps: [{ ...publisher.steps[0], conclusion: "skipped" }],
  });
  const input = {
    jobs,
    runId,
    runAttempt: 2,
    commit,
    provenance: candidate.publication.provenance,
  };
  const accepted = evidenceGenerator.scopedWorkflowJobs(input);
  expect(accepted.publisherJob).toEqual({
    url: publisher.html_url,
    runAttempt: 1,
    conclusion: "failure",
  });
  expect(accepted.requiredJobs).toHaveLength(8);
  expect(accepted.qualificationRunAttempt).toBe(1);
  candidate.publication.publisherJob = accepted.publisherJob;
  candidate.requiredJobs = accepted.requiredJobs;
  candidate.workflow.runAttempt = 2;
  candidate.qualificationWorkflow.runAttempt = 1;
  expect(() =>
    validateReleaseEvidence(buildReleaseEvidence(candidate)),
  ).not.toThrow();
  for (const field of ["run_id", "head_sha", "run_attempt", "conclusion"]) {
    const changed = structuredClone(input);
    const latest = changed.jobs.at(-1);
    latest[field] =
      field === "run_id"
        ? 999
        : field === "head_sha"
          ? "f".repeat(40)
          : field === "run_attempt"
            ? 3
            : "failure";
    expect(() => evidenceGenerator.scopedWorkflowJobs(changed)).toThrow();
  }
  const skippedWrite = structuredClone(input);
  skippedWrite.jobs.find(
    (job) => job.name === publisher.name,
  ).steps[0].conclusion = "skipped";
  expect(() => evidenceGenerator.scopedWorkflowJobs(skippedWrite)).toThrow(
    /publisher job/u,
  );
});

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
