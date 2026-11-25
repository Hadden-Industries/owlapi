import { createHash } from "node:crypto";
import { realpathSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { isStrictDescendantPath } from "./release-file-utils.mjs";

const PROVIDER_ORIGIN = "https://ga.jspm.io";
const PACKAGE_PREFIX = "./package/owlapi/";
const RUNTIME_BASE = new URL("https://owlapi.invalid/");

const asUrl = (value, base) => {
  if (
    typeof value !== "string" ||
    !value ||
    value !== value.trim() ||
    /[\\\p{Cc}]/u.test(value)
  ) {
    throw new Error(`Invalid reference map URL: ${value}`);
  }
  return new URL(value, base);
};

const pathSegments = (url, scope) => {
  const path = url.pathname.slice(1, scope ? -1 : undefined);
  return path.split("/").map((segment) => {
    const decoded = decodeURIComponent(segment);
    if (
      !decoded ||
      decoded === "." ||
      decoded === ".." ||
      /[/%\\\p{Cc}]/u.test(decoded)
    ) {
      throw new Error(`Unsafe reference map path segment in ${url.href}`);
    }
    return decoded;
  });
};

// A provider URL has one spelling. Mirror filenames encode individual segments
// because the fixture server serves the encoded request path from disk.
const providerLocation = (value, scope) => {
  const url = asUrl(value);
  if (url.protocol !== "https:" || url.origin !== PROVIDER_ORIGIN) {
    throw new Error(
      `Reference provider URL is outside the selected HTTPS origin: ${value}`,
    );
  }
  if (
    url.href !== value ||
    url.username ||
    url.password ||
    value.includes("#") ||
    url.pathname.endsWith("/") !== scope ||
    (scope ? value.includes("?") : value.endsWith("?") && !url.search)
  ) {
    throw new Error(
      `Noncanonical reference provider ${scope ? "scope" : "module"}: ${value}`,
    );
  }
  const segments = url.pathname === "/" ? [] : pathSegments(url, scope);
  const canonicalPath = segments
    .map((segment) =>
      encodeURI(segment).replaceAll("?", "%3F").replaceAll("#", "%23"),
    )
    .join("/");
  if (
    url.pathname !== `/${canonicalPath}${scope && segments.length ? "/" : ""}`
  ) {
    throw new Error(`Ambiguous reference provider path: ${value}`);
  }
  const suffix = url.search
    ? `.__query-${createHash("sha256").update(url.search).digest("hex")}`
    : "";
  const encoded = segments.map(encodeURIComponent);
  if (
    encoded.some((segment) =>
      /(?:\.$|^(?:con|prn|aux|nul|(?:com|lpt)[1-9])(?:\.|$))/iu.test(segment),
    )
  ) {
    throw new Error(`Nonportable reference provider mirror path: ${value}`);
  }
  const path = encoded.join("/");
  return `provider/${url.hostname}/${path}${scope && path ? "/" : ""}${suffix}`;
};

/** Return the mirror-relative file path for an admitted JSPM module URL. */
export const toLocalProviderPath = (value) => providerLocation(value, false);

/** Require exactly one repository-profile SHA-384 SRI token. */
export const assertSha384Integrity = (integrity, url) => {
  if (
    typeof integrity !== "string" ||
    integrity.length !== 71 ||
    !/^sha384-[A-Za-z0-9+/]{64}$/u.test(integrity)
  ) {
    throw new Error(`Invalid SHA-384 integrity pin for ${url}`);
  }
};

const admitProvider = (value, scope) => {
  providerLocation(value, scope);
  return { url: value, provider: true };
};

const relativeUrlPath = (base, path) =>
  relative(base, path).split(sep).map(encodeURIComponent).join("/");
const samePath = (left, right) => relative(left, right) === "";
const withinScope = (root, path, scope) =>
  isStrictDescendantPath(root, path) || (scope && samePath(root, path));
const fixtureNamespace = (name) =>
  !/^(?:node_modules|package|provider|runtime)(?:\/|$)/iu.test(name);

/** Classify JSPM file URLs against the installed package and the exact runtime copy list. */
export const generatedUrlClassifier = ({
  applicationPath,
  packageRoot,
  fixtureModules,
}) => {
  const applicationRoot = dirname(applicationPath);
  const realApplicationRoot = realpathSync(applicationRoot);
  const realPackageRoot = realpathSync(packageRoot);
  const base = pathToFileURL(applicationPath);
  const fixtures = new Map();
  const fixtureScopes = new Set([""]);
  for (const name of fixtureModules) {
    const path = resolve(applicationRoot, name);
    const realPath = realpathSync(path);
    const entry = relativeUrlPath(applicationRoot, path);
    if (
      !isStrictDescendantPath(applicationRoot, path) ||
      !isStrictDescendantPath(realApplicationRoot, realPath) ||
      !fixtureNamespace(entry) ||
      !statSync(realPath).isFile()
    ) {
      throw new Error(`Invalid staged fixture module: ${name}`);
    }
    fixtures.set(entry, realPath);
    for (
      let parent = dirname(path);
      !samePath(parent, applicationRoot);
      parent = dirname(parent)
    ) {
      fixtureScopes.add(relativeUrlPath(applicationRoot, parent));
    }
  }

  const cache = [new Map(), new Map()];
  return (value, scope) => {
    const admitted = cache[Number(scope)];
    if (admitted.has(value)) return admitted.get(value);
    const url = asUrl(value, base);
    let result;
    if (url.protocol !== "file:") {
      result = admitProvider(value, scope);
    } else {
      if (
        !/^(?:file:|\.\.?\/|\/(?!\/))/u.test(value) ||
        /[?#]/u.test(value) ||
        url.pathname.endsWith("/") !== scope
      ) {
        throw new Error(`Invalid local reference map URL: ${value}`);
      }
      const path = fileURLToPath(url);
      const localRoot = withinScope(packageRoot, path, scope)
        ? packageRoot
        : realPackageRoot;
      if (withinScope(localRoot, path, scope)) {
        const realPath = realpathSync(path);
        if (
          withinScope(realPackageRoot, realPath, scope) &&
          (scope
            ? statSync(realPath).isDirectory()
            : statSync(realPath).isFile())
        ) {
          const entry = relativeUrlPath(realPackageRoot, realPath);
          result = {
            url: `${PACKAGE_PREFIX}${entry}${scope && entry ? "/" : ""}`,
          };
        }
      } else if (withinScope(applicationRoot, path, scope)) {
        const entry = relativeUrlPath(applicationRoot, path);
        const realPath = realpathSync(path);
        if (
          scope
            ? fixtureScopes.has(entry) &&
              withinScope(realApplicationRoot, realPath, true)
            : fixtures.has(entry) && samePath(fixtures.get(entry), realPath)
        ) {
          result = { url: `./${entry}${scope && entry ? "/" : ""}` };
        }
      }
      if (!result)
        throw new Error(`Unclassified local reference map URL: ${value}`);
    }
    admitted.set(value, result);
    return result;
  };
};

const reviewedUrlClassifier = (value, scope) => {
  if (typeof value === "string" && value.startsWith("./")) {
    const url = asUrl(value, RUNTIME_BASE);
    const segments = url.pathname === "/" ? [] : pathSegments(url, scope);
    const entry = segments.map(encodeURIComponent).join("/");
    if (
      value === `./${entry}${scope && entry ? "/" : ""}` &&
      (value.startsWith(PACKAGE_PREFIX) || fixtureNamespace(entry)) &&
      (scope || entry)
    ) {
      return { url: value };
    }
    throw new Error(`Unclassified local reference map URL: ${value}`);
  }
  return admitProvider(value, scope);
};

const entries = (object, label) => {
  if (
    object === null ||
    typeof object !== "object" ||
    ![null, Object.prototype].includes(Object.getPrototypeOf(object))
  ) {
    throw new Error(`Invalid reference map ${label}: expected an object`);
  }
  return Object.entries(object);
};

const uniqueEntries = (pairs, label) => {
  const unique = new Map();
  for (const [key, value] of pairs) {
    if (unique.has(key))
      throw new Error(`Reference map ${label} collision: ${key}`);
    unique.set(key, value);
  }
  return Object.fromEntries(unique);
};

const checkCoverage = (required, available, message) => {
  const missing = [...required].filter((url) => !available.has(url));
  if (missing.length) throw new Error(`${message}: ${missing.join(", ")}`);
};

const projectMap = (map, classify, { trace, localIntegrity }) => {
  for (const [key] of entries(map, "root")) {
    if (!["imports", "scopes", "integrity"].includes(key)) {
      throw new Error(`Unknown reference map field: ${key}`);
    }
  }
  const field = (name) => (Object.hasOwn(map, name) ? map[name] : {});
  const targets = new Set();
  const imports = (mappings) =>
    Object.fromEntries(
      entries(mappings, "mappings").map(([key, value]) => {
        if (!key) throw new Error("Empty reference map specifier");
        const target = classify(value, false);
        if (target.provider) targets.add(target.url);
        return [key, target.url];
      }),
    );
  const projected = {
    ...(Object.hasOwn(map, "imports") ? { imports: imports(map.imports) } : {}),
    ...(Object.hasOwn(map, "scopes")
      ? {
          scopes: uniqueEntries(
            entries(map.scopes, "scopes").map(([scope, mappings]) => [
              classify(scope, true).url,
              imports(mappings),
            ]),
            "scope",
          ),
        }
      : {}),
  };
  const pins = new Set();
  const integrity = uniqueEntries(
    entries(field("integrity"), "integrity").map(([value, digest]) => {
      const target = classify(value, false);
      assertSha384Integrity(digest, value);
      if (target.provider) pins.add(target.url);
      else if (localIntegrity === "refuse")
        throw new Error(
          `First-party integrity is outside the reviewed pin scope: ${value}`,
        );
      return [target.url, digest];
    }),
    "integrity",
  );

  if (trace) {
    const traced = new Set();
    for (const name of ["staticDeps", "dynamicDeps"]) {
      if (!Array.isArray(trace[name]))
        throw new Error(`Invalid JSPM ${name} trace`);
      for (const value of trace[name]) {
        const target = classify(value, false);
        if (target.provider) traced.add(target.url);
      }
    }
    checkCoverage(
      traced,
      pins,
      "Traced provider modules without integrity pins",
    );
    checkCoverage(pins, traced, "Untraced provider integrity pins");
  }
  checkCoverage(
    targets,
    pins,
    "Reference provider targets without integrity pins",
  );
  projected.integrity =
    localIntegrity === "discard"
      ? Object.fromEntries([...pins].map((url) => [url, integrity[url]]))
      : integrity;
  return projected;
};

/** Admit all generated URL positions and require the provider trace and pin set to agree. */
export const projectGeneratedReferenceMap = (map, trace, classify) => {
  if (!trace) throw new Error("Missing JSPM dependency trace");
  return projectMap(map, classify, { trace, localIntegrity: "discard" });
};

/** Recheck the canonical URL and pin profile before a reviewed map can supply bytes. */
export const admitReviewedReferenceMap = (map, { legacy = false } = {}) =>
  projectMap(map, reviewedUrlClassifier, {
    localIntegrity: legacy ? "keep" : "refuse",
  });

/** Validate and rewrite only URL positions, before any provider fetch can write a file. */
export const planProviderMirror = (map, runtimeRoot) => {
  const providerRoot = resolve(runtimeRoot, "provider");
  const paths = new Map();
  const files = new Set();
  const directories = new Set();
  const scopes = new Set();
  const translate = (value, scope = false) => {
    if (!value.startsWith(`${PROVIDER_ORIGIN}/`)) return value;
    if (paths.has(value)) return `./${paths.get(value)}`;
    const path = providerLocation(value, scope);
    if (!isStrictDescendantPath(providerRoot, resolve(runtimeRoot, path))) {
      throw new Error(`Provider mirror path escaped its root: ${value}`);
    }
    // The portable mirror must also be unambiguous on case-insensitive volumes.
    const key = path.replace(/\/$/u, "").toLowerCase();
    if (files.has(key) || (scope ? scopes.has(key) : directories.has(key))) {
      throw new Error(`Provider mirror path collision: ${value}`);
    }
    if (scope) scopes.add(key);
    else files.add(key);
    for (
      let parent = scope ? key : key.slice(0, key.lastIndexOf("/"));
      parent;
      parent = parent.slice(0, Math.max(0, parent.lastIndexOf("/")))
    ) {
      if (files.has(parent))
        throw new Error(`Provider mirror path collision: ${value}`);
      directories.add(parent);
    }
    paths.set(value, path);
    return `./${path}`;
  };
  const imports = (mappings) =>
    Object.fromEntries(
      Object.entries(mappings).map(([key, value]) => [key, translate(value)]),
    );
  const localMap = {
    ...(map.imports ? { imports: imports(map.imports) } : {}),
    ...(map.scopes
      ? {
          scopes: Object.fromEntries(
            Object.entries(map.scopes).map(([scope, mappings]) => [
              translate(scope, true),
              imports(mappings),
            ]),
          ),
        }
      : {}),
    integrity: Object.fromEntries(
      Object.entries(map.integrity).map(([value, digest]) => [
        translate(value),
        digest,
      ]),
    ),
  };
  const modules = Object.entries(map.integrity)
    .filter(([url]) => url.startsWith(`${PROVIDER_ORIGIN}/`))
    .map(([url, integrity]) => ({ url, integrity, localPath: paths.get(url) }));
  return { localMap, modules };
};
