import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertApprovalObservations,
  assertArchiveEntries,
  assertRecoveryRun,
  assertPreparedEvidence,
  completeRecovery,
  buildRecoveryEvidence,
} from "./recover-rc2-finalization.mjs";
import { SCOPED_RELEASE_JOB_NAMES } from "./release-evidence.mjs";
import { contractReport } from "./fixtures/owl-contract-report.mjs";

const originalControl = JSON.parse(
  readFileSync(
    new URL("../docs/release/rc2-finalization-recovery.json", import.meta.url),
    "utf8",
  ),
);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

test.each(["ambiguous finalization", "verification failure", "success"])(
  "never replays writes after %s",
  async (outcome) => {
    const root = mkdtempSync(join(tmpdir(), "owlapi-recovery-test-"));
    let writes = 0;
    let reads = 0;
    const request = {
      root,
      intent: { source: "test-only" },
      finalize: () => {
        writes++;
        if (outcome === "ambiguous finalization") throw new Error("ambiguous");
      },
      verify: () => {
        reads++;
        if (outcome === "verification failure")
          throw new Error("not yet verified");
      },
    };
    try {
      if (outcome === "success") await completeRecovery(request);
      else await expect(completeRecovery(request)).rejects.toThrow();
      await expect(completeRecovery(request)).rejects.toThrow("EEXIST");
      expect(writes).toBe(1);
      expect(reads).toBe(outcome === "ambiguous finalization" ? 0 : 1);
      expect(
        JSON.parse(
          readFileSync(join(root, "github-write-intent.json"), "utf8"),
        ),
      ).toEqual(request.intent);
    } finally {
      rmSync(root, { recursive: true });
    }
  },
);
const fixture = () => {
  const control = structuredClone(originalControl);
  const records = {};
  for (const observation of control.approvalObservations) {
    const approval = {
      state: "approved",
      user: "MaksymShostak",
      verified: true,
    };
    records[observation.record] = Buffer.from(
      JSON.stringify({
        repository: control.repository,
        runId: Number(control.runId),
        attempt: 1,
        headSha: control.sourceCommit,
        observedAt: observation.observedAt,
        approval: { ...approval, environment: "release-manual" },
        npmReleaseApproval: approval,
      }),
    );
    observation.sha256 = digest(records[observation.record]);
  }
  const jobs = SCOPED_RELEASE_JOB_NAMES.map((name, index) => ({
    id: index + 1,
    name,
    run_id: Number(control.runId),
    head_sha: control.sourceCommit,
    run_attempt: 1,
    status: "completed",
    conclusion: "success",
    html_url: `https://github.com/${control.repository}/actions/runs/${control.runId}/job/${index + 1}`,
  }));
  jobs.find(({ name }) => name === "Release / tag accepted").id =
    control.approvalObservations[0].jobId;
  const publisher = jobs.find(
    ({ name }) => name === "Release / npm trusted publisher",
  );
  publisher.id = control.approvalObservations[1].jobId;
  publisher.steps = [
    {
      name: "Perform the authorized publication and exact-version channel writes",
      status: "completed",
      conclusion: "success",
    },
  ];
  const registryJob = jobs.find(
    ({ name }) => name === "Release / fresh public registry",
  );
  jobs.push({ ...registryJob, id: 114059194373, run_attempt: 2 });
  registryJob.id = control.failedJobs[0].id;
  registryJob.conclusion = "failure";
  jobs.push({
    ...registryJob,
    id: control.failedJobs[1].id,
    name: control.failedJobs[1].name,
    run_attempt: 2,
  });
  const run = {
    id: Number(control.runId),
    run_attempt: 2,
    head_sha: control.sourceCommit,
    head_branch: "main",
    path: ".github/workflows/release.yml",
    event: "workflow_dispatch",
    status: "completed",
    conclusion: "failure",
    actor: { login: "MaksymShostak" },
  };
  const assets = [
    {
      name: "SHA256SUMS",
      bytes: 217,
      sha256:
        "0ca3910e2981e968526ec28686fed696ec815baf0a79da9774e73bf180c7f99b",
    },
    {
      name: "hadden-industries-owlapi-0.1.0-rc.2.cdx.json",
      bytes: 79156,
      sha256:
        "b93b1efc25ea46cf2b15e99e59bae05b2ec50c969e000ab2b78d694e964bc4e0",
    },
    {
      name: "hadden-industries-owlapi-0.1.0-rc.2.tgz",
      bytes: 325713,
      sha256: control.tarballSha256,
    },
  ];
  const candidate = {
    artifactId: String(control.artifacts[0].id),
    artifactDigest: control.artifacts[0].digest,
    checksums: assets[0],
    sbom: assets[1],
    tarball: assets[2],
  };
  const integrity =
    "sha512-vTSHt2y7cRnOK2H53jZTEIUoC5HA0id2fV98yJDTkhpM2vtjtjFri0wTCAQ+Gezgsncxzb3vgUV/g7Mv7UOyzQ==";
  const consumer = {
    package: { name: "@hadden-industries/owlapi", version: "0.1.0-rc.2" },
    integrity,
    signatureAudit: { invalid: [], missing: [] },
  };
  const reports = {
    publication: {
      result: "PASS",
      schemaVersion: 2,
      registryState: "DIRECT_BOOTSTRAP_READY",
      candidate: { sha256: control.tarballSha256 },
      producerContract: contractReport(
        {
          commit: control.sourceCommit,
          runId: Number(control.runId),
          runAttempt: 1,
        },
        {
          workflow: "Release",
          tarballSha256: control.tarballSha256,
          artifact: {
            id: Number(candidate.artifactId),
            digest: candidate.artifactDigest,
          },
        },
      ),
    },
    tag: {
      result: "PASS",
      sourceCommit: control.sourceCommit,
      tag: control.tag,
      signerId: "maksym-shostak-github-ssh-2026",
      signerPrincipal: "MaksymShostak",
      fingerprint: "SHA256:0lELaqBbgGHdSctv4GOpPmROX56wNCaii2PLZI5pXCU",
      githubVerifiedAt: "2026-10-09T22:31:35Z",
    },
    draft: {
      result: "PASS",
      releaseId: control.releaseId,
      releaseUrl: `https://github.com/${control.repository}/releases/tag/${control.tag}`,
      assets,
    },
    registry: {
      result: "PASS",
      coordinate: "@hadden-industries/owlapi@0.1.0-rc.2",
      next: "0.1.0-rc.2",
      latest: "0.1.0-rc.2",
      tarballSha256: control.tarballSha256,
      integrity,
      tarballUrl:
        "https://registry.npmjs.org/@hadden-industries/owlapi/-/owlapi-0.1.0-rc.2.tgz",
      verifiedAt: "2026-10-09T22:48:25.918Z",
      consumer: {
        scoped: structuredClone(consumer),
        alias: structuredClone(consumer),
      },
      provenance: {
        sourceCommit: control.sourceCommit,
        sourceRef: "refs/heads/main",
        workflow: ".github/workflows/release.yml",
        subjectSha256: control.tarballSha256,
        runId: control.runId,
        runAttempt: 1,
      },
    },
  };
  return {
    control,
    records,
    jobs,
    run,
    reports,
    candidate,
    controlCommit: "b".repeat(40),
    inputEvidence: [
      { name: "rc2-finalization-recovery.json", sha256: "c".repeat(64) },
    ],
  };
};

