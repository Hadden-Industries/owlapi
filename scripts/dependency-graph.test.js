import { describe, expect, test } from "@jest/globals";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { format } from "dependency-cruiser";
import {
  authoredInventory,
  shippedInventory,
  extractGraph,
  checkRuntime,
  reserveOutput,
  lexicalOffenders,
  inputIdentity,
  writeBundle,
} from "./dependency-graph.mjs";

const fixture = async (run) => {
  const parent = mkdtempSync(path.join(tmpdir(), "owlapi-dependencies-"));
  const root = path.join(parent, "package with spaces [test]");
  mkdirSync(root);
  const write = (file, text) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  };
  write(
    "package.json",
    JSON.stringify({
      name: "graph-fixture",
      version: "1.0.0",
      type: "module",
      exports: { ".": "./index.js" },
      files: ["index.js", "internal/", "search/", "!**/*.test.js"],
      dependencies: { legal: "1.0.0" },
      devDependencies: { devonly: "1.0.0" },
    }),
  );
  write("index.js", 'import "./internal/valid.js"; export const value = 1;\n');
  write("internal/valid.js", "export const internal = 1;\n");
  write("search/disconnected.js", "export const disconnected = true;\n");
  write("search/excluded.test.js", "export const test = true;\n");
  write("scripts/tool.js", "export const tool = true;\n");
  for (const name of ["legal", "devonly"]) {
    write(
      `node_modules/${name}/package.json`,
      JSON.stringify({ name, version: "1.0.0", main: "index.js" }),
    );
    write(`node_modules/${name}/index.js`, "module.exports = {};\n");
  }
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  write(".gitignore", "node_modules/\n");
  try {
    await run({ root, parent, write });
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
};

