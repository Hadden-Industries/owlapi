import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";

const sourceCommit = "caabb1197ffdab91c1e10d596d177b5142aea5c1";
const candidateDigest =
  "sha256:f5967321e1c18a9c5aa14ad44a1d45fe3606605453866ce7746afe9c394f52d7";
const preflightDigest =
  "sha256:324472ff607ce6bbaebf30fe1e1a1db40a78da54f0877a712001a3c9ee84157e";

const publicationControl = {
  schemaVersion: 2,
  enabled: true,
  mode: "DIRECT_BOOTSTRAP",
  coordinate: "owlapi@0.1.0-alpha.0",
  channel: "next",
  reconciliation: {
    enabled: true,
    mode: "EXACT_ARTIFACT_RECONCILIATION",
    failureClass: "POST_QUALIFICATION_EVIDENCE_PERSISTENCE_FAILURE",
    source: {
      repository: "Hadden-Industries/owlapi",
      workflow: ".github/workflows/release.yml",
      runId: 33160042447,
      runAttempt: 1,
      commit: sourceCommit,
      tag: "v0.1.0-alpha.0",
      failedJob: "Release / tag accepted",
    },
    candidateArtifact: {
      id: 9682090118,
      name: "owlapi-0.1.0-alpha.0-candidate-33160042447-1",
      digest: candidateDigest,
      expiresAt: "2026-11-26T09:36:09Z",
    },
    publicationPreflightArtifact: {
      id: 9682247101,
      name: "release-publication-preflight-33160042447-1",
      digest: preflightDigest,
      expiresAt: "2026-11-26T09:36:09Z",
    },
    requiredSuccessfulJobs: [
      "Release / qualified",
      "Release / publication preflight",
    ],
    packageReproduction: "BYTE_IDENTICAL",
    reviewedOn: "2026-08-28",
  },
  reason: "Reviewed bootstrap publication remains enabled.",
  reviewedOn: "2026-08-28",
};

const manifest = {
  name: "owlapi",
  version: "0.1.0-alpha.0",
  publishConfig: {
    access: "public",
    registry: "https://registry.npmjs.org/",
    tag: "next",
  },
};

const sourceRun = {
  id: 33160042447,
  run_attempt: 1,
  event: "workflow_dispatch",
  status: "completed",
  conclusion: "failure",
  head_branch: "main",
  head_sha: sourceCommit,
  path: ".github/workflows/release.yml",
  head_repository: { full_name: "Hadden-Industries/owlapi" },
  actor: { login: "MaksymShostak" },
  html_url:
    "https://github.com/Hadden-Industries/owlapi/actions/runs/33160042447",
};

const sourceJobs = [
  {
    name: "Release / qualified",
    conclusion: "success",
    html_url:
      "https://github.com/Hadden-Industries/owlapi/actions/runs/33160042447/job/1",
  },
  {
    name: "Release / publication preflight",
    conclusion: "success",
    html_url:
      "https://github.com/Hadden-Industries/owlapi/actions/runs/33160042447/job/2",
  },
  {
    name: "Release / tag accepted",
    conclusion: "failure",
    html_url:
      "https://github.com/Hadden-Industries/owlapi/actions/runs/33160042447/job/3",
  },
];

const artifact = ({ id, name, digest }) => ({
  id,
  name,
  digest,
  expired: false,
  expires_at: "2026-11-26T09:36:09Z",
  workflow_run: { id: 33160042447, head_sha: sourceCommit },
});

const publicationPreflight = {
  schemaVersion: 1,
  result: "PASS",
  checkedAt: "2026-08-28T10:14:47.638Z",
  registry: "https://registry.npmjs.org/",
  channel: "next",
  canonicalTag: "v0.1.0-alpha.0",
  registryState: "DIRECT_BOOTSTRAP_READY",
  candidate: {
    coordinate: "owlapi@0.1.0-alpha.0",
    fileName: "owlapi-0.1.0-alpha.0.tgz",
    bytes: 179949,
    sha256: "80d56eb103c1a94dcdc006b4549e91cce16f7ed0eb076e0e26053e3d670704a3",
    fileCount: 72,
  },
  dryRun: {
    command:
      "npm publish <retained-tarball> --dry-run --tag next --access public --registry=https://registry.npmjs.org/ --json",
    entryCount: 72,
    integrity:
      "sha512-m6H5akkbspCsOzPNAjneRG+hWjphqfXHQXOqzFbHeEkdABOufEZKIS4rjvQDpartQRilsr+ux5UmKJZMfL8Mkg==",
    shasum: "5d7e46c1118b3be07044b4a0797aa04aac82d694",
  },
};

const retainedCandidate = {
  package: { name: "owlapi", version: "0.1.0-alpha.0" },
  tarball: {
    fileName: "owlapi-0.1.0-alpha.0.tgz",
    bytes: 179949,
    sha256: "80d56eb103c1a94dcdc006b4549e91cce16f7ed0eb076e0e26053e3d670704a3",
  },
};

