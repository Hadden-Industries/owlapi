/** Measure npm's native typed graph without executing packages or resolving from a registry. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { canonicalJson } from "./canonical-json.mjs";
import { findNpmCliCandidates } from "./assert-workflow-runtime.mjs";
import { PACKAGE_NAME, assertRegistryTarballUrl } from "./package-identity.mjs";
import { readGzipTarEntries } from "./release-artifacts.mjs";
import { isStrictDescendantPath, sha256Buffer } from "./release-file-utils.mjs";
import { indexRegistryOccurrences } from "../util/third-party-evidence/lock-graph.mjs";

const utf8 = new TextDecoder("utf-8", { fatal: true });
const parse = (bytes) => JSON.parse(utf8.decode(bytes));
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const orderEdges = (a, b) => compare(a.from, b.from) || compare(a.name, b.name);
const sri = (bytes) =>
  "sha512-" + createHash("sha512").update(bytes).digest("base64");

function checkPayload(directory, entries) {
  const expected = new Map(entries.map((entry) => [entry.path, entry.content]));
  assert.equal(
    expected.size,
    entries.length,
    "Duplicate candidate archive member",
  );
  const pending = [""];
  while (pending.length) {
    const parent = pending.pop();
    for (const child of readdirSync(join(directory, parent), {
      withFileTypes: true,
    })) {
      const path = parent ? parent + "/" + child.name : child.name;
      if (path === "node_modules" && child.isDirectory()) continue;
      if (child.isDirectory()) {
        pending.push(path);
        continue;
      }
      assert.ok(
        child.isFile() && expected.has(path),
        "Unexpected first-party payload member: " + path,
      );
      assert.ok(
        readFileSync(join(directory, path)).equals(expected.get(path)),
        "Changed first-party payload: " + path,
      );
      expected.delete(path);
    }
  }
  assert.equal(expected.size, 0, "Missing first-party payload member");
}

function readInputs(directory, { tarball, dependencyName, registryTarball }) {
  const manifestBytes = readFileSync(join(directory, "package.json"));
  const lockBytes = readFileSync(join(directory, "package-lock.json"));
  const manifest = parse(manifestBytes),
    lock = parse(lockBytes);
  const entries = readGzipTarEntries(tarball);
  const packed = entries.filter((item) => item.path === "package.json");
  assert.equal(packed.length, 1);
  const subject = parse(packed[0].content);
  assert.equal(subject.name, PACKAGE_NAME);
  assert.equal(lock.lockfileVersion, 3);
  const location = dependencyName ? "node_modules/" + dependencyName : "";
  const root = lock.packages[location];
  assert.ok(
    root && root.version === subject.version,
    "Different candidate version in lock",
  );
  const integrity = sri(tarball);
  const registryEntries = { ...lock.packages };
  if (dependencyName) {
    assert.ok([PACKAGE_NAME, "owlapi"].includes(dependencyName));
    const resolved = registryTarball
      ? assertRegistryTarballUrl(registryTarball)
      : "file:candidate.tgz";
    const spec = registryTarball
      ? dependencyName === PACKAGE_NAME
        ? subject.version
        : "npm:" + PACKAGE_NAME + "@" + subject.version
      : resolved;
    for (const consumer of [manifest, lock.packages[""]]) {
      assert.deepEqual(
        consumer.dependencies,
        { [dependencyName]: spec },
        "Incorrect consumer root specifier",
      );
      for (const field of [
        "workspaces",
        "overrides",
        "packageExtensions",
        "peerDependencies",
        "optionalDependencies",
        "devDependencies",
        "bundleDependencies",
        "bundledDependencies",
      ])
        assert.equal(
          consumer[field],
          undefined,
          "Unexpected consumer " + field,
        );
    }
    assert.equal(root.name ?? dependencyName, subject.name);
    assert.equal(
      root.integrity,
      integrity,
      "Different candidate archive integrity",
    );
    assert.equal(root.resolved, resolved, "Different candidate archive source");
    assert.ok(
      !root.link && !root.inBundle && !root.extraneous,
      "Invalid candidate archive occurrence",
    );
    delete registryEntries[location];
  } else {
    assert.deepEqual(manifest, subject, "Packed producer manifest differs");
  }
  for (const field of [
    "dependencies",
    "peerDependencies",
    "peerDependenciesMeta",
    "optionalDependencies",
    "acceptDependencies",
    "bundleDependencies",
    "bundledDependencies",
    "workspaces",
  ]) {
    assert.deepEqual(
      root[field] ?? {},
      subject[field] ?? {},
      "Candidate lock differs from packed " + field,
    );
  }
  for (const [path, entry] of Object.entries(registryEntries)) {
    if (path) {
      assert.ok(entry && !entry.link, "Unsupported registry occurrence link");
      assert.ok(!entry.extraneous, "Extraneous registry lock occurrence");
    }
  }
  const indexed = indexRegistryOccurrences(registryEntries);
  const archiveById = new Map(
    indexed.artifacts.map((archive) => [archive.artifactId, archive]),
  );
  const origins = new Map(
    indexed.occurrences.map((row) => [
      row.dependencyPath,
      {
        archive: archiveById.get(row.artifactId),
        bundled: row.bundled,
      },
    ]),
  );
  return {
    manifestBytes,
    lockBytes,
    manifest,
    lock,
    entries,
    subject,
    location,
    integrity,
    origins,
  };
}

/** The caller supplies the platform observed by its trusted native lane when replaying a lock. */
export function currentResolutionPlatform(
  npmCli = process.env.OWLAPI_CONSUMER_NPM ??
    process.env.npm_execpath ??
    findNpmCliCandidates()[0],
) {
  const result = {
    os: process.platform,
    cpu: process.arch,
    node: process.versions.node,
  };
  if (result.os === "linux") {
    const libc = createRequire(npmCli)("npm-install-checks").currentEnv.libc(
      result.os,
    );
    if (libc) result.libc = libc;
  }
  return result;
}

