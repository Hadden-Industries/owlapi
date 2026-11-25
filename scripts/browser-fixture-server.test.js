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

it("serves encoded first-party filenames and preserves literal provider mirror filenames", async () => {
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
    const querySuffix = `.__query-${"a".repeat(64)}`;
    writeFileSync(
      join(installed, "model@v2.js"),
      "export const firstParty = 1;\n",
    );
    writeFileSync(
      join(provider, `example.js${querySuffix}`),
      "export const provider = 2;\n",
    );
    server = await startBrowserFixtureServer({ root });
    for (const [url, source] of [
      ["package/owlapi/model%40v2.js", "export const firstParty = 1;\n"],
      [
        `provider/ga.jspm.io/npm%3Aexample%401.0.0/example.js${querySuffix}`,
        "export const provider = 2;\n",
      ],
    ]) {
      const response = await fetch(`${server.baseUrl}/import-map/${url}`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toMatch(/javascript/u);
      expect(await response.text()).toBe(source);
    }
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
