import { readFileSync } from "node:fs";
import { npmSemver as semver } from "./npm-semver.mjs";

/** Closed package name; the checked-out manifest selects the current candidate. */
export const PACKAGE_NAME = "@hadden-industries/owlapi";
const manifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
if (
  manifest.name !== PACKAGE_NAME ||
  typeof manifest.version !== "string" ||
  semver.valid(manifest.version) !== manifest.version
)
  throw new Error("The repository manifest has an invalid package identity.");
export const PACKAGE_VERSION = manifest.version;
/** Primary publish channel; additional tag approvals are separate release decisions. */
export const releaseChannel = (version = PACKAGE_VERSION) =>
  semver.prerelease(version) ? "next" : "latest";
export const PACKAGE_PURL = `pkg:npm/%40hadden-industries/owlapi@${PACKAGE_VERSION}`;
// The pinned CycloneDX generator retains the canonical package repository qualifier.
export const PACKAGE_SBOM_PURL = `${PACKAGE_PURL}?vcs_url=${encodeURIComponent("git+https://github.com/Hadden-Industries/owlapi.git")}`;
export const PACKAGE_FILE_STEM = "hadden-industries-owlapi";
export const NPM_REGISTRY = "https://registry.npmjs.org/";
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
