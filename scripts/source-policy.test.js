import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import prettier from "prettier";
import { ESLint } from "eslint";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

const git = (...args) =>
  execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();

describe("standalone source policy", () => {
  let eslint;

  beforeAll(async () => {
    eslint = new ESLint({ cwd: repositoryRoot });
    // Load the native configuration and plugins as bounded suite setup, so
    // first-use module loading does not consume a behavioral test's timeout.
    await eslint.calculateConfigForFile("docs/quality-example.md");
  }, 30000);

  it("uses native GFM content rules independently of JavaScript and fenced examples", async () => {
    const defects = await eslint.lintText(
      "# Example\n\n[missing][definition]\n\n![](image.png)\n\n| A | B |\n| - | - |\n| one | two | three |\n",
      { filePath: "docs/quality-example.md" },
    );
    const rules = defects[0].messages.map(({ ruleId }) => ruleId);
    expect(rules).toEqual(
      expect.arrayContaining([
        "markdown/no-missing-label-refs",
        "markdown/require-alt-text",
        "markdown/table-column-count",
      ]),
    );
    expect(rules).not.toContain("no-undef");
    const valid = await eslint.lintText(
      '# Example\n\n> [!NOTE]\n> Valid GitHub alert.\n\n<details><summary>Example</summary>\n\n<a id="anchor"></a>\n\n- [ ] Task.\n\n```javascript\nundefinedName();\n```\n\n</details>\n',
      { filePath: "docs/quality-example.md" },
    );
    expect(valid[0].messages).toEqual([]);
    expect(
      (
        await eslint.lintText("undefinedName();\n", {
          filePath: "scripts/quality-example.js",
        })
      )[0].messages.map(({ ruleId }) => ruleId),
    ).toContain("no-undef");
  });

  it("rejects reversed links even when the pinned plugin cannot render its diagnostic", async () => {
    // @eslint/markdown 8.0.3 currently throws through getLoc on this rule's
    // suggested fix under ESLint 10.11.0. Keep the rule enabled and fail closed;
    // accept its proper diagnostic when the upstream compatibility bug is fixed.
    let rejected;
    try {
      const [result] = await eslint.lintText("(text)[https://example.com]\n", {
        filePath: "docs/quality-example.md",
      });
      rejected = result.messages.some(
        ({ ruleId }) => ruleId === "markdown/no-reversed-media-syntax",
      );
    } catch (error) {
      expect(error.message).toMatch(/getLoc/u);
      rejected = true;
    }
    expect(rejected).toBe(true);
  });

  it("keeps generated Markdown and retained evidence out of editor and CLI lint/format scope", async () => {
    const ignorePath = resolve(repositoryRoot, ".prettierignore");
    for (const name of [
      "API.md",
      "docs/compatibility/java-api-surface.md",
      "docs/conformance/upstream/w3c-rdf-tests/LICENSE.md",
      "docs/provenance/history-reconstruction/README.md",
      "util/owlapi-reference/fixtures/README.md",
      "docs/Deep Review of Phase 19 and Phase 20 of the owlapi Implementation Plan [2026-08-24T1130].md",
    ]) {
      const path = resolve(repositoryRoot, name);
      expect((await prettier.getFileInfo(path, { ignorePath })).ignored).toBe(
        true,
      );
      expect(await eslint.isPathIgnored(path)).toBe(true);
    }
    expect(
      await eslint.isPathIgnored(
        resolve(repositoryRoot, ".github/pull_request_template.md"),
      ),
    ).toBe(false);
  });

  it("normalizes first-party text to LF without rewriting pinned upstream bytes", () => {
    // Nested overrides are part of the contract: upstream fixtures and
    // digest-addressed npm evidence remain byte-for-byte inputs even though
    // ordinary project text is normalized for contributors.
    expect(
      git(
        "check-attr",
        "text",
        "eol",
        "--",
        "index.js",
        "docs/conformance/upstream/w3c-owl2/all.rdf",
        "docs/provenance/evidence/npm/blobs/sha256/aa/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ).split(/\r?\n/u),
    ).toEqual([
      "index.js: text: auto",
      "index.js: eol: lf",
      "docs/conformance/upstream/w3c-owl2/all.rdf: text: unset",
      "docs/conformance/upstream/w3c-owl2/all.rdf: eol: unspecified",
      "docs/provenance/evidence/npm/blobs/sha256/aa/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: text: unset",
      "docs/provenance/evidence/npm/blobs/sha256/aa/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: eol: unspecified",
    ]);

    const nonLfFirstPartyEntries = git("ls-files", "--eol")
      .split(/\r?\n/u)
      .filter((entry) => /^i\/(?:crlf|mixed)\s/u.test(entry))
      .filter((entry) => {
        const [metadata = "", path = ""] = entry.split("\t", 2);
        return (
          !metadata.includes("attr/-text") &&
          !path.startsWith("docs/conformance/upstream/")
        );
      });

    expect(nonLfFirstPartyEntries).toEqual([]);
  });

  it("makes the exact Prettier defaults and EditorConfig mapping discoverable", async () => {
    const sourcePath = resolve(repositoryRoot, "index.js");

    expect(await prettier.resolveConfigFile(sourcePath)).toBe(
      resolve(repositoryRoot, ".prettierrc.json"),
    );
    const resolvedConfiguration = await prettier.resolveConfig(sourcePath, {
      editorconfig: true,
      useCache: false,
    });
    expect(resolvedConfiguration).toEqual({
      useTabs: false,
      tabWidth: 2,
      endOfLine: "lf",
    });

    expect(
      await prettier.format("const value={nested:true}\r\n", {
        ...resolvedConfiguration,
        filepath: sourcePath,
      }),
    ).toBe("const value = { nested: true };\n");
  });

  it("leaves canonical generated JSON under its owning generator's control", async () => {
    // These artefacts are schema- and digest-verified in their own gates. Running
    // a second formatter over them would change reviewed bytes after generation.
    const ignorePath = resolve(repositoryRoot, ".prettierignore");
    const [evidenceManifest, releaseGates, ordinarySource] = await Promise.all([
      prettier.getFileInfo(
        resolve(repositoryRoot, "docs/provenance/npm-package-evidence.json"),
        { ignorePath },
      ),
      prettier.getFileInfo(resolve(repositoryRoot, "docs/release/gates.json"), {
        ignorePath,
      }),
      prettier.getFileInfo(resolve(repositoryRoot, "index.js"), { ignorePath }),
    ]);

    expect(evidenceManifest.ignored).toBe(true);
    expect(releaseGates.ignored).toBe(true);
    expect(ordinarySource).toMatchObject({
      ignored: false,
      inferredParser: "babel",
    });
  });
});
