import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

describe("network-denial preload", () => {
  it("fails a network-capable Node process before any request can be sent", () => {
    const repositoryRoot = resolve(import.meta.dirname, "..");
    const result = spawnSync(
      process.execPath,
      [
        "--import=./util/deny-network.mjs",
        "--eval",
        'fetch("https://registry.npmjs.org/owlapi")',
      ],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Network access is disabled for this verification process",
    );
  });
});
