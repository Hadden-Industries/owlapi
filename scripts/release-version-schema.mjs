import assert from "node:assert/strict";
import semver from "semver";
import {
  PACKAGE_NAME,
  PACKAGE_FILE_STEM,
  releaseChannel,
} from "./package-identity.mjs";

const object = (properties) => ({ type: "object", properties });
const constant = (value) => ({ const: value });

/** Exact identity constraints layered over the shared schema-5 structure.
 * Stored older identities remain readable; none grants publication authority.
 */
export function releaseVersionConstraints(version) {
  assert.equal(typeof version, "string", "Missing release version");
  assert.equal(semver.valid(version), version, "Invalid release version");
  const coordinate = `${PACKAGE_NAME}@${version}`;
  const tarball = `${PACKAGE_FILE_STEM}-${version}.tgz`;
  const sbom = `${PACKAGE_FILE_STEM}-${version}.cdx.json`;
  const channel = releaseChannel(version);
  return object({
    package: object({
      version: constant(version),
      coordinate: constant(coordinate),
      channel: constant(channel),
    }),
    source: object({
      ref: constant(`refs/tags/v${version}`),
      tag: constant(`v${version}`),
    }),
    candidate: object({
      tarball: object({ name: constant(tarball) }),
      sbom: object({ name: constant(sbom) }),
    }),
    publication: object({
      coordinate: constant(coordinate),
      channel: constant(channel),
      tarballUrl: constant(
        `https://registry.npmjs.org/${PACKAGE_NAME}/-/owlapi-${version}.tgz`,
      ),
      next: constant(version),
      latest: constant(version),
    }),
    githubRelease: object({
      assets: {
        type: "array",
        allOf: [tarball, sbom].map((name) => ({
          contains: { ...object({ name: constant(name) }), required: ["name"] },
        })),
      },
    }),
  });
}

/** Regenerate closed version projections, retaining previously recorded identities. */
export function projectReleaseEvidenceSchema(schema, version) {
  const projected = structuredClone(schema);
  const alternatives = projected.oneOf.find(
    (branch) => branch.allOf?.[0]?.$ref === "#/$defs/scopedRelease",
  )?.allOf[1].oneOf;
  assert.ok(
    Array.isArray(alternatives),
    "Missing shared scoped release schema",
  );
  const versions = [
    ...new Set([
      ...alternatives.map(
        (branch) => branch.properties.package.properties.version.const,
      ),
      version,
    ]),
  ];
  alternatives.splice(
    0,
    alternatives.length,
    ...versions.map(releaseVersionConstraints),
  );
  return projected;
}
