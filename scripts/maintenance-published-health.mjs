import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { PACKAGE_NAME, NPM_REGISTRY } from "./package-identity.mjs";
import { readPublicRegistry } from "./public-registry-read.mjs";
import { createRepositoryReader } from "./github-evidence-reader.mjs";
import { npmSemver } from "./npm-semver.mjs";

export function maintenanceTarget(designation, observed) {
  assert.equal(designation.schemaVersion, 1);
  for (const tag of ["pilot", "latest", "next"])
    assert.equal(
      observed[tag] ?? null,
      designation.tags[tag],
      "Unexpected public " + tag,
    );
  const version = designation.stable ?? designation.supportedRc;
  if (version === null)
    return { action: "NOT_APPLICABLE", reason: "NO_SUPPORTED_RELEASE" };
  assert.equal(npmSemver.valid(version), version);
  if (designation.stable !== null)
    assert.equal(npmSemver.prerelease(version), null);
  else assert.equal(designation.tags.next, version);
  return {
    action: "QUERY",
    coordinate: PACKAGE_NAME + "@" + version,
    version,
    releaseId: designation.releaseId,
  };
}
async function main() {
  const designation = JSON.parse(
    readFileSync(
      new URL("../docs/release/support-designation.json", import.meta.url),
    ),
  );
  const tags = JSON.parse(
    await readPublicRegistry(
      new URL(
        "-/package/" + encodeURIComponent(PACKAGE_NAME) + "/dist-tags",
        NPM_REGISTRY,
      ),
    ),
  );
  const target = maintenanceTarget(designation, tags);
  if (target.action === "QUERY") {
    const read = createRepositoryReader({
      repository: "Hadden-Industries/owlapi",
      token: process.env.GH_TOKEN,
    });
    const release = await read("/releases/" + designation.releaseId);
    assert.equal(release.immutable, true);
    assert.equal(release.tag_name, "v" + target.version);
    const ref = await read("/git/ref/tags/" + release.tag_name);
    assert.equal(ref.object.sha, designation.tagObject);
    assert.equal(
      (await read("/git/tags/" + ref.object.sha)).object.sha,
      designation.source,
    );
    assert.ok(
      release.assets.some(
        (a) =>
          a.name === "hadden-industries-owlapi-" + target.version + ".tgz" &&
          a.digest === "sha256:" + designation.tarballSha256,
      ),
    );
    const metadata = JSON.parse(
      await readPublicRegistry(
        new URL(
          encodeURIComponent(PACKAGE_NAME) + "/" + target.version,
          NPM_REGISTRY,
        ),
      ),
    );
    assert.equal(metadata.name, PACKAGE_NAME);
    assert.equal(metadata.version, target.version);
  }
  process.stdout.write(JSON.stringify({ ...target, tags }, null, 2) + "\n");
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  await main();
