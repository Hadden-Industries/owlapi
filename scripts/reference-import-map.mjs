import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { Generator } from "@jspm/generator";
import {
  assertPackageIdentity,
  NODE_ONLY_PUBLIC_SUBPATHS,
} from "./package-identity.mjs";
import {
  admitReviewedReferenceMap,
  generatedUrlClassifier,
  planProviderMirror,
  projectGeneratedReferenceMap,
} from "./reference-import-map-admission.mjs";

export { toLocalProviderPath } from "./reference-import-map-admission.mjs";

const repositoryManifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const compareCodeUnits = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;
const toPublicSpecifier = (packageName, exportKey) => {
  if (exportKey === ".") {
    return packageName;
  }
  if (!exportKey.startsWith("./") || exportKey.includes("*")) {
    throw new Error(`Unsupported public package export key ${exportKey}`);
  }
  return `${packageName}/${exportKey.slice(2)}`;
};

/** The application owns these import-map aliases; the installed manifest owns package identity. */
export const BROWSER_CONSUMER_SPECIFIERS = Object.freeze(
  Object.keys(repositoryManifest.exports)
    .filter(
      (exportKey) => !NODE_ONLY_PUBLIC_SUBPATHS.includes(exportKey.slice(1)),
    )
    .map((exportKey) => toPublicSpecifier("owlapi", exportKey))
    .sort(compareCodeUnits),
);
const ENVIRONMENT_CONDITIONS = Object.freeze([
  "production",
  "browser",
  "module",
]);
const XML_DOM_PACKAGE = "@xmldom/xmldom";
const XML_ADAPTER_URL_SUFFIX = "/internal/parsing/xml/xmlParserAdapter.js";
const XML_LITERAL_VALIDATOR_URL_SUFFIX =
  "/internal/storage/rdfxml/xmlLiteralValidation.js";
const RDF_XML_FORMAT_URL_SUFFIX = "/formats/rdfXMLDocumentFormat.js";
const JSON_LD_SPECIFIER = "jsonld";
const jsonLdVersion = repositoryManifest.dependencies?.[JSON_LD_SPECIFIER];
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(jsonLdVersion ?? "")) {
  throw new Error(
    "Reference import-map generation requires an exact jsonld dependency version",
  );
}

export const excludeNodeXmlParserFallback = (specifier, parentUrl) => {
  if (specifier !== XML_DOM_PACKAGE) return false;
  // Parse documents with the native DOMParser where available. Literal and
  // prefix validation must retain their package provider in browser workers.
  if (parentUrl.endsWith(XML_ADAPTER_URL_SUFFIX)) return true;
  if (
    parentUrl.endsWith(XML_LITERAL_VALIDATOR_URL_SUFFIX) ||
    parentUrl.endsWith(RDF_XML_FORMAT_URL_SUFFIX)
  )
    return false;
  throw new Error(
    `${XML_DOM_PACKAGE} appeared outside an approved XML parser or serializer seam: ${parentUrl}`,
  );
};

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

  // Every host consumes the same maintained, package-local provider build.
  // Resolving stock jsonld here would silently restore its incompatible limit.
  throw new Error(
    "OwlAPI browser consumers must use the package-local JSON-LD provider",
  );
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

/** Trace the staged package and fixture and return their provider-only reference map. */
export const generateReferenceImportMap = async ({
  applicationPath,
  packageRoot,
  fixtureModules,
  createGenerator = (options) => new Generator(options),
}) => {
  const application = resolve(applicationPath);
  const resolvedPackageRoot = resolve(packageRoot);
  assertPackageIdentity(
    JSON.parse(
      readFileSync(resolve(resolvedPackageRoot, "package.json"), "utf8"),
    ),
  );
  const packageUrl = withTrailingSlash(pathToFileURL(resolvedPackageRoot).href);
  const classify = generatedUrlClassifier({
    applicationPath: application,
    packageRoot: resolvedPackageRoot,
    fixtureModules,
  });
  const mapUrl = pathToFileURL(application);
  const generator = createGenerator({
    baseUrl: pathToFileURL(`${dirname(application)}${sep}`),
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
    ignore: excludeNodeXmlParserFallback,
    mapUrl,
    resolutions: { owlapi: packageUrl },
  });

  const trace = await generator.link(mapUrl.href);
  const map = projectGeneratedReferenceMap(generator.getMap(), trace, classify);
  for (const specifier of BROWSER_CONSUMER_SPECIFIERS) {
    if (!map.imports?.[specifier]) {
      throw new Error(`Generated reference map omits ${specifier}`);
    }
  }
  return stableObject(map);
};

/** Mirror complete, admitted provider responses and preserve their expected SRI tokens. */
export const hydrateReferenceImportMap = async ({
  map,
  mirrorRoot,
  fetchImplementation = globalThis.fetch,
  mkdirImplementation = mkdirSync,
  writeImplementation = writeFileSync,
}) => {
  const resolvedMirrorRoot = resolve(mirrorRoot);
  const { localMap, modules } = planProviderMirror(
    admitReviewedReferenceMap(map),
    resolvedMirrorRoot,
  );
  const inventory = [];
  for (const { url: providerUrl, integrity, localPath } of modules) {
    const outputPath = resolve(resolvedMirrorRoot, localPath);
    let response;
    try {
      response = await fetchImplementation(providerUrl, {
        headers: {
          Accept: "application/javascript, text/javascript;q=0.9, */*;q=0.1",
        },
        redirect: "error",
      });
    } catch (cause) {
      throw new Error(
        `Reference provider request failed or refused a redirect for ${providerUrl}`,
        { cause },
      );
    }
    if (
      response.status !== 200 ||
      response.redirected !== false ||
      response.url !== providerUrl
    ) {
      throw new Error(
        `Reference provider fetch failed or redirected for ${providerUrl}: ${response.status} ${response.url}`,
      );
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    try {
      verifySubresourceIntegrity(bytes, integrity);
    } catch (cause) {
      const observed = `sha384-${createHash("sha384").update(bytes).digest("base64")}`;
      throw new Error(
        `Reference provider bytes do not match for ${providerUrl}. Expected ${integrity}, observed ${observed}`,
        { cause },
      );
    }
    mkdirImplementation(dirname(outputPath), { recursive: true });
    writeImplementation(outputPath, bytes);
    inventory.push({
      bytes: bytes.byteLength,
      integrity,
      localPath,
      providerUrl,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }

  return {
    inventory: inventory.sort((left, right) =>
      compareCodeUnits(left.providerUrl, right.providerUrl),
    ),
    localMap: stableObject(localMap),
  };
};

export const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
export const writeJson = (path, value) =>
  writeFileSync(path, stableJson(value), "utf8");
