import {
  assertNpmSbomInventory,
  flattenNpmGraph,
} from "./npm-production-graph.mjs";

// npm ls supplies names in dependency keys, not in the nested node objects.
const graph = {
  name: "@hadden-industries/owlapi",
  version: "0.1.0-rc.3",
  dependencies: {
    "rdf-parser": {
      version: "2.0.0",
      dependencies: {
        "shared-util": { version: "1.0.0" },
      },
    },
    "rdf-store": {
      version: "3.0.0",
      dependencies: {
        "shared-util": { version: "1.0.0" },
        "older-util": { version: "0.9.0" },
      },
    },
  },
};

test("the locked CycloneDX dependency relationships must match the physical npm occurrences", () => {
  const component = (name, path) => ({
    type: "library",
    name,
    version: "1.0.0",
    "bom-ref": name,
    properties: [{ name: "cdx:npm:package:path", value: path }],
  });
  const sbom = {
    metadata: { component: component("app", "") },
    components: [
      component("parser", "node_modules/parser"),
      component("types", "node_modules/types"),
    ],
    dependencies: [
      { ref: "app", dependsOn: ["parser"] },
      { ref: "parser", dependsOn: ["types"] },
      { ref: "types", dependsOn: [] },
    ],
  };
  const identities = ["app@1.0.0", "parser@1.0.0", "types@1.0.0"];
  const graph = {
    nodes: [
      { location: ".", name: "app", version: "1.0.0" },
      { location: "node_modules/parser", name: "parser", version: "1.0.0" },
      { location: "node_modules/types", name: "types", version: "1.0.0" },
    ],
    edges: [
      { from: ".", to: "node_modules/parser" },
      { from: "node_modules/parser", to: "node_modules/types" },
    ],
  };
  expect(() =>
    assertNpmSbomInventory(sbom, identities, { graph }),
  ).not.toThrow();
  sbom.dependencies[0].dependsOn.push("types");
  sbom.dependencies[1].dependsOn = [];
  expect(() => assertNpmSbomInventory(sbom, identities, { graph })).toThrow(
    /relationship/,
  );
});

test("reconciles every direct and transitive package identity from npm ls keys", () => {
  expect(graph.dependencies["rdf-parser"]).not.toHaveProperty("name");
  expect(flattenNpmGraph(graph)).toEqual([
    "@hadden-industries/owlapi@0.1.0-rc.3",
    "older-util@0.9.0",
    "rdf-parser@2.0.0",
    "rdf-store@3.0.0",
    "shared-util@1.0.0",
  ]);
  const changed = structuredClone(graph);
  changed.dependencies["rdf-store"].dependencies["shared-util"].version =
    "1.1.0";
  expect(flattenNpmGraph(changed)).not.toEqual(flattenNpmGraph(graph));
  expect(flattenNpmGraph(changed)).toContain("shared-util@1.1.0");
  expect(flattenNpmGraph(changed)).toContain("shared-util@1.0.0");
});

test("reconciles nested npm components without using embedded copies to fill a missing dependency", () => {
  const leaf = { type: "library", name: "shared", version: "1.0.0" };
  const embedded = {
    type: "file",
    name: "internal/parsing/jsonld/provider/jsonld.js",
    "bom-ref": "owlapi:embedded-jsonld:sha256:" + "a".repeat(64),
    components: [leaf],
  };
  const sbom = {
    metadata: {
      component: {
        group: "@hadden-industries",
        name: "owlapi",
        version: "0.1.0",
      },
    },
    components: [
      { type: "library", name: "parser", version: "2.0.0", components: [leaf] },
      embedded,
    ],
  };
  const installed = [
    "@hadden-industries/owlapi@0.1.0",
    "parser@2.0.0",
    "shared@1.0.0",
  ];
  assertNpmSbomInventory(sbom, installed);
  sbom.components[0].components = [];
  expect(() => assertNpmSbomInventory(sbom, installed)).toThrow();
  sbom.components[0].components.push({ ...leaf, version: "9.0.0" });
  expect(() => assertNpmSbomInventory(sbom, installed)).toThrow();
});

test("uses the checked package name for an alias-installed root and refuses incomplete nodes", () => {
  const { name, ...installedAliasNode } = graph;
  expect(flattenNpmGraph(installedAliasNode, name)).toEqual(
    flattenNpmGraph(graph),
  );
  const missing = structuredClone(graph);
  delete missing.dependencies["rdf-parser"].version;
  expect(() => flattenNpmGraph(missing)).toThrow(/identity/);
  expect(() => flattenNpmGraph({ version: "1.0.0" })).toThrow(/identity/);
});
