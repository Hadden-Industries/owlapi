import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { Generator } from "@jspm/generator";

const PUBLIC_SPECIFIERS = Object.freeze([
  "owlapi",
  "owlapi/apibinding",
  "owlapi/formats",
  "owlapi/io",
  "owlapi/model",
]);
const ENVIRONMENT_CONDITIONS = Object.freeze([
  "production",
  "browser",
  "module",
]);
const NODE_XML_FALLBACK = "@xmldom/xmldom";
const XML_ADAPTER_URL_SUFFIX = "/internal/parsing/xml/xmlParserAdapter.js";
const JSON_LD_SPECIFIER = "jsonld";
const JSPM_PROVIDER_BASE_URL = "https://ga.jspm.io/";
const repositoryManifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const jsonLdVersion = repositoryManifest.dependencies?.[JSON_LD_SPECIFIER];
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(jsonLdVersion ?? "")) {
  throw new Error(
    "Reference import-map generation requires an exact jsonld dependency version",
  );
}
const JSON_LD_BROWSER_BUNDLE_URL = new URL(
  `./npm:jsonld@${jsonLdVersion}/dist/jsonld.js`,
  JSPM_PROVIDER_BASE_URL,
).href;

const compareCodeUnits = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

const stableObject = (value) => {
  if (Array.isArray(value)) {
    return value.map(stableObject);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([key, entry]) => [key, stableObject(entry)]),
  );
};

export const stableJson = (value) =>
  `${JSON.stringify(stableObject(value), null, 2)}\n`;

const withTrailingSlash = (url) => (url.endsWith("/") ? url : `${url}/`);

export const resolveReferenceBrowserDependency = ({
  packageUrl,
  parentUrl,
  specifier,
}) => {
  if (
    specifier !== JSON_LD_SPECIFIER ||
    !parentUrl.startsWith(withTrailingSlash(packageUrl))
  ) {
    return undefined;
  }

  // jsonld publishes this bundle specifically for browser consumers. Asking
  // JSPM to convert that supported subpath keeps the native import-map graph
  // standards-based while avoiding the split CommonJS conversion graph whose
  // export-initialization order fails in the pre-Safari-27 WebKit ESM loader.
  // Node and bundler consumers continue to resolve jsonld's ordinary entry.
  return JSON_LD_BROWSER_BUNDLE_URL;
};

export const toLocalProviderPath = (providerUrl) => {
  const url = new URL(providerUrl);
  if (url.protocol !== "https:") {
    throw new Error(`Reference provider URL must use HTTPS: ${providerUrl}`);
  }
  if (url.username || url.password || url.hash) {
    throw new Error(
      `Reference provider URL has unsupported URL data: ${providerUrl}`,
    );
  }
  const querySuffix = url.search
    ? `.__query-${createHash("sha256").update(url.search).digest("hex")}`
    : "";
  const path = url.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(decodeURIComponent(segment)))
    .join("/");
  return `provider/${url.hostname}/${path || "index.js"}${querySuffix}`;
};

const toLocalProviderScope = (providerUrl) => {
  const url = new URL(providerUrl);
  if (url.protocol !== "https:" || !providerUrl.endsWith("/")) {
    throw new Error(
      `Reference provider scope is not an HTTPS base: ${providerUrl}`,
    );
  }
  const path = url.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(decodeURIComponent(segment)))
    .join("/");
  return `./provider/${url.hostname}/${path ? `${path}/` : ""}`;
};

export const verifySubresourceIntegrity = (bytes, integrity) => {
  const entries = integrity.trim().split(/\s+/u);
  if (entries.length === 0 || entries.includes("")) {
    throw new Error("Subresource integrity metadata is empty");
  }
  for (const entry of entries) {
    const separator = entry.indexOf("-");
    const algorithm = entry.slice(0, separator);
    const expected = entry.slice(separator + 1);
    if (!new Set(["sha256", "sha384", "sha512"]).has(algorithm) || !expected) {
      throw new Error(`Unsupported subresource integrity token ${entry}`);
    }
    const observed = createHash(algorithm).update(bytes).digest("base64");
    if (observed === expected) {
      return;
    }
  }
  throw new Error(
    "Provider bytes do not match their generated integrity metadata",
  );
};

const normalizeLocalPackageUrl = (url, packageUrl) => {
  if (typeof url !== "string") {
    return url;
  }
  const relativeNodeModulesPrefix = "./node_modules/owlapi/";
  if (url.startsWith(relativeNodeModulesPrefix)) {
    return `./package/owlapi/${url.slice(relativeNodeModulesPrefix.length)}`;
  }
  if (url.startsWith(packageUrl)) {
    return `./package/owlapi/${url.slice(packageUrl.length)}`;
  }
  return url;
};

const normalizeGeneratedMap = (map, packageUrl) => ({
  ...(map.imports
    ? {
        imports: Object.fromEntries(
          Object.entries(map.imports).map(([key, value]) => [
            key,
            normalizeLocalPackageUrl(value, packageUrl),
          ]),
        ),
      }
    : {}),
  ...(map.scopes
    ? {
        scopes: Object.fromEntries(
          Object.entries(map.scopes).map(([scope, mappings]) => [
            normalizeLocalPackageUrl(scope, packageUrl),
            Object.fromEntries(
              Object.entries(mappings).map(([key, value]) => [
                key,
                normalizeLocalPackageUrl(value, packageUrl),
              ]),
            ),
          ]),
        ),
      }
    : {}),
  ...(map.integrity
    ? {
        integrity: Object.fromEntries(
          Object.entries(map.integrity).map(([url, integrity]) => [
            normalizeLocalPackageUrl(url, packageUrl),
            integrity,
          ]),
        ),
      }
    : {}),
});