// An incompatible required descendant removes its optional parent. Reachability from
// the active candidate then naturally excludes siblings used only by that branch.
function omittedOptionalNodes(tree, native, platform, npmVersion) {
  const { checkPlatform, checkEngine } = native("npm-install-checks");
  const omitted = new Set();
  for (const node of tree.inventory.values()) {
    if (!node.optional) continue;
    try {
      if (platform.os === "linux" && node.package.libc && !platform.libc)
        throw new Error(
          "Cannot qualify a libc-specific package without a measured libc",
        );
      checkPlatform(node.package, false, platform);
      checkEngine(node.package, npmVersion, platform.node);
    } catch (error) {
      if (!["EBADENGINE", "EBADPLATFORM"].includes(error.code)) throw error;
      omitted.add(node);
    }
  }
  for (const child of omitted)
    for (const edge of child.edgesIn)
      if (!edge.optional && !edge.dev) omitted.add(edge.from);
  return omitted;
}

function nativeTree(native, directory) {
  const Arborist = native("@npmcli/arborist");
  // The inspector never evaluates a package-supplied npm extension.
  return new Arborist({
    path: directory,
    ignoreExtension: true,
    ignoreScripts: true,
    offline: true,
  });
}

function graphOf(tree, inputs, native, platform, actual, npmVersion) {
  const { location, subject, integrity, origins } = inputs;
  const semver = native("semver"),
    npa = native("npm-package-arg");
  const omitted = actual
    ? new Set()
    : omittedOptionalNodes(tree, native, platform, npmVersion);
  if (!actual && location) {
    const reachable = new Set([tree]);
    for (const n of reachable)
      for (const edge of n.edgesOut.values())
        if (!edge.dev && edge.to) reachable.add(edge.to);
    assert.ok(
      [...tree.inventory.values()].every((n) => reachable.has(n)),
      "Extraneous unreachable occurrence in native lock",
    );
  }
  const root = tree.inventory.get(location);
  assert.ok(
    root &&
      !root.isLink &&
      root.packageName === subject.name &&
      root.version === subject.version,
    "Different installed candidate",
  );
  assert.deepEqual(
    root.package.dependencies ?? {},
    subject.dependencies ?? {},
    "Changed direct dependency contract",
  );
  for (const value of Object.values(subject.dependencies ?? {}))
    assert.equal(semver.valid(value), value, "Expected an exact direct pin");
  const canonicalLocation = (path) =>
    path === location
      ? "."
      : location && path.startsWith(location + "/")
        ? "." + path.slice(location.length)
        : path;
  const visited = new Set(),
    nodes = [],
    edges = [];
  const pending = [root];
  while (pending.length) {
    const node = pending.pop();
    if (visited.has(node.location)) continue;
    visited.add(node.location);
    const from = canonicalLocation(node.location);
    assert.ok(
      !node.isLink && !node.errors?.length,
      "Invalid node in npm production closure",
    );
    const origin = origins.get(node.location);
    assert.ok(node === root || origin, "Unregistered npm occurrence");
    const archive = origin?.archive;
    if (node !== root) {
      assert.equal(node.packageName, origin.bundled?.name ?? archive.name);
      assert.equal(node.version, origin.bundled?.version ?? archive.version);
    }
    nodes.push({
      location: from,
      name: node.packageName,
      version: node.version,
      integrity: archive?.integrity ?? integrity,
      ...(archive ? { resolved: archive.resolved } : {}),
      ...(origin?.bundled
        ? { bundledIn: canonicalLocation(origin.bundled.ownerDependencyPath) }
        : {}),
    });
    for (const edge of node.edgesOut.values()) {
      if (edge.dev) continue;
      assert.ok(
        !edge.workspace && edge.valid && !edge.peerConflicted,
        "Invalid native npm edge " + from + " -> " + edge.name,
      );
      const requests = [edge.spec, ...(edge.accept ? [edge.accept] : [])].map(
        (spec) => {
          const request = npa.resolve(edge.name, spec);
          const dest = request.type === "alias" ? request.subSpec : request;
          assert.ok(
            ["range", "version"].includes(dest.type),
            "Ineligible dependency specifier: " + edge.name,
          );
          return dest;
        },
      );
      // Only producer-root policy can legitimately affect its own graph.
      if (location)
        assert.equal(edge.spec, edge.rawSpec, "Unexpected consumer override");
      const target = omitted.has(edge.to) ? null : edge.to;
      if (target) {
        assert.ok(
          requests.some(
            (req) =>
              req.name === target.packageName &&
              (req.fetchSpec === "*" ||
                semver.satisfies(target.version, req.fetchSpec, {
                  loose: true,
                })),
          ),
          "Target differs from requested npm identity or range",
        );
        if (
          node === root &&
          Object.hasOwn(subject.dependencies ?? {}, edge.name)
        ) {
          assert.equal(
            target.packageName,
            edge.name,
            "Direct package identity differs",
          );
          assert.equal(
            target.version,
            subject.dependencies[edge.name],
            "Direct package version differs",
          );
        }
        pending.push(target);
      } else {
        assert.ok(
          edge.optional && (actual || edge.to || edge.type === "peerOptional"),
          "Unexplained dependency omission: " + edge.name,
        );
      }
      edges.push({
        from,
        name: edge.name,
        type: edge.type,
        spec: edge.rawSpec,
        ...(edge.accept ? { accept: edge.accept } : {}),
        ...(edge.spec !== edge.rawSpec ? { effectiveSpec: edge.spec } : {}),
        to: target ? canonicalLocation(target.location) : null,
      });
    }
  }
  if (actual && location) {
    for (const node of tree.inventory.values())
      assert.ok(
        node === tree || visited.has(node.location),
        "Extraneous physical consumer package: " + node.location,
      );
  }
  nodes.sort((a, b) => compare(a.location, b.location));
  edges.sort(orderEdges);
  return { nodes, edges };
}

