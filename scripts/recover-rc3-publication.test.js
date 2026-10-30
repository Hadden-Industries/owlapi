import {
  RC3_RECOVERY as c,
  assertRecoverySource,
  RECOVERY_SOURCE_JOBS,
  RECOVERY_WRITE_STEP,
  assertRecoveryRegistryUnused,
} from "./rc3-recovery-policy.mjs";

test("publication guard accepts only the unused coordinate and unchanged channels", async () => {
  const responses = [
    new Response(null, { status: 404 }),
    Response.json(c.priorChannels),
  ];
  await expect(
    assertRecoveryRegistryUnused(async () => responses.shift()),
  ).resolves.toBeUndefined();
  expect(responses).toHaveLength(0);
});

test.each([
  "already public",
  "unauthorized",
  "changed channel",
  "missing channel",
  "oversized",
  "malformed",
])("publication guard refuses %s without writing", async (fault) => {
  const responses = [
    new Response(null, {
      status:
        fault === "already public" ? 200 : fault === "unauthorized" ? 403 : 404,
    }),
    fault === "oversized"
      ? new Response(" ".repeat(65537))
      : fault === "malformed"
        ? new Response("{")
        : Response.json(
            fault === "changed channel"
              ? { ...c.priorChannels, latest: "0.2.0" }
              : fault === "missing channel"
                ? {}
                : c.priorChannels,
          ),
  ];
  await expect(
    assertRecoveryRegistryUnused(async () => responses.shift()),
  ).rejects.toThrow();
});
import {
  verifySourceReports,
  assertRecoveryDraft,
} from "./recover-rc3-publication.mjs";
import { contractReport } from "./fixtures/owl-contract-report.mjs";

const source = () => {
  const run = {
    id: Number(c.runId),
    run_attempt: 1,
    head_sha: c.sourceCommit,
    head_branch: "main",
    head_repository: { full_name: c.repository },
    path: ".github/workflows/release.yml",
    event: "workflow_dispatch",
    status: "completed",
    conclusion: "failure",
  };
  const successful = [
    ...RECOVERY_SOURCE_JOBS,
    ...Array.from({ length: 71 }, (_, i) => `Qualification ${i}`),
  ];
  const jobs = [
    ...successful,
    "Release / npm trusted publisher",
    "Release / fresh public registry",
    "Release / evidence",
    "Release / finalize immutable GitHub release",
    "Release / immutable verification",
  ].map((name, index) => ({
    id: index + 1,
    name,
    run_id: Number(c.runId),
    run_attempt: 1,
    head_sha: c.sourceCommit,
    status: "completed",
    conclusion: index < 77 ? "success" : index === 77 ? "failure" : "skipped",
    steps: [],
  }));
  jobs[77].steps = [
    { name: RECOVERY_WRITE_STEP, conclusion: "skipped" },
    {
      name: "Capture the authenticated publisher-gate approval",
      conclusion: "failure",
    },
  ];
  return { run, jobs };
};

test("recovery admits complete native qualification and proves the original write never ran", () => {
  const { run, jobs } = source();
  expect(assertRecoverySource(run, jobs)).toBe(jobs[77]);
});

test.each([
  "source",
  "run",
  "repository",
  "rerun",
  "missing job",
  "duplicate job",
  "failed qualification",
  "write attempted",
  "write missing",
  "wrong failure",
])("source recovery refuses %s", (fault) => {
  const { run, jobs } = source();
  if (fault === "source") run.head_sha = "e".repeat(40);
  if (fault === "run") run.id++;
  if (fault === "repository") run.head_repository.full_name = "other/owlapi";
  if (fault === "rerun") run.run_attempt = 2;
  if (fault === "missing job") jobs.pop();
  if (fault === "duplicate job") jobs[0] = jobs[1];
  if (fault === "failed qualification") jobs[0].conclusion = "failure";
  if (fault === "write attempted") jobs[77].steps[0].conclusion = "failure";
  if (fault === "write missing") jobs[77].steps.shift();
  if (fault === "wrong failure") jobs[77].steps[1].conclusion = "success";
  expect(() => assertRecoverySource(run, jobs)).toThrow();
});

