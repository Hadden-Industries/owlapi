import { join } from "node:path";
import { createCiRecipientScanner } from "./ci-recipient-scanner.mjs";

test("prepares the pinned scanner once on first real archive scan", async () => {
  const requests = [];
  const root = join("reviewed-output", "eligibility");
  const scanner = createCiRecipientScanner({
    root,
    environment: { SCANCODE_PYTHON: "pinned-python" },
    platform: "linux",
    architecture: "x64",
    prepare: async (input) => {
      requests.push({ prepare: input });
      return { command: "isolated-scancode" };
    },
    scan: async (input) => requests.push({ scan: input }),
  });
  expect(requests).toEqual([]);
  await Promise.all([
    scanner({ artifactId: "a" }),
    scanner({ artifactId: "b" }),
  ]);
  expect(requests).toEqual([
    {
      prepare: {
        platform: "linux",
        outputRoot: join(root, "scanner"),
        python: "pinned-python",
      },
    },
    { scan: { artifactId: "a", scancode: "isolated-scancode" } },
    { scan: { artifactId: "b", scancode: "isolated-scancode" } },
  ]);
});

test("does not prepare a scanner on unsupported macOS even if a command is offered", async () => {
  const unexpected = () => {
    throw new Error("Unexpected scanner execution");
  };
  const scanner = createCiRecipientScanner({
    root: "temporary",
    environment: { SCANCODE_COMMAND: "not-admitted" },
    platform: "darwin",
    architecture: "arm64",
    prepare: unexpected,
    scan: unexpected,
  });
  await expect(scanner({ artifactId: "a" })).rejects.toMatchObject({
    code: "RECIPIENT_ARCHIVE_SCANNER_REQUIRED",
  });
});
