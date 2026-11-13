import { describe, expect, test } from "@jest/globals";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import semver from "semver";
import { CANONICAL_NODE, CI_RUNTIME } from "./runtime-policy.mjs";
import {
  qualificationMatrix,
  runtimeDigest,
  validateFrozenMatrix,
} from "./consumer-runtime-matrix.mjs";
import { consumerRuntimeFixture } from "./consumer-runtime-fixture.mjs";
import { OTHER_UBUNTU } from "./fixtures/ubuntu-runner.mjs";
import { OTHER_WINDOWS_IMAGE } from "./fixtures/windows-runner.mjs";

describe("frozen consumer runtime admission", () => {
  test.each([
    ["linux", "Linux", OTHER_UBUNTU.image],
    ["win32", "Windows", OTHER_WINDOWS_IMAGE],
  ])(
    "the %s consumer rejects the wrong image before executing tests",
    (platform, runnerOs, image) => {
      const { matrix } = consumerRuntimeFixture();
      // Exercise hosted-image admission independently of the developer's OS.
      const host = `
      import os from "node:os";
      import { syncBuiltinESMExports } from "node:module";
      os.platform = () => ${JSON.stringify(platform)};
      os.arch = () => "x64";
      syncBuiltinESMExports();
      Object.defineProperty(process.versions, "node", { value: ${JSON.stringify(CANONICAL_NODE)} });
    `;
      const result = spawnSync(
        process.execPath,
        [
          "--import",
          `data:text/javascript,${encodeURIComponent(host)}`,
          fileURLToPath(
            new URL("./qualify-consumer-runtime.mjs", import.meta.url),
          ),
        ],
        {
          encoding: "utf8",
          timeout: 10000,
          env: {
            ...process.env,
            OWLAPI_RUNTIME_MATRIX: JSON.stringify(matrix),
            OWLAPI_EXPECTED_NODE: CANONICAL_NODE,
            RUNNER_OS: runnerOs,
            ImageOS: image,
          },
        },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`on image ${image} does not match`);
    },
  );

  test("includes every floor, fresh latest patch and distinct reference on every declared platform", () => {
    const { matrix } = consumerRuntimeFixture();
    for (const minimum of CI_RUNTIME.minimums) {
      const reference = CI_RUNTIME.node[semver.major(minimum)];
      expect(matrix.selections).toContainEqual({
        minimum,
        reference,
        latest: semver.inc(reference, "patch"),
      });
      for (const platform of CI_RUNTIME.consumerPlatforms)
        for (const node of [minimum, reference, semver.inc(reference, "patch")])
          expect(matrix.include).toContainEqual({ ...platform, node });
    }
    expect(validateFrozenMatrix(matrix)).toEqual(matrix);
  });
  test.each([
    "missing",
    "duplicate",
    "unexpected-platform",
    "policy",
    "selection",
  ])(
    "rejects %s lane evidence instead of accepting a smaller matrix",
    (mutation) => {
      const { matrix } = consumerRuntimeFixture();
      if (mutation === "missing") matrix.include.pop();
      if (mutation === "duplicate") matrix.include.push(matrix.include[0]);
      if (mutation === "unexpected-platform") matrix.include[0].arch = "other";
      if (mutation === "policy") matrix.policySha256 = "0".repeat(64);
      if (mutation === "selection") matrix.selections[0].minimum = "0.0.0";
      expect(() => validateFrozenMatrix(matrix)).toThrow();
    },
  );
  test("a newly released patch changes the exact proof identity", () => {
    const { matrix: previous, releases } = consumerRuntimeFixture();
    const next = qualificationMatrix([
      ...releases,
      { version: `v${semver.inc(previous.selections[0].latest, "patch")}` },
    ]);
    expect(runtimeDigest(next)).not.toBe(runtimeDigest(previous));
  });
  test("ignores valid prereleases without admitting them as supported stable lanes", () => {
    const { matrix, releases } = consumerRuntimeFixture();
    const missingMinimum = CI_RUNTIME.minimums.at(-1);
    expect(
      qualificationMatrix([
        ...releases,
        { version: "v27.0.0-alpha.0.0.0" },
        { version: "v26.99.0-rc.1" },
      ]),
    ).toEqual(matrix);
    expect(() =>
      qualificationMatrix([
        ...releases.filter(({ version }) => version !== `v${missingMinimum}`),
        { version: `v${missingMinimum}-rc.1` },
      ]),
    ).toThrow("Missing minimum/reference release");
  });
  test.each(["26.13.0", "v26.13", "v26.13.0-", "v26.13.0-alpha.01"])(
    "rejects malformed release identity %s",
    (version) => {
      const { releases } = consumerRuntimeFixture();
      expect(() => qualificationMatrix([...releases, { version }])).toThrow();
    },
  );
});
