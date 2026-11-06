import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../", import.meta.url));
// Resolve the public Node export from this root consumer, then read its bin metadata.
const sdkUrl = import.meta.resolve("@hadden-industries/markdown-quality");
const metadataPath = fileURLToPath(new URL("../package.json", sdkUrl));
const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
const cli = resolve(dirname(metadataPath), metadata.bin["markdown-quality"]);
const {
  inspectSelection,
  processLogicalDocument,
  runQuality,
  validateQualityResult,
  readExecutionProfile,
} = await import(sdkUrl);

function fixture(t, name) {
  const root = mkdtempSync(join(tmpdir(), `owlapi-markdown-${name}-`));
  t.after(() => {
    assert.equal(dirname(root), resolve(tmpdir()));
    assert.ok(root.startsWith(join(tmpdir(), `owlapi-markdown-${name}-`)));
    rmSync(root, { recursive: true, force: true });
  });
  return root;
}

function validate(report, expected = {}) {
  assert.equal(
    report.schemaVersion,
    5,
    "Consumer independently requires schema 5",
  );
  validateQualityResult(report, expected);
  return report;
}

function native(args, options = {}) {
  const child = spawnSync(process.execPath, [cli, ...args], {
    cwd: repository,
    encoding: "utf8",
    timeout: 60000,
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
  assert.ifError(child.error);
  assert.equal(child.signal, null, child.stderr);
  return child;
}

function result(root, mode, extra = [], options = {}) {
  const child = native([mode, "--root", root, "--json", ...extra], options);
  const report = validate(JSON.parse(child.stdout), {
    operation: mode,
    exitCode: child.status,
  });
  return { ...child, report };
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function treeHashes(root, prefix = "") {
  return readdirSync(join(root, prefix), { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .flatMap((entry) => {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return treeHashes(root, path);
      assert.ok(entry.isFile(), "Fixture members must be regular files");
      return [[path, sha256(readFileSync(join(root, path)))]];
    });
}

test("filesystem repair requires one mode and writes exactly the independently predicted candidate", (t) => {
  const root = fixture(t, "repair");
  const path = join(root, "README.md");
  const original = Buffer.from("#   Consumer\r\n\r\nA paragraph.\r\n");
  const expected = Buffer.from("# Consumer\n\nA paragraph.\n");
  writeFileSync(path, original);
  const preimage = treeHashes(root);
  for (const flags of [[], ["--write", "--dry-run"]]) {
    const refused = result(root, "format", [...flags, "--", "README.md"]);
    assert.equal(refused.status, 2, refused.stderr);
    assert.deepEqual(refused.report.writtenPaths, []);
    assert.equal(sha256(readFileSync(path)), sha256(original));
    assert.deepEqual(treeHashes(root), preimage);
  }
  const preview = result(root, "format", ["--dry-run", "--", "README.md"]);
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(preview.report.operationStatus, "previewed");
  assert.equal(preview.report.qualityBasis, "candidate");
  assert.deepEqual(preview.report.writtenPaths, []);
  assert.equal(sha256(readFileSync(path)), sha256(original));
  assert.deepEqual(treeHashes(root), preimage);
  assert.deepEqual(preview.report.documentResults[0].candidate, {
    inputSha256: sha256(original),
    inputBytes: original.length,
    outputSha256: sha256(expected),
    outputBytes: expected.length,
    changed: true,
  });
  const applied = result(root, "format", ["--write", "--", "README.md"]);
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(applied.report.operationStatus, "completed");
  assert.equal(applied.report.qualityBasis, "applied");
  assert.deepEqual(applied.report.writtenPaths, ["README.md"]);
  assert.equal(applied.report.documentResults[0].writeStatus, "written");
  assert.deepEqual(
    applied.report.documentResults[0].candidate,
    preview.report.documentResults[0].candidate,
  );
  assert.deepEqual(readFileSync(path), expected);
  const second = result(root, "format", ["--write", "--", "README.md"]);
  assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(second.report.writtenPaths, []);
  assert.equal(second.report.documentResults[0].writeStatus, "unchanged");
  const checked = result(root, "check");
  assert.equal(checked.status, 0, checked.stderr);
  assert.equal(checked.report.qualityStatus, "clean");
});

test("SDK physical format keeps guarded write semantics and resource refusals preserve bytes", async (t) => {
  const root = fixture(t, "sdk");
  const path = join(root, "README.md");
  const original = Buffer.from("#   Consumer\n");
  writeFileSync(path, original);
  const refused = validate(
    await runQuality({
      root,
      mode: "format",
      analyzerLimits: { maxDocumentBytes: 1 },
    }),
    { exitCode: 2 },
  );
  assert.ok(refused.errors.some(({ code }) => code === "DOCUMENT_LIMIT"));
  assert.deepEqual(refused.writtenPaths, []);
  assert.deepEqual(readFileSync(path), original);
  const formatted = validate(await runQuality({ root, mode: "format" }), {
    exitCode: 0,
  });
  assert.deepEqual(formatted.writtenPaths, ["README.md"]);
  assert.deepEqual(readFileSync(path), Buffer.from("# Consumer\n"));
});

test("literal operands and empty selections retain scope from nested discovered roots", (t) => {
  const root = fixture(t, "literal");
  const nested = join(root, "nested", "deeper");
  mkdirSync(nested, { recursive: true });
  writeFileSync(join(root, "package.json"), "{}");
  const names = ["--quiet.md", "a [draft].md", "space name.md"];
  for (const path of names) writeFileSync(join(root, path), "# Consumer\n");
  for (const gitRoot of [false, true]) {
    if (gitRoot)
      assert.equal(
        spawnSync("git", ["init", "--quiet"], { cwd: root }).status,
        0,
      );
    const child = native(["inspect", "--json", "--", ...names], {
      cwd: nested,
    });
    assert.equal(child.status, 0, child.stderr);
    const report = validate(JSON.parse(child.stdout), {
      operation: "inspect",
      exitCode: 0,
    });
    assert.equal(resolve(report.root), resolve(root));
    assert.deepEqual(report.selection.files, names);
  }
  for (const flags of [["--files-json", "[]"], ["--"]]) {
    const empty = result(root, "check", flags);
    assert.equal(empty.status, 0, empty.stderr);
    assert.equal(empty.report.selection.mode, "explicit");
    assert.deepEqual(empty.report.selection.files, []);
    assert.deepEqual(empty.report.writtenPaths, []);
  }
  const fallback = fixture(t, "cwd");
  writeFileSync(join(fallback, "README.md"), "# Consumer\n");
  const child = native(["inspect", "--json"], { cwd: fallback });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(resolve(JSON.parse(child.stdout).root), resolve(fallback));
});

test("external npm prefix selects OwlAPI and forwards JSON without lifecycle chatter", (t) => {
  const outside = fixture(t, "external");
  assert.ok(process.env.npm_execpath, "Run via npm run test:markdown");
  const child = spawnSync(
    process.execPath,
    [
      process.env.npm_execpath,
      "--prefix",
      repository,
      "run",
      "--silent",
      "inspect:markdown",
      "--",
      "--",
      "README.md",
    ],
    {
      cwd: outside,
      encoding: "utf8",
      timeout: 60000,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
  const report = validate(JSON.parse(child.stdout), {
    operation: "inspect",
    exitCode: 0,
  });
  assert.equal(resolve(report.root), resolve(repository));
  assert.deepEqual(report.selection.files, ["README.md"]);
});

test("native input failures, quiet strict blockers and discovery preserve fixture bytes", (t) => {
  const root = fixture(t, "failures");
  const path = join(root, "README.md");
  const original = Buffer.from("# Consumer\n\n[Missing](missing.txt)\n");
  writeFileSync(path, original);
  const preimage = treeHashes(root);
  for (const args of [
    ["check", "--files-json", "{"],
    ["check", "--", "absent.md"],
  ]) {
    const child = native([args[0], "--root", root, "--json", ...args.slice(1)]);
    assert.equal(child.status, 2, child.stderr);
    assert.deepEqual(
      validate(JSON.parse(child.stdout), { exitCode: 2 }).writtenPaths,
      [],
    );
  }
  const human = native(["check", "--root", root, "--quiet"]);
  assert.equal(human.status, 1);
  assert.equal(human.stdout, "");
  assert.match(human.stderr, /local-target|missing/i);
  for (const flag of ["--help", "--version"]) {
    const child = native([flag], { cwd: root });
    assert.equal(child.status, 0, child.stderr);
    assert.ok(child.stdout.length > 0);
  }
  assert.deepEqual(readFileSync(path), original);
  assert.deepEqual(treeHashes(root), preimage);
  writeFileSync(
    join(root, ".markdown-quality.json"),
    JSON.stringify({
      schemaVersion: 3,
      lint: { "quality/long-prose-line": "warn" },
    }),
  );
  const warning = Buffer.from(
    "# Consumer\n\n" + "Independent prose example ".repeat(10).trim() + ".\n",
  );
  writeFileSync(path, warning);
  const strictFlags = [
    "--write",
    "--strict",
    "--quiet",
    "--diagnostic-display-level",
    "error",
  ];
  const strict = result(root, "format", strictFlags);
  assert.equal(strict.status, 1, strict.stderr);
  assert.equal(strict.report.operationStatus, "refused");
  assert.deepEqual(strict.report.writtenPaths, []);
  assert.ok(
    strict.report.diagnostics.some(({ severity }) => severity === "warning"),
  );
  assert.equal(strict.stderr, "", "JSON mode emits one complete stdout report");
  const humanStrict = native(["format", "--root", root, ...strictFlags]);
  assert.equal(humanStrict.status, 1, humanStrict.stderr);
  assert.equal(humanStrict.stdout, "");
  assert.match(
    humanStrict.stderr,
    /Strict mode blocked on \d+ hidden warning diagnostics?\./,
  );
  assert.deepEqual(readFileSync(path), warning);
});

test("raw logical buffers emit source only and refuse incompatible flags without physical effects", (t) => {
  const root = fixture(t, "raw");
  const disk = Buffer.from("# Disk\n");
  writeFileSync(join(root, "README.md"), disk);
  const preimage = treeHashes(root);
  const args = [
    "format",
    "--root",
    root,
    "--stdin",
    "--stdin-filepath",
    "README.md",
  ];
  const child = native(args, { input: "#   Buffer\n" });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, "# Buffer\n");
  for (const flag of ["--json", "--write", "--dry-run"]) {
    const refused = native([...args, flag], { input: "#   Buffer\n" });
    assert.equal(refused.status, 2, refused.stderr);
  }
  assert.deepEqual(readFileSync(join(root, "README.md")), disk);
  assert.deepEqual(treeHashes(root), preimage);
});

/** Exercise the installed public bin; fixtures own expected scope and link outcomes. */
function check(root, extra = []) {
  const child = spawnSync(
    process.execPath,
    [cli, "check", "--root", root, "--json", ...extra],
    {
      cwd: repository,
      encoding: "utf8",
      timeout: 60000,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  assert.ifError(child.error);
  const report = JSON.parse(child.stdout);
  validate(report, { operation: "check", exitCode: child.status });
  return { exitCode: child.status, report };
}

test("installed canonical profile and supplied-format commands retain their distinct effects", () => {
  const original = readFileSync(join(repository, "README.md"));
  const profile = spawnSync(
    process.execPath,
    [cli, "inspect-profile", "--root", repository, "--json"],
    { encoding: "utf8", timeout: 15000 },
  );
  assert.equal(profile.status, 0, profile.stdout + profile.stderr);
  assert.equal(
    JSON.parse(profile.stdout).profileSha256,
    readExecutionProfile({ root: repository }).profileSha256,
  );
  assert.equal(Object.hasOwn(JSON.parse(profile.stdout), "passed"), false);
  const formatted = spawnSync(
    process.execPath,
    [cli, "format", "--stdin-request", "--root", repository, "--json"],
    {
      input: JSON.stringify({
        path: "README.md",
        requestId: "canonical-consumer-command",
        contentBase64: original.toString("base64"),
      }),
      encoding: "utf8",
      timeout: 30000,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  assert.equal(formatted.status, 0, formatted.stdout + formatted.stderr);
  const result = JSON.parse(formatted.stdout);
  validate(result, {
    operation: "format",
    exitCode: 0,
    requestId: "canonical-consumer-command",
  });
  assert.deepEqual(result.writtenPaths, []);
  assert.deepEqual(readFileSync(join(repository, "README.md")), original);
});

test("root npm commands preserve explicit-file scope without reconciling a full inventory", (t) => {
  const root = mkdtempSync(join(repository, "markdown-quality-probe-"));
  t.after(() => {
    assert.equal(dirname(root), resolve(repository));
    assert.ok(basename(root).startsWith("markdown-quality-probe-"));
    rmSync(root, { recursive: true, force: true });
  });
  const operand = `${basename(root)}/README.md`;
  const content = "# Consumer\n";
  writeFileSync(join(root, "README.md"), content);
  // A full selection would fail on this unrelated invalid UTF-8 document.
  const sentinel = Buffer.from([0xff]);
  writeFileSync(join(root, "unselected.md"), sentinel);
  assert.ok(
    process.env.npm_execpath,
    "Run the maintained npm run test:markdown entry point with the repository's required npm version",
  );
  for (const [command, operation] of [
    ["check:markdown", "check"],
    ["format:markdown", "format"],
    ["inspect:markdown", "inspect"],
  ]) {
    const child = spawnSync(
      process.execPath,
      [
        process.env.npm_execpath,
        "run",
        "--silent",
        command,
        "--",
        "--json",
        "--",
        operand,
      ],
      {
        cwd: repository,
        encoding: "utf8",
        timeout: 60000,
        maxBuffer: 8 * 1024 * 1024,
      },
    );
    assert.ifError(child.error);
    const report = JSON.parse(child.stdout);
    assert.equal(child.status, 0, JSON.stringify(report.errors));
    validate(report, {
      operation,
      exitCode: 0,
      selectionMode: "explicit",
    });
    assert.deepEqual(report.selection.files, [operand]);
    assert.deepEqual(report.selection.reconciliationDecisions, []);
    assert.deepEqual(report.writtenPaths, []);
    assert.equal(readFileSync(join(root, "README.md"), "utf8"), content);
    assert.deepEqual(readFileSync(join(root, "unselected.md")), sentinel);
  }
});

test("full installed contract detects a missing non-Markdown link target without writes", (t) => {
  const root = fixture(t, "contract");
  writeFileSync(
    join(root, ".markdown-quality.json"),
    JSON.stringify({
      schemaVersion: 3,
    }),
  );
  const content = "# Consumer\n\n[Payload](data.txt)\n";
  writeFileSync(join(root, "README.md"), content);
  const result = check(root);
  assert.equal(result.report.schemaVersion, 5);
  assert.equal(result.exitCode, 1);
  assert.equal(result.report.exitCode, 1);
  assert.ok(
    result.report.diagnostics.some(
      (finding) =>
        finding.rule === "local-target" && finding.severity === "error",
    ),
  );
  assert.deepEqual(result.report.writtenPaths, []);
  assert.equal(readFileSync(join(root, "README.md"), "utf8"), content);
  writeFileSync(join(root, "data.txt"), "Independent link target\n");
  assert.equal(check(root).exitCode, 0);
});

test("root policy accounts for every tracked Markdown path and preserves the reviewed exclusions", async () => {
  const git = spawnSync("git", ["ls-files", "-z", "--", "*.md"], {
    cwd: repository,
    encoding: "utf8",
  });
  assert.equal(git.status, 0);
  const tracked = git.stdout.split("\0").filter(Boolean).sort();
  const excluded = [
    "API.md",
    // Historical decisions retain their original bytes and link interpretation.
    "docs/implementation-plan.md",
    ...tracked.filter((path) => path.startsWith("docs/plans/")),
    // Scanner notices retain upstream bytes across dependency upgrades. Keep
    // their directory boundary fixed without freezing package-version paths.
    ...tracked.filter((path) =>
      path.startsWith("LICENSES/development/scancode-runtime/"),
    ),
    "docs/Deep Review of Phase 19 and Phase 20 of the owlapi Implementation Plan [2026-08-24T1130].md",
    "docs/Deep Review of Phase 19 and Phase 20 of the owlapi Implementation Plan [2026-08-25T0020].md",
    "docs/compatibility/0.1.0-api-delta.md",
    "docs/compatibility/java-api-surface.md",
    "docs/conformance/upstream/w3c-json-ld-api/tests/LICENSE.md",
    "docs/conformance/upstream/w3c-owl2/README.md",
    "docs/conformance/upstream/w3c-rdf-tests/LICENSE.md",
    "docs/conformance/upstream/w3c-rdf-tests/rdf/rdf11/rdf-xml/README.md",
    "docs/provenance/history-reconstruction/README.md",
    "docs/provenance/history-reconstruction/review/partition-proposal-g3-summary.md",
    "util/owlapi-reference/fixtures/profiles/README.md",
  ].sort();
  assert.ok(
    excluded.every((path) => tracked.includes(path)),
    "Frozen exclusions must exist in Git",
  );
  const result = await inspectSelection({
    root: repository,
    reconciliationInventory: "git",
  });
  validate(result, { operation: "inspect", exitCode: 0 });
  // Native full selection also admits authored untracked documents. Verify the
  // complete tracked contract without treating parallel authored work as drift.
  const isTracked = (path) => tracked.includes(path);
  assert.deepEqual(
    result.selection.reconciliationDecisions.map((entry) => entry.path).sort(),
    tracked,
  );
  assert.deepEqual(
    result.selection.reconciliationDecisions
      .filter((entry) => entry.decision === "excluded")
      .map((entry) => entry.path)
      .sort(),
    excluded,
  );
  assert.deepEqual(
    result.selection.files.filter(isTracked),
    tracked.filter((path) => !excluded.includes(path)),
  );
  assert.deepEqual(
    result.selection.omissions
      .filter(({ path, reason }) => isTracked(path) && reason === "excluded")
      .map(({ path }) => path)
      .sort(),
    excluded,
  );
});

test("native Git reconciliation retains authored untracked Markdown", async (t) => {
  const root = fixture(t, "untracked");
  {
    writeFileSync(
      join(root, ".markdown-quality.json"),
      readFileSync(join(repository, ".markdown-quality.json")),
    );
    writeFileSync(join(root, "README.md"), "# Tracked\n");
    for (const args of [
      ["init", "--quiet"],
      ["add", "README.md"],
    ]) {
      assert.equal(spawnSync("git", args, { cwd: root }).status, 0);
    }
    writeFileSync(join(root, "draft.md"), "# Authored draft\n");
    const result = await inspectSelection({
      root,
      reconciliationInventory: "git",
    });
    validate(result, { operation: "inspect", exitCode: 0 });
    assert.deepEqual(result.selection.files, ["README.md", "draft.md"]);
    assert.deepEqual(
      result.selection.reconciliationDecisions.map(({ path }) => path),
      ["README.md"],
    );
  }
});

test("external ignore files cannot suppress authored data; logical exclusions preserve invalid bytes", async (t) => {
  const root = fixture(t, "policy");
  writeFileSync(
    join(root, ".markdown-quality.json"),
    readFileSync(join(repository, ".markdown-quality.json")),
  );
  writeFileSync(join(root, ".gitignore"), "**/*.md\n");
  writeFileSync(join(root, ".prettierignore"), "**/*.md\n");
  mkdirSync(join(root, ".sdlc"));
  writeFileSync(join(root, ".sdlc/authored.md"), "# Authored\n");
  const review =
    "docs/Deep Review of Phase 19 and Phase 20 of the owlapi Implementation Plan [2026-08-24T1130].md";
  const malformed = Buffer.from([0xff, 0x0d, 0x0a]);
  writeFileSync(join(root, ".env.notes.md"), malformed);
  const excluded = await processLogicalDocument({
    root,
    path: review,
    requestId: "excluded",
    content: malformed,
  });
  validate(excluded, { requestId: "excluded", exitCode: 0 });
  assert.deepEqual(
    Buffer.from(excluded.document.contentBase64, "base64"),
    malformed,
  );
  assert.deepEqual(excluded.writtenPaths, []);
  assert.equal(excluded.document.decision, "excluded");
  const selection = await inspectSelection({ root });
  validate(selection, { exitCode: 0 });
  assert.deepEqual(selection.selection.files, [".sdlc/authored.md"]);
  const selected = await processLogicalDocument({
    root,
    path: "README.md",
    requestId: "selected",
    content: malformed,
  });
  validate(selected, { requestId: "selected", exitCode: 2 });
  assert.ok(selected.errors.some((error) => error.code === "INVALID_UTF8"));
  assert.deepEqual(selected.writtenPaths, []);
});

test("ordinary execution consumes finite schema-2 resource limits without an archive trust tuple", () => {
  const profile = readExecutionProfile({ root: repository });
  assert.equal(profile.schemaVersion, 2);
  assert.equal(profile.executionTimeoutMs, 30000);
  assert.equal(profile.maxNodeOldGenerationMiB, 256);
  assert.equal(profile.maxRequestBytes, 8388608);
  assert.equal(profile.maxOutputBytes, 8388608);
  assert.equal(profile.requiredConsecutiveSamples, null);
  assert.equal(profile.toolchain, null);
  for (const value of Object.values(profile.analyzerLimits)) {
    assert.ok(Number.isSafeInteger(value) && value > 0);
  }
});

test("advisory findings admit formatting while strict warnings retain original logical bytes", async (t) => {
  const root = fixture(t, "admission");
  const policy = {
    schemaVersion: 3,
  };
  const content = Buffer.from(
    "# Consumer\n\n" +
      "An independent consumer prose example ".repeat(5).trim() +
      "." +
      "\n",
  );
  writeFileSync(join(root, ".markdown-quality.json"), JSON.stringify(policy));
  const informational = await processLogicalDocument({
    root,
    path: "README.md",
    requestId: "info",
    content,
  });
  validate(informational, { requestId: "info", exitCode: 0 });
  assert.equal(informational.qualityStatus, "findings");
  assert.ok(
    informational.diagnostics.some(
      (finding) =>
        finding.rule === "quality/long-prose-line" &&
        finding.severity === "info",
    ),
  );
  assert.deepEqual(informational.writtenPaths, []);
  policy.lint = { "quality/long-prose-line": "warn" };
  writeFileSync(join(root, ".markdown-quality.json"), JSON.stringify(policy));
  const warning = await processLogicalDocument({
    root,
    path: "README.md",
    requestId: "warning",
    content,
  });
  validate(warning, { requestId: "warning", exitCode: 0 });
  assert.ok(
    warning.diagnostics.some((finding) => finding.severity === "warning"),
  );
  const strict = await processLogicalDocument({
    root,
    path: "README.md",
    requestId: "strict",
    content,
    strict: true,
  });
  validate(strict, { requestId: "strict", exitCode: 1 });
  assert.deepEqual(
    Buffer.from(strict.document.contentBase64, "base64"),
    content,
  );
  assert.deepEqual(strict.writtenPaths, []);
  assert.equal(strict.operationStatus, "refused");
});
