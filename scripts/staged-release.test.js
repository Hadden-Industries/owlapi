import {
  checkSealSettings,
  draft,
  reconcilePublishedSeal,
} from "./staged-release-followup.mjs";
import {
  immutableRuleHasNoBypass,
  verifyReservations,
} from "./release-history-checkpoint.mjs";
import { validateStagedReleaseEvidence } from "./staged-evidence.mjs";
import {
  createRepositoryReader,
  readAcknowledgedInventory,
  readWorkflowRuns,
} from "./github-evidence-reader.mjs";
import { zipArchive } from "./fixtures/zip-archive.mjs";
import { physicalName } from "../tooling/artifact-transport/identity.mjs";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { findNpmCliCandidates } from "./assert-workflow-runtime.mjs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  hash,
  assertPriorOperations,
  readStageJournal,
  originArtifact,
  originalBytes,
  stageOnce,
  verifyPrivateStage,
} from "./staged-release.mjs";
import { planChannels, applyLabels } from "./release-channel-operation.mjs";
import { RegistryReadError } from "./public-registry-read.mjs";
import {
  assertQualificationCandidate,
  readReleaseSecurity,
} from "./release-qualification-manifest.mjs";
const bytes = Buffer.from("one immutable fixture");
const sha = "a".repeat(40),
  stageId = "aa884366-0aaa-4033-aed3-438727bb6e42";
