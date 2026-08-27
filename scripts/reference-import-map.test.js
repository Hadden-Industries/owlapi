import { createHash } from "node:crypto";

import {
  hydrateReferenceImportMap,
  toLocalProviderPath,
  verifySubresourceIntegrity,
} from "./reference-import-map.mjs";

describe("reference import-map evidence", () => {
  it("maps provider URLs into a traversal-safe host-preserving mirror", () => {
    expect(
      toLocalProviderPath("https://ga.jspm.io/npm:n3@2.3.0/browser/index.js"),
    ).toBe("provider/ga.jspm.io/npm%3An3%402.3.0/browser/index.js");
    expect(() =>
      toLocalProviderPath("http://ga.jspm.io/npm:n3@2.3.0/browser/index.js"),
    ).toThrow(/HTTPS/u);
  });

  it("validates standard SRI algorithms against the fetched bytes", () => {
    const bytes = Buffer.from("export const answer = 42;\n");
    const integrity = `sha384-${createHash("sha384").update(bytes).digest("base64")}`;
    expect(() => verifySubresourceIntegrity(bytes, integrity)).not.toThrow();
    expect(() =>
      verifySubresourceIntegrity(Buffer.from("changed"), integrity),
    ).toThrow(/do not match/u);
  });

  it("hydrates every provider URL and rewrites map keys and values", async () => {
    const bytes = Buffer.from("export {};\n");
    const providerUrl = "https://ga.jspm.io/npm:example@1.0.0/index.js";
    const integrity = `sha384-${createHash("sha384").update(bytes).digest("base64")}`;
    const writes = new Map();
    const result = await hydrateReferenceImportMap({
      map: {
        imports: { example: providerUrl },
        integrity: { [providerUrl]: integrity },
        scopes: {
          "https://ga.jspm.io/": { dependency: providerUrl },
          "https://ga.jspm.io/npm:example@1.0.0/": {
            dependency: providerUrl,
          },
        },
      },
      mirrorRoot: process.cwd(),
      fetchImplementation: async () => ({
        arrayBuffer: async () => bytes,
        ok: true,
        status: 200,
        url: providerUrl,
      }),
      mkdirImplementation() {},
      writeImplementation(path, body) {
        writes.set(path, body);
      },
    });

    expect(result.localMap.imports.example).toBe(
      "./provider/ga.jspm.io/npm%3Aexample%401.0.0/index.js",
    );
    expect(
      result.localMap.integrity[
        "./provider/ga.jspm.io/npm%3Aexample%401.0.0/index.js"
      ],
    ).toBe(integrity);
    expect(result.inventory).toHaveLength(1);
    expect(writes).toHaveProperty("size", 1);
    expect(result.localMap.scopes["./provider/ga.jspm.io/"]).toEqual({
      dependency: "./provider/ga.jspm.io/npm%3Aexample%401.0.0/index.js",
    });
    expect(
      result.localMap.scopes["./provider/ga.jspm.io/npm%3Aexample%401.0.0/"],
    ).toBeDefined();
  });
});
