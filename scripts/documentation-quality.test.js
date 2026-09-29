// Regression examples adapted from WebVOWL tooling/prose/test_format_docs.py at
// 4f1970e5b6c95655af823c495bd58f9e9993f8b8 (AGPL-3.0-only).
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import {
  checkDocumentProse,
  formatDocument,
  processDocumentation,
  snapperDiagnostics,
} from "./documentation-quality.mjs";
import { repositoryRoot, runPythonTool } from "./repository-python-tools.mjs";

let root;
let path;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "owlapi-prose-"));
  path = join(root, "guide ș [1].md");
  for (const config of [
    ".prettierrc.json",
    ".editorconfig",
    ".snapperrc.toml",
  ]) {
    writeFileSync(
      join(root, config),
      readFileSync(join(repositoryRoot, config)),
    );
  }
});
afterEach(() => {
  if (
    dirname(root) !== resolve(tmpdir()) ||
    !basename(root).startsWith("owlapi-prose-")
  )
    throw new Error("Refusing cleanup outside the owned prose fixture.");
  rmSync(root, { recursive: true });
});

test.each([
  "> 1. First item.\n> 2. Second item.\n",
  "> > 1. First item.\n> > 2. Second item.\n",
  "> > > 1. First item.\n> > > 2. Second item.\n",
  "- first item; and\n- second item.\n",
  "1. first item; and\n2. second item.\n",
  "- `first/path`\n- every `second/path`\n",
])(
  "approved list false positives are bounded and the chain converges: %s",
  async (source) => {
    const first = await formatDocument(source, path, { root });
    expect(first.diagnostics).toEqual([]);
    const second = await formatDocument(first.output, path, { root });
    expect(second).toEqual(first);
  },
);

test("the native render backstop cannot hide fused sentences on a successful exit", async () => {
  const source = ".NET mods retain their own licence. Check the converter.\n";
  const args = [
    "--native",
    "--config",
    join(root, ".snapperrc.toml"),
    "--stdin-filepath",
    path,
  ];
  const native = runPythonTool("snapper-fmt", args, { input: source });
  expect(native.status).toBe(0);
  expect(native.stdout).toBe(source);
  const checked = runPythonTool(
    "snapper-fmt",
    [...args, "--check", "--output-format", "json"],
    { input: source },
  );
  expect(checked.status).toBe(0);
  expect(JSON.parse(checked.stdout)[0].would_reformat).toBe(false);
  expect((await formatDocument(source, path, { root })).diagnostics).toEqual(
    expect.arrayContaining([expect.objectContaining({ kind: "fused" })]),
  );
  writeFileSync(path, source);
  expect(
    await processDocumentation({ root, mode: "write", report: () => {} }),
  ).toBe(1);
  expect(readFileSync(path, "utf8")).toBe(source);
});

test("unknown, malformed and failed native reports fail closed", () => {
  const report = (diagnostics) => ({
    status: 0,
    stdout: JSON.stringify([{ would_reformat: false, diagnostics }]),
    stderr: "",
  });
  expect(
    snapperDiagnostics(
      report([{ kind: "fused", line: 1, excerpt: "First. Second." }]),
      "First. Second.\n",
    ),
  ).toHaveLength(1);
  expect(() =>
    snapperDiagnostics(
      report([{ kind: "new-kind", line: 1, excerpt: "prose" }]),
      "prose\n",
    ),
  ).toThrow(/unknown/);
  expect(() =>
    snapperDiagnostics(
      report([{ kind: "wrap", line: 900, excerpt: "prose" }]),
      "prose\n",
    ),
  ).toThrow(/Invalid/);
  expect(() =>
    snapperDiagnostics({ status: 0, stdout: "not json" }, ""),
  ).toThrow(/JSON/);
  expect(() =>
    snapperDiagnostics({ status: 2, stderr: "native failure" }, ""),
  ).toThrow(/native failure/);
});

