import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { addEmbeddedJsonLdComponents } from "./embedded-provider-sbom.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const base = () => ({
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  version: 1,
  metadata: {
    component: {
      type: "library",
      name: "owlapi",
      version: "0.1.0-rc.2",
      "bom-ref": "root",
    },
  },
  components: [
    {
      type: "library",
      name: "ordinary-dependency",
      version: "1.0.0",
      "bom-ref": "ordinary",
    },
  ],
  dependencies: [
    { ref: "root", dependsOn: ["ordinary"] },
    { ref: "ordinary", dependsOn: [] },
  ],
});

test("the SBOM includes all executable provider contributors and retains ordinary dependencies", async () => {
  const input = base();
  const result = await addEmbeddedJsonLdComponents(input, repositoryRoot);
  const provider = result.components.find(({ type }) => type === "file");
  expect(provider).toBeDefined();
  expect(
    provider.components.map(({ name, version }) => `${name}@${version}`).sort(),
  ).toEqual([
    "canonicalize@2.1.0",
    "jsonld@9.0.0",
    "lru-cache@6.0.0",
    "rdf-canonize@5.0.0",
    "rolldown@1.2.13",
    "setimmediate@1.0.5",
    "yallist@4.0.0",
  ]);
  expect(provider.hashes).toEqual([
    {
      alg: "SHA-256",
      content: createHash("sha256")
        .update(readFileSync(resolve(repositoryRoot, provider.name)))
        .digest("hex"),
    },
  ]);
  expect(
    provider.components.find(({ name }) => name === "jsonld").pedigree.patches,
  ).toHaveLength(2);
  expect(
    provider.components.find(({ name }) => name === "rolldown").licenses,
  ).toEqual([{ license: { id: "MIT" } }]);
  expect(
    result.dependencies.find(({ ref }) => ref === "root").dependsOn,
  ).toEqual(["ordinary", provider["bom-ref"]]);
  expect(result.components[0]).toEqual(input.components[0]);
  // The manifest establishes contained material, not package-to-package calls.
  // An empty dependsOn would falsely assert that each bundled package is a leaf.
  for (const component of provider.components)
    expect(
      result.dependencies.some(({ ref }) => ref === component["bom-ref"]),
    ).toBe(false);
  expect(input).toEqual(base());
  expect(await addEmbeddedJsonLdComponents(result, repositoryRoot)).toEqual(
    result,
  );
});

test("a retained SBOM for different embedded bytes is rejected rather than relabelled", async () => {
  const result = await addEmbeddedJsonLdComponents(base(), repositoryRoot);
  result.components.find(({ type }) => type === "file").hashes[0].content =
    "a".repeat(64);
  await expect(
    addEmbeddedJsonLdComponents(result, repositoryRoot),
  ).rejects.toThrow(/different embedded provider/);
});

test("object member ordering does not change the embedded provider while array ordering does", async () => {
  const result = await addEmbeddedJsonLdComponents(base(), repositoryRoot);
  const reverseObjects = (value) => {
    if (Array.isArray(value)) return value.map(reverseObjects);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .reverse()
          .map(([key, entry]) => [key, reverseObjects(entry)]),
      );
    }
    return value;
  };
  const reordered = reverseObjects(result);
  await expect(
    addEmbeddedJsonLdComponents(reordered, repositoryRoot),
  ).resolves.toEqual(result);
  const changedArray = structuredClone(result);
  changedArray.components
    .find(({ type }) => type === "file")
    .components.reverse();
  await expect(
    addEmbeddedJsonLdComponents(changedArray, repositoryRoot),
  ).rejects.toThrow(/different embedded provider/);
});

test("the native CycloneDX validator rejects malformed pre-existing component metadata", async () => {
  const input = base();
  input.components[0].type = "invented-component-kind";
  await expect(
    addEmbeddedJsonLdComponents(input, repositoryRoot),
  ).rejects.toThrow(/CycloneDX validation failed/);
});
