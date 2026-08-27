import {
  compareCodeUnits,
  parseExactSha512Sri,
  sha256,
  stableJson,
  verifySha512Sri,
} from "./digests.mjs";

const PUBLIC_REGISTRY_ORIGIN = "https://registry.npmjs.org";
const NODE_MODULES_MARKER = "node_modules/";

const requireNonemptyString = (value, label) => {
  if (typeof value !== "string" || value.length === 0 || /\s/u.test(value)) {
    throw new TypeError(`Expected ${label}`);
  }
  return value;
};

const packageNameFromDependencyPath = (dependencyPath) => {
  if (
    typeof dependencyPath !== "string" ||
    !dependencyPath.startsWith(NODE_MODULES_MARKER) ||
    dependencyPath.includes("\\") ||
    dependencyPath.split("/").some((segment) => !segment || segment === "..")
  ) {
    throw new TypeError(
      `Expected node_modules dependency path, received ${String(dependencyPath)}`,
    );
  }
  const markerIndex = dependencyPath.lastIndexOf(NODE_MODULES_MARKER);
  const suffix = dependencyPath.slice(markerIndex + NODE_MODULES_MARKER.length);
  const segments = suffix.split("/");
  const valid = suffix.startsWith("@")
    ? segments.length === 2 && segments.every(Boolean)
    : segments.length === 1 && Boolean(segments[0]);
  if (!valid) {
    throw new TypeError(
      `Expected node_modules dependency path, received ${dependencyPath}`,
    );
  }
  return suffix;
};

const validatePublicRegistryTarball = (resolved, dependencyPath) => {
  let url;
  try {
    url = new URL(resolved);
  } catch (error) {
    throw new TypeError(
      `Expected public npm registry HTTPS URL for ${dependencyPath}`,
      { cause: error },
    );
  }
  if (
    url.origin !== PUBLIC_REGISTRY_ORIGIN ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    !url.pathname.endsWith(".tgz")
  ) {
    throw new TypeError(
      `Expected public npm registry HTTPS URL for ${dependencyPath}`,
    );
  }
  return url.href;
};

const normalizeSelector = (value, label, dependencyPath) => {
  if (value === undefined) {
    return [];
  }
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string" || entry.length === 0)
  ) {
    throw new TypeError(`Invalid ${label} selector for ${dependencyPath}`);
  }
  return [...new Set(value)].sort(compareCodeUnits);
};

const readLockfile = (lockfileBytes) => {
  if (!Buffer.isBuffer(lockfileBytes) && typeof lockfileBytes !== "string") {
    throw new TypeError("Lockfile input must be bytes or text");
  }
  try {
    return JSON.parse(Buffer.from(lockfileBytes).toString("utf8"));
  } catch (error) {
    throw new TypeError("Lockfile is not valid UTF-8 JSON", { cause: error });
  }
};

export const verifySri = verifySha512Sri;

export const normalizeLockedRegistryGraph = (lockfileBytes) => {
  const lockfile = readLockfile(lockfileBytes);
  if (lockfile?.lockfileVersion !== 3) {
    throw new TypeError("Expected npm lockfile version 3");
  }
  if (
    !lockfile.packages ||
    typeof lockfile.packages !== "object" ||
    Array.isArray(lockfile.packages)
  ) {
    throw new TypeError("Lockfile packages must be an object");
  }
  const root = lockfile.packages[""];
  if (!root || typeof root !== "object") {
    throw new TypeError("Lockfile is missing its root package");
  }
  const packageName = requireNonemptyString(root.name, "root package name");
  const packageVersion = requireNonemptyString(
    root.version,
    "root package exact version",
  );

  const artifactsByCoordinate = new Map();
  const occurrences = [];
  const dependencyEntries = Object.entries(lockfile.packages)
    .filter(([dependencyPath]) => dependencyPath !== "")
    .sort(([left], [right]) => compareCodeUnits(left, right));

  for (const [dependencyPath, lockEntry] of dependencyEntries) {
    if (!lockEntry || typeof lockEntry !== "object") {
      throw new TypeError(`Invalid lock entry for ${dependencyPath}`);
    }
    const dependencyName = packageNameFromDependencyPath(dependencyPath);
    // npm records aliases such as string-width-cjs with the underlying package
    // identity in lockEntry.name. The archive and registry signature use that
    // underlying identity; the install-path alias remains occurrence metadata.
    const name =
      lockEntry.name === undefined
        ? dependencyName
        : requireNonemptyString(
            lockEntry.name,
            `package name for ${dependencyPath}`,
          );
    const version = requireNonemptyString(
      lockEntry.version,
      `exact version for ${dependencyPath}`,
    );
    const resolved = validatePublicRegistryTarball(
      lockEntry.resolved,
      dependencyPath,
    );
    parseExactSha512Sri(lockEntry.integrity);
    const integrity = lockEntry.integrity;
    const coordinate = `${name}@${version}`;
    const identity = { name, version, resolved, integrity };
    const artifactId = sha256(stableJson(identity));
    const existing = artifactsByCoordinate.get(coordinate);
    if (existing && existing.artifactId !== artifactId) {
      throw new Error(`Contradictory locked artifacts for ${coordinate}`);
    }
    const artifact = existing || {
      artifactId,
      ...identity,
      lockfileLicenses: [],
      occurrencePaths: [],
    };
    if (
      typeof lockEntry.license === "string" &&
      lockEntry.license.length > 0 &&
      !artifact.lockfileLicenses.includes(lockEntry.license)
    ) {
      artifact.lockfileLicenses.push(lockEntry.license);
      artifact.lockfileLicenses.sort(compareCodeUnits);
    }
    artifact.occurrencePaths.push(dependencyPath);
    artifact.occurrencePaths.sort(compareCodeUnits);
    artifactsByCoordinate.set(coordinate, artifact);
    occurrences.push({
      dependencyPath,
      dependencyName,
      artifactId,
      development: lockEntry.dev === true,
      optional: lockEntry.optional === true,
      platformSelectors: {
        cpu: normalizeSelector(lockEntry.cpu, "cpu", dependencyPath),
        os: normalizeSelector(lockEntry.os, "os", dependencyPath),
        libc: normalizeSelector(lockEntry.libc, "libc", dependencyPath),
      },
    });
  }

  return {
    lockfileSha256: sha256(Buffer.from(lockfileBytes)),
    lockfileVersion: lockfile.lockfileVersion,
    package: { name: packageName, version: packageVersion },
    occurrences,
    artifacts: [...artifactsByCoordinate.values()].sort((left, right) =>
      compareCodeUnits(left.artifactId, right.artifactId),
    ),
  };
};
