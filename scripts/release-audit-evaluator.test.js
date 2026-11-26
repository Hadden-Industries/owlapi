import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { expect, jest, test } from "@jest/globals";
import { canonicalJson } from "./canonical-json.mjs";
import {
  observeLockedReleaseAudit,
  openPrivateAuditStore,
} from "./release-audit-evaluator-private.mjs";
import { CI_RUNTIME } from "./runtime-policy.mjs";
import { isStrictDescendantPath } from "./release-file-utils.mjs";
import {
  findNpmCliCandidates,
  observeNpmVersion,
  selectNpmCliForVersion,
} from "./assert-workflow-runtime.mjs";

const utc = Date.parse("2026-11-26T12:00:00.000Z");
const hour = 60 * 60 * 1000;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const bytes = (record) => Buffer.from(canonicalJson(record) + "\n");
const issueSignature = jest.fn(async (statement) =>
  Buffer.from(digest(statement)),
);
jest.unstable_mockModule("./release-audit-evaluator-sigstore.mjs", () => ({
  assertAuditEvaluatorIdentity: jest.fn(),
  assertAuditIssuerContext: jest.fn(),
  signAuditStatement: issueSignature,
  async verifyAuditStatement(signature, statement) {
    if (signature.toString() !== digest(statement))
      throw new Error("Untrusted signature");
  },
}));
const {
  buildReleaseAuditSubject,
  captureReleaseAudit,
  evaluateReleaseAudit,
  preflightReleaseAudit,
  verifyReleaseAuditReceipt,
} = await import("./release-audit-evaluator.mjs");

const manifest = { name: "@hadden-industries/owlapi", version: "1.0.0" };
const input = {
  manifestBytes: bytes(manifest),
  lockBytes: bytes({ lockfileVersion: 3, packages: { "": manifest } }),
  tarballSha256: "a".repeat(64),
  graphSha256: "b".repeat(64),
  role: "producer",
  scope: "production",
  platform: { os: "linux", cpu: "x64", node: "26.13.1", npm: "12.2.3" },
};
const source = {
  repositoryId: 1347610640,
  commit: "c".repeat(40),
  runId: 3801,
  attempt: 2,
  jobId: 4402,
  artifactSha256: "d".repeat(64),
};
const evaluator = {
  workflow: ".github/workflows/release.yml",
  controller: "e".repeat(40),
  runId: 3812,
  attempt: 1,
  checkRunId: 5412,
};
const trust = { policySha256: "f".repeat(64), evaluator };
const privateMarker = "PRIVATE_AUDIT_FIXTURE_MARKER";

function report(high = 0) {
  return Buffer.from(
    `  ${canonicalJson({
      auditReportVersion: 2,
      vulnerabilities: high
        ? { fixture: { severity: "high", notes: privateMarker } }
        : {},
      metadata: {
        vulnerabilities: {
          info: 0,
          low: 0,
          moderate: 0,
          high,
          critical: 0,
          total: high,
        },
      },
    })}\r\n`,
  );
}

function fixture({ stdout = report(), status = 0, readback = true } = {}) {
  const held = new Map();
  const events = [];
  return {
    held,
    events,
    options: {
      now: () => utc,
      trust,
      authenticate: async (reference) => {
        expect(reference).toEqual(source);
        return { ...input, source };
      },
      observe: async (candidate) => {
        expect(candidate.manifestBytes.equals(input.manifestBytes)).toBe(true);
        expect(candidate.lockBytes.equals(input.lockBytes)).toBe(true);
        return {
          status,
          stdout,
          stderr: Buffer.from(privateMarker),
          signal: null,
          complete: true,
          runtime: { node: "26.13.1", npm: "12.2.3" },
        };
      },
      store: {
        async retain(id, original) {
          events.push("retain");
          held.set(id, original);
        },
        async read(id) {
          events.push("read");
          return readback ? held.get(id) : Buffer.from(privateMarker);
        },
      },
    },
  };
}