/** Collect physical edges and their virtual-lock oracle using only the selected npm distribution. */
export async function captureConsumerResolution(directory, options) {
  directory = realpathSync(directory);
  const native = createRequire(options.npmCli);
  assert.ok(
    !readdirSync(directory).some((name) =>
      /^\.npm-extension\.(?:cjs|mjs)$/iu.test(name),
    ),
    "Unexpected consumer npm extension",
  );
  const inputs = readInputs(directory, options);
  const platform = currentResolutionPlatform(options.npmCli);
  const npmVersion = native("../package.json").version;
  const locked = await nativeTree(native, directory).loadVirtual();
  const expected = graphOf(locked, inputs, native, platform, false, npmVersion);
  if (inputs.location) {
    const root = join(directory, inputs.location);
    assert.ok(
      !lstatSync(root).isSymbolicLink() &&
        isStrictDescendantPath(directory, realpathSync(root)),
      "Linked installed candidate",
    );
    checkPayload(root, inputs.entries);
  }
  const actual = await nativeTree(native, directory).loadActual({
    forceActual: true,
  });
  const graph = graphOf(actual, inputs, native, platform, true, npmVersion);
  assert.deepEqual(
    graph,
    expected,
    "Installed dependency edges differ from the native lock",
  );
  const manifests = {};
  for (const node of graph.nodes) {
    const location =
      node.location === "."
        ? inputs.location
        : node.location.startsWith("./")
          ? inputs.location + node.location.slice(1)
          : node.location;
    const path = join(directory, location, "package.json");
    assert.ok(
      !lstatSync(path).isSymbolicLink() &&
        isStrictDescendantPath(directory, realpathSync(path)),
      "Installed manifest escapes its root",
    );
    manifests[node.location] = sha256Buffer(readFileSync(path));
  }
  return {
    schemaVersion: 1,
    tarballSha256: sha256Buffer(options.tarball),
    dependencyName: options.dependencyName ?? null,
    platform,
    npm: native("../package.json").version,
    manifestSha256: sha256Buffer(inputs.manifestBytes),
    lockSha256: sha256Buffer(inputs.lockBytes),
    manifests,
    graph,
  };
}

