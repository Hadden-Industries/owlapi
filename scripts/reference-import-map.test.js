import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { PACKAGE_NAME, PACKAGE_VERSION } from "./package-identity.mjs";
import {
  BROWSER_CONSUMER_SPECIFIERS,
  excludeNodeXmlParserFallback,
  generateReferenceImportMap,
  hydrateReferenceImportMap,
  resolveReferenceBrowserDependency,
  stableJson,
  toLocalProviderPath,
  verifySubresourceIntegrity,
} from "./reference-import-map.mjs";

const PROVIDER_URL = "https://ga.jspm.io/npm:example@1.0.0/index.js";
const PROVIDER_BYTES = Buffer.from("export const answer = 42;\n");
const PROVIDER_INTEGRITY =
  "sha384-ikZ73SkpeVKecHr7elzJWfj9+687EjDbwuBxv4Y9r+0kWi0jb5fuIoOCDE+E/0m6";

const RELATIVE_CHUNK = "https://ga.jspm.io/npm:example@1.0.0/chunk.js";
const CHUNK_INTEGRITY =
  "sha384-z0dQZuTpVhlJhRpzBVjQTCgdq+BUSh89DMD4c8ea5gn4XTF+416jeLVKPWSl2O8q";

async function withLocalGraph(run, { rebased = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "owlapi-map-"));
  try {
    const app = join(root, "fixture");
    const packageRoot = join(rebased ? root : app, "node_modules", "owlapi");
    mkdirSync(app, { recursive: true });
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(join(app, "package.json"), '{"type":"module"}');
    writeFileSync(
      join(packageRoot, "package.json"),
      JSON.stringify({
        name: PACKAGE_NAME,
        version: PACKAGE_VERSION,
        type: "module",
        exports: Object.fromEntries(
          BROWSER_CONSUMER_SPECIFIERS.map((name) => [
            `.${name.slice("owlapi".length)}`,
            "./index.js",
          ]),
        ),
      }),
    );
    const applicationPath = join(app, "main.js");
    const packageModule = join(packageRoot, "index.js");
    const fixtureModule = join(app, "exercise.js");
    writeFileSync(packageModule, "export const packageValue = 1;\n");
    writeFileSync(fixtureModule, "export const fixtureValue = 2;\n");
    writeFileSync(
      applicationPath,
      `${BROWSER_CONSUMER_SPECIFIERS.map((name) => `import "${name}";`).join("\n")}\nimport "./exercise.js";\n`,
    );
    await run({
      app,
      applicationPath,
      packageRoot,
      packageModule,
      fixtureModule,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const traceFixture = (
  { applicationPath, packageRoot },
  configure = () => {},
) => {
  const packageEntry = "../node_modules/owlapi/index.js";
  const packageScope = "../node_modules/owlapi/";
  const trace = {
    staticDeps: [
      pathToFileURL(applicationPath).href,
      packageEntry,
      PROVIDER_URL,
    ],
    dynamicDeps: [RELATIVE_CHUNK, "./exercise.js"],
  };
  const map = {
    imports: Object.fromEntries(
      BROWSER_CONSUMER_SPECIFIERS.map((specifier) => [specifier, packageEntry]),
    ),
    scopes: { [packageScope]: { example: PROVIDER_URL } },
    integrity: {
      [PROVIDER_URL]: PROVIDER_INTEGRITY,
      [RELATIVE_CHUNK]: CHUNK_INTEGRITY,
    },
  };
  configure(map, trace);
  return generateReferenceImportMap({
    applicationPath,
    packageRoot,
    fixtureModules: ["main.js", "exercise.js"],
    createGenerator: () => ({ link: async () => trace, getMap: () => map }),
  });
};

describe("reference import-map evidence", () => {
  it("keeps exact reviewed-map bytes after separate package and staged fixture body edits", async () => {
    await withLocalGraph(
      async ({
        applicationPath,
        packageRoot,
        packageModule,
        fixtureModule,
      }) => {
        const generate = () =>
          generateReferenceImportMap({
            applicationPath,
            packageRoot,
            fixtureModules: ["main.js", "exercise.js"],
          });
        const original = await generate();
        expect(original.imports.owlapi).toBe("./package/owlapi/index.js");
        writeFileSync(packageModule, "export const packageValue = 100;\n");
        expect(stableJson(await generate())).toBe(stableJson(original));
        writeFileSync(packageModule, "export const packageValue = 1;\n");
        writeFileSync(fixtureModule, "export const fixtureValue = 200;\n");
        expect(stableJson(await generate())).toBe(stableJson(original));
        expect(original.integrity ?? {}).toEqual({});
      },
    );
  });

  it("projects an installed package outside the app, its package-root scope, and a relative transitive provider pin", async () => {
    await withLocalGraph(
      async (fixture) => {
        const map = await traceFixture(fixture);
        expect(map.imports.owlapi).toBe("./package/owlapi/index.js");
        expect(map.scopes).toEqual({
          "./package/owlapi/": { example: PROVIDER_URL },
        });
        expect(map.integrity).toEqual({
          [PROVIDER_URL]: PROVIDER_INTEGRITY,
          [RELATIVE_CHUNK]: CHUNK_INTEGRITY,
        });
      },
      { rebased: true },
    );
  });

  it.each([
    [
      "a relative transitive without a pin",
      (map) => {
        delete map.integrity[RELATIVE_CHUNK];
      },
      /without integrity pins: .*chunk\.js/u,
    ],
    [
      "an orphan pin",
      (_, trace) => {
        trace.dynamicDeps.shift();
      },
      /Untraced .*chunk\.js/u,
    ],
    [
      "an untraced provider target",
      (map) => {
        map.imports.external = "https://ga.jspm.io/untraced.js";
      },
      /targets without integrity pins: .*untraced\.js/u,
    ],
    [
      "an unexpected origin in scoped imports",
      (map) => {
        map.scopes["../node_modules/owlapi/"].example =
          "https://example.com/module.js";
      },
      /selected HTTPS origin/u,
    ],
    [
      "an unexpected origin in trace",
      (_, trace) => {
        trace.dynamicDeps.push("https://example.com/module.js");
      },
      /selected HTTPS origin/u,
    ],
    [
      "an unexpected origin even in an orphan integrity entry",
      (map) => {
        map.integrity["https://example.com/orphan.js"] = CHUNK_INTEGRITY;
      },
      /selected HTTPS origin/u,
    ],
    [
      "a non-object mapping",
      (map) => {
        map.scopes["../node_modules/owlapi/"] = [];
      },
      /expected an object/u,
    ],
    [
      "a malformed SHA-384 token",
      (map) => {
        map.integrity[RELATIVE_CHUNK] = `${CHUNK_INTEGRITY} `;
      },
      /Invalid SHA-384 .*chunk\.js/u,
    ],
  ])("refuses %s", async (_, configure, error) => {
    await withLocalGraph(
      async (fixture) => {
        await expect(traceFixture(fixture, configure)).rejects.toThrow(error);
      },
      { rebased: true },
    );
  });

  it("admits staged fixture imports and refuses sibling Node dependencies, provider mirrors and unlisted scopes", async () => {
    await withLocalGraph(
      async (fixture) => {
        for (const directory of ["node_modules/sibling", "provider/subpath"]) {
          mkdirSync(join(fixture.app, directory), { recursive: true });
          writeFileSync(join(fixture.app, directory, "index.js"), "export {};");
          await expect(
            traceFixture(fixture, (map) => {
              map.imports.extra = `./${directory}/index.js`;
            }),
          ).rejects.toThrow(/Unclassified local reference map URL/u);
          await expect(
            traceFixture(fixture, (map) => {
              map.scopes[`./${directory}/`] = {};
            }),
          ).rejects.toThrow(/Unclassified local reference map URL/u);
        }
        const map = await traceFixture(fixture, (map) => {
          map.imports.extra = "./exercise.js";
          map.scopes["./"] = { extra: "./exercise.js" };
        });
        expect(map.imports.extra).toBe("./exercise.js");
        expect(map.scopes["./"]).toEqual({ extra: "./exercise.js" });
      },
      { rebased: true },
    );
  });

  it("refuses a file alias escaping the installed root and scope keys that normalize to the same path", async () => {
    await withLocalGraph(
      async (fixture) => {
        symlinkSync(
          fixture.app,
          join(fixture.packageRoot, "alias"),
          "junction",
        );
        await expect(
          traceFixture(fixture, (map) => {
            map.imports.extra = "../node_modules/owlapi/alias/exercise.js";
          }),
        ).rejects.toThrow(/Unclassified local reference map URL/u);
        await expect(
          traceFixture(fixture, (map) => {
            const absoluteScope = pathToFileURL(fixture.packageRoot).href + "/";
            map.scopes[absoluteScope] = {};
          }),
        ).rejects.toThrow(/scope collision: \.\/package\/owlapi\//u);
      },
      { rebased: true },
    );
  });

  it("refuses hydration redirects at the request boundary and writes no refused bytes", async () => {
    const writes = [];
    let redirectMode;
    await expect(
      hydrateReferenceImportMap({
        map: { integrity: { [PROVIDER_URL]: PROVIDER_INTEGRITY } },
        mirrorRoot: process.cwd(),
        fetchImplementation: async (url, options) => {
          redirectMode = options.redirect;
          if (redirectMode === "error") throw new TypeError("redirect refused");
          return {
            arrayBuffer: async () => PROVIDER_BYTES,
            redirected: false,
            status: 200,
            url,
          };
        },
        mkdirImplementation() {},
        writeImplementation: (...args) => writes.push(args),
      }),
    ).rejects.toThrow(/redirect/iu);
    expect(redirectMode).toBe("error");
    expect(writes).toEqual([]);
  });

  it("traces literal validation and rejects document DOM dependencies in the streaming writers", () => {
    expect(
      excludeNodeXmlParserFallback(
        "@xmldom/xmldom",
        "file:///package/internal/storage/rdfxml/xmlLiteralValidation.js",
      ),
    ).toBe(false);
    for (const previous of [
      "rdfxml/rdfXmlGraphWriter.js",
      "owlxml/owlXmlStorer.js",
    ])
      expect(() =>
        excludeNodeXmlParserFallback(
          "@xmldom/xmldom",
          "file:///package/internal/storage/" + previous,
        ),
      ).toThrow(/approved/u);
    expect(
      excludeNodeXmlParserFallback(
        "@xmldom/xmldom",
        "file:///package/formats/rdfXMLDocumentFormat.js",
      ),
    ).toBe(false);
    expect(
      excludeNodeXmlParserFallback(
        "@xmldom/xmldom",
        "file:///package/internal/parsing/xml/xmlParserAdapter.js",
      ),
    ).toBe(true);
    expect(excludeNodeXmlParserFallback("n3", "file:///package/index.js")).toBe(
      false,
    );
    expect(() =>
      excludeNodeXmlParserFallback(
        "@xmldom/xmldom",
        "file:///package/unapproved.js",
      ),
    ).toThrow(/approved/u);
    expect(() =>
      excludeNodeXmlParserFallback(
        "@xmldom/xmldom",
        "file:///package/formats/otherRDFXMLDocumentFormat.js",
      ),
    ).toThrow(/approved/u);
  });

  it("requires every portable public entry point and excludes the approved Node transport boundary", () => {
    expect(BROWSER_CONSUMER_SPECIFIERS).toEqual([
      "owlapi",
      "owlapi/apibinding",
      "owlapi/formats",
      "owlapi/io",
      "owlapi/manchestersyntax/renderer",
      "owlapi/model",
      "owlapi/model/parameters",
      "owlapi/modularity/locality",
      "owlapi/profiles",
      "owlapi/search",
      "owlapi/util",
    ]);
  });

  it("maps provider URLs into a traversal-safe host-preserving mirror", () => {
    expect(
      toLocalProviderPath("https://ga.jspm.io/npm:n3@2.3.0/browser/index.js"),
    ).toBe("provider/ga.jspm.io/npm%3An3%402.3.0/browser/index.js");
    expect(() =>
      toLocalProviderPath("http://ga.jspm.io/npm:n3@2.3.0/browser/index.js"),
    ).toThrow(/HTTPS/u);
  });

  it.each([
    "https://example.com/a.js",
    "https://ga.jspm.io:443/a.js",
    "https://user@ga.jspm.io/a.js",
    "https://ga.jspm.io/a.js#",
    "https://ga.jspm.io/a.js?",
    "https://ga.jspm.io/dir//a.js",
    "https://ga.jspm.io/dir/../a.js",
    "https://ga.jspm.io/dir/%2Fa.js",
    "https://ga.jspm.io/dir/%255Ca.js",
    "https://ga.jspm.io/%61.js",
    "https://ga.jspm.io/con/module.js",
    "https://ga.jspm.io/dir./module.js",
  ])("refuses noncanonical provider module URL %s", (url) => {
    expect(() => toLocalProviderPath(url)).toThrow();
  });

  it("preflights conflicting mirror paths before fetching any bytes", async () => {
    let requested = false;
    await expect(
      hydrateReferenceImportMap({
        map: {
          integrity: {
            [PROVIDER_URL]: PROVIDER_INTEGRITY,
            [PROVIDER_URL.toUpperCase().replace(
              "HTTPS://GA.JSPM.IO/",
              "https://ga.jspm.io/",
            )]: PROVIDER_INTEGRITY,
          },
        },
        mirrorRoot: process.cwd(),
        fetchImplementation: async () => {
          requested = true;
        },
      }),
    ).rejects.toThrow(/mirror path collision/u);
    expect(requested).toBe(false);
  });

  it.each([
    ["unexpected status", { status: 206 }, /206/u],
    ["different final URL", { url: RELATIVE_CHUNK }, /chunk\.js/u],
    ["a followed redirect", { redirected: true }, /redirect/u],
    [
      "changed bytes",
      { arrayBuffer: async () => Buffer.from("export {};\n") },
      `Expected ${PROVIDER_INTEGRITY}, observed ${CHUNK_INTEGRITY}`,
    ],
  ])("refuses %s without writing a mirror file", async (_, override, error) => {
    const writes = [];
    await expect(
      hydrateReferenceImportMap({
        map: { integrity: { [PROVIDER_URL]: PROVIDER_INTEGRITY } },
        mirrorRoot: process.cwd(),
        fetchImplementation: async () => ({
          status: 200,
          redirected: false,
          url: PROVIDER_URL,
          arrayBuffer: async () => PROVIDER_BYTES,
          ...override,
        }),
        mkdirImplementation() {},
        writeImplementation: (...args) => writes.push(args),
      }),
    ).rejects.toThrow(error);
    expect(writes).toEqual([]);
  });

  it("validates standard SRI algorithms against the fetched bytes", () => {
    const bytes = PROVIDER_BYTES;
    const integrity = PROVIDER_INTEGRITY;
    expect(() => verifySubresourceIntegrity(bytes, integrity)).not.toThrow();
    expect(() =>
      verifySubresourceIntegrity(Buffer.from("changed"), integrity),
    ).toThrow(/do not match/u);
  });

  it("rejects stock jsonld substitution inside owlapi's native module graph", () => {
    const packageUrl = "file:///fixture/node_modules/owlapi/";
    expect(() =>
      resolveReferenceBrowserDependency({
        packageUrl,
        parentUrl: `${packageUrl}internal/parsing/jsonld/parser.js`,
        specifier: "jsonld",
      }),
    ).toThrow(/package-local JSON-LD provider/);
    expect(
      resolveReferenceBrowserDependency({
        packageUrl,
        parentUrl: "file:///fixture/main.js",
        specifier: "jsonld",
      }),
    ).toBeUndefined();
    expect(
      resolveReferenceBrowserDependency({
        packageUrl,
        parentUrl: `${packageUrl}internal/parsing/rdf/n3SyntaxAdapter.js`,
        specifier: "n3",
      }),
    ).toBeUndefined();
  });

  it("hydrates every provider URL and rewrites map keys and values", async () => {
    const bytes = Buffer.from("export {};\n");
    const providerUrl = "https://ga.jspm.io/npm:example@1.0.0/index.js";
    const integrity = CHUNK_INTEGRITY;
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
        redirected: false,
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