test("binds byte identity and refuses manifest and lock disagreement", () => {
  const subject = buildReleaseAuditSubject(input);
  expect(subject).toMatchObject({
    manifestSha256: digest(input.manifestBytes),
    lockSha256: digest(input.lockBytes),
    graphSha256: input.graphSha256,
    tarballSha256: input.tarballSha256,
    scope: "production",
  });
  expect(
    buildReleaseAuditSubject({
      ...input,
      manifestBytes: Buffer.concat([input.manifestBytes, Buffer.from("\n")]),
    }).manifestSha256,
  ).not.toBe(subject.manifestSha256);
  expect(() =>
    buildReleaseAuditSubject({
      ...input,
      manifestBytes: bytes({ ...manifest, version: "2.0.0" }),
    }),
  ).toThrow("Audit manifest and lock disagree");
});

test("retains exact native bytes only for explicitly selected private evidence", async () => {
  const { held, events, options } = fixture();
  const original = await captureReleaseAudit(source, {
    ...options,
    policySha256: trust.policySha256,
  });
  expect(events).toEqual(["retain", "read"]);
  const saved = JSON.parse(held.get(original.evidenceId));
  expect(Buffer.from(saved.stdout, "base64").equals(report())).toBe(true);
  expect(Buffer.from(saved.stderr, "base64").toString()).toBe(privateMarker);
  expect(saved.status).toBe(0);
});

const clearAuditCli =
  'process.stdout.write(Buffer.from("' +
  report().toString("base64") +
  '", "base64")); process.stderr.write("' +
  privateMarker +
  '");';

test("one routine signature covers the independently admitted receipt members without retained originals", () =>
  withAuditCli(clearAuditCli, async (npmCli) => {
    issueSignature.mockClear();
    const full = { ...input, scope: "full", graphSha256: "0".repeat(64) };
    const entries = [input, full].map((native) => ({
      source,
      subject: buildReleaseAuditSubject(native),
    }));
    const authenticate = async ({ subject }) => ({
      ...(subject.scope === "full" ? full : input),
      source,
    });
    const receipt = await evaluateReleaseAudit(entries, {
      authenticate,
      trust,
      npmCli,
      now: () => utc,
    });
    expect(issueSignature).toHaveBeenCalledTimes(1);
    const statement = JSON.parse(receipt.statement);
    expect(statement).toMatchObject({
      schemaVersion: 2,
      evaluator,
      policySha256: trust.policySha256,
      decidedAt: new Date(utc).toISOString(),
      decision: "ACCEPTED",
    });
    expect(statement.subjects).toHaveLength(2);
    expect(
      statement.subjects.map((entry) => entry.subject.scope).sort(),
    ).toEqual(["full", "production"]);
    expect(
      statement.subjects.every(
        ({ observedAt }) => observedAt === new Date(utc).toISOString(),
      ),
    ).toBe(true);
    expect(receipt.statement.toString()).not.toContain(privateMarker);
    expect(receipt.statement.toString()).not.toContain("evidenceId");
    const options = { trust, entries, npmCli, now: utc + hour };
    await expect(verifyReleaseAuditReceipt(receipt, options)).resolves.toEqual(
      statement,
    );

    const late = utc + 25 * hour;
    const stale = bytes({
      ...statement,
      decidedAt: new Date(late).toISOString(),
    });
    for (const [checked, changed] of [
      [receipt, { entries: [entries[0]] }],
      [
        receipt,
        {
          entries: entries.map((entry) => ({
            ...entry,
            source: { ...entry.source, attempt: 1 },
          })),
        },
      ],
      [receipt, { trust: { ...trust, policySha256: "0".repeat(64) } }],
      [
        receipt,
        { trust: { ...trust, evaluator: { ...evaluator, checkRunId: 5413 } } },
      ],
      [{ ...receipt, signature: Buffer.from("other signature") }, {}],
      [
        { statement: stale, signature: Buffer.from(digest(stale)) },
        { now: late },
      ],
      [
        {
          ...receipt,
          statement: bytes({ ...statement, stdout: privateMarker }),
        },
        {},
      ],
    ]) {
      await expect(
        verifyReleaseAuditReceipt(checked, { ...options, ...changed }),
      ).rejects.toThrow();
    }
  }));