/** Recompute the native graph from the retained manifest and lock on the recorded platform. */
export async function replayConsumerResolution(directory, options, observed) {
  const inputs = readInputs(directory, options);
  const native = createRequire(options.npmCli);
  assert.deepEqual(Object.keys(observed).sort(), [
    "dependencyName",
    "graph",
    "lockSha256",
    "manifestSha256",
    "manifests",
    "npm",
    "platform",
    "schemaVersion",
    "tarballSha256",
  ]);
  assert.equal(observed.schemaVersion, 1);
  assert.deepEqual(
    observed.platform,
    options.platform,
    "Unexpected recorded platform",
  );
  assert.equal(observed.npm, options.observedNpm, "Unexpected recorded npm");
  assert.equal(observed.dependencyName, options.dependencyName ?? null);
  assert.equal(observed.tarballSha256, sha256Buffer(options.tarball));
  assert.equal(observed.manifestSha256, sha256Buffer(inputs.manifestBytes));
  assert.equal(observed.lockSha256, sha256Buffer(inputs.lockBytes));
  const tree = await nativeTree(native, resolve(directory)).loadVirtual();
  const expected = graphOf(
    tree,
    inputs,
    native,
    options.platform,
    false,
    options.observedNpm,
  );
  assert.deepEqual(
    observed.graph,
    expected,
    "Recorded graph differs from replayed native edges",
  );
  assert.deepEqual(
    Object.keys(observed.manifests).sort(),
    expected.nodes.map((n) => n.location),
  );
  for (const digest of Object.values(observed.manifests))
    assert.match(digest, /^[a-f0-9]{64}$/u);
  assert.equal(
    observed.manifests["."],
    sha256Buffer(inputs.entries.find((e) => e.path === "package.json").content),
  );
}

/** Compare two validated snapshots, retaining occurrence and parent-edge explanations for every delta. */
export function compareConsumerResolutions(before, after) {
  assert.equal(
    before.tarballSha256,
    after.tarballSha256,
    "Compared different candidate bytes",
  );
  const archives = new Map();
  for (const node of [...before.graph.nodes, ...after.graph.nodes]) {
    if (node.bundledIn) continue;
    const key = node.name + "@" + node.version;
    const identity = canonicalJson([node.integrity, node.resolved ?? null]);
    assert.ok(
      !archives.has(key) || archives.get(key) === identity,
      "Contradictory archive for " + key,
    );
    archives.set(key, identity);
  }
  function differences(left, right, keyOf) {
    const a = new Map(left.map((value) => [keyOf(value), value]));
    const b = new Map(right.map((value) => [keyOf(value), value]));
    const delta = [];
    for (const key of [...new Set([...a.keys(), ...b.keys()])].sort()) {
      const old = a.get(key) ?? null,
        current = b.get(key) ?? null;
      if (canonicalJson(old) !== canonicalJson(current))
        delta.push({ before: old, after: current });
    }
    return delta;
  }
  const parents = (edges) => {
    const index = new Map();
    for (const edge of edges) {
      if (edge.to === null) continue;
      if (!index.has(edge.to)) index.set(edge.to, []);
      index.get(edge.to).push(edge);
    }
    return index;
  };
  const oldParents = parents(before.graph.edges),
    newParents = parents(after.graph.edges);
  const occurrences = differences(
    before.graph.nodes,
    after.graph.nodes,
    (n) => n.location,
  );
  for (const change of occurrences)
    change.requestedBy = {
      before: oldParents.get(change.before?.location) ?? [],
      after: newParents.get(change.after?.location) ?? [],
    };
  return {
    occurrences,
    edges: differences(before.graph.edges, after.graph.edges, (e) =>
      canonicalJson([e.from, e.name]),
    ),
  };
}
