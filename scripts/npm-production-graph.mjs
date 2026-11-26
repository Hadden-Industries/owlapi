import assert from "node:assert/strict";
import { readGzipTarEntries } from "./release-artifacts.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";

/** Check native problem diagnostics before selecting a subtree; npm can exit zero for extras. */
export function assertHealthyNpmGraph(root) {
  const pending = [root];
  while (pending.length) {
    const node = pending.pop();
    assert.ok(node && typeof node === "object", "Invalid npm graph node");
    assert.ok(
      (node.problems === undefined ||
        (Array.isArray(node.problems) && node.problems.length === 0)) &&
        !node.extraneous &&
        !node.invalid &&
        !node.missing &&
        !node.error,
      "Native npm graph contains a dependency problem",
    );
    pending.push(...Object.values(node.dependencies ?? {}));
  }
}

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
export function assertNpmSbomInventory(
  sbom,
  installedIdentities,
  lockedSubject,
) {
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
  if (lockedSubject) assertLockedRelationships(sbom, lockedSubject);
}

// CycloneDX's path property identifies an npm occurrence independently of its
// generated bom-ref. Two physical occurrences can have the same package name/version.
function assertLockedRelationships(sbom, { graph, tarball }) {
  const packages = new Map(graph.nodes.map((n) => [n.location, n]));
  const references = new Map(),
    expected = new Map();
  const byLocation = new Map();
  const requireRef = (component) => {
    const ref = component["bom-ref"];
    assert.ok(
      typeof ref === "string" && ref && !references.has(ref),
      "Missing or duplicate CycloneDX reference",
    );
    references.set(ref, component);
    return ref;
  };
  const visit = (component) => {
    const ref = requireRef(component);
    const paths = (component.properties ?? []).filter(
      (p) => p.name === "cdx:npm:package:path",
    );
    assert.equal(
      paths.length,
      1,
      "Missing or duplicate npm occurrence location",
    );
    const location = paths[0].value === "" ? "." : paths[0].value;
    const occurrence = packages.get(location);
    const name = component.group
      ? component.group + "/" + component.name
      : component.name;
    assert.ok(
      occurrence &&
        occurrence.name === name &&
        occurrence.version === component.version &&
        !byLocation.has(location),
      "Unexpected CycloneDX occurrence: " + location,
    );
    byLocation.set(location, ref);
    expected.set(ref, new Set());
    for (const child of component.components ?? []) visit(child);
  };
  visit(sbom.metadata.component);
  const embedded = sbom.components.filter((c) => c.type === "file");
  for (const component of sbom.components)
    if (component.type !== "file") visit(component);
  assert.equal(
    byLocation.size,
    packages.size,
    "Incomplete npm occurrence inventory",
  );
  for (const edge of graph.edges)
    if (edge.to !== null)
      expected.get(byLocation.get(edge.from)).add(byLocation.get(edge.to));
  const entries = new Map(
    (tarball ? readGzipTarEntries(tarball) : []).map((e) => [
      e.path,
      e.content,
    ]),
  );
  const provider = "internal/parsing/jsonld/provider/";
  const providerBytes = entries.get(provider + "jsonld.js");
  assert.equal(
    embedded.length,
    providerBytes ? 1 : 0,
    "Unexpected embedded provider census",
  );
  if (providerBytes) {
    const [component] = embedded;
    const digest = sha256Buffer(providerBytes);
    assert.equal(component.name, provider + "jsonld.js");
    assert.deepEqual(component.hashes, [{ alg: "SHA-256", content: digest }]);
    const ref = requireRef(component);
    assert.equal(ref, "owlapi:embedded-jsonld:sha256:" + digest);
    const manifestBytes = entries.get(provider + "build-manifest.json");
    assert.deepEqual(component.properties, [
      {
        name: "owlapi:embedded-provider-manifest-sha256",
        value: sha256Buffer(manifestBytes),
      },
    ]);
    const declared = JSON.parse(manifestBytes);
    assert.equal(declared.output.sha256, digest);
    const members = new Set(
      declared.bundledPackages.map((c) => ref + ":" + c.name + "@" + c.version),
    );
    const included = new Set(
      component.components.map((c) => {
        assert.ok(
          !c.components?.length && c.type === "library",
          "Unexpected embedded provider subtree",
        );
        const id = requireRef(c);
        assert.equal(id, ref + ":" + c.name + "@" + c.version);
        return id;
      }),
    );
    assert.deepEqual(included, members, "Embedded provider inventory differs");
    expected.get(byLocation.get(".")).add(ref);
    expected.set(ref, members);
  }
  const measured = new Map();
  for (const { ref, dependsOn = [] } of sbom.dependencies ?? []) {
    assert.ok(
      references.has(ref) && !measured.has(ref),
      "Invalid CycloneDX relationship source",
    );
    const targets = new Set(dependsOn);
    assert.equal(
      targets.size,
      dependsOn.length,
      "Duplicate CycloneDX relationship",
    );
    for (const target of targets)
      assert.ok(
        references.has(target),
        "Unknown CycloneDX relationship target",
      );
    measured.set(ref, targets);
  }
  for (const ref of references.keys())
    assert.deepEqual(
      measured.get(ref) ?? new Set(),
      expected.get(ref) ?? new Set(),
      "CycloneDX dependency relationship differs for " + ref,
    );
}
