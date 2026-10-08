import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repository = fileURLToPath(new URL("../", import.meta.url));
const metadataPath = join(
  repository,
  "tooling/markdown/node_modules/@hadden-industries/markdown-quality/package.json",
);
const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
const cli = resolve(dirname(metadataPath), metadata.bin["markdown-quality"]);
const tooling = createRequire(
  new URL("../tooling/markdown/package.json", import.meta.url),
);
const {
  inspectSelection,
  processDocument,
  validateQualityResult,
  readExecutionProfile,
} = await import(
  pathToFileURL(tooling.resolve("@hadden-industries/markdown-quality"))
);

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
  validateQualityResult(report, { operation: "check", exitCode: child.status });
  return { exitCode: child.status, report };
}

test("root npm commands preserve explicit-file scope without reconciling a full inventory", () => {
  const root = mkdtempSync(join(tmpdir(), "owlapi-markdown-npm-"));
  const initialized = spawnSync("git", ["init", "--quiet", root], {
    encoding: "utf8",
  });
  assert.equal(initialized.status, 0, initialized.stderr);
  writeFileSync(
    join(root, ".markdown-quality.json"),
    JSON.stringify({
      schemaVersion: 2,
      preset: "authored-gfm@1",
      include: ["**/*.md"],
      exclude: [],
    }),
  );
  const content = "# Consumer\n";
  writeFileSync(join(root, "README.md"), content);
  assert.ok(
    process.env.npm_execpath,
    "Run the maintained npm run test:markdown entry point with the repository's required npm version",
  );
  for (const [command, operation] of [
    ["lint:md", "check"],
    ["format:md", "format"],
    ["inspect:md", "inspect"],
  ]) {
    const child = spawnSync(
      process.execPath,
      [
        process.env.npm_execpath,
        "run",
        command,
        "--",
        "--root",
        root,
        "--json",
        "--",
        "README.md",
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
    validateQualityResult(report, {
      operation,
      exitCode: 0,
      selectionMode: "explicit",
    });
    assert.deepEqual(report.selection.files, ["README.md"]);
    assert.deepEqual(report.written, []);
    assert.equal(readFileSync(join(root, "README.md"), "utf8"), content);
  }
});

test("full installed contract detects a missing non-Markdown link target without writes", () => {
  const root = mkdtempSync(join(tmpdir(), "owlapi-markdown-contract-"));
  writeFileSync(
    join(root, ".markdown-quality.json"),
    JSON.stringify({
      schemaVersion: 2,
      preset: "authored-gfm@1",
      include: ["**/*.md"],
      exclude: [],
      links: { localFiles: true, rootRelative: "reject" },
    }),
  );
  const content = "# Consumer\n\n[Payload](data.txt)\n";
  writeFileSync(join(root, "README.md"), content);
  const result = check(root);
  assert.equal(result.report.schemaVersion, 3);
  assert.equal(result.exitCode, 1);
  assert.equal(result.report.exitCode, 1);
  assert.ok(
    result.report.diagnostics.some(
      (finding) =>
        finding.rule === "local-target" && finding.severity === "error",
    ),
  );
  assert.deepEqual(result.report.written, []);
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
    "docs/Deep Review of Phase 19 and Phase 20 of the owlapi Implementation Plan [2026-08-24T1130].md",
    "docs/Deep Review of Phase 19 and Phase 20 of the owlapi Implementation Plan [2026-08-25T0020].md",
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
  const result = await inspectSelection({ root: repository });
  validateQualityResult(result, { operation: "inspect", exitCode: 0 });
  assert.deepEqual(
    result.selection.inventory.map((entry) => entry.path).sort(),
    tracked,
  );
  assert.deepEqual(
    result.selection.inventory
      .filter((entry) => entry.decision === "excluded")
      .map((entry) => entry.path)
      .sort(),
    excluded,
  );
  assert.deepEqual(
    result.selection.files,
    tracked.filter((path) => !excluded.includes(path)),
  );
});

test("external ignore files cannot suppress authored data; logical exclusions preserve invalid bytes", async () => {
  const root = mkdtempSync(join(tmpdir(), "owlapi-markdown-policy-"));
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
  const excluded = await processDocument({
    root,
    path: review,
    requestId: "excluded",
    content: malformed,
  });
  validateQualityResult(excluded, { requestId: "excluded", exitCode: 0 });
  assert.deepEqual(
    Buffer.from(excluded.document.contentBase64, "base64"),
    malformed,
  );
  assert.deepEqual(excluded.written, []);
  const selection = await inspectSelection({ root });
  validateQualityResult(selection, { exitCode: 0 });
  assert.deepEqual(selection.selection.files, [".sdlc/authored.md"]);
  const selected = await processDocument({
    root,
    path: "README.md",
    requestId: "selected",
    content: malformed,
  });
  validateQualityResult(selected, { requestId: "selected", exitCode: 2 });
  assert.ok(selected.errors.some((error) => error.code === "INVALID_UTF8"));
  assert.deepEqual(selected.written, []);
});

test("qualification consumes one finite profile with the existing OwlAPI observation targets", () => {
  const profile = readExecutionProfile({ root: repository });
  assert.equal(profile.samples, 6);
  assert.equal(profile.checkerMs, 30000);
  assert.equal(profile.memoryBytes, 512 * 1024 * 1024);
  assert.ok(
    Object.values(profile.limits).every(
      (value) => Number.isSafeInteger(value) && value > 0,
    ),
  );
});

test("advisory findings admit formatting while strict warnings retain original logical bytes", async () => {
  const root = mkdtempSync(join(tmpdir(), "owlapi-markdown-admission-"));
  const policy = {
    schemaVersion: 2,
    preset: "authored-gfm@1",
    include: ["**/*.md"],
    exclude: [],
  };
  const content = Buffer.from(
    "# Consumer\n\n" +
      "An independent consumer prose example ".repeat(5).trim() +
      "." +
      "\n",
  );
  writeFileSync(join(root, ".markdown-quality.json"), JSON.stringify(policy));
  const informational = await processDocument({
    root,
    path: "README.md",
    requestId: "info",
    content,
  });
  validateQualityResult(informational, { requestId: "info", exitCode: 0 });
  assert.equal(informational.outcome, "findings");
  assert.ok(
    informational.diagnostics.some(
      (finding) =>
        finding.rule === "quality/long-prose-line" &&
        finding.severity === "info",
    ),
  );
  assert.deepEqual(informational.written, []);
  policy.lint = { "quality/long-prose-line": "warn" };
  writeFileSync(join(root, ".markdown-quality.json"), JSON.stringify(policy));
  const warning = await processDocument({
    root,
    path: "README.md",
    requestId: "warning",
    content,
  });
  validateQualityResult(warning, { requestId: "warning", exitCode: 0 });
  assert.ok(
    warning.diagnostics.some((finding) => finding.severity === "warning"),
  );
  const strict = await processDocument({
    root,
    path: "README.md",
    requestId: "strict",
    content,
    strict: true,
  });
  validateQualityResult(strict, { requestId: "strict", exitCode: 1 });
  assert.deepEqual(
    Buffer.from(strict.document.contentBase64, "base64"),
    content,
  );
  assert.deepEqual(strict.written, []);
});
