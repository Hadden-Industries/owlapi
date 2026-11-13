import { reconcilePublishedSeal } from "./staged-release-followup.mjs";
import {
  immutableRuleHasNoBypass,
  verifyReservations,
} from "./release-history-checkpoint.mjs";
import { validateStagedReleaseEvidence } from "./staged-evidence.mjs";
import { readWorkflowRuns } from "./github-evidence-reader.mjs";
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
  originArtifact,
  originalBytes,
  stageOnce,
  verifyPrivateStage,
} from "./staged-release.mjs";
import { planChannels, applyLabels } from "./release-channel-operation.mjs";
import { RegistryReadError } from "./public-registry-read.mjs";
import { readReleaseSecurity } from "./release-qualification-manifest.mjs";
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
    const receipt = await stageOnce(input);
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
