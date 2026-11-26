import { expect, test } from "@jest/globals";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installResolutionFixture } from "./fixtures/npm-consumer-resolution.mjs";
import {
  captureResolutionEvidence,
  verifyTestedConsumerResolution,
} from "./release-consumer-evidence.mjs";
import { isStrictDescendantPath } from "./release-file-utils.mjs";

test("the final test receipt requires the original first-party package and installed manifests under the same root lock", async () => {
  const root = mkdtempSync(join(tmpdir(), "owlapi-post-test-resolution-"));
  expect(isStrictDescendantPath(tmpdir(), root)).toBe(true);
  try {
    const directory = join(root, "consumer");
    mkdirSync(directory);
    const npmCli = process.env.npm_execpath;
    const { tarball } = await installResolutionFixture(
      directory,
      npmCli,
      "owlapi",
      "1.0.1",
    );
    const options = { tarball, npmCli, dependencyName: "owlapi" };
    const before = await captureResolutionEvidence(directory, options);
    await expect(
      verifyTestedConsumerResolution(directory, options, before.resolution),
    ).resolves.toBeUndefined();
    for (const name of ["owlapi", "reader"]) {
      const path = join(directory, "node_modules", name, "package.json"),
        bytes = readFileSync(path);
      appendFileSync(path, "\n");
      expect(readFileSync(join(directory, "package-lock.json"), "utf8")).toBe(
        before.lock,
      );
      await expect(
        verifyTestedConsumerResolution(directory, options, before.resolution),
      ).rejects.toThrow();
      writeFileSync(path, bytes);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