test("preserves original publication, successful second verification and explicit operator recovery", () => {
  const f = fixture();
  assertApprovalObservations(f.control, f.records, f.jobs);
  assertRecoveryRun(f.control, f.run, f.jobs);
  const evidence = buildRecoveryEvidence(f);
  expect(evidence.schemaVersion).toBe(5);
  expect(evidence.publication.provenance.runAttempt).toBe(1);
  expect(evidence.workflow.runAttempt).toBe(2);
  expect(evidence.qualificationWorkflow.runAttempt).toBe(1);
  expect(
    evidence.extendedTests.find(
      ({ environment }) => environment === "operator-finalization-recovery",
    ).reason,
  ).toContain("workflow evidence job failed");
  expect(
    evidence.requiredJobs.some(({ name }) => name === "Release / evidence"),
  ).toBe(false);
});

test("rejects jointly altered preparation hashes and evidence facts", () => {
  const f = fixture();
  const expected = buildRecoveryEvidence(f);
  const changed = structuredClone(expected);
  changed.approvals[0].observedAt = "2026-10-09T22:48:59Z";
  expect(() => assertPreparedEvidence(changed, expected)).toThrow(
    "authenticated recovery inputs",
  );
  expect(() =>
    assertPreparedEvidence(expected, structuredClone(expected)),
  ).not.toThrow();
});