test("the issuer refuses altered input and preserves failure material only for a selected case", () =>
  withAuditCli(
    'process.stdout.write(Buffer.from("' +
      report(1).toString("base64") +
      '", "base64")); process.stderr.write("' +
      privateMarker +
      '"); process.exitCode=1;',
    async (npmCli) => {
      issueSignature.mockClear();
      const entry = { source, subject: buildReleaseAuditSubject(input) };
      const options = {
        npmCli,
        trust,
        now: () => utc,
        authenticate: async () => ({ ...input, source }),
      };
      const { held, options: privateOptions } = fixture();
      await expect(
        evaluateReleaseAudit([entry], {
          ...options,
          authenticate: async () => ({
            ...input,
            graphSha256: "0".repeat(64),
            source,
          }),
        }),
      ).rejects.toThrow("Audit inputs differ from the admitted subject");
      await expect(
        evaluateReleaseAudit([entry], {
          ...options,
          store: privateOptions.store,
        }),
      ).rejects.toThrow(/^Release audit did not satisfy policy$/u);
      expect(held.size).toBe(0);
      await expect(
        evaluateReleaseAudit([entry], {
          ...options,
          store: privateOptions.store,
          retainOriginals: true,
        }),
      ).rejects.toThrow(/^Release audit did not satisfy policy$/u);
      expect(held.size).toBe(1);
      const saved = JSON.parse([...held.values()][0]);
      expect(saved.status).toBe(1);
      expect(Buffer.from(saved.stderr, "base64").toString()).toBe(
        privateMarker,
      );
      expect(issueSignature).not.toHaveBeenCalled();
    },
  ));

test("keeps failed and full-graph observations retrievable without making them eligible", async () => {
  const { held, events, options } = fixture({
    stdout: Buffer.from(privateMarker),
  });
  const original = await captureReleaseAudit(source, {
    ...options,
    policySha256: trust.policySha256,
    authenticate: async () => ({ ...input, scope: "full", source }),
  });
  expect(original.eligible).toBe(false);
  expect(events).toEqual(["retain", "read"]);
  expect(
    Buffer.from(
      JSON.parse(held.get(original.evidenceId)).stdout,
      "base64",
    ).toString(),
  ).toBe(privateMarker);
  const failed = await captureReleaseAudit(source, {
    ...options,
    policySha256: trust.policySha256,
  });
  expect(failed.eligible).toBe(false);
  expect(failed.evidenceId).not.toBe(original.evidenceId);
  expect(held.size).toBe(2);
});

