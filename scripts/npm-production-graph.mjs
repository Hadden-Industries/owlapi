import assert from "node:assert/strict";

/** Package identities observed by npm ls, independent of installation locations. */
export const flattenNpmGraph = (root, rootName = root?.name) => {
  const identities = new Set();
  const visit = (node, name) => {
    if (
      typeof name !== "string" ||
      !name ||
      typeof node?.version !== "string" ||
      !node.version
    )
      throw new Error(
        "npm production graph contains an incomplete package identity.",
      );
    identities.add(`${name}@${node.version}`);
    for (const [key, dependency] of Object.entries(node.dependencies ?? {}))
      visit(dependency, dependency?.name ?? key);
  };
  visit(root, rootName);
  return [...identities].sort();
};

/** CycloneDX nests npm occurrences and separately inventories the embedded JSON-LD provider. */
export function assertNpmSbomInventory(sbom, installedIdentities) {
  const identities = new Set();
  function visit(component) {
    assert.ok(
      component?.name && component.version,
      "Incomplete npm SBOM component",
    );
    const name = component.group
      ? component.group + "/" + component.name
      : component.name;
    identities.add(name + "@" + component.version);
    for (const child of component.components ?? []) visit(child);
  }
  visit(sbom.metadata.component);
  for (const component of sbom.components) {
    if (
      component.type === "file" &&
      component.name === "internal/parsing/jsonld/provider/jsonld.js" &&
      /^owlapi:embedded-jsonld:sha256:[a-f0-9]{64}$/u.test(component["bom-ref"])
    )
      continue;
    visit(component);
  }
  assert.deepEqual(
    [...identities].sort(),
    installedIdentities,
    "CycloneDX npm inventory differs from the installed production graph",
  );
}
