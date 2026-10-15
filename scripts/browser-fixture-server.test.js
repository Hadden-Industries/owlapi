import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { startBrowserFixtureServer } from "./browser-fixture-server.mjs";

it("serves the consumer's JSON identity module as browser JavaScript", async () => {
  const root = mkdtempSync(join(tmpdir(), "owlapi-browser-mime-"));
  let server;
  try {
    const runtime = join(root, "import-map", "runtime");
    mkdirSync(runtime, { recursive: true });
    const source = fileURLToPath(
      new URL(
        "../test/consumers/owl-contract/json-identity.mjs",
        import.meta.url,
      ),
    );
    copyFileSync(source, join(runtime, "json-identity.mjs"));
    server = await startBrowserFixtureServer({ root });
    const response = await fetch(
      `${server.baseUrl}/import-map/json-identity.mjs`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/javascript; charset=utf-8",
    );
    expect(await response.text()).toContain("export");
  } finally {
    await server?.close();
    rmSync(root, { recursive: true });
  }
});
