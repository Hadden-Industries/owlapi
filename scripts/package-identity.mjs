import { readFileSync } from "node:fs";
import { npmSemver as semver } from "./npm-semver.mjs";
import {
  NPM_REGISTRY,
  PACKAGE_NAME,
  REPOSITORY_NPM_URL,
  packagePurl,
  packageSbomPurl,
} from "./release-identity.mjs";

export {
  NPM_REGISTRY,
  PACKAGE_FILE_STEM,
  PACKAGE_NAME,
} from "./release-identity.mjs";

// The checked-out manifest selects the current candidate version.
const manifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
if (
  manifest.name !== PACKAGE_NAME ||
  manifest.repository?.url !== REPOSITORY_NPM_URL ||
  typeof manifest.version !== "string" ||
  semver.valid(manifest.version) !== manifest.version
)
  throw new Error("The repository manifest has an invalid package identity.");
export const PACKAGE_VERSION = manifest.version;
/** Published historical packages keep their original packed tag. New tarballs default to pilot. */
export const releaseChannel = (version = PACKAGE_VERSION) =>
  ["0.1.0-alpha.0", "0.1.0-rc.1", "0.1.0-rc.2", "0.1.0-rc.3"].includes(version)
    ? "next"
    : "pilot";
export const PACKAGE_PURL = packagePurl(PACKAGE_VERSION);
export const PACKAGE_SBOM_PURL = packageSbomPurl(PACKAGE_VERSION);
export const PUBLIC_SUBPATHS = Object.freeze([
  "",
  "/apibinding",
  "/model",
  "/io",
  "/io/node",
  "/formats",
  "/profiles",
  "/util",
  "/model/parameters",
  "/search",
  "/manchestersyntax/renderer",
  "/modularity/locality",
]);
/** Approved host-specific entry points; these must never enter a browser graph. */
export const NODE_ONLY_PUBLIC_SUBPATHS = Object.freeze(["/io/node"]);

/** Refuse a different package/version before using any candidate-supplied location. */
export const assertPackageIdentity = (manifest, version = PACKAGE_VERSION) => {
  if (manifest?.name !== PACKAGE_NAME || manifest.version !== version) {
    throw new Error("The candidate has an unexpected package coordinate.");
  }
};

/** Registry metadata is authoritative for the leaf filename, within this package's path. */
export const assertRegistryTarballUrl = (value) => {
  const url = new URL(value);
  if (
    url.origin !== new URL(NPM_REGISTRY).origin ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.startsWith(`/${PACKAGE_NAME}/-/`) ||
    !/^owlapi-[A-Za-z0-9.+-]+\.tgz$/u.test(url.pathname.split("/").at(-1)) ||
    url.pathname.split("/").length !== 5
  ) {
    throw new Error("Registry tarball URL is outside the scoped package.");
  }
  return url.href;
};