test("admits the native virtual lock for a versionless recipient and an upstream bundle", () =>
  withAuditCli("", async (fixtureCli) => {
    const { npmCli } = selectNpmCliForVersion({
      expectedNpm: CI_RUNTIME.npm,
      candidates: findNpmCliCandidates(),
      observeVersion: observeNpmVersion,
    });
    const root = join(fixtureCli, "../../recipient");
    mkdirSync(root);
    const rootManifest = {
      name: "owlapi-registry-consumer",
      private: true,
      dependencies: { "@hadden-industries/owlapi": "1.0.0" },
    };
    const sri = "sha512-" + Buffer.alloc(64).toString("base64");
    const rootLock = {
      name: rootManifest.name,
      lockfileVersion: 3,
      packages: {
        "": {
          name: rootManifest.name,
          dependencies: rootManifest.dependencies,
        },
        "node_modules/@hadden-industries/owlapi": {
          version: "1.0.0",
          resolved:
            "https://registry.npmjs.org/@hadden-industries/owlapi/-/owlapi-1.0.0.tgz",
          integrity: sri,
          dependencies: { wrapper: "1.0.0" },
        },
        "node_modules/wrapper": {
          version: "1.0.0",
          resolved: "https://registry.npmjs.org/wrapper/-/wrapper-1.0.0.tgz",
          integrity: sri,
          dependencies: { child: "1.0.0" },
          bundleDependencies: ["child"],
        },
        "node_modules/wrapper/node_modules/child": {
          version: "1.0.0",
          inBundle: true,
        },
      },
    };
    const manifestBytes = bytes(rootManifest),
      lockBytes = bytes(rootLock);
    writeFileSync(join(root, "package.json"), manifestBytes);
    writeFileSync(join(root, "package-lock.json"), lockBytes);
    const native = createRequire(npmCli);
    const Arborist = native("@npmcli/arborist");
    const AuditReport = native("@npmcli/arborist/lib/audit-report.js");
    const tree = await new Arborist({
      path: root,
      offline: true,
      ignoreScripts: true,
      ignoreExtension: true,
    }).loadVirtual();
    expect(tree.package.version).toBeUndefined();
    expect(
      tree.inventory.get("node_modules/wrapper/node_modules/child")?.version,
    ).toBe("1.0.0");
    expect(
      new AuditReport(tree, { omit: ["dev"] }).prepareBulkData().child,
    ).toEqual(["1.0.0"]);
    expect(
      buildReleaseAuditSubject({
        ...input,
        role: "recipient",
        manifestBytes,
        lockBytes,
      }).lockSha256,
    ).toBe(digest(lockBytes));
  }));

test("allows file only for the authenticated first-party candidate dependency", () => {
  const root = {
    name: "owlapi-candidate-consumer",
    version: "1.0.0",
    dependencies: { owlapi: "file:candidate.tgz" },
  };
  const packageLock = {
    lockfileVersion: 3,
    packages: {
      "": root,
      "node_modules/owlapi": {
        name: "@hadden-industries/owlapi",
        version: "1.0.0",
        resolved: "file:candidate.tgz",
      },
    },
  };
  const build = (lock) =>
    buildReleaseAuditSubject({
      ...input,
      role: "candidate",
      manifestBytes: bytes(root),
      lockBytes: bytes(lock),
    });
  expect(build(packageLock).role).toBe("candidate");
  expect(() =>
    build({
      ...packageLock,
      packages: {
        ...packageLock.packages,
        "node_modules/@hadden-industries/owlapi":
          packageLock.packages["node_modules/owlapi"],
      },
    }),
  ).toThrow("requires an admitted npm package lock");
  expect(() =>
    build({
      ...packageLock,
      packages: {
        ...packageLock.packages,
        "node_modules/owlapi": {
          ...packageLock.packages["node_modules/owlapi"],
          name: "other-package",
        },
      },
    }),
  ).toThrow("Invalid local candidate audit subject");
});

