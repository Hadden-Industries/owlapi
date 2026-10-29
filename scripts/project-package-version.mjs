import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { format } from "prettier";
import semver from "semver";
import { PACKAGE_NAME, releaseChannel } from "./package-identity.mjs";
import { projectReleaseEvidenceSchema } from "./release-version-schema.mjs";
import {
  renderApiView,
  renderCompatibilityView,
} from "../util/generate-java-api-surface.mjs";

const root = new URL("../", import.meta.url);
export const VERSION_PROJECTION_PATHS = Object.freeze([
  "package-lock.json",
  "docs/compatibility/capabilities.json",
  "docs/compatibility/dependency-seams.json",
  "docs/compatibility/java-api-surface.json",
  "API.md",
  "docs/compatibility/java-api-surface.md",
  "docs/release/publication-control.json",
  "docs/release/publication-control.schema.json",
  "docs/release/availability-policy.json",
  "docs/release/release-evidence.schema.json",
]);

/** Pure projection of current declarations, never evidence, approvals or first-release targets.
 * Computes every output before the CLI writes any file. No installation or network work.
 */
export async function projectPackageVersion(files, manifest) {
  assert.equal(manifest.name, PACKAGE_NAME, "Unexpected package name");
  assert.equal(typeof manifest.version, "string", "Missing package version");
  assert.equal(
    semver.valid(manifest.version),
    manifest.version,
    "Invalid package version",
  );
  const version = manifest.version;
  const coordinate = `${PACKAGE_NAME}@${version}`;
  const channel = releaseChannel(version);
  assert.equal(
    manifest.publishConfig.tag,
    channel,
    "Select publishConfig.tag for this release channel before synchronization",
  );
  const output = { ...files };
  const read = (path) => JSON.parse(files[path]);
  const put = async (path, value) => {
    output[path] = await format(JSON.stringify(value), {
      parser: "json-stringify",
      endOfLine: "lf",
    });
  };

  const lock = read("package-lock.json");
  assert.equal(lock.name, PACKAGE_NAME);
  assert.equal(lock.packages[""].name, PACKAGE_NAME);
  lock.version = version;
  lock.packages[""].version = version;
  await put("package-lock.json", lock);
  for (const [path, key] of [
    ["docs/compatibility/capabilities.json", "release"],
    ["docs/compatibility/dependency-seams.json", "packageVersion"],
  ]) {
    const record = read(path);
    record[key] = version;
    await put(path, record);
  }

  // Re-render the existing registry's version and digest only. Rebuilding its Java
  // inventory remains the separate source generator's responsibility.
  const registryPath = "docs/compatibility/java-api-surface.json";
  const registry = read(registryPath);
  assert.equal(registry.packageName, PACKAGE_NAME);
  registry.packageVersion = version;
  await put(registryPath, registry);
  const digest = createHash("sha256")
    .update(output[registryPath])
    .digest("hex");
  for (const [path, render] of [
    ["API.md", renderApiView],
    ["docs/compatibility/java-api-surface.md", renderCompatibilityView],
  ])
    output[path] = await format(render(registry, digest), {
      parser: "markdown",
      endOfLine: "lf",
    });

  const publicationPath = "docs/release/publication-control.json";
  const publication = read(publicationPath);
  if (
    publication.coordinate !== coordinate ||
    publication.channel !== channel
  ) {
    Object.assign(publication, {
      coordinate,
      channel,
      enabled: false,
      mode: "UNRESOLVED",
      reconciliation: null,
      reviewedOn: null,
      reason:
        "Candidate identity projected from package.json. Previous version-specific decisions do not authorize this candidate, publication or channel changes; obtain a new decision before enabling publication.",
    });
  }
  await put(publicationPath, publication);

  const publicationSchemaPath = "docs/release/publication-control.schema.json";
  const publicationSchema = read(publicationSchemaPath);
  // The alpha and rc.1 bootstrap exceptions remain closed historical identities.
  const oidc = publicationSchema.allOf.find((branch) =>
    branch.then.oneOf?.some(
      (choice) => choice.properties.mode.const === "DIRECT_OIDC",
    ),
  );
  assert.ok(oidc, "Missing OIDC publication schema");
  if (!publicationSchema.properties.coordinate.enum.includes(coordinate)) {
    publicationSchema.properties.coordinate.enum.push(coordinate);
    oidc.if.properties.coordinate.enum.push(coordinate);
  }
  publicationSchema.properties.channel = { enum: ["next", "latest"] };
  publicationSchema.allOf = publicationSchema.allOf.filter(
    (branch) => branch.$comment !== "Generated SemVer channel projection",
  );
  for (const projectedChannel of ["next", "latest"]) {
    const coordinates = publicationSchema.properties.coordinate.enum.filter(
      (value) =>
        releaseChannel(value.slice(value.lastIndexOf("@") + 1)) ===
        projectedChannel,
    );
    if (coordinates.length)
      publicationSchema.allOf.push({
        $comment: "Generated SemVer channel projection",
        if: {
          type: "object",
          properties: { coordinate: { enum: coordinates } },
        },
        then: {
          type: "object",
          properties: { channel: { const: projectedChannel } },
        },
      });
  }
  await put(publicationSchemaPath, publicationSchema);

  const availabilityPath = "docs/release/availability-policy.json";
  const availability = read(availabilityPath);
  availability.coordinate = coordinate;
  // previousVersion is an independently accepted published predecessor, not a projection.
  await put(availabilityPath, availability);
  const evidencePath = "docs/release/release-evidence.schema.json";
  await put(
    evidencePath,
    projectReleaseEvidenceSchema(read(evidencePath), version),
  );
  return output;
}

export async function synchronizePackageVersion({ write = false } = {}) {
  const manifest = JSON.parse(
    readFileSync(new URL("package.json", root), "utf8"),
  );
  const files = Object.fromEntries(
    VERSION_PROJECTION_PATHS.map((path) => [
      path,
      readFileSync(new URL(path, root), "utf8").replace(/\r\n/gu, "\n"),
    ]),
  );
  const output = await projectPackageVersion(files, manifest);
  const changed = VERSION_PROJECTION_PATHS.filter(
    (path) => output[path] !== files[path],
  );
  if (write)
    for (const path of changed)
      writeFileSync(new URL(path, root), output[path]);
  return changed;
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  assert.equal(process.argv.length, 3, "Use --check or --write");
  const mode = process.argv[2];
  assert.ok(["--check", "--write"].includes(mode), "Use --check or --write");
  const changed = await synchronizePackageVersion({
    write: mode === "--write",
  });
  process.stdout.write(`${JSON.stringify({ mode, changed })}\n`);
  if (mode === "--check" && changed.length) process.exitCode = 1;
}