test("rejects a missing original approval observation", () => {
  const f = fixture();
  f.control.approvalObservations.pop();
  expect(() =>
    assertApprovalObservations(f.control, f.records, f.jobs),
  ).toThrow("Both distinct");
});

test.each([
  "digest",
  "reviewer",
  "source",
  "run",
  "protected job",
  "protected attempt",
])("rejects mismatched approval %s", (fault) => {
  const f = fixture();
  const observation = f.control.approvalObservations[0];
  if (fault === "digest") f.records[observation.record] = Buffer.from("{}");
  if (fault === "reviewer") observation.reviewer = "another-user";
  if (fault === "source" || fault === "run") {
    const record = JSON.parse(f.records[observation.record]);
    if (fault === "source") record.headSha = "a".repeat(40);
    else record.runId++;
    f.records[observation.record] = Buffer.from(JSON.stringify(record));
    observation.sha256 = digest(f.records[observation.record]);
  }
  const job = f.jobs.find(({ id }) => id === observation.jobId);
  if (fault === "protected job") job.conclusion = "failure";
  if (fault === "protected attempt") job.run_attempt = 2;
  expect(() =>
    assertApprovalObservations(f.control, f.records, f.jobs),
  ).toThrow();
});

test.each(["future attempt", "source", "failure history"])(
  "rejects changed recovery %s",
  (fault) => {
    const f = fixture();
    if (fault === "future attempt") f.run.run_attempt = 3;
    if (fault === "source") f.run.head_sha = "a".repeat(40);
    if (fault === "failure history")
      f.jobs.find(({ id }) => id === f.control.failedJobs[1].id).conclusion =
        "success";
    expect(() => assertRecoveryRun(f.control, f.run, f.jobs)).toThrow();
  },
);

test.each([
  "bytes",
  "provenance attempt",
  "signature",
  "consumer",
  "channel",
  "producer",
])("rejects changed report %s", (fault) => {
  const f = fixture();
  if (fault === "bytes") f.reports.registry.tarballSha256 = "a".repeat(64);
  if (fault === "provenance attempt")
    f.reports.registry.provenance.runAttempt = 2;
  if (fault === "signature")
    f.reports.registry.consumer.alias.signatureAudit.invalid.push({});
  if (fault === "consumer")
    f.reports.registry.consumer.scoped.package.name = "other-package";
  if (fault === "channel") f.reports.registry.latest = "0.1.0-rc.1";
  if (fault === "producer")
    f.reports.publication.producerContract.identity.commit = "a".repeat(40);
  expect(() => buildRecoveryEvidence(f)).toThrow();
});

test.each([
  "../registry-verification.json",
  "/registry-verification.json",
  "registry-verification.json\nregistry-verification.json",
  "link/registry-verification.json",
])("rejects unsafe or unexpected archive entry %s", (entry) => {
  expect(() =>
    assertArchiveEntries(entry, ["registry-verification.json"]),
  ).toThrow();
});
