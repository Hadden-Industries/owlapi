import { assertPublicRegistryFacts } from "./qualify-public-registry.mjs";

const version = "0.1.0-alpha.0";
const retainedSha256 = "a".repeat(64);

describe("fresh public-registry qualification", () => {
  test("accepts the exact prerelease under next without latest", () => {
    expect(
      assertPublicRegistryFacts({
        expectedVersion: version,
        retainedSha256,
        metadata: {
          name: "owlapi",
          version,
          dist: {
            integrity: "sha512-example",
            tarball: `https://registry.npmjs.org/owlapi/-/owlapi-${version}.tgz`,
          },
        },
        distTags: { next: version },
        registryTarballSha256: retainedSha256,
      }),
    ).toEqual({
      coordinate: `owlapi@${version}`,
      channel: "next",
      integrity: "sha512-example",
      tarballSha256: retainedSha256,
    });
  });

  test.each([
    ["a stale next tag", { distTags: { next: "0.1.0-alpha.1" } }],
    [
      "an unexpected latest tag",
      { distTags: { next: version, latest: version } },
    ],
    ["different registry bytes", { registryTarballSha256: "b".repeat(64) }],
  ])("rejects %s", (_label, override) => {
    expect(() =>
      assertPublicRegistryFacts({
        expectedVersion: version,
        retainedSha256,
        metadata: {
          name: "owlapi",
          version,
          dist: {
            integrity: "sha512-example",
            tarball: "https://registry.npmjs.org/tarball",
          },
        },
        distTags: { next: version },
        registryTarballSha256: retainedSha256,
        ...override,
      }),
    ).toThrow();
  });
});
