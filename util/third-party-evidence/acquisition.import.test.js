import { jest } from "@jest/globals";

jest.unstable_mockModule("pacote", () => {
  throw new Error("Pacote must not load while importing non-network helpers");
});

describe("npm evidence acquisition module loading", () => {
  it("keeps non-network helpers usable without loading the Pacote client", async () => {
    await expect(
      import("../acquire-npm-package-evidence.mjs").then(
        ({ parseAcquisitionArguments }) =>
          parseAcquisitionArguments(["--write"]),
      ),
    ).resolves.toEqual({
      write: true,
      scancode: null,
      shard: null,
      registryKeysPath: null,
    });
  });

  it("keeps archive-completion helpers usable without loading the Pacote client", async () => {
    await expect(
      import("../complete-npm-archive-evidence.mjs").then(
        ({ parseArchiveCompletionArguments }) =>
          parseArchiveCompletionArguments([
            "--input=aggregate",
            "--output=completed",
          ]),
      ),
    ).resolves.toEqual({
      inputRoot: "aggregate",
      outputRoot: "completed",
    });
  });
});