const packageName = "@hadden-industries/owlapi";
const manifest = (version) => ({
  schemaVersion: 1,
  workflow: ".github/workflows/release.yml",
  repository: "Hadden-Industries/owlapi",
  commit: sha,
  package: { name: packageName, version },
  runId: "10",
  attempt: "1",
  packedConfig: {
    access: "public",
    tag: "pilot",
    registry: "https://registry.npmjs.org/",
  },
  assets: { tarball: { bytes: bytes.length, sha256: hash(bytes) } },
  integrity: "sha512-" + hash(bytes, "sha512", "base64"),
});
const tags = { pilot: null, next: "0.1.0-rc.3", latest: "0.1.0-rc.3" };
function run(version, channel, command) {
  const m = manifest(version);
  const journal = join(
    mkdtempSync(join(tmpdir(), "owlapi-stage-test-")),
    "journal.jsonl",
  );
  const input = {
    path: "retained.tgz",
    manifest: m,
    env: {
      GITHUB_RUN_ID: "42",
      GITHUB_RUN_ATTEMPT: "1",
      GITHUB_LATEST_BEFORE: "null",
      MANIFEST_SHA256: hash(JSON.stringify(m)),
    },
    journal,
    command,
    channel,
    before: tags,
    bytes,
  };
  return { input, m };
}
test.each(
  ["0.1.0", "0.1.0-rc.4"].flatMap((v) =>
    ["pilot", "latest"].map((tag) => [v, tag]),
  ),
)(
  "stages %s once on %s and verifies the original private bytes",
  async (version, tag) => {
    const commands = [];
    const { input, m } = run(version, tag, (args) => {
      commands.push(args);
      return Buffer.from(
        JSON.stringify({
          [packageName]: {
            name: packageName,
            version,
            integrity: m.integrity,
            stageId,
          },
        }),
      );
    });
    const controller = "c".repeat(40);
    input.env.GITHUB_SHA = version.endsWith("rc.4") ? controller : sha;
    const receipt = await stageOnce(input);
    const expectedOrigin = {
      runId: "42",
      attempt: "1",
      controller: input.env.GITHUB_SHA,
    };
    const journal = readFileSync(input.journal);
    expect(
      readStageJournal(journal, m, input.env.MANIFEST_SHA256, expectedOrigin),
    ).toEqual(receipt);
    expect(() =>
      readStageJournal(journal, m, input.env.MANIFEST_SHA256, {
        ...expectedOrigin,
        controller: "e".repeat(40),
      }),
    ).toThrow();
    const mismatched = journal
      .toString()
      .replace('"channel":"' + tag + '"', '"channel":"next"');
    expect(() =>
      readStageJournal(Buffer.from(mismatched), m, input.env.MANIFEST_SHA256),
    ).toThrow();
    expect(commands).toEqual([
      [
        "stage",
        "publish",
        "retained.tgz",
        "--ignore-scripts",
        "--access=public",
        "--tag=" + tag,
        "--provenance",
        "--json",
        "--registry=https://registry.npmjs.org/",
      ],
    ]);
    const evidence = {
      manifest: m,
      manifestSha256: input.env.MANIFEST_SHA256,
      bytes,
      receipt,
      view: {
        id: stageId,
        packageName,
        version,
        tag,
        shasum: hash(bytes, "sha1"),
      },
    };
    expect(verifyPrivateStage(evidence).state).toBe("PRIVATE_BYTES_VERIFIED");
    for (const bad of [
      { bytes: Buffer.from("different") },
      { view: { ...evidence.view, id: "abc" } },
      { view: { ...evidence.view, tag: "next" } },
    ])
      expect(() => verifyPrivateStage({ ...evidence, ...bad })).toThrow();
    await expect(stageOnce(input)).rejects.toThrow();
    expect(commands.length).toBe(1);
  },
);
test("refuses ambiguous acknowledgement, unapproved tag and historical coordinate", async () => {
  const { input } = run("0.1.0-rc.4", "pilot", () => {
    throw new Error("lost");
  });
  await expect(stageOnce({ ...input, channel: "next" })).rejects.toThrow();
  await expect(
    stageOnce({ ...input, manifest: manifest("0.1.0-rc.3") }),
  ).rejects.toThrow();
  await expect(stageOnce(input)).rejects.toThrow("lost");
  expect(readFileSync(input.journal, "utf8")).toContain("OUTCOME_UNKNOWN");
});
const op = {
  type: "preview",
  support: { stable: null, preview: null },
  version: "0.1.0-rc.4",
  before: tags,
  after: { ...tags, next: "0.1.0-rc.4" },
};
test.each([
  "converges",
  "rate limited",
  "timeout",
  "third value",
  "other tag changed",
])(
  "an acknowledged label %s is polled with a single npm write",
  async (scenario) => {
    let time = 0,
      writes = 0,
      observations = 0;
    const states = [];
    const applied = applyLabels(op, {
      now: () => time,
      sleep: async (ms) => {
        time += ms;
      },
      read: async (options) => {
        if (!writes) return op.before;
        expect(options.attempts).toBe(1);
        expect(options.timeoutMs).toBeLessThanOrEqual(300000 - time);
        ++observations;
        if (scenario === "rate limited" && observations === 1)
          throw new RegistryReadError("retry", {
            status: 429,
            retryAfterMs: 3000,
          });
        if (observations === 1 || scenario === "timeout") return op.before;
        if (scenario === "third value")
          return { ...op.before, next: "0.1.0-rc.9" };
        if (scenario === "other tag changed")
          return { ...op.after, latest: null };
        return op.after;
      },
      write: () => {
        writes++;
        return "+next: " + packageName + "@" + op.version;
      },
      record: (effect) => states.push(effect.state),
    });
    if (scenario === "converges" || scenario === "rate limited") {
      expect(await applied).toEqual(op.after);
      expect(states).toEqual(["REQUESTED", "ACKNOWLEDGED", "SETTLED"]);
    } else {
      await expect(applied).rejects.toThrow(
        scenario === "timeout" ? /five minutes/ : /Conflicting/,
      );
      expect(states).toEqual(["REQUESTED", "ACKNOWLEDGED"]);
    }
    expect(time).toBe(
      scenario === "timeout"
        ? 300000
        : scenario === "rate limited"
          ? 3000
          : 1000,
    );
    expect(writes).toBe(1);
  },
);
test("advances verified RC before stable, requires opening a new preview after stable", () => {
  expect(planChannels(op).after).toEqual(op.after);
  const next = {
    ...op,
    support: { stable: "0.1.0", preview: null },
    version: "0.2.0-rc.1",
    after: { ...tags, next: "0.2.0-rc.1" },
  };
  expect(() => planChannels(next)).toThrow();
  expect(planChannels({ ...next, openLine: true }).classify).toBe(false);
  expect(() => planChannels({ ...op, version: "0.1.0-rc.2" })).toThrow();
});
test.each([null, "0.1.0-rc.2"])(
  "withdraws pre-stable latest and next independently to %s",
  async (target) => {
    const withdraw = {
      ...op,
      type: "withdraw",
      version: tags.latest,
      after: { ...tags, next: target, latest: target },
      restore: [
        { tag: "latest", target },
        { tag: "next", target },
      ],
    };
    let live = { ...tags };
    const events = [];
    await applyLabels(withdraw, {
      read: () => live,
      write: (tag, value) => {
        const previous = live[tag];
        live = { ...live, [tag]: value };
        return (
          (value === null ? "-" : "+") +
          tag +
          ": " +
          packageName +
          "@" +
          (value ?? previous)
        );
      },
      record: (e) => events.push(e),
    });
    expect(live).toEqual(withdraw.after);
    expect(events.map((e) => e.state)).toEqual([
      "REQUESTED",
      "ACKNOWLEDGED",
      "SETTLED",
      "REQUESTED",
      "ACKNOWLEDGED",
      "SETTLED",
    ]);
    const settled = events.filter((e) => e.state === "SETTLED");
    await applyLabels(withdraw, {
      read: () => live,
      write: () => {
        throw Error("replay");
      },
      record: () => {},
      // GitHub may return the two reconciled writer runs newest first.
      settled: [...settled].reverse(),
    });
    for (const effects of [
      [...settled, settled[0]],
      [{ ...settled[0], before: settled[0].after }],
    ]) {
      await expect(
        applyLabels(withdraw, {
          read: () => live,
          write: () => {
            throw new Error("unexpected replay");
          },
          record: () => {},
          settled: effects,
        }),
      ).rejects.toThrow();
    }
    await expect(
      applyLabels(withdraw, {
        read: () => ({ ...tags, pilot: "0.1.0" }),
        write: () => {},
        record: () => {},
      }),
    ).rejects.toThrow();
  },
);
test("managed scanning binds both categories, the protected head and high severity threshold", async () => {
  const analyses = ["actions", "javascript-typescript"].map((n, i) => ({
    category: "/language:" + n,
    id: i + 1,
    ref: "refs/heads/main",
    commit_sha: sha,
    analysis_key: "dynamic/github-code-scanning/codeql:analyze",
    tool: { name: "CodeQL", version: "2.27.4" },
    created_at: new Date().toISOString(),
    error: "",
  }));
  let alerts = [];
  const read = (p) =>
    p.startsWith("/rulesets/")
      ? {
          id: 21687258,
          enforcement: "active",
          target: "branch",
          conditions: {
            ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] },
          },
          rules: [
            {
              type: "code_scanning",
              parameters: {
                code_scanning_tools: [
                  {
                    tool: "CodeQL",
                    alerts_threshold: "none",
                    security_alerts_threshold: "high_or_higher",
                  },
                ],
              },
            },
          ],
        }
      : p.startsWith("/git/")
        ? { object: { sha } }
        : p.includes("analyses")
          ? analyses
          : alerts;
  expect((await readReleaseSecurity({ read, commit: sha })).scans).toHaveLength(
    2,
  );
  alerts = [
    {
      tool: { name: "CodeQL" },
      state: "open",
      rule: { security_severity_level: "high" },
    },
  ];
  await expect(readReleaseSecurity({ read, commit: sha })).rejects.toThrow();
  alerts = [];
  const fresh = analyses[0].created_at;
  analyses[0].created_at = "2000-01-01T00:00:00Z";
  await expect(readReleaseSecurity({ read, commit: sha })).rejects.toThrow();
  analyses[0].created_at = fresh;
  analyses[0].commit_sha = "b".repeat(40);
  await expect(readReleaseSecurity({ read, commit: sha })).rejects.toThrow();
});