export const generateReferenceImportMap = async ({
  applicationPath,
  packageRoot,
}) => {
  const resolvedPackageRoot = resolve(packageRoot);
  const packageUrl = withTrailingSlash(pathToFileURL(resolvedPackageRoot).href);
  const generator = new Generator({
    baseUrl: pathToFileURL(`${dirname(resolve(applicationPath))}${sep}`),
    cache: false,
    customResolver(specifier, parentUrl) {
      return resolveReferenceBrowserDependency({
        packageUrl,
        parentUrl,
        specifier,
      });
    },
    defaultProvider: "jspm.io",
    // Generator appends its always-supported `import` condition in place, so
    // give the tool a fresh array while keeping our canonical inputs immutable.
    env: [...ENVIRONMENT_CONDITIONS],
    fetchRetries: 2,
    integrity: true,
    ignore(specifier, parentUrl) {
      if (specifier !== NODE_XML_FALLBACK) {
        return false;
      }
      if (!parentUrl.endsWith(XML_ADAPTER_URL_SUFFIX)) {
        throw new Error(
          `${NODE_XML_FALLBACK} appeared outside the approved XML adapter seam: ${parentUrl}`,
        );
      }
      // Native document environments must use their DOMParser and never fetch
      // the declared Node fallback. The bundled worker is qualified separately.
      return true;
    },
    mapUrl: pathToFileURL(resolve(applicationPath)),
    resolutions: { owlapi: packageUrl },
  });

  await generator.link(pathToFileURL(resolve(applicationPath)).href);
  const map = normalizeGeneratedMap(generator.getMap(), packageUrl);

  for (const specifier of PUBLIC_SPECIFIERS) {
    if (!map.imports?.[specifier]) {
      throw new Error(`Generated reference map omits ${specifier}`);
    }
  }
  for (const [url, integrity] of Object.entries(map.integrity ?? {})) {
    if (!integrity || (!url.startsWith("https://") && !url.startsWith("./"))) {
      throw new Error(
        `Generated reference map has invalid integrity for ${url}`,
      );
    }
  }
  return stableObject(map);
};

const rewriteMapUrls = (value, replacements) => {
  if (typeof value === "string") {
    return replacements.get(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => rewriteMapUrls(entry, replacements));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      replacements.get(key) ?? key,
      rewriteMapUrls(entry, replacements),
    ]),
  );
};

export const hydrateReferenceImportMap = async ({
  map,
  mirrorRoot,
  fetchImplementation = globalThis.fetch,
  mkdirImplementation = mkdirSync,
  writeImplementation = writeFileSync,
}) => {
  const resolvedMirrorRoot = resolve(mirrorRoot);
  const replacements = new Map();
  const inventory = [];
  const providerEntries = Object.entries(map.integrity ?? {}).filter(([url]) =>
    url.startsWith("https://"),
  );

  for (const scopeUrl of Object.keys(map.scopes ?? {})) {
    if (!scopeUrl.startsWith("https://")) {
      continue;
    }
    replacements.set(scopeUrl, toLocalProviderScope(scopeUrl));
  }

  for (const [providerUrl, integrity] of providerEntries) {
    const localPath = toLocalProviderPath(providerUrl);
    const outputPath = resolve(resolvedMirrorRoot, localPath);
    const outputRelativePath = relative(resolvedMirrorRoot, outputPath);
    if (
      outputRelativePath === "" ||
      outputRelativePath === ".." ||
      outputRelativePath.startsWith(`..${sep}`)
    ) {
      throw new Error(`Provider mirror path escaped its root: ${providerUrl}`);
    }

    const response = await fetchImplementation(providerUrl, {
      headers: {
        Accept: "application/javascript, text/javascript;q=0.9, */*;q=0.1",
      },
      redirect: "follow",
    });
    if (!response.ok || response.url !== providerUrl) {
      throw new Error(
        `Reference provider fetch failed or redirected for ${providerUrl}: ${response.status} ${response.url}`,
      );
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    verifySubresourceIntegrity(bytes, integrity);
    mkdirImplementation(dirname(outputPath), { recursive: true });
    writeImplementation(outputPath, bytes);
    const browserPath = `./${localPath.replaceAll("\\", "/")}`;
    replacements.set(providerUrl, browserPath);
    inventory.push({
      bytes: bytes.byteLength,
      integrity,
      localPath: localPath.replaceAll("\\", "/"),
      providerUrl,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }

  const referencedProviderUrls = new Set();
  const collectUrls = (value) => {
    if (typeof value === "string" && value.startsWith("https://")) {
      referencedProviderUrls.add(value);
    } else if (value && typeof value === "object") {
      for (const [key, entry] of Object.entries(value)) {
        if (key.startsWith("https://")) {
          referencedProviderUrls.add(key);
        }
        collectUrls(entry);
      }
    }
  };
  collectUrls(map);
  for (const url of referencedProviderUrls) {
    if (!replacements.has(url)) {
      throw new Error(
        `Reference provider URL lacks hydrated integrity evidence: ${url}`,
      );
    }
  }

  return {
    inventory: inventory.sort((left, right) =>
      compareCodeUnits(left.providerUrl, right.providerUrl),
    ),
    localMap: stableObject(rewriteMapUrls(map, replacements)),
  };
};

export const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
export const writeJson = (path, value) =>
  writeFileSync(path, stableJson(value), "utf8");
