import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  pythonTarget,
  syncPythonProjections,
} from "./development-tool-policy.mjs";
import { SCANCODE_TOOL } from "../util/third-party-evidence/scancode.mjs";

test("Python package, Ruff and scanner declarations follow one maintained pin", () => {
  expect(() => syncPythonProjections()).not.toThrow();
  expect(SCANCODE_TOOL.pythonVersion).toBe(pythonTarget().minor);
  const root = mkdtempSync(join(tmpdir(), "owlapi-python-target-"));
  try {
    for (const relative of [
      "pyproject.toml",
      "util/scancode-runtime/pyproject.toml",
      "ruff.toml",
    ]) {
      mkdirSync(dirname(join(root, relative)), { recursive: true });
      writeFileSync(
        join(root, relative),
        readFileSync(new URL(`../${relative}`, import.meta.url)),
      );
    }
    writeFileSync(join(root, ".python-version"), "3.16.2\n");
    expect(() => syncPythonProjections(root)).toThrow(
      "Python projection drift",
    );
    syncPythonProjections(root, { write: true });
    expect(readFileSync(join(root, "pyproject.toml"), "utf8")).toContain(
      'requires-python = ">=3.16.2"',
    );
    expect(
      readFileSync(join(root, "util/scancode-runtime/pyproject.toml"), "utf8"),
    ).toContain('requires-python = ">=3.16.2"');
    expect(readFileSync(join(root, "ruff.toml"), "utf8")).toContain(
      'target-version = "py316"',
    );
    expect(() => syncPythonProjections(root)).not.toThrow();
    writeFileSync(join(root, ".python-version"), "3.16.2rc1\n");
    expect(() => pythonTarget(root)).toThrow("stable major.minor.patch");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
