import { describe, expect, test } from "@jest/globals";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  prepareScancode,
  parseScancodeBootstrapArguments,
  resolveScancodeBootstrap,
} from "../prepare-scancode.mjs";
import { qualifyScancodeRuntime } from "../qualify-scancode-runtime.mjs";

describe("isolated ScanCode bootstrap", () => {
  test("retains a preparation failure in the qualification reports", async () => {
    const root = await mkdtemp(join(tmpdir(), "owlapi-scancode-failure-"));
    const outputRoot = join(root, "qualification");
    try {
      await expect(
        qualifyScancodeRuntime({
          python: join(root, "absent-python.exe"),
          outputRoot,
        }),
      ).rejects.toThrow();
      expect(
        await readFile(
          join(outputRoot, "reports", "installation-failure.log"),
          "utf8",
        ),
      ).toMatch(/Python|python/u);
    } finally {
      await rm(root, { recursive: true });
    }
  });
  test.each([
    ["linux", "venv/bin/scancode"],
    ["windows", "venv/Scripts/scancode.exe"],
  ])("selects the isolated %s native command", (platform, suffix) => {
    const resolved = resolveScancodeBootstrap({
      platform,
      outputRoot: ".release/tools/scancode",
    });

    expect(resolved.toolkitRoot.replaceAll("\\", "/")).toMatch(
      /scancode-toolkit-v32\.5\.0$/u,
    );
    expect(resolved.command.replaceAll("\\", "/").endsWith(suffix)).toBe(true);
  });

  test("parses a closed platform/output/python argument surface", () => {
    expect(
      parseScancodeBootstrapArguments([
        "--platform=linux",
        "--output=.release/tools/scancode",
        "--python=/opt/hostedtoolcache/Python/3.15.0/x64/bin/python",
      ]),
    ).toEqual({
      platform: "linux",
      outputRoot: ".release/tools/scancode",
      python: "/opt/hostedtoolcache/Python/3.15.0/x64/bin/python",
    });
    expect(
      parseScancodeBootstrapArguments(
        [
          "--platform-env=SCANCODE_PLATFORM",
          "--output=.release/tools/scancode",
          "--python-env=SCANCODE_PYTHON",
        ],
        {
          SCANCODE_PLATFORM: "windows",
          SCANCODE_PYTHON: "C:/hostedtoolcache/Python/3.15.0/x64/python.exe",
        },
      ),
    ).toEqual({
      platform: "windows",
      outputRoot: ".release/tools/scancode",
      python: "C:/hostedtoolcache/Python/3.15.0/x64/python.exe",
    });
  });

  test("rejects unsupported, missing, or duplicate bootstrap arguments", () => {
    expect(() =>
      parseScancodeBootstrapArguments([
        "--platform=macos",
        "--output=.release/tools/scancode",
        "--python=python",
      ]),
    ).toThrow(/platform/iu);
    expect(() =>
      parseScancodeBootstrapArguments([
        "--platform=linux",
        "--output=.release/tools/scancode",
      ]),
    ).toThrow(/python/iu);
    expect(() =>
      parseScancodeBootstrapArguments([
        "--platform=linux",
        "--platform=windows",
        "--output=.release/tools/scancode",
        "--python=python",
      ]),
    ).toThrow(/duplicate/iu);
    expect(() =>
      parseScancodeBootstrapArguments(
        [
          "--platform-env=SCANCODE_PLATFORM",
          "--output=.release/tools/scancode",
          "--python-env=SCANCODE_PYTHON",
        ],
        { SCANCODE_PLATFORM: "linux" },
      ),
    ).toThrow(/SCANCODE_PYTHON/iu);
  });

  test("refuses an existing destination without touching its contents", async () => {
    const root = await mkdtemp(join(tmpdir(), "owlapi-scancode-owned-"));
    const sentinel = join(root, "sentinel.txt");
    await writeFile(sentinel, "preserve existing output");
    try {
      await expect(
        prepareScancode({
          platform: process.platform === "win32" ? "windows" : "linux",
          outputRoot: root,
          python: process.execPath,
        }),
      ).rejects.toThrow(/already exists/iu);
      expect(await readFile(sentinel, "utf8")).toBe("preserve existing output");
    } finally {
      await rm(root, { recursive: true });
    }
  });
});
