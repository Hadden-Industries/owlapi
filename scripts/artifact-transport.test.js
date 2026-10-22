import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  readdir,
  symlink,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { crc32 } from "node:zlib";
import { execFileSync } from "node:child_process";
import { cp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { zipArchive } from "./fixtures/zip-archive.mjs";
import { createSdkAdapter } from "../tooling/artifact-transport/sdk-adapter.mjs";
import { inspectArtifact } from "../tooling/artifact-transport/sdk-inspection.mjs";
import { collectArtifacts } from "../tooling/artifact-transport/collection.mjs";
import {
  policy,
  hashBytes,
  physicalName,
  parseArtifactName,
  selectArtifactGroups,
  matchesLogicalArtifact,
} from "../tooling/artifact-transport/identity.mjs";
import {
  freezePayload,
  assertSameManifest,
  inspectArchive,
  materializeArchive,
} from "../tooling/artifact-transport/payload.mjs";
import {
  retainArtifact,
  classifyUploadError,
} from "../tooling/artifact-transport/transport.mjs";

const scope = {
  logical: "owl-contract-42-1",
  run: "42",
  attempt: 1,
  producer: "a".repeat(16),
  invocation: "b".repeat(32),
};
const snapshot = {
  root: "/owned",
  files: ["/owned/proof.json"],
  manifest: [{ path: "proof.json", bytes: 2, sha256: "c".repeat(64) }],
};
const digest = "d".repeat(64);
const reset = () =>
  Object.assign(new Error("socket reset"), {
    name: "NetworkError",
    code: "ECONNRESET",
  });
const remote = (ordinal = 0) => ({
  id: 100 + ordinal,
  name: physicalName({ ...scope, ordinal }),
  digest: `sha256:${digest}`,
});
function harness(overrides = {}) {
  let clock = 0;
  const trace = [];
  const adapter = {
    upload: async (name) => {
      trace.push(["upload", name]);
      return { id: 100, digest };
    },
    list: async () => {
      trace.push(["list"]);
      return [];
    },
    inspect: async (artifact) => {
      trace.push(["inspect", artifact.id]);
      return { manifest: snapshot.manifest };
    },
    ...overrides,
  };
  const run = (extra = {}) =>
    retainArtifact({
      adapter,
      scope,
      snapshot,
      options: {},
      now: () => clock,
      random: () => 0.5,
      sleep: async (milliseconds) => {
        trace.push(["wait", milliseconds]);
        clock += milliseconds;
      },
      ...extra,
    });
  return { adapter, trace, run };
}

describe("immutable artifact recovery", () => {
  test("retains physical identity, budget and final disposition after a failed attempt", async () => {
    const events = [];
    const h = harness({
      upload: async () => {
        throw new Error("permanent failure");
      },
    });
    await expect(
      h.run({ report: (event) => events.push(event) }),
    ).rejects.toThrow("permanent");
    expect(events.at(-1)).toEqual(
      expect.objectContaining({
        name: physicalName({ ...scope, ordinal: 0 }),
        ordinal: 0,
        disposition: "failed",
        elapsedMilliseconds: 0,
        remainingMilliseconds: policy.deadlineMilliseconds,
      }),
    );
    expect(events[0].disposition).toBe("uploading");
  });
  test("normal operation uploads once and never sleeps or lists", async () => {
    const h = harness();
    expect((await h.run()).id).toBe(100);
    expect(h.trace.map(([operation]) => operation)).toEqual(["upload"]);
  });
  test.each(["CreateArtifact", "FinalizeArtifact"])(
    "recognizes only the pinned %s network wrapper",
    (phase) => {
      const error = new Error(
        `Failed to ${phase}: Unable to make request: ECONNRESET\nIf you are using self-hosted runners, please make sure your runner has access to all GitHub endpoints: https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/about-self-hosted-runners#communication-between-self-hosted-runners-and-github`,
      );
      expect(classifyUploadError(error)).toEqual({
        eligible: true,
        phase,
        code: "ECONNRESET",
      });
      expect(
        classifyUploadError(new Error(`${error.message} trailing unknown text`))
          .eligible,
      ).toBe(false);
    },
  );
  test("lost finalization acknowledgement adopts verified server identity without another upload", async () => {
    const h = harness();
    h.adapter.upload = async () => {
      h.trace.push(["upload"]);
      throw reset();
    };
    h.adapter.list = async () => [remote()];
    expect(await h.run()).toEqual({ id: 100, digest, name: remote().name });
    expect(h.trace).toEqual([["upload"], ["inspect", 100]]);
  });
  test("absence probes precede jittered recovery under a fresh immutable name", async () => {
    const h = harness();
    const names = [];
    h.adapter.upload = async (name) => {
      names.push(name);
      if (names.length === 1) {
        throw reset();
      }
      return { id: 101, digest };
    };
    expect((await h.run()).id).toBe(101);
    expect(names).toEqual([remote(0).name, remote(1).name]);
    expect(h.trace.filter(([op]) => op === "list")).toHaveLength(
      policy.visibilityProbes,
    );
    expect(h.trace.filter(([op]) => op === "wait").at(-1)).toEqual([
      "wait",
      7500,
    ]);
  });
  test("late equivalent copies are checked and the earliest ordinal is selected", async () => {
    const h = harness({
      upload: async () => {
        throw reset();
      },
    });
    let calls = 0;
    h.adapter.list = async () =>
      ++calls <= policy.visibilityProbes ? [] : [remote(1), remote(0)];
    expect((await h.run()).id).toBe(100);
    expect(h.trace.filter(([op]) => op === "inspect")).toEqual([
      ["inspect", 100],
      ["inspect", 101],
    ]);
  });
  test("conflicting recovered bytes stop without another upload", async () => {
    const h = harness({
      upload: async () => {
        throw reset();
      },
      list: async () => [remote()],
      inspect: async () => ({ manifest: [] }),
    });
    await expect(h.run()).rejects.toThrow("Conflicting artifact");
  });
  test.each([
    new Error("HTTP 403"),
    new Error("HTTP 429 exhausted"),
    new Error("insufficient usage"),
    new Error("ECONNRESET"),
    new Error("invalid path"),
  ])(
    "permanent and unknown errors do not trigger recovery: %s",
    async (error) => {
      const h = harness({
        upload: async () => {
          throw error;
        },
      });
      await expect(h.run()).rejects.toThrow(error.message);
      expect(h.trace).toEqual([]);
    },
  );
  test("lookup failure remains unknown and stops recovery", async () => {
    const h = harness({
      upload: async () => {
        throw reset();
      },
      list: async () => {
        throw new Error("lookup unavailable");
      },
    });
    await expect(h.run()).rejects.toThrow("lookup unavailable");
    expect(h.trace).toEqual([]);
  });
  test("malformed/truncated listing is never absence", async () => {
    const h = harness({
      upload: async () => {
        throw reset();
      },
      list: async () => ({ artifacts: [], truncated: true }),
    });
    await expect(h.run()).rejects.toThrow("Incomplete artifact reconciliation");
  });
  test("download or digest verification failure blocks adoption", async () => {
    const h = harness({
      upload: async () => {
        throw reset();
      },
      list: async () => [remote()],
      inspect: async () => {
        throw new Error("digest mismatch");
      },
    });
    await expect(h.run()).rejects.toThrow("digest mismatch");
  });
  test("upload exhaustion has exactly three identities and two recovery waits", async () => {
    const names = [];
    const h = harness({
      upload: async (name) => {
        names.push(name);
        throw reset();
      },
    });
    await expect(h.run()).rejects.toThrow("exhausted");
    expect(new Set(names).size).toBe(policy.maximumUploads);
    expect(
      h.trace.filter(
        ([op, ms]) => op === "wait" && ms > policy.visibilityWaitMilliseconds,
      ),
    ).toHaveLength(2);
  });
  test("cancellation during backoff prevents the next upload", async () => {
    const controller = new AbortController();
    let count = 0;
    const events = [];
    const h = harness({
      upload: async () => {
        count += 1;
        throw reset();
      },
    });
    await expect(
      h.run({
        report: (event) => events.push(event),
        signal: controller.signal,
        sleep: async () => controller.abort(),
      }),
    ).rejects.toThrow();
    expect(count).toBe(1);
    expect(events.at(-1)).toEqual(
      expect.objectContaining({
        disposition: "cancelled",
        name: remote().name,
      }),
    );
  });
  test("deadline prevents continuing after an otherwise successful remote operation", async () => {
    let time = 0;
    const events = [];
    const h = harness({
      upload: async () => {
        time = policy.deadlineMilliseconds;
        return { id: 100, digest };
      },
    });
    await expect(
      h.run({ now: () => time, report: (event) => events.push(event) }),
    ).rejects.toThrow("deadline");
    expect(events.at(-1)).toEqual(
      expect.objectContaining({
        disposition: "deadline-exceeded",
        name: remote().name,
        remainingMilliseconds: 0,
      }),
    );
  });
});

describe("artifact identity selection", () => {
  test("codec binds logical key, producing attempt and immutable ordinal", () => {
    expect(parseArtifactName(remote().name)).toEqual({
      ...scope,
      ordinal: 0,
      legacy: false,
    });
    expect(
      matchesLogicalArtifact(remote().name, scope.logical, {
        run: 42,
        attempt: 1,
      }),
    ).toBe(true);
    expect(
      matchesLogicalArtifact(remote().name, scope.logical, {
        run: 43,
        attempt: 1,
      }),
    ).toBe(false);
    expect(parseArtifactName(scope.logical)).toBeNull();
    expect(
      matchesLogicalArtifact(scope.logical, scope.logical, { legacy: false }),
    ).toBe(false);
  });
  test("one logical report is selected independent of service listing order", () => {
    const groups = selectArtifactGroups([remote(1), remote(0)], {
      name: scope.logical,
      run: 42,
      attempt: 1,
    });
    expect([...groups.values()][0].map((item) => item.id)).toEqual([100, 101]);
  });
  test("duplicate invocations and unknown protocol variants fail closed", () => {
    const other = {
      ...remote(),
      name: physicalName({ ...scope, invocation: "e".repeat(32), ordinal: 0 }),
    };
    expect(() =>
      selectArtifactGroups([remote(), other], {
        name: scope.logical,
        run: 42,
        attempt: 1,
      }),
    ).toThrow("duplicate invocations");
    expect(() =>
      parseArtifactName(`${scope.logical}${policy.nameMarker}unknown`),
    ).toThrow();
  });
  test("temporary coordinate replacement chooses the latest producing workflow attempt only", () => {
    const next = {
      ...remote(),
      id: 200,
      name: physicalName({ ...scope, attempt: 2, ordinal: 0 }),
    };
    const options = { pattern: "owl-contract-*", run: 42, attempt: 2 };
    expect(
      [...selectArtifactGroups([remote(), next], options).values()][0][0].id,
    ).toBe(200);
  });
});

describe("frozen upload subject", () => {
  let root;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "owlapi-artifact-test-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });
  test.each([
    "valid",
    "manifest-mismatch",
    "expanded-budget",
    "download-budget",
    "deadline",
    "cancel",
    "symlink",
  ])(
    "collection retires each download and fails closed before publishing: %s",
    async (scenario) => {
      const workspace = join(root, "workspace");
      const temporary = join(root, "temporary");
      await mkdir(workspace);
      await mkdir(temporary);
      const controller = new AbortController();
      let clock = performance.now();
      const controls = { deadline: clock + 100000, signal: controller.signal };
      const bytes = zipArchive([{ path: "proof.txt", content: "verified" }]);
      const manifest = inspectArchive(bytes, crc32).manifest;
      let inspected = 0;
      let disposed = 0;
      let live = 0;
      if (scenario === "symlink") {
        await mkdir(join(root, "outside"));
        await symlink(
          join(root, "outside"),
          join(workspace, "link"),
          "junction",
        );
      }
      const copies = Array.from(
        { length: scenario === "download-budget" ? 5 : 2 },
        (_, ordinal) => ({
          ...remote(ordinal % policy.maximumUploads),
          size:
            scenario === "download-budget"
              ? policy.maximumArchiveBytes
              : bytes.length,
        }),
      );
      const adapter = {
        inspect: async () => {
          expect(live).toBe(0);
          inspected += 1;
          live += 1;
          const directory = await mkdtemp(join(temporary, "download-"));
          const archivePath = join(directory, "archive.zip");
          await writeFile(archivePath, bytes);
          if (scenario === "deadline") clock = controls.deadline;
          if (scenario === "cancel") controller.abort();
          const declared = manifest.map((file) => ({ ...file }));
          if (scenario === "manifest-mismatch")
            declared[0].sha256 = "0".repeat(64);
          if (scenario === "expanded-budget")
            declared[0].bytes = policy.maximumPayloadBytes + 1;
          return {
            archivePath,
            manifest: declared,
            dispose: async () => {
              await rm(directory, { recursive: true, force: true });
              live -= 1;
              disposed += 1;
            },
          };
        },
      };
      const run = () =>
        collectArtifacts({
          adapter,
          groups:
            scenario === "download-budget"
              ? new Map(
                  copies.map((copy, index) => [
                    `${scope.logical}-${index}`,
                    [copy],
                  ]),
                )
              : new Map([[scope.logical, copies]]),
          workspace,
          path: scenario === "symlink" ? "link/collected" : "collected",
          temporary,
          exact: scenario !== "download-budget",
          controls,
          now: () => clock,
        });
      if (scenario === "valid") {
        await run();
        expect(
          await readFile(join(workspace, "collected/proof.txt"), "utf8"),
        ).toBe("verified");
        expect(inspected).toBe(2);
      } else {
        await expect(run()).rejects.toThrow();
        await expect(
          readFile(join(workspace, "collected/proof.txt")),
        ).rejects.toThrow();
      }
      expect(disposed).toBe(inspected);
      expect(live).toBe(0);
      expect(
        (await readdir(temporary)).filter((name) =>
          name.startsWith("download-"),
        ),
      ).toEqual([]);
      if (scenario === "symlink") expect(inspected).toBe(0);
      if (scenario === "download-budget") expect(inspected).toBe(3);
    },
  );
  test("raw disk-growth guard terminates its isolated worker before inspection returns", () => {
    const inspection = new URL(
      "../tooling/artifact-transport/sdk-inspection.mjs",
      import.meta.url,
    ).href;
    const program = `import {inspectArtifact} from ${JSON.stringify(inspection)}; import {open} from "node:fs/promises"; import {join} from "node:path"; const client={downloadArtifact:async()=>{const f=await open(join(${JSON.stringify(root)},"oversized.zip"),"w");await f.truncate(${policy.maximumArchiveBytes + 1});await f.close();await new Promise(resolve=>setTimeout(resolve,1000));return {};}};await inspectArtifact(client,{id:1,size:1,digest:"sha256:${"0".repeat(64)}"},${JSON.stringify(root)}); console.log("UNEXPECTED_INSPECTION_RETURN");`;
    try {
      execFileSync(process.execPath, ["--input-type=module", "-e", program], {
        windowsHide: true,
        timeout: 10000,
        stdio: ["ignore", "pipe", "pipe"],
      });
      throw new Error("Worker unexpectedly succeeded");
    } catch (error) {
      expect(error.status).toBe(1);
      expect(error.signal).toBeNull();
      expect(error.stdout?.toString()).not.toContain(
        "UNEXPECTED_INSPECTION_RETURN",
      );
      expect(error.stderr?.toString()).toBe("");
    }
  }, 15000);
  test("keeps explicit common-root layout and frozen bytes while excluding hidden descendants", async () => {
    const workspace = join(root, "workspace");
    await mkdir(join(workspace, ".release/proof/sub"), { recursive: true });
    await writeFile(join(workspace, ".release/proof/one.json"), "one");
    await writeFile(join(workspace, ".release/proof/sub/two.txt"), "two");
    await writeFile(join(workspace, ".release/proof/.secret"), "private");
    const frozen = await freezePayload({
      workspace,
      paths: ".release/proof",
      destination: join(root, "snapshot"),
    });
    await writeFile(join(workspace, ".release/proof/one.json"), "changed");
    expect(frozen.manifest.map((item) => item.path)).toEqual([
      "one.json",
      "sub/two.txt",
    ]);
    expect(await readFile(join(frozen.root, "one.json"), "utf8")).toBe("one");
    expect(() =>
      assertSameManifest(frozen.manifest, frozen.manifest.slice(1)),
    ).toThrow();
  });
  test("refuses globs, missing files and escaping inputs", async () => {
    const options = { workspace: root, destination: join(root, "snapshot") };
    await expect(
      freezePayload({ ...options, paths: "*.json" }),
    ).rejects.toThrow("literal");
    await expect(
      freezePayload({ ...options, paths: "missing.json" }),
    ).rejects.toThrow();
    await expect(
      freezePayload({ ...options, paths: "../outside" }),
    ).rejects.toThrow("escapes");
  });
  test("rejects hidden manifest components before uploading mixed literal roots", async () => {
    await mkdir(join(root, ".release"));
    await mkdir(join(root, "docs"));
    await writeFile(join(root, ".release/a.json"), "{}");
    await writeFile(join(root, "docs/b.json"), "{}");
    await expect(
      freezePayload({
        workspace: root,
        paths: ".release/a.json\ndocs/b.json",
        destination: join(root, "snapshot"),
      }),
    ).rejects.toThrow("hidden");
  });
  test.each([
    "valid",
    "sdk-digest-mismatch",
    "wrong-size",
    "wrong-digest",
    "extra-file",
  ])("public SDK raw inspection checks actual bytes: %s", async (scenario) => {
    const archive = zipArchive([{ path: "proof.json", content: "verified" }]);
    const directory = join(root, "raw");
    await mkdir(directory);
    const metadata = {
      id: 200,
      size: archive.length,
      digest: `sha256:${hashBytes(archive)}`,
    };
    if (scenario === "wrong-size") metadata.size += 1;
    if (scenario === "wrong-digest")
      metadata.digest = `sha256:${"0".repeat(64)}`;
    let requested;
    const sdk = {
      downloadArtifact: async (id, options) => {
        requested = { id, ...options };
        await writeFile(join(directory, "raw.zip"), archive);
        if (scenario === "extra-file")
          await writeFile(join(directory, "extra"), "extra");
        return { digestMismatch: scenario === "sdk-digest-mismatch" };
      },
    };
    if (scenario === "valid") {
      const verified = await inspectArtifact(sdk, metadata, directory);
      expect(verified.manifest).toEqual([
        { path: "proof.json", bytes: 8, sha256: hashBytes("verified") },
      ]);
    } else {
      await expect(inspectArtifact(sdk, metadata, directory)).rejects.toThrow(
        /digest|size|inventory/u,
      );
    }
    expect(requested).toEqual({
      id: 200,
      path: directory,
      expectedHash: metadata.digest,
      skipDecompress: true,
    });
  });
  test("rejects directory symlinks even when their targets contain ordinary files", async () => {
    await mkdir(join(root, "target"));
    await writeFile(join(root, "target/file"), "payload");
    await symlink(join(root, "target"), join(root, "link"), "junction");
    await expect(
      freezePayload({
        workspace: root,
        paths: "link",
        destination: join(root, "snapshot"),
      }),
    ).rejects.toThrow("symlink");
  });
  test("validates stored/deflated payloads before bounded materialization", async () => {
    const archive = inspectArchive(
      zipArchive([
        { path: "proof.json", content: "{}" },
        { path: "sub/report.txt", content: "report", compression: "deflated" },
      ]),
      crc32,
    );
    expect(archive.manifest.map((item) => item.path)).toEqual([
      "proof.json",
      "sub/report.txt",
    ]);
    await materializeArchive(archive.files, join(root, "recovered"));
    expect(await readFile(join(root, "recovered/sub/report.txt"), "utf8")).toBe(
      "report",
    );
    await expect(
      materializeArchive(archive.files, join(root, "recovered")),
    ).rejects.toThrow();
  });
  test.each([
    "../escape",
    "/absolute",
    "drive:escape",
    ".secret",
    "trailing.",
    "CON",
  ])("rejects unsafe archive path before extraction: %s", (path) => {
    expect(() =>
      inspectArchive(zipArchive([{ path, content: "bytes" }]), crc32),
    ).toThrow();
  });
  test("rejects duplicate/case-colliding entries and corrupt bytes", () => {
    expect(() =>
      inspectArchive(
        zipArchive([
          { path: "proof.json", content: "one" },
          { path: "PROOF.json", content: "two" },
        ]),
        crc32,
      ),
    ).toThrow();
    const bytes = zipArchive([{ path: "proof.json", content: "one" }]);
    bytes[30 + Buffer.byteLength("proof.json")] += 1;
    expect(() => inspectArchive(bytes, crc32)).toThrow("CRC");
  });
  test("checks declared expansion bounds before decompressing and accepts empty deflated files", () => {
    expect(
      inspectArchive(
        zipArchive([
          { path: "empty.txt", content: "", compression: "deflated" },
        ]),
        crc32,
      ).manifest[0].bytes,
    ).toBe(0);
    const archive = zipArchive([
      { path: "small.txt", content: "small", compression: "deflated" },
    ]);
    const centralOffset = archive.readUInt32LE(archive.length - 6);
    archive.writeUInt32LE(policy.maximumPayloadBytes + 1, centralOffset + 24);
    expect(() => inspectArchive(archive, crc32)).toThrow(
      "uncompressed-size safety limit",
    );
  });
  test("SDK worker cancellation closes its handles before temporary retirement", async () => {
    const worker = join(root, "hanging-worker.mjs");
    await writeFile(worker, "process.on('message', () => {});\n");
    const adapter = createSdkAdapter({ worker, temporary: root });
    await expect(
      adapter.upload(
        "name",
        snapshot,
        {},
        {
          deadline: performance.now() + 100,
          signal: new AbortController().signal,
        },
      ),
    ).rejects.toThrow("deadline");
    await rm(worker);
  });
  test("the deployed JavaScript entry uploads without composite-only environment variables", async () => {
    const source = fileURLToPath(
      new URL("../.github/actions/retain-artifact/dist", import.meta.url),
    );
    const deployed = join(root, "deployed");
    await cp(source, deployed, { recursive: true });
    // Replace only the child SDK seam; execute the actual deployed entry, snapshot
    // and output code with the environment GitHub supplies to JavaScript actions.
    await writeFile(
      join(deployed, "sdk-worker.mjs"),
      `
      import {readFile} from "node:fs/promises";
      process.once("message", async ({operation, args}) => {
        if (operation !== "upload" || (await readFile(args.files[0], "utf8")) !== "frozen proof") {
          process.exit(1);
        }
        process.send({ok: true, result: {id: 901, digest: "${digest}"}}, () => process.exit(0));
      });
    `,
    );
    const workspace = join(root, "workspace");
    const temporary = join(root, "runner-temp");
    const output = join(root, "outputs");
    await mkdir(workspace);
    await mkdir(temporary);
    await writeFile(join(workspace, "proof.txt"), "frozen proof");
    await writeFile(output, "");
    const inherited = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) => !["GITHUB_ACTION_PATH", "INPUT_MODE"].includes(key),
      ),
    );
    execFileSync(process.execPath, [join(deployed, "action.mjs")], {
      windowsHide: true,
      timeout: 15000,
      env: {
        ...inherited,
        RUNNER_TEMP: temporary,
        GITHUB_WORKSPACE: workspace,
        GITHUB_RUN_ID: scope.run,
        GITHUB_RUN_ATTEMPT: String(scope.attempt),
        GITHUB_JOB: "fixture",
        GITHUB_SERVER_URL: "https://github.com",
        GITHUB_REPOSITORY: "fixture/repository",
        GITHUB_OUTPUT: output,
        INPUT_NAME: scope.logical,
        INPUT_PATH: "proof.txt",
        "INPUT_RETENTION-DAYS": "1",
      },
    });
    const outputs = await readFile(output, "utf8");
    expect(outputs).toContain("901");
    expect(outputs).toContain(digest);
    expect(outputs).toContain(`${scope.logical}${policy.nameMarker}`);
  }, 20000);
  test.each([
    [false, false],
    [true, false],
    [false, true],
  ])(
    "deployed collector validates copies and publishes a single logical payload; conflict=%s pattern=%s",
    async (conflict, pattern) => {
      const deployed = join(root, "deployed");
      await cp(
        fileURLToPath(
          new URL("../.github/actions/retain-artifact/dist", import.meta.url),
        ),
        deployed,
        { recursive: true },
      );
      const archive = zipArchive([
        { path: "proof.txt", content: "one verified payload" },
      ]);
      const archivePath = join(root, "verified.zip");
      await writeFile(archivePath, archive);
      const secondArchive = zipArchive([
        {
          path: "proof.txt",
          content: conflict
            ? "different verified payload"
            : "one verified payload",
        },
      ]);
      const secondPath = join(root, "verified-second.zip");
      await writeFile(secondPath, secondArchive);
      const copies = [
        {
          ...remote(1),
          size: secondArchive.length,
          digest: `sha256:${hashBytes(secondArchive)}`,
        },
        {
          ...remote(0),
          size: archive.length,
          digest: `sha256:${hashBytes(archive)}`,
        },
      ];
      const inspection = new URL(
        "../tooling/artifact-transport/sdk-inspection.mjs",
        import.meta.url,
      ).href;
      await writeFile(
        join(deployed, "sdk-worker.mjs"),
        `
      import {inspectArtifact} from ${JSON.stringify(inspection)};
      import {copyFile} from "node:fs/promises";
      import {join} from "node:path";
      process.once("message", async ({operation,args}) => {
        let result;
        if (operation === "list") result = ${JSON.stringify(copies)};
        else if (operation === "inspect") result = await inspectArtifact({downloadArtifact:async()=>{await copyFile(args.artifact.id===101?${JSON.stringify(secondPath)}:${JSON.stringify(archivePath)},join(args.directory,"raw.zip"));return {}; }},args.artifact,args.directory);
        else process.exit(1);
        process.send({ok:true,result}, () => process.exit(0));
      });
    `,
      );
      const workspace = join(root, "workspace");
      const temporary = join(root, "runner-temp");
      await mkdir(workspace);
      await mkdir(temporary);
      const env = {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            ([key]) => key !== "GITHUB_ACTION_PATH",
          ),
        ),
        RUNNER_TEMP: temporary,
        GITHUB_WORKSPACE: workspace,
        GITHUB_RUN_ID: scope.run,
        GITHUB_RUN_ATTEMPT: String(scope.attempt),
        INPUT_MODE: "collect",
        INPUT_NAME: pattern ? "" : scope.logical,
        INPUT_PATTERN: pattern ? "owl-contract-*" : "",
        INPUT_PATH: "collected",
      };
      const execute = () => {
        try {
          return execFileSync(
            process.execPath,
            [join(deployed, "action.mjs")],
            {
              env,
              windowsHide: true,
              timeout: 15000,
            },
          );
        } catch (error) {
          throw new Error(
            `${error.stdout?.toString() ?? ""}${error.stderr?.toString() ?? ""}`,
            { cause: error },
          );
        }
      };
      const proof = pattern
        ? join(workspace, "collected", scope.logical, "proof.txt")
        : join(workspace, "collected/proof.txt");
      if (conflict) {
        expect(execute).toThrow();
        await expect(readFile(proof)).rejects.toThrow();
      } else {
        execute();
        expect(await readFile(proof, "utf8")).toBe("one verified payload");
        // A second collection must not merge into or overwrite the first destination.
        expect(execute).toThrow();
        expect(await readFile(proof, "utf8")).toBe("one verified payload");
      }
    },
    20000,
  );
  test("the packaged action loads the SDK with only its bundled files", async () => {
    const source = fileURLToPath(
      new URL("../.github/actions/retain-artifact/dist", import.meta.url),
    );
    const action = join(root, "actions/retain-artifact");
    await cp(source, join(action, "dist"), { recursive: true });
    execFileSync(
      process.execPath,
      ["--check", join(action, "dist/action.mjs")],
      { windowsHide: true, timeout: 15000 },
    );
    const result = await createSdkAdapter({
      worker: join(action, "dist/sdk-worker.mjs"),
      temporary: root,
    }).probe();
    expect(result.artifactClient).toBe("function");
  }, 20000);
});