describe("native dependency graph contract", () => {
  test(
    "includes disconnected authored roots and uses the native pack inventory",
    async () =>
      fixture(async ({ root }) => {
        const authored = authoredInventory(root);
        expect(authored).toContain("scripts/tool.js");
        expect(authored).toContain("search/disconnected.js");
        const inventory = shippedInventory(root);
        expect(inventory.runtime).toContain("search/disconnected.js");
        expect(inventory.runtime).not.toContain("search/excluded.test.js");
        expect(inventory.runtime).not.toContain("scripts/tool.js");
        const graph = await extractGraph(root, authored);
        expect(graph.modules.map(({ source }) => source)).toEqual(
          expect.arrayContaining(authored),
        );
        expect(
          JSON.parse((await format(graph, { outputType: "json" })).output)
            .modules.length,
        ).toBeGreaterThan(0);
      }),
    120000,
  );

  test.each([
    ['import "../outside.js";\n', "no-relative-runtime-escape"],
    ['import "./missing.js";\n', "no-unresolvable-runtime"],
    ['import "./search/excluded.test.js";\n', "no-runtime-to-unshipped-source"],
    ['import "./scripts/tool.js";\n', "no-runtime-to-unshipped-source"],
    ['import "devonly";\n', "no-runtime-to-dev-only"],
  ])(
    "rejects %s through native rule %s",
    async (source, rule) =>
      fixture(async ({ root, parent, write }) => {
        writeFileSync(
          path.join(parent, "outside.js"),
          "export const outside = true;\n",
        );
        write("index.js", source);
        const result = await checkRuntime(root);
        expect(result.errors.map(({ rule }) => rule.name)).toContain(rule);
      }),
    120000,
  );

  test(
    "accepts shipped internals, package self-references and production packages",
    async () =>
      fixture(async ({ root, write }) => {
        write(
          "internal/valid.js",
          'import "graph-fixture"; import "legal"; export const internal = 1;\n',
        );
        const result = await checkRuntime(root);
        expect(result.errors).toEqual([]);
        expect(result.lexical).toEqual([]);
      }),
    120000,
  );

  test(
    "retains the independent lexical guard for comments and strings",
    async () =>
      fixture(async ({ root, write }) => {
        write(
          "search/disconnected.js",
          "// VOWL must stay outside this library\n",
        );
        expect(lexicalOffenders(root, shippedInventory(root).runtime)).toEqual([
          "search/disconnected.js",
        ]);
      }),
    120000,
  );

  test("refuses unsafe or existing outputs and accepts literal external paths", async () =>
    fixture(async ({ root, parent }) => {
      expect(() => reserveOutput(path.join(root, "graph"), root)).toThrow(
        "outside",
      );
      expect(() => reserveOutput("relative", root)).toThrow("absolute");
      const output = path.join(parent, "new graph [literal]");
      expect(reserveOutput(output, root)).toBeTruthy();
      writeFileSync(path.join(output, "sentinel"), "unchanged");
      expect(() => reserveOutput(output, root)).toThrow();
      expect(readFileSync(path.join(output, "sentinel"), "utf8")).toBe(
        "unchanged",
      );
      const alias = path.join(parent, "alias");
      symlinkSync(
        root,
        alias,
        process.platform === "win32" ? "junction" : "dir",
      );
      expect(() => reserveOutput(path.join(alias, "graph"), root)).toThrow(
        "outside",
      );
    }));

  test("uses native schema validation for malformed output", async () => {
    await expect(
      format({ modules: [] }, { outputType: "json" }),
    ).rejects.toThrow();
  });

  test(
    "binds already-untracked nested controls even when Git status is unchanged",
    async () =>
      fixture(async ({ root, write }) => {
        execFileSync("git", ["add", "."], { cwd: root });
        execFileSync(
          "git",
          [
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.invalid",
            "-c",
            "core.hooksPath=/dev/null",
            "commit",
            "--quiet",
            "--no-gpg-sign",
            "-m",
            "Fixture baseline",
          ],
          { cwd: root },
        );
        write(
          "search/package.json",
          '{"type":"module","imports":{"#value":"./disconnected.js"}}\n',
        );
        const inventory = shippedInventory(root);
        const before = inputIdentity(root, authoredInventory(root), inventory);
        write(
          "search/package.json",
          '{"type":"module","imports":{"#value":"../internal/valid.js"}}\n',
        );
        const after = inputIdentity(root, authoredInventory(root), inventory);
        expect(after.status).toBe(before.status);
        expect(after.files["search/package.json"]).not.toBe(
          before.files["search/package.json"],
        );
        expect(before.files["search/.npmignore"]).toBeNull();
        write("search/.npmignore", "disconnected.js\n");
        expect(
          inputIdentity(root, authoredInventory(root), inventory).files[
            "search/.npmignore"
          ],
        ).not.toBeNull();
      }),
    120000,
  );

  test(
    "publishes reproducible validated bundles with actual tools and member digests",
    async () =>
      fixture(async ({ parent }) => {
        const target = path.join(parent, "bundle one");
        const first = await writeBundle(target);
        const second = await writeBundle(path.join(parent, "bundle two"));
        expect(first.members).toEqual(second.members);
        expect(first.identity.tools.npm.name).toBe("npm");
        expect(first.identity.tools.jest.name).toBe("jest");
        expect(first.invocations.npm.argv).toContain("--ignore-scripts");
        expect(first.invocations.jestDiscovery.argv).toContain("--listTests");
        expect(first.effectiveJestConfiguration.configs.length).toBeGreaterThan(
          0,
        );
        for (const [file, hash] of Object.entries(first.members)) {
          expect(
            createHash("sha256")
              .update(readFileSync(path.join(target, file)))
              .digest("hex"),
          ).toBe(hash);
        }
        expect(
          JSON.parse(readFileSync(path.join(target, "manifest.json"))).complete,
        ).toBe(true);
        await expect(writeBundle(target)).rejects.toThrow();
      }),
    120000,
  );

  test(
    "failed bundles preserve incomplete evidence without a completion manifest",
    async () =>
      fixture(async ({ root, parent }) => {
        const target = path.join(parent, "failed bundle");
        await expect(writeBundle(target, root)).rejects.toThrow(
          "unexpected package coordinate",
        );
        expect(
          JSON.parse(readFileSync(path.join(target, "incomplete.json")))
            .complete,
        ).toBe(false);
        expect(() =>
          readFileSync(path.join(target, "manifest.json")),
        ).toThrow();
      }),
    120000,
  );
});