async function withAuditCli(script, use) {
  const temporaryRoot = realpathSync(tmpdir());
  const fixtureDirectory = mkdtempSync(
    join(temporaryRoot, "owlapi-private-audit-test-"),
  );
  expect(isStrictDescendantPath(temporaryRoot, fixtureDirectory)).toBe(true);
  try {
    const bin = join(fixtureDirectory, "bin");
    mkdirSync(bin);
    writeFileSync(
      join(fixtureDirectory, "package.json"),
      bytes({ name: "npm", version: CI_RUNTIME.npm }),
    );
    const npmCli = join(bin, "npm-cli.js");
    writeFileSync(npmCli, script);
    return await use(npmCli);
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
}

test("the native subprocess uses the exact inputs and isolated configuration", () =>
  withAuditCli(
    `
      const { readFileSync } = require("node:fs");
      const args = process.argv.slice(2);
      if (args[0] !== "audit" || !args.includes("--omit=dev") || !args.includes("--package-lock-only") ||
          !args.includes("--ignore-scripts") || !args.includes("--registry=https://registry.npmjs.org/") ||
          !args.includes("--prefix=" + process.cwd()) || process.env.HOME !== process.cwd() ||
          process.env.NODE_OPTIONS !== undefined || process.env.npm_execpath !== undefined) process.exit(2);
      for (const option of ["--userconfig=", "--globalconfig="]) {
        const config = args.find((arg) => arg.startsWith(option)).slice(option.length);
        if (readFileSync(config).length !== 0) process.exit(3);
      }
      process.stdout.write(readFileSync("package.json"));
      process.stderr.write(readFileSync("package-lock.json"));
    `,
    (npmCli) => {
      const observation = observeLockedReleaseAudit(input, { npmCli });
      expect(observation).toMatchObject({
        status: 0,
        complete: true,
        runtime: { node: process.versions.node, npm: CI_RUNTIME.npm },
      });
      expect(observation.stdout.equals(input.manifestBytes)).toBe(true);
      expect(observation.stderr.equals(input.lockBytes)).toBe(true);
    },
  ));

test("the filesystem store requires existing restricted custody and refuses replacements", () => {
  const temporaryRoot = realpathSync(tmpdir());
  const root = mkdtempSync(join(temporaryRoot, "owlapi-private-store-test-"));
  expect(isStrictDescendantPath(temporaryRoot, root)).toBe(true);
  try {
    if (process.platform === "win32") {
      expect(() => openPrivateAuditStore(root)).toThrow(
        "ACL-verified private audit store",
      );
    } else {
      const store = openPrivateAuditStore(root);
      const evidenceId = "3cbc7bbd-9ec8-48ad-bb48-4088768a6d70";
      const original = Buffer.from(privateMarker);
      store.retain(evidenceId, original);
      expect(store.read(evidenceId).equals(original)).toBe(true);
      expect(() => store.retain(evidenceId, Buffer.from("replace"))).toThrow();
      expect(() => store.read("../other")).toThrow("Invalid audit evidence ID");
      chmodSync(root, 0o750);
      expect(() => openPrivateAuditStore(root)).toThrow("owner-only root");
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pinned npm reports transient eligibility using isolated configuration", async () => {
  const { npmCli } = selectNpmCliForVersion({
    expectedNpm: CI_RUNTIME.npm,
    candidates: findNpmCliCandidates(),
    observeVersion: observeNpmVersion,
  });
  await expect(
    preflightReleaseAudit(input, { npmCli, now: () => utc }),
  ).resolves.toEqual({
    schemaVersion: 1,
    subject: buildReleaseAuditSubject(input),
    observedAt: new Date(utc).toISOString(),
    eligible: true,
  });
});

test("transient production preflight reports a policy denial without original security data or signing", () =>
  withAuditCli(
    `process.stdout.write(Buffer.from("${report(1).toString("base64")}", "base64"));
     process.stderr.write("${privateMarker}"); process.exitCode = 1;`,
    async (npmCli) => {
      const result = await preflightReleaseAudit(input, {
        npmCli,
        now: () => utc,
        identity: {
          sign: () => {
            throw new Error("Unexpected signing");
          },
        },
        store: {
          retain: () => {
            throw new Error("Unexpected retention");
          },
        },
      });
      expect(result).toEqual({
        schemaVersion: 1,
        subject: buildReleaseAuditSubject(input),
        observedAt: new Date(utc).toISOString(),
        eligible: false,
      });
      expect(canonicalJson(result)).not.toContain(privateMarker);
    },
  ));

test("transient preflight rejects malformed reports, unavailable npm and full scope", async () => {
  await withAuditCli(
    `process.stdout.write("${privateMarker}"); process.stderr.write("${privateMarker}");`,
    async (npmCli) => {
      await expect(preflightReleaseAudit(input, { npmCli })).rejects.toThrow(
        /^Trusted audit observation is unavailable$/u,
      );
    },
  );
  await expect(preflightReleaseAudit(input)).rejects.toThrow(
    /^Trusted audit observation is unavailable$/u,
  );
  await expect(
    preflightReleaseAudit({ ...input, scope: "full" }),
  ).rejects.toThrow("Transient audit preflight requires production scope");
});