test("native npm stages the retained bytes with the selected tag at the registry boundary", async () => {
  const dir = mkdtempSync(join(tmpdir(), "owlapi-native-stage-"));
  const writes = [];
  const server = createServer(async (req, res) => {
    if (req.method === "GET") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end('{"error":"not found"}');
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    writes.push({
      method: req.method,
      path: req.url,
      body: JSON.parse(Buffer.concat(chunks)),
    });
    res.writeHead(201, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ stageId }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const host = "127.0.0.1:" + server.address().port;
    const registry = "http://" + host + "/";
    const npm = process.env.npm_execpath ?? findNpmCliCandidates()[0];
    const config = join(dir, "fixture.npmrc");
    writeFileSync(
      config,
      "registry=" +
        registry +
        "\n//" +
        host +
        "/:_authToken=loopback-test-only\n",
    );
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: packageName,
        version: "0.1.0-rc.4",
        publishConfig: { tag: "pilot", registry, access: "public" },
      }),
    );
    const env = {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      HOME: dir,
      USERPROFILE: dir,
      NPM_CONFIG_CACHE: join(dir, "cache"),
      NPM_CONFIG_USERCONFIG: config,
      NPM_CONFIG_FETCH_RETRIES: "0",
    };
    const cli = async (...args) =>
      (
        await promisify(execFile)(process.execPath, [npm, ...args], {
          cwd: dir,
          env,
          timeout: 15000,
        })
      ).stdout;
    expect((await cli("--version")).trim()).toBe("12.2.2");
    const packed = JSON.parse(await cli("pack", "--ignore-scripts", "--json"))[
      packageName
    ];
    for (const tag of ["pilot", "latest"]) {
      const ack = JSON.parse(
        await cli(
          "stage",
          "publish",
          packed.filename,
          "--ignore-scripts",
          "--access=public",
          "--tag=" + tag,
          "--json",
          "--registry=" + registry,
        ),
      );
      expect(ack[packageName].stageId).toBe(stageId);
      const write = writes.at(-1);
      expect([write.method, decodeURIComponent(write.path)]).toEqual([
        "POST",
        "/-/stage/package/" + packageName,
      ]);
      expect(write.body["dist-tags"]).toEqual({ [tag]: "0.1.0-rc.4" });
      expect(write.body.versions["0.1.0-rc.4"].dist.integrity).toBe(
        packed.integrity,
      );
      expect(
        Buffer.from(Object.values(write.body._attachments)[0].data, "base64"),
      ).toEqual(readFileSync(join(dir, packed.filename)));
    }
    expect(writes).toHaveLength(2);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
}, 45000);

