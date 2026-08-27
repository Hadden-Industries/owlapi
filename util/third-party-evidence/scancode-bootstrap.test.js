import { describe, expect, test } from "@jest/globals";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  downloadPinnedAsset,
  parseScancodeBootstrapArguments,
  resolveScancodeBootstrap,
} from "../prepare-scancode.mjs";
import { SCANCODE_TOOL } from "./scancode.mjs";

describe("isolated ScanCode bootstrap", () => {
  test.each([
    ["linux", "venv/bin/scancode"],
    ["windows", "venv/Scripts/scancode.exe"],
  ])("selects the pinned %s archive and native command", (platform, suffix) => {
    const resolved = resolveScancodeBootstrap({
      platform,
      outputRoot: ".release/tools/scancode",
    });

    expect(resolved.asset).toEqual(SCANCODE_TOOL.assets[platform]);
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
        "--python=/opt/hostedtoolcache/Python/3.14.6/x64/bin/python",
      ]),
    ).toEqual({
      platform: "linux",
      outputRoot: ".release/tools/scancode",
      python: "/opt/hostedtoolcache/Python/3.14.6/x64/bin/python",
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
          SCANCODE_PYTHON: "C:/hostedtoolcache/Python/3.14.7/x64/python.exe",
        },
      ),
    ).toEqual({
      platform: "windows",
      outputRoot: ".release/tools/scancode",
      python: "C:/hostedtoolcache/Python/3.14.7/x64/python.exe",
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

  test("retains only download bytes that match the pinned SHA-256", async () => {
    const root = await mkdtemp(join(tmpdir(), "owlapi-scancode-download-"));
    const destination = join(root, "scancode.zip");
    const bytes = Buffer.from("fixture ScanCode archive");
    const digest = createHash("sha256").update(bytes).digest("hex");
    try {
      await expect(
        downloadPinnedAsset({
          asset: {
            url: "https://example.invalid/scancode.zip",
            sha256: digest,
          },
          destination,
          fetchImpl: async () => new Response(bytes),
          sleep: async () => {},
        }),
      ).resolves.toEqual({ bytes: bytes.length, sha256: digest });
      await expect(readFile(destination)).resolves.toEqual(bytes);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("deletes a download that does not match the pinned digest", async () => {
    const root = await mkdtemp(join(tmpdir(), "owlapi-scancode-download-"));
    const destination = join(root, "scancode.zip");
    try {
      await expect(
        downloadPinnedAsset({
          asset: {
            url: "https://example.invalid/scancode.zip",
            sha256: "0".repeat(64),
          },
          destination,
          fetchImpl: async () => new Response("wrong bytes"),
          sleep: async () => {},
        }),
      ).rejects.toThrow(/SHA-256 mismatch/iu);
      await expect(readFile(destination)).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
