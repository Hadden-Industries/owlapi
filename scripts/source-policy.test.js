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
