import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

test("native reporter preserves actual pass, fail, skip and todo events", () => {
  const directory = mkdtempSync(join(tmpdir(), "owl-native-reporter-"));
  try {
    const fixture = join(directory, "events.test.mjs");
    writeFileSync(
      fixture,
      `import test from 'node:test';
test('native pass', () => {});
test('native fail', () => { throw new Error('expected failure'); });
test('native skip', { skip: true }, () => {});
test('native todo', { todo: true }, () => {});
`,
    );
    const result = spawnSync(
      process.execPath,
      [
        "--test",
        `--test-reporter=${pathToFileURL(resolve("test/consumers/owl-contract/native-reporter.mjs")).href}`,
        fixture,
      ],
      {
        encoding: "utf8",
        timeout: 10000,
        maxBuffer: 256 * 1024,
        windowsHide: true,
        env: { ...process.env, NODE_OPTIONS: "" },
      },
    );
    expect(result.error).toBeUndefined();
    expect({ status: result.status, stderr: result.stderr }).toEqual({
      status: 1,
      stderr: "",
    });
    const rows = result.stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(rows).toEqual([
      { name: "native pass", status: "passed", skipped: false, todo: false },
      {
        name: "native fail",
        status: "failed",
        skipped: false,
        todo: false,
        error: expect.stringContaining("expected failure"),
      },
      { name: "native skip", status: "passed", skipped: true, todo: false },
      { name: "native todo", status: "passed", skipped: false, todo: true },
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