test("expired original proof uses authenticated checkpoint bytes and rejects conflicting native identity", async () => {
  const logical = "release-stage-42-1";
  const repo = { full_name: "Hadden-Industries/owlapi" };
  const run = {
    id: 42,
    run_attempt: 1,
    path: ".github/workflows/stage-release.yml",
    repository: repo,
    head_repository: repo,
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: sha,
    status: "completed",
    conclusion: "success",
  };
  const artifact = {
    name: physicalName({
      logical,
      run: 42,
      attempt: 1,
      producer: "a".repeat(16),
      invocation: "b".repeat(32),
      ordinal: 0,
    }),
    id: 73,
    digest: "sha256:" + hash(bytes),
    workflow_run: { id: 42, head_sha: sha },
    expired: false,
  };
  const checkpoint = {
    files: new Map([
      [
        "origin-42-1-" + logical + ".json",
        Buffer.from(JSON.stringify({ run, artifact })),
      ],
      ["artifact-73.zip", bytes],
    ]),
  };
  const client = {
    read: async () => {
      throw Object.assign(Error("expired"), { httpStatus: 404 });
    },
  };
  const request = {
    runId: "42",
    attempt: "1",
    commit: sha,
    filename: run.path,
    logical,
    artifactId: 73,
  };
  const result = await originArtifact(client, request, checkpoint);
  expect(await originalBytes(client, result)).toEqual(bytes);
  checkpoint.files.set("artifact-73.zip", Buffer.from("changed"));
  await expect(originArtifact(client, request, checkpoint)).rejects.toThrow();
});

test("a successful npm no-op cannot acknowledge an intervening label change", async () => {
  let current = { ...tags };
  const journal = [];
  await expect(
    applyLabels(op, {
      read: () => current,
      write: (tag, value) => {
        current = { ...current, [tag]: value };
        return "";
      },
      record: (e) => journal.push(e),
    }),
  ).rejects.toThrow("acknowledgement");
  expect(journal.map((e) => e.state)).toEqual(["REQUESTED"]);
});

