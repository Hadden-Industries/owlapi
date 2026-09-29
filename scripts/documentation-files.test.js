import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { selectDocumentationFiles } from "./documentation-files.mjs";

let root;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "owlapi-documents-"));
});
afterEach(() => {
  if (
    dirname(root) !== resolve(tmpdir()) ||
    !basename(root).startsWith("owlapi-documents-")
  ) {
    throw new Error("Refusing cleanup outside the owned document fixture.");
  }
  rmSync(root, { recursive: true });
});

function write(path, contents = "# Example\n") {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), contents);
}

test("discovers authored Markdown outside donor roots, including hidden directories and untracked files", async () => {
  const names = [
    "README.md",
    ".github/pull_request_template.md",
    "util/owlapi-reference/README.md",
    "docs/new.md",
  ];
  names.forEach((name) => write(name));
  expect(await selectDocumentationFiles(root)).toEqual(
    names.map((name) => join(root, name)).sort(),
  );
});

test("uses native ignores and negation, and distinguishes explicit empty selection", async () => {
  ["README.md", "docs/draft.md", "docs/keep.md", "ignored/evidence.md"].forEach(
    (name) => write(name),
  );
  write(".gitignore", "ignored/\n");
  write(".prettierignore", "docs/*.md\n!docs/keep.md\n");
  expect(await selectDocumentationFiles(root)).toEqual(
    [join(root, "README.md"), join(root, "docs/keep.md")].sort(),
  );
  expect(await selectDocumentationFiles(root, [])).toEqual([]);
  expect(
    await selectDocumentationFiles(root, ["README.md", "README.md"]),
  ).toEqual([join(root, "README.md")]);
});

test("rejects missing and outside explicit paths instead of silently checking nothing", async () => {
  await expect(selectDocumentationFiles(root, ["missing.md"])).rejects.toThrow(
    /missing|ENOENT/i,
  );
  await expect(
    selectDocumentationFiles(root, ["../outside.md"]),
  ).rejects.toThrow(/outside/i);
});

test("does not follow directory links in discovery or explicit arguments", async () => {
  write("real/Unicode-ș.md");
  symlinkSync(
    join(root, "real"),
    join(root, "linked"),
    process.platform === "win32" ? "junction" : "dir",
  );
  expect(await selectDocumentationFiles(root)).toEqual([
    join(root, "real/Unicode-ș.md"),
  ]);
  await expect(
    selectDocumentationFiles(root, ["linked/Unicode-ș.md"]),
  ).rejects.toThrow(/symlink/);
});
