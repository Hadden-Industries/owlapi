import { jest } from "@jest/globals";

jest.unstable_mockModule("pacote", () => {
  throw new Error("Pacote must not load while importing pure release helpers");
});

test.each([
  ["./registry-provenance.mjs", "assertReleaseProvenance"],
  ["./qualify-public-registry.mjs", "assertPublicRegistryFacts"],
])(
  "%s exposes its metadata assertions without loading a registry client",
  async (path, name) => {
    const helpers = await import(path);
    expect(helpers[name]).toEqual(expect.any(Function));
  },
);