test("qualification binds the upload acknowledgement to one unexpired REST digest", () => {
  const digest = hash(bytes);
  const artifact = { id: 42, digest: "sha256:" + digest, expired: false };
  assertQualificationCandidate([artifact], "42", digest);
  for (const [rows, upload] of [
    [[artifact], artifact.digest],
    [[artifact], "b".repeat(64)],
    [[{ ...artifact, digest }], digest],
    [[{ ...artifact, expired: true }], digest],
    [[artifact, artifact], digest],
    [[], digest],
  ])
    expect(() => assertQualificationCandidate(rows, "42", upload)).toThrow();
});

test("only a known artifact ID retries a visibility 404 within the GET budget", async () => {
  const reads = [];
  let clock = 0;
  const read = createRepositoryReader({
    repository: "Hadden-Industries/owlapi",
    token: "fixture",
    now: () => clock,
    random: () => 0,
    sleep: async (ms) => {
      clock += ms;
    },
    fetchImpl: async (url, options) => {
      reads.push([url, options.method ?? "GET"]);
      return reads.length === 2
        ? Response.json({ id: 42 })
        : new Response(null, { status: 404 });
    },
  });
  const retry = { retryArtifact404: true };
  await expect(read("/actions/artifacts/42", retry)).resolves.toEqual({
    id: 42,
  });
  expect(reads[0]).toEqual(reads[1]);
  expect(clock).toBe(1000);
  await expect(read("/git/ref/tags/v1", retry)).rejects.toThrow(
    "exact artifact ID",
  );
  await expect(read("/actions/artifacts/43", retry)).rejects.toThrow(
    "HTTP 404",
  );
  expect(reads).toHaveLength(5);
});

test("a late run inventory must converge on the acknowledged artifact identity", async () => {
  const artifact = {
    id: 73,
    name: "candidate",
    expired: false,
    workflow_run: { id: 42 },
    digest: "sha256:" + hash(bytes),
    size_in_bytes: 8,
  };
  for (const conflict of [false, true]) {
    const waits = [];
    const result = readAcknowledgedInventory(
      async (path, options) => {
        if (path === "/actions/artifacts/73") {
          expect(options).toEqual({ retryArtifact404: true });
          return artifact;
        }
        return waits.length
          ? {
              total_count: 1,
              artifacts: [
                { ...artifact, name: conflict ? "wrong" : "candidate" },
              ],
            }
          : { total_count: 0, artifacts: [] };
      },
      "42",
      ["73"],
      async (n) => {
        waits.push(n);
      },
    );
    if (conflict) await expect(result).rejects.toThrow("Conflicting");
    else await expect(result).resolves.toEqual([artifact]);
    expect(waits).toEqual([1000]);
  }
});

function failedStageOrigin(writer, retention, journal) {
  const repository = { full_name: "Hadden-Industries/owlapi" };
  const run = {
    id: 42,
    run_attempt: 1,
    path: ".github/workflows/stage-release.yml",
    repository,
    head_repository: repository,
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: sha,
    status: "completed",
    conclusion: "failure",
  };
  const common = {
    run_id: 42,
    run_attempt: 1,
    head_sha: sha,
    status: "completed",
  };
  const jobs = {
    total_count: 2,
    jobs: [
      { ...common, id: 101, name: "admit", conclusion: "success" },
      {
        ...common,
        id: 102,
        name: "stage",
        conclusion: "failure",
        steps: [
          {
            name: "Stage the admitted tarball",
            status: "completed",
            conclusion: writer,
          },
          {
            name: "Retain original stage journal",
            status: "completed",
            conclusion: retention,
          },
        ],
      },
    ],
  };
  const logical = "release-stage-42-1";
  const zip = zipArchive([{ path: "journal.jsonl", content: journal }]);
  const artifact = {
    id: 73,
    name: physicalName({
      logical,
      run: 42,
      attempt: 1,
      producer: "a".repeat(16),
      invocation: "b".repeat(32),
      ordinal: 0,
    }),
    workflow_run: { id: 42, head_sha: sha },
    expired: true,
    size_in_bytes: zip.length,
    digest: "sha256:" + hash(zip),
  };
  const checkpoint = {
    files: new Map([
      [
        "origin-42-1-" + logical + ".json",
        Buffer.from(JSON.stringify({ run, jobs, artifact })),
      ],
      ["artifact-73.zip", zip],
    ]),
  };
  const client = {
    read: async (path) => {
      if (path.startsWith("/actions/workflows/"))
        return { workflow_runs: [run], total_count: 1 };
      if (path.endsWith("/jobs?per_page=100")) return jobs;
      if (path.endsWith("/attempts/1")) return run;
      if (path.includes("/artifacts?"))
        return { artifacts: [artifact], total_count: 1 };
      if (path === "/actions/artifacts/73") return artifact;
      throw Error("Unexpected path " + path);
    },
  };
  return {
    run,
    jobs,
    client,
    checkpoint,
    request: {
      filename: run.path,
      commit: sha,
      runId: "42",
      attempt: "1",
      logical,
    },
  };
}

