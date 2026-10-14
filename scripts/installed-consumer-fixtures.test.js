import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { writeInstalledConsumerFixtures } from "./installed-consumer-fixtures.mjs";

test("transported consumer fixtures use the same pure JSON encoder without checkout imports", async () => {
  const directory = mkdtempSync(join(tmpdir(), "owlapi-consumer-json-"));
  try {
    writeInstalledConsumerFixtures(directory);
    expect(
      readFileSync(join(directory, "import-closure", "json-identity.mjs")),
    ).toEqual(readFileSync(new URL("./canonical-json.mjs", import.meta.url)));
    const { createPublicContract } = await import(
      pathToFileURL(join(directory, "import-closure", "public-contract.js"))
        .href
    );
    expect(typeof createPublicContract).toBe("function");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