test.each([
  "> 1. First sentence. Another sentence.\n",
  "> > 1. First sentence. Another sentence.\n",
  "> > > 1. First sentence. Another sentence.\n",
  "> 1. First sentence.\n>    Another sentence. Yet another.\n",
  "- first item; and\n- Second sentence. Another sentence.\n",
  "> A single sentence\n> continues here.\n",
])("list workaround retains real prose defects: %s", (source) => {
  expect(checkDocumentProse(source, path, { root }).length).toBeGreaterThan(0);
});

test("sentence layout preserves literal content and explicit hard breaks", async () => {
  const code = "```javascript\nconst value={a:1}; // Keep. Both.\n```\n";
  const source =
    "First sentence. Second sentence.\n\n" +
    code +
    "\nFirst line.\\\nSecond line.\n\n| Key | Value |\n| --- | --- |\n| `a \\| b` | **text** |\n\n- [ ] First sentence. Second sentence.\n";
  const first = await formatDocument(source, path, { root });
  expect(first.diagnostics).toEqual([]);
  expect(first.output).toContain("First sentence.\nSecond sentence.");
  expect(first.output).toContain(code);
  expect(first.output).toContain("First line.\\\nSecond line.");
  expect(first.output).toContain("`a \\| b`");
  expect(first.output).toContain("- [ ] First sentence.");
  expect(await formatDocument(first.output, path, { root })).toEqual(first);
});

test("preserves HTML, images, indented code and explicit source autolinks", async () => {
  const source =
    '# Examples\n\nUse ``a`b  c`` safely.\n\n![Diagram](https://example.com/diagram.png "Diagram")\n\n<!-- Preserve. This. -->\n\n<details><summary>Example</summary>\n\n    const value={a:1}; // Keep. Both.\n\n</details>\n\n1. **Source**\\\n   <https://www.w3.org/TR/owl2-syntax/>\n';
  const first = await formatDocument(source, path, { root });
  expect(first).toEqual({ output: source, diagnostics: [] });
  expect(
    await formatDocument(first.output.replace(/[\t ]+$/gmu, ""), path, {
      root,
    }),
  ).toEqual(first);
});

test("checks a long quoted item through the bounded native subprocess path", () => {
  const source = `> > > 1. Keep ${"meaningful prose ".repeat(4000)}on one source line.\n`;
  expect(checkDocumentProse(source, path, { root })).toEqual([]);
});

test.each([
  ["Use e.g. Node tooling. Check it.\n", "Use e.g. Node tooling.\nCheck it.\n"],
  ["Use version 12.0.2. Check it.\n", "Use version 12.0.2.\nCheck it.\n"],
  ["Run this. `npm test` checks it.\n", "Run this.\n`npm test` checks it.\n"],
  [
    "**First sentence.** Next sentence.\n",
    "**First sentence.**\nNext sentence.\n",
  ],
  ["Keep\u00a0this. Next sentence.\n", "Keep\u00a0this.\nNext sentence.\n"],
  ['Say "Done." Then check it.\n', 'Say "Done."\nThen check it.\n'],
])("native sentence boundaries: %s", async (source, expected) => {
  const result = await formatDocument(source, path, { root });
  expect(result).toEqual({ output: expected, diagnostics: [] });
  expect(await formatDocument(result.output, path, { root })).toEqual(result);
});

test("read-only checks, selected paths and empty selections have no writing side effects", async () => {
  writeFileSync(path, "First non‑ASCII sentence. Second sentence.\n");
  const original = readFileSync(path);
  const report = [];
  expect(
    await processDocumentation({
      root,
      mode: "check",
      paths: [path],
      report: (line) => report.push(line),
    }),
  ).toBe(1);
  expect(readFileSync(path)).toEqual(original);
  expect(report.join("\n")).toContain(path);
  for (const mode of ["write", "check", "lint"]) {
    expect(
      await processDocumentation({ root, mode, paths: [], report: () => {} }),
    ).toBe(0);
    expect(readFileSync(path)).toEqual(original);
  }
  expect(
    await processDocumentation({
      root,
      mode: "write",
      paths: [path],
      report: () => {},
    }),
  ).toBe(0);
  expect(readFileSync(path, "utf8")).toBe(
    "First non‑ASCII sentence.\nSecond sentence.\n",
  );
});