test("a failed stage run can supply its original journal only after the writer succeeded", async () => {
  const { run, jobs, client, checkpoint, request } = failedStageOrigin(
    "success",
    "failure",
    "original journal",
  );
  const recover = () =>
    originArtifact(
      client,
      { ...request, stageFailure: "retention" },
      checkpoint,
    );
  await expect(originArtifact(client, request, checkpoint)).rejects.toThrow();
  const recovered = await recover();
  expect(recovered.retentionFailure).toEqual({
    runId: "42",
    attempt: "1",
    controller: sha,
    admitJob: 101,
    stageJob: 102,
    stage: "success",
    retention: "failure",
  });
  const offline = {
    read: async () => {
      throw Object.assign(Error("expired"), { httpStatus: 404 });
    },
  };
  const archived = await originArtifact(
    offline,
    { ...request, stageFailure: "retention" },
    checkpoint,
  );
  expect(archived.retentionFailure).toEqual(recovered.retentionFailure);
  const savedKey = "origin-42-1-" + request.logical + ".json";
  const original = checkpoint.files.get(savedKey);
  const saved = JSON.parse(original);
  saved.run.conclusion = "success";
  checkpoint.files.set(savedKey, Buffer.from(JSON.stringify(saved)));
  await expect(recover()).rejects.toThrow("Conflicting signed original run");
  saved.run.conclusion = "failure";
  saved.jobs.jobs[1].id++;
  checkpoint.files.set(savedKey, Buffer.from(JSON.stringify(saved)));
  await expect(recover()).rejects.toThrow(
    "Conflicting signed stage job inventory",
  );
  delete saved.jobs;
  checkpoint.files.set(savedKey, Buffer.from(JSON.stringify(saved)));
  await expect(
    originArtifact(
      client,
      { ...request, stageFailure: "retention", requireArchivedFailure: true },
      checkpoint,
    ),
  ).rejects.toThrow("signed history");
  checkpoint.files.set(savedKey, original);
  run.conclusion = "cancelled";
  await expect(recover()).rejects.toThrow();
  run.conclusion = "failure";
  jobs.jobs[1].steps[0].conclusion = "failure";
  await expect(recover()).rejects.toThrow();
  jobs.jobs[1].steps[0].conclusion = "success";
  jobs.jobs[1].steps.push({
    name: "Unexpected failure",
    status: "completed",
    conclusion: "failure",
  });
  await expect(recover()).rejects.toThrow();
  jobs.jobs[1].steps.pop();
  jobs.jobs[1].head_sha = "d".repeat(40);
  await expect(recover()).rejects.toThrow();
});

test.each(["NO_REQUEST", "REQUESTED", "OUTCOME_UNKNOWN"])(
  "a signed %s disposition is checked against original native bytes before resubmission",
  async (state) => {
    const disposition = {
      state: "NO_REQUEST",
      runId: "42",
      attempt: "1",
      manifestSha256: hash(bytes),
    };
    const { client, checkpoint } = failedStageOrigin(
      "failure",
      "success",
      JSON.stringify({ ...disposition, state, controller: sha }),
    );
    checkpoint.files.set(
      "stage-42-1.json",
      Buffer.from(JSON.stringify(disposition)),
    );
    const admitted = assertPriorOperations(
      client,
      { GITHUB_RUN_ID: "71", MANIFEST_SHA256: hash(bytes) },
      checkpoint,
      "stage",
    );
    if (state === "NO_REQUEST") await admitted;
    else await expect(admitted).rejects.toThrow();
  },
);