const reports = () => {
  const digest = "a".repeat(64),
    artifact = {
      id: c.artifacts.candidate,
      digest: `sha256:${"b".repeat(64)}`,
    };
  const assets = [
    "SHA256SUMS",
    "hadden-industries-owlapi-0.1.0-rc.3.tgz",
    "hadden-industries-owlapi-0.1.0-rc.3.cdx.json",
  ].map((name) => ({ name, bytes: 10, sha256: digest }));
  return {
    candidate: { tarball: { sha256: digest, bytes: 10 } },
    artifact,
    reports: {
      preflight: {
        result: "PASS",
        schemaVersion: 2,
        canonicalTag: c.tag,
        registryState: "DIRECT_BOOTSTRAP_READY",
        candidate: {
          sha256: digest,
          bytes: 10,
          coordinate: "@hadden-industries/owlapi@0.1.0-rc.3",
        },
        producerContract: contractReport(
          { commit: c.sourceCommit, runId: Number(c.runId), runAttempt: 1 },
          { workflow: "Release", tarballSha256: digest, artifact },
        ),
      },
      tag: { result: "PASS", sourceCommit: c.sourceCommit, tag: c.tag },
      draft: {
        result: "PASS",
        releaseId: c.releaseId,
        sourceCommit: c.sourceCommit,
        tag: c.tag,
        draft: true,
        assets,
      },
    },
    release: {
      id: c.releaseId,
      tag_name: c.tag,
      draft: true,
      prerelease: true,
      immutable: false,
      assets: assets.map((a) => ({
        name: a.name,
        size: a.bytes,
        digest: `sha256:${a.sha256}`,
        state: "uploaded",
      })),
    },
    tag: {
      sha: c.tagObject,
      object: { type: "commit", sha: c.sourceCommit },
      verification: { verified: true },
    },
  };
};
test("read-only admission binds retained draft identity, tag, preflight and OWL proof", () =>
  expect(() => verifySourceReports(reports())).not.toThrow());
test.each([
  "candidate",
  "contract",
  "preflight",
  "tag",
  "signature",
  "draft",
  "draft source",
])("original report admission rejects changed %s", (fault) => {
  const input = reports();
  if (fault === "candidate") input.candidate.tarball.sha256 = "e".repeat(64);
  if (fault === "contract")
    input.reports.preflight.producerContract.identity.runId++;
  if (fault === "preflight") input.reports.preflight.result = "FAIL";
  if (fault === "tag") input.tag.object.sha = "e".repeat(40);
  if (fault === "signature") input.tag.verification.verified = false;
  if (fault === "draft") input.reports.draft.draft = false;
  if (fault === "draft source")
    input.reports.draft.sourceCommit = "e".repeat(40);
  expect(() => verifySourceReports(input)).toThrow();
});

test("the isolated GitHub release job verifies the live draft and its exact assets", () => {
  const input = reports();
  expect(() =>
    assertRecoveryDraft(input.release, input.reports.draft.assets),
  ).not.toThrow();
});

test.each([
  "id",
  "tag",
  "published",
  "stable",
  "immutable",
  "asset",
  "missing asset",
  "extra asset",
])(
  "live draft verification refuses %s before registry publication",
  (fault) => {
    const { release, reports: retained } = reports();
    if (fault === "id") release.id++;
    if (fault === "tag") release.tag_name = "v0.1.0";
    if (fault === "published") release.draft = false;
    if (fault === "stable") release.prerelease = false;
    if (fault === "immutable") release.immutable = true;
    if (fault === "asset") release.assets[0].size++;
    if (fault === "missing asset") release.assets.pop();
    if (fault === "extra asset")
      release.assets.push({ ...release.assets[0], name: "unexpected" });
    expect(() => assertRecoveryDraft(release, retained.draft.assets)).toThrow();
  },
);
