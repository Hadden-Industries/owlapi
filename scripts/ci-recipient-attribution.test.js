import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  qualifyCiConsumerInstall,
  replayCiConsumerAttribution,
} from "./ci-recipient-attribution.mjs";
import { captureResolutionEvidence } from "./release-consumer-evidence.mjs";
import { stableJson } from "./canonical-json.mjs";
import { installResolutionFixture } from "./fixtures/npm-consumer-resolution.mjs";
import { isStrictDescendantPath } from "./release-file-utils.mjs";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const npmCli = process.env.npm_execpath;

test("refuses eligibility cleared for another real npm recipient graph before execution", async () => {
  const root = mkdtempSync(join(tmpdir(), "owlapi-ci-attribution-"));
  expect(isStrictDescendantPath(tmpdir(), root)).toBe(true);
  try {
    const directory = join(root, "installed"),
      other = join(root, "other");
    mkdirSync(directory);
    mkdirSync(other);
    const { tarball } = await installResolutionFixture(
      directory,
      npmCli,
      "owlapi",
      "1.0.1",
    );
    const second = await installResolutionFixture(
      other,
      npmCli,
      "owlapi",
      "1.0.2",
    );
    expect(second.tarball).toEqual(tarball);
    const approved = await captureResolutionEvidence(other, {
      tarball,
      npmCli,
      dependencyName: "owlapi",
    });
    const verifyConsumerEvidence = async ({ evidence }) => {
      expect(
        evidence.resolution.graph.nodes.find(
          ({ name }) => name === "node-types",
        ).version,
      ).toBe("1.0.1");
      expect(
        approved.resolution.graph.nodes.find(
          ({ name }) => name === "node-types",
        ).version,
      ).toBe("1.0.2");
      return {
        schemaVersion: 1,
        result: "PASS",
        role: "portability-alias",
        resolutionSha256: digest(stableJson(approved.resolution)),
        tarballSha256: digest(tarball),
        decisionSha256: "b".repeat(64),
      };
    };
    await expect(
      qualifyCiConsumerInstall({
        directory,
        tarball,
        npmCli,
        dependencyName: "owlapi",
        role: "portability-alias",
        verifyConsumerEvidence,
      }),
    ).rejects.toThrow(/different installed graph/iu);
    for (const [installed, expectedVersion] of [
      [directory, "1.0.1"],
      [other, "1.0.2"],
    ]) {
      const attribution = await qualifyCiConsumerInstall({
        directory: installed,
        tarball,
        npmCli,
        dependencyName: "owlapi",
        role: "portability-alias",
        verifyConsumerEvidence: async ({ evidence, role }) => ({
          schemaVersion: 1,
          result: "PASS",
          role,
          resolutionSha256: digest(stableJson(evidence.resolution)),
          tarballSha256: digest(tarball),
          decisionSha256: "b".repeat(64),
        }),
      });
      const { platform, npm } = attribution.evidence.resolution;
      const replay = await replayCiConsumerAttribution(
        JSON.parse(JSON.stringify(attribution)),
        {
          role: "portability-alias",
          tarball,
          npmCli,
          platform,
          observedNpm: npm,
        },
      );
      expect(
        replay.graph.nodes.find(({ name }) => name === "node-types").version,
      ).toBe(expectedVersion);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