test("a corrupted third draft asset is rejected before the first GitHub write", async () => {
  const assets = Object.fromEntries(
    ["tarball", "sbom", "checksums"].map((name) => [
      name,
      { name, bytes: bytes.length, sha256: hash(bytes) },
    ]),
  );
  const calls = [];
  await expect(
    draft(
      {
        getReleaseByTag: async () => null,
        write: async () => {
          calls.push("POST");
        },
      },
      {
        operation: { version: "0.1.0", expectedReleaseId: null },
        manifest: { assets },
        read: (name) => (name === "checksums" ? Buffer.from("altered") : bytes),
      },
    ),
  ).rejects.toThrow();
  expect(calls).toEqual([]);
});

test("seal requires fresh native settings at the documented level and can renew the original operation", () => {
  const now = Date.parse("2026-11-13T22:00:00Z");
  const responseJson = '{"enabled":true,"enforced_by_owner":false}';
  const immutableReleases = {
    responseJson,
    checkedAt: new Date(now).toISOString(),
    evidence: {
      url: "https://api.github.com/repos/Hadden-Industries/owlapi/immutable-releases",
      sha256: hash(responseJson),
    },
  };
  const encode = (fields) =>
    Buffer.from(JSON.stringify({ type: "seal", ...fields }));
  const original = encode({ immutableReleases });
  checkSealSettings(original, undefined, now);
  for (const override of [
    { checkedAt: new Date(now - 3600001).toISOString() },
    { checkedAt: new Date(now + 1).toISOString() },
    {
      responseJson: '{"enabled":false}',
      evidence: {
        ...immutableReleases.evidence,
        sha256: hash('{"enabled":false}'),
      },
    },
    { responseJson: responseJson + " " },
    { evidence: { ...immutableReleases.evidence, url: "https://example.org" } },
  ])
    expect(() =>
      checkSealSettings(
        encode({ immutableReleases: { ...immutableReleases, ...override } }),
        undefined,
        now,
      ),
    ).toThrow();
  expect(() =>
    checkSealSettings(
      encode({ decision: { immutableReleases } }),
      undefined,
      now,
    ),
  ).toThrow();
  const later = now + 7200000;
  const renewed = {
    immutableReleases: {
      ...immutableReleases,
      checkedAt: new Date(later).toISOString(),
    },
    operationSha256: hash(original),
  };
  checkSealSettings(original, renewed, later);
  expect(() =>
    checkSealSettings(
      encode({ releaseId: 99, immutableReleases }),
      renewed,
      later,
    ),
  ).toThrow();
});

test("durable reservations reject a second run and survive lost Actions history", async () => {
  const tag = "owlapi-release-history/stage-7";
  const checkpoint = { tag, objectId: sha, files: new Map() };
  const current = { ref: "refs/tags/" + tag, object: { type: "tag", sha } };
  const previous = {
    ref: "refs/tags/owlapi-release-history/stage-4",
    object: { type: "tag", sha: "f".repeat(40) },
  };
  const client = {
    read: (p) => (p.endsWith("stage-") ? [current, previous] : []),
  };
  const env = { GITHUB_RUN_NUMBER: "7", GITHUB_RUN_ATTEMPT: "1" };
  await expect(
    verifyReservations(client, checkpoint, env, "stage"),
  ).rejects.toThrow();
  checkpoint.files.set(
    "reservation-stage-4.json",
    Buffer.from(
      JSON.stringify({ state: "SETTLED", object: previous.object.sha }),
    ),
  );
  await verifyReservations(client, checkpoint, env, "stage");
  await expect(
    verifyReservations(
      client,
      checkpoint,
      { ...env, GITHUB_RUN_NUMBER: "8" },
      "stage",
    ),
  ).rejects.toThrow();
});
test("workflow history can cross the first 100 native runs", async () => {
  const records = Array.from({ length: 101 }, (_, i) => ({ id: i + 1 }));
  const list = await readWorkflowRuns(
    (p) => ({
      total_count: 101,
      workflow_runs: p.endsWith("page=1")
        ? records.slice(0, 100)
        : records.slice(100),
    }),
    "stage-release.yml",
  );
  expect(list).toEqual(records);
});
test("staged evidence has a distinct closed inventory and binds the public release subject", () => {
  const version = "0.1.0-rc.4",
    stem = "hadden-industries-owlapi-" + version;
  const item = (name) => ({ name, bytes: 10, sha256: "a".repeat(64) });
  const stage = {
    state: "STAGED",
    package: packageName,
    commit: sha,
    version,
    runId: "42",
    attempt: "1",
    stageId,
  };
  const evidence = {
    schemaVersion: 7,
    releaseId: 3,
    source: sha,
    tagObject: "b".repeat(40),
    stage,
    publicVerification: {
      result: "PASS",
      coordinate: packageName + "@" + version,
      tarballSha256: "a".repeat(64),
      publication: { stageId },
      provenance: {
        workflow: ".github/workflows/stage-release.yml",
        sourceCommit: sha,
        runId: "42",
        runAttempt: 1,
      },
    },
    assets: {
      tarball: item(stem + ".tgz"),
      sbom: item(stem + ".cdx.json"),
      checksums: item("SHA256SUMS"),
    },
    archive: item(stem + ".evidence.json.gz"),
  };
  expect(validateStagedReleaseEvidence(evidence)).toBe(evidence);
  const controller = "d".repeat(40);
  stage.controller = controller;
  expect(() => validateStagedReleaseEvidence(evidence)).toThrow();
  evidence.publicVerification.provenance.sourceCommit = controller;
  expect(validateStagedReleaseEvidence(evidence)).toBe(evidence);
  expect(() =>
    validateStagedReleaseEvidence({ ...evidence, schemaVersion: 6 }),
  ).toThrow();
  expect(() =>
    validateStagedReleaseEvidence({
      ...evidence,
      archive: { ...evidence.archive, bytes: 64 * 1024 * 1024 + 1 },
    }),
  ).toThrow();
});

