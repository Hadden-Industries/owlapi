import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import {
  historicalEvidenceName,
  readHistoricalRelease,
} from "./historical-release-evidence.mjs";
import { verifiedChannelRelease } from "./release-channel-operation.mjs";

const evidence = (version) =>
  gunzipSync(
    readFileSync(
      new URL(
        "./fixtures/immutable-release-evidence/" +
          historicalEvidenceName(version) +
          ".gz",
        import.meta.url,
      ),
    ),
  );
test.each(["0.1.0-rc.1", "0.1.0-rc.2", "0.1.0-rc.3"])(
  "reads the original immutable %s evidence and checks the live release before a restore",
  async (version) => {
    const bytes = evidence(version);
    const proof = readHistoricalRelease(version, bytes);
    expect(proof.assets).toHaveLength(4);
    expect(() =>
      readHistoricalRelease(version, Buffer.concat([bytes, Buffer.from("\n")])),
    ).toThrow(/altered/);
    const files = new Map([[historicalEvidenceName(version), bytes]]);
    const release = {
      id: proof.releaseId,
      tag_name: "v" + version,
      draft: false,
      prerelease: true,
      immutable: true,
      assets: proof.assets.map((a) => ({
        name: a.name,
        size: a.bytes,
        digest: "sha256:" + a.sha256,
      })),
    };
    const ref = { object: { type: "tag", sha: proof.tagObject } };
    const client = {
      read: async (path) => {
        if (path === "/releases/" + release.id) return release;
        if (path === "/git/ref/tags/v" + version) return ref;
        throw new Error("Unexpected read " + path);
      },
    };
    expect(await verifiedChannelRelease(client, { files }, version)).toBe(
      release,
    );
    release.prerelease = false;
    await expect(
      verifiedChannelRelease(client, { files }, version),
    ).rejects.toThrow(/classification/);
    release.prerelease = true;
    ref.object.sha = "0".repeat(40);
    await expect(
      verifiedChannelRelease(client, { files }, version),
    ).rejects.toThrow();
    ref.object.sha = proof.tagObject;
    release.assets.pop();
    await expect(
      verifiedChannelRelease(client, { files }, version),
    ).rejects.toThrow();
  },
);

test("rejects evidence substituted across versions and denies historical treatment to a successor", async () => {
  const bytes = evidence("0.1.0-rc.1");
  expect(() => readHistoricalRelease("0.1.0-rc.2", bytes)).toThrow(/altered/);
  expect(() => readHistoricalRelease("0.1.0-rc.4", bytes)).toThrow(/Unknown/);
  const files = new Map([[historicalEvidenceName("0.1.0-rc.4"), bytes]]);
  await expect(
    verifiedChannelRelease({}, { files }, "0.1.0-rc.4"),
  ).rejects.toThrow();
});
