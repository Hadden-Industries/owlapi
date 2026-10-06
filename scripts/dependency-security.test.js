import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const { SourceMapConsumer, SourceNode } = require("source-map-js");
const leafMap = {
  version: 3,
  sources: ["original.js"],
  sourcesContent: ["answer()"],
  names: [],
  mappings: "AAAA",
};
const indexedMap = (line, map = leafMap) => ({
  version: 3,
  sections: [{ offset: { line, column: 0 }, map }],
});

describe("development dependency security boundaries", () => {
  test("no locked dependency retains the unpatched sprintf-js package", () => {
    const lock = JSON.parse(readFileSync(join(root, "package-lock.json")));
    expect(
      Object.keys(lock.packages).filter((path) => path.endsWith("/sprintf-js")),
    ).toEqual([]);
    expect(() => require.resolve("sprintf-js")).toThrow();
  });

  test("the coverage loader preserves ordinary YAML extends and option names", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "owlapi-coverage-yaml-"));
    try {
      writeFileSync(join(cwd, "package.json"), '{"private":true}\n');
      writeFileSync(join(cwd, "base.yml"), "all: true\ninclude: [model/**]\n");
      writeFileSync(
        join(cwd, ".nycrc.yml"),
        "extends: ./base.yml\ncheck-coverage: true\nlines: 85\nreporter: [text, json]\n",
      );
      const { loadNycConfig } = require("@istanbuljs/load-nyc-config");
      const config = await loadNycConfig({ cwd });
      expect(config).toMatchObject({
        all: true,
        include: ["model/**"],
        checkCoverage: true,
        lines: 85,
        reporter: ["text", "json"],
      });
      writeFileSync(join(cwd, ".nycrc.yml"), "reporter: [unterminated\n");
      await expect(loadNycConfig({ cwd })).rejects.toThrow();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test.each(["100", -1, 0.25, Number.MAX_SAFE_INTEGER])(
    "indexed source maps reject invalid offset %p",
    (line) => {
      expect(() => new SourceMapConsumer(indexedMap(line))).toThrow();
    },
  );

  test("ordinary indexed source maps retain mappings and generated code", () => {
    const consumer = new SourceMapConsumer(indexedMap(1));
    const mappings = [];
    consumer.eachMapping((mapping) => mappings.push(mapping));
    expect(mappings[0]).toMatchObject({
      source: "original.js",
      originalLine: 1,
      originalColumn: 0,
      generatedLine: 2,
    });
    const code = "// header\nanswer();\n";
    expect(SourceNode.fromStringWithSourceMap(code, consumer).toString()).toBe(
      code,
    );
  });

  test("offsets past the source text and nested maps finish within a bounded child", () => {
    // Bound execution so the vulnerable dependency cannot block the test runner.
    const program = `
      const assert = require('node:assert/strict');
      const { SourceMapConsumer, SourceNode } = require('source-map-js');
      const leaf = ${JSON.stringify(leafMap)};
      const wrap = (line, map) => ({version: 3, sections: [{offset: {line, column: 0}, map}]});
      const code = 'answer();\\n';
      assert.throws(() => new SourceMapConsumer(wrap(1e12, leaf)), /offset/i);
      const distant = SourceNode.fromStringWithSourceMap(code, new SourceMapConsumer(wrap(1e7, leaf)));
      assert.equal(distant.toString(), code);
      assert.ok(distant.children.length < 10);
      let nested = leaf;
      for (let depth = 0; depth < 40; depth++) nested = wrap(0, nested);
      assert.equal(SourceNode.fromStringWithSourceMap(code, new SourceMapConsumer(nested)).toString(), code);
    `;
    const result = spawnSync(process.execPath, ["-e", program], {
      cwd: root,
      encoding: "utf8",
      timeout: 3000,
    });
    expect(result.error).toBeUndefined();
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
});