test("read-only rule projections bind the owner's bypass readback to its current revision", () => {
  const rule = { id: 4, updated_at: "2026-11-13T10:01:00Z" };
  const saved = [{ ...rule, bypass_actors: [] }];
  expect(immutableRuleHasNoBypass(rule, saved)).toBe(true);
  expect(
    immutableRuleHasNoBypass(
      { ...rule, updated_at: "2026-11-13T10:02:00Z" },
      saved,
    ),
  ).toBe(false);
  expect(
    immutableRuleHasNoBypass(
      { ...rule, bypass_actors: [{ actor_id: 1 }] },
      saved,
    ),
  ).toBe(false);
});
test("hundreds of prior reservations fit a single signed disposition index", async () => {
  const kind = "stage",
    tag = "owlapi-release-history/stage-305";
  const checkpoint = {
    tag,
    objectId: sha,
    files: new Map(),
    index: { dispositions: {} },
  };
  const refs = Array.from({ length: 305 }, (_, i) => ({
    ref: "refs/tags/owlapi-release-history/stage-" + (i + 1),
    object: { type: "tag", sha },
  }));
  for (let i = 1; i < 305; i++)
    checkpoint.index.dispositions["reservation-stage-" + i + ".json"] = {
      object: sha,
      state: "SETTLED",
    };
  const client = { read: (p) => (p.endsWith("stage-") ? refs : []) };
  await verifyReservations(
    client,
    checkpoint,
    { GITHUB_RUN_NUMBER: "305", GITHUB_RUN_ATTEMPT: "1" },
    kind,
  );
});

test("a lost acknowledgement for an already sealed draft reconciles through reads", async () => {
  const body = "signed notes";
  const request = {
    state: "SEAL_REQUESTED",
    releaseId: 47,
    version: "0.1.0",
    notesSha256: hash(body),
    assets: [{ name: "SHA256SUMS", bytes: 3, sha256: hash(bytes) }],
  };
  const release = {
    id: 47,
    tag_name: "v0.1.0",
    immutable: true,
    draft: false,
    prerelease: true,
    name: "owlapi 0.1.0",
    body,
    assets: [{ name: "SHA256SUMS", size: 3, digest: "sha256:" + hash(bytes) }],
  };
  const client = {
    read: (path) => {
      expect(path).toBe("/releases/47");
      return release;
    },
  };
  expect((await reconcilePublishedSeal(client, request)).state).toBe("SEALED");
  release.body = "modified";
  await expect(reconcilePublishedSeal(client, request)).rejects.toThrow();
});
