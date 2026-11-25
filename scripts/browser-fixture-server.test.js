import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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

it("serves first-party names and a provider module reached by its unchanged relative query", async () => {
  const root = mkdtempSync(join(tmpdir(), "owlapi-browser-path-"));
  let server;
  try {
    const runtime = join(root, "import-map", "runtime");
    const installed = join(runtime, "package", "owlapi");
    const provider = join(
      runtime,
      "provider",
      "ga.jspm.io",
      "npm%3Aexample%401.0.0",
    );
    for (const directory of [installed, provider])
      mkdirSync(directory, { recursive: true });
    const querySuffix =
      ".__query-6830ed8c21d79fd4e3825eed232dff5f5a377a9ad24e43a139284c9f0e28ca2a";
    writeFileSync(
      join(installed, "model@v2.js"),
      "export const firstParty = 1;\n",
    );
    writeFileSync(
      join(provider, `part%2Bone.js${querySuffix}`),
      "export const provider = 2;\n",
    );
    writeFileSync(
      join(provider, "part%2Bone.js"),
      "export const provider = 1;\n",
    );
    server = await startBrowserFixtureServer({ root });
    const fixtureUrl = `${server.baseUrl}/import-map/`;
    const providerEntry = new URL(
      "provider/ga.jspm.io/npm:example@1.0.0/index.js",
      fixtureUrl,
    );
    for (const [url, source] of [
      [
        new URL("package/owlapi/model%40v2.js", fixtureUrl),
        "export const firstParty = 1;\n",
      ],
      [
        new URL("./part+one.js?mode=browser", providerEntry),
        "export const provider = 2;\n",
      ],
      [new URL("./part+one.js", providerEntry), "export const provider = 1;\n"],
    ]) {
      const response = await fetch(url);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toMatch(/javascript/u);
      expect(await response.text()).toBe(source);
    }
    expect(
      (await fetch(new URL("./part+one.js?mode=unknown", providerEntry)))
        .status,
    ).toBe(404);
    expect(
      (
        await fetch(
          `${server.baseUrl}/import-map/package%2Fowlapi/model%40v2.js`,
        )
      ).status,
    ).toBe(404);
  } finally {
    await server?.close();
    rmSync(root, { recursive: true, force: true });
  }
});
