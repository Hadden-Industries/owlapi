import { jest } from "@jest/globals";
import {
  classifyRegistryReadme,
  observeRegistryDocumentation,
} from "./registry-documentation.mjs";
import {
  documentationManifest as manifest,
  documentationArchive,
} from "./fixtures/documentation-candidate.mjs";

test.each([
  [{}, "README_ABSENT"],
  [{ readme: "candidate 🌟 documentation" }, "MATCH"],
  [{ readme: "candidate 🌟" }, "MATCHING_PREFIX"],
  [{ readme: "old documentation" }, "DIFFERENT_CONTENT"],
  [
    {
      readme: "new documentation",
      versions: { "0.1.1": {} },
      time: { "0.1.1": "2026-11-02T00:00:00Z" },
    },
    "OTHER_RECENT_PUBLICATION",
  ],
])(
  "classifies moving metadata independently of exact-version bytes: %s",
  (metadata, state) => {
    expect(
      classifyRegistryReadme({
        metadata,
        version: manifest.version,
        readme: "candidate 🌟 documentation",
      }).state,
    ).toBe(state);
  },
);

test("a bounded failed observation remains unknown and cannot authorize another publication", async () => {
  const read = jest.fn(async () => {
    throw new Error("HTTP 503");
  });
  expect(
    await observeRegistryDocumentation({
      manifest,
      tarball: documentationArchive(),
      read,
    }),
  ).toMatchObject({ state: "UNAVAILABLE" });
  expect(read).toHaveBeenCalledTimes(1);
  expect(read.mock.calls[0][1]).toMatchObject({
    attempts: 1,
    timeoutMs: 15000,
  });
});
