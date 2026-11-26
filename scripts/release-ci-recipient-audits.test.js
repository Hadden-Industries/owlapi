import { readCiRecipientAuditInputs } from "./release-ci-recipient-audits.mjs";
import { consumerRuntimeFixture } from "./consumer-runtime-fixture.mjs";
import { REPOSITORY, REPOSITORY_ID } from "./release-identity.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";
import { physicalName } from "../tooling/artifact-transport/identity.mjs";
import { UBUNTU } from "./ubuntu-runner.mjs";

const { matrix } = consumerRuntimeFixture({ newerPatches: false });
const source = { runId: 101, attempt: 2, commit: "a".repeat(40) };
const repo = { id: REPOSITORY_ID, full_name: REPOSITORY };
const run = {
  id: source.runId,
  run_attempt: source.attempt,
  head_sha: source.commit,
  repository: repo,
  head_repository: repo,
  path: ".github/workflows/release.yml",
  status: "in_progress",
  event: "workflow_dispatch",
};
const tarball = Buffer.from("authenticated candidate fixture");
const candidate = {
  id: 201,
  digest: `sha256:${"b".repeat(64)}`,
  tarball,
  tarballSha256: sha256Buffer(tarball),
};

test("required recipient audit inputs cannot disappear from an active protected release run", async () => {
  await expect(
    readCiRecipientAuditInputs({
      client: { read: async () => ({ total_count: 0, jobs: [] }) },
      run,
      workflow: "Release",
      matrix,
      candidate,
      source,
    }),
  ).rejects.toThrow(/missing original recipient job/iu);
});

test.each(["same execution", "changed execution", "expired original"])(
  "checks native artifact custody for %s",
  async (fault) => {
    const start = "2026-11-26T10:00:00.000Z";
    const end = "2026-11-26T10:03:00.000Z";
    const lane = matrix.include[0];
    const names = [
      ...matrix.include.map(({ runner, node }) => [
        `Release / complete consumer qualification / Consumer / ${runner} / Node ${node}`,
        runner,
      ]),
      ...["Chromium", "Firefox", "WebKit"].map((engine) => [
        `Release / browser / ${engine}`,
        UBUNTU.label,
      ]),
      ["Release / installed OWL contract", UBUNTU.label],
    ];
    const jobs = names.map(([name, runner], index) => ({
      name,
      id: 1000 + index,
      run_attempt: 2,
      run_id: run.id,
      head_sha: run.head_sha,
      runner_id: 100 + index,
      status: "completed",
      conclusion: "success",
      started_at: start,
      completed_at: end,
      labels: [runner],
      steps: [],
    }));
    const prior = {
      ...jobs[0],
      id: 800,
      run_attempt: 1,
      steps: [
        {
          name: "Retain the actual consumer lane evidence",
          status: "completed",
          conclusion: "success",
          started_at: start,
          completed_at: end,
        },
      ],
    };
    if (fault === "changed execution") jobs[0].runner_id++;
    const artifact = {
      id: 812,
      name: physicalName({
        logical: `consumer-runtime-${lane.runner}-${lane.node}-attempt-1`,
        run: run.id,
        attempt: 1,
        producer: "a".repeat(16),
        invocation: "b".repeat(32),
        ordinal: 1,
      }),
      size_in_bytes: 100,
      digest: `sha256:${"c".repeat(64)}`,
      created_at: start,
      expires_at: "2027-02-26T10:00:00.000Z",
      expired: fault === "expired original",
      workflow_run: {
        id: run.id,
        head_sha: run.head_sha,
        repository_id: REPOSITORY_ID,
        head_repository_id: REPOSITORY_ID,
      },
    };
    const read = async (path) => {
      if (path.includes("/jobs?filter=latest"))
        return { total_count: jobs.length, jobs };
      if (path.includes("/attempts/1/jobs"))
        return { total_count: 1, jobs: [prior] };
      if (path.includes("/artifacts?per_page="))
        return { total_count: 1, artifacts: [artifact] };
      if (path === `/actions/artifacts/${artifact.id}`) return artifact;
      throw new Error(`Unexpected fixture read ${path}`);
    };
    let downloads = 0;
    const download = async () => {
      downloads++;
      throw new Error("Verified original reached download");
    };
    await expect(
      readCiRecipientAuditInputs({
        client: { read },
        run,
        workflow: "Release",
        matrix,
        candidate,
        source,
        download,
        now: Date.parse(end),
      }),
    ).rejects.toThrow(
      fault === "same execution"
        ? /verified original reached download/iu
        : /original recipient artifact|original successful upload/iu,
    );
    expect(downloads).toBe(fault === "same execution" ? 1 : 0);
  },
);
