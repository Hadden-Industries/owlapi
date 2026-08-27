import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import prettier from "prettier";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

const git = (...args) =>
  execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();

describe("standalone source policy", () => {
  it("normalizes first-party text to LF without rewriting pinned upstream bytes", () => {
    // The nested override is part of the contract: W3C fixtures remain byte-for-byte
    // evidence even though ordinary project text is normalized for contributors.
    expect(
      git(
        "check-attr",
        "text",
        "eol",
        "--",
        "index.js",
        "docs/conformance/upstream/w3c-owl2/all.rdf",
      ).split(/\r?\n/u),
    ).toEqual([
      "index.js: text: auto",
      "index.js: eol: lf",
      "docs/conformance/upstream/w3c-owl2/all.rdf: text: unset",
      "docs/conformance/upstream/w3c-owl2/all.rdf: eol: unspecified",
    ]);

    const nonLfFirstPartyEntries = git("ls-files", "--eol")
      .split(/\r?\n/u)
      .filter((entry) => /^i\/(?:crlf|mixed)\s/u.test(entry))
      .filter((entry) => {
        const [, path = ""] = entry.split("\t", 2);
        return !path.startsWith("docs/conformance/upstream/");
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
});