const tagVerification = {
  result: "PASS",
  tag: "v0.1.0-alpha.0",
  sourceCommit,
};

describe("exact-artifact release reconciliation", () => {
  let reconciliation;

  beforeAll(async () => {
    reconciliation = await import("./release-reconciliation.mjs").catch(
      () => null,
    );
  });

  test("derives every recovery coordinate from the reviewed control record", () => {
    expect(typeof reconciliation?.deriveReconciliationMetadata).toBe(
      "function",
    );
    expect(
      reconciliation.deriveReconciliationMetadata({
        control: publicationControl,
        manifest,
      }),
    ).toEqual({
      version: "0.1.0-alpha.0",
      coordinate: "owlapi@0.1.0-alpha.0",
      channel: "next",
      tag: "v0.1.0-alpha.0",
      sourceCommit,
      sourceRunId: "33160042447",
      sourceRunAttempt: "1",
      candidateArtifactId: "9682090118",
      candidateArtifactDigest: candidateDigest,
      publicationPreflightArtifactId: "9682247101",
      publicationPreflightArtifactDigest: preflightDigest,
    });
  });

  test("the checked-in publication control selects the reviewed source artefacts", () => {
    const checkedInControl = JSON.parse(
      readFileSync("docs/release/publication-control.json", "utf8"),
    );
    const checkedInManifest = JSON.parse(readFileSync("package.json", "utf8"));

    expect(
      reconciliation.deriveReconciliationMetadata({
        control: checkedInControl,
        manifest: checkedInManifest,
      }),
    ).toEqual(
      reconciliation.deriveReconciliationMetadata({
        control: publicationControl,
        manifest,
      }),
    );
  });

  test("emits only the closed metadata keys consumed by the workflow", () => {
    const metadata = reconciliation.deriveReconciliationMetadata({
      control: publicationControl,
      manifest,
    });

    expect(typeof reconciliation?.formatReconciliationOutputs).toBe("function");
    expect(reconciliation.formatReconciliationOutputs(metadata)).toBe(
      [
        "candidate_artifact_digest=" + candidateDigest,
        "candidate_artifact_id=9682090118",
        "channel=next",
        "coordinate=owlapi@0.1.0-alpha.0",
        "publication_preflight_artifact_digest=" + preflightDigest,
        "publication_preflight_artifact_id=9682247101",
        "source_commit=" + sourceCommit,
        "source_run_attempt=1",
        "source_run_id=33160042447",
        "tag=v0.1.0-alpha.0",
        "version=0.1.0-alpha.0",
        "",
      ].join("\n"),
    );
  });

  test("accepts promotion only from a distinct protected-main commit", () => {
    expect(typeof reconciliation?.assertPromotionContext).toBe("function");
    expect(
      reconciliation.assertPromotionContext({
        repository: "Hadden-Industries/owlapi",
        ref: "refs/heads/main",
        promotionCommit: "d".repeat(40),
        sourceCommit,
      }),
    ).toEqual({
      repository: "Hadden-Industries/owlapi",
      ref: "refs/heads/main",
      promotionCommit: "d".repeat(40),
    });
    expect(() =>
      reconciliation.assertPromotionContext({
        repository: "Hadden-Industries/owlapi",
        ref: "refs/heads/main",
        promotionCommit: sourceCommit,
        sourceCommit,
      }),
    ).toThrow(/later repair commit/u);
  });

  test("requires the promotion commit to descend from the source commit", () => {
    expect(typeof reconciliation?.assertPromotionLineage).toBe("function");
    expect(
      reconciliation.assertPromotionLineage({
        sourceCommit,
        promotionCommit: "d".repeat(40),
        sourceIsAncestor: true,
      }),
    ).toEqual({ sourceCommit, promotionCommit: "d".repeat(40) });
    expect(() =>
      reconciliation.assertPromotionLineage({
        sourceCommit,
        promotionCommit: "d".repeat(40),
        sourceIsAncestor: false,
      }),
    ).toThrow(/descend from the reviewed source commit/u);
  });

  test("accepts the failed source run only at its proved post-qualification boundary", () => {
    expect(typeof reconciliation?.assertReconciliationSourceFacts).toBe(
      "function",
    );
    expect(
      reconciliation.assertReconciliationSourceFacts({
        control: publicationControl,
        sourceRun,
        sourceJobs,
        candidateArtifact: artifact(
          publicationControl.reconciliation.candidateArtifact,
        ),
        publicationPreflightArtifact: artifact(
          publicationControl.reconciliation.publicationPreflightArtifact,
        ),
        publicationPreflight,
        retainedCandidate,
        tagVerification,
        githubRelease: null,
        registryVersion: null,
      }),
    ).toEqual({
      result: "PASS",
      failureClass: "POST_QUALIFICATION_EVIDENCE_PERSISTENCE_FAILURE",
      source: {
        repository: "Hadden-Industries/owlapi",
        workflow: ".github/workflows/release.yml",
        runId: "33160042447",
        runAttempt: 1,
        url: sourceRun.html_url,
        commit: sourceCommit,
        tag: "v0.1.0-alpha.0",
        actor: "MaksymShostak",
      },
      requiredJobs: sourceJobs.slice(0, 2).map((job) => ({
        name: job.name,
        conclusion: job.conclusion,
        url: job.html_url,
      })),
      failedJob: {
        name: sourceJobs[2].name,
        conclusion: sourceJobs[2].conclusion,
        url: sourceJobs[2].html_url,
      },
      candidateArtifact: {
        id: "9682090118",
        digest: candidateDigest,
        name: "owlapi-0.1.0-alpha.0-candidate-33160042447-1",
      },
      publicationPreflightArtifact: {
        id: "9682247101",
        digest: preflightDigest,
        name: "release-publication-preflight-33160042447-1",
      },
      publicationPreflightResult: "PASS",
      tagVerificationResult: "PASS",
      githubReleaseAbsent: true,
      registryCoordinateAbsent: true,
    });
  });

  test.each([
    [
      "registry state",
      { ...publicationPreflight, registryState: "ABANDON_TAGGED_VERSION" },
    ],
    [
      "canonical tag",
      { ...publicationPreflight, canonicalTag: "v0.1.0-alpha.1" },
    ],
    [
      "package coordinate",
      {
        ...publicationPreflight,
        candidate: {
          ...publicationPreflight.candidate,
          coordinate: "owlapi@0.1.0-alpha.1",
        },
      },
    ],
    [
      "tarball digest",
      {
        ...publicationPreflight,
        candidate: {
          ...publicationPreflight.candidate,
          sha256: "0".repeat(64),
        },
      },
    ],
    [
      "tarball byte count",
      {
        ...publicationPreflight,
        candidate: {
          ...publicationPreflight.candidate,
          bytes: publicationPreflight.candidate.bytes + 1,
        },
      },
    ],
  ])("rejects a retained preflight with the wrong %s", (_field, report) => {
    expect(() =>
      reconciliation.assertReconciliationSourceFacts({
        control: publicationControl,
        sourceRun,
        sourceJobs,
        candidateArtifact: artifact(
          publicationControl.reconciliation.candidateArtifact,
        ),
        publicationPreflightArtifact: artifact(
          publicationControl.reconciliation.publicationPreflightArtifact,
        ),
        publicationPreflight: report,
        retainedCandidate,
        tagVerification,
        githubRelease: null,
        registryVersion: null,
      }),
    ).toThrow(/retained publication-preflight report/iu);
  });

  test("rejects a source run whose qualification aggregate did not pass", () => {
    expect(() =>
      reconciliation.assertReconciliationSourceFacts({
        control: publicationControl,
        sourceRun,
        sourceJobs: sourceJobs.map((job) =>
          job.name === "Release / qualified"
            ? { ...job, conclusion: "failure" }
            : job,
        ),
        candidateArtifact: artifact(
          publicationControl.reconciliation.candidateArtifact,
        ),
        publicationPreflightArtifact: artifact(
          publicationControl.reconciliation.publicationPreflightArtifact,
        ),
        publicationPreflight,
        retainedCandidate,
        tagVerification,
        githubRelease: null,
        registryVersion: null,
      }),
    ).toThrow(/required source job/iu);
  });

  test("proves byte identity and rejects any reproduced-package difference", () => {
    expect(typeof reconciliation?.assertByteIdenticalTarball).toBe("function");
    const retained = Buffer.from("abc");

    expect(
      reconciliation.assertByteIdenticalTarball({
        retained,
        reproduced: Buffer.from(retained),
      }),
    ).toEqual({
      result: "BYTE_IDENTICAL",
      bytes: 3,
      sha256:
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    });
    expect(() =>
      reconciliation.assertByteIdenticalTarball({
        retained,
        reproduced: Buffer.from("different"),
      }),
    ).toThrow(/byte-identical/u);
  });

  test("records qualification and promotion as distinct evidence stages", () => {
    const sourceFacts = {
      result: "PASS",
      source: { commit: sourceCommit, runId: "33160042447" },
    };
    const reproduction = {
      result: "BYTE_IDENTICAL",
      bytes: 3,
      sha256:
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    };

    expect(typeof reconciliation?.buildReconciliationReport).toBe("function");
    expect(
      reconciliation.buildReconciliationReport({
        verifiedAt: "2026-08-28T13:00:00.000Z",
        promotionCommit: "d".repeat(40),
        sourceFacts,
        reproduction,
      }),
    ).toEqual({
      schemaVersion: 1,
      result: "PASS",
      verifiedAt: "2026-08-28T13:00:00.000Z",
      promotionCommit: "d".repeat(40),
      source: sourceFacts,
      packageReproduction: reproduction,
    });
  });
});
