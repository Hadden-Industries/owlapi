import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { JsonStrictValidator } from "@cyclonedx/cyclonedx-library/Validation";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Add actual embedded executable material to the npm dependency SBOM. The
 * provider manifest owns component scope; CycloneDX owns document validation.
 * Original npm dependencies remain separate occurrences, even at equal versions.
 */
export async function addEmbeddedJsonLdComponents(document, repositoryRoot) {
  const directory = "internal/parsing/jsonld/provider";
  const manifestBytes = readFileSync(
    resolve(repositoryRoot, directory, "build-manifest.json"),
  );
  const manifest = JSON.parse(manifestBytes);
  const fileName = `${directory}/${manifest.output.path}`;
  const output = readFileSync(resolve(repositoryRoot, fileName));
  if (
    sha256(output) !== manifest.output.sha256 ||
    output.length !== manifest.output.byteLength
  )
    throw new Error("Embedded provider output differs from its build manifest");
  const providerReference = `owlapi:embedded-jsonld:sha256:${manifest.output.sha256}`;
  const components = manifest.bundledPackages.map(
    ({ name, version, license, role, notices }) => {
      for (const notice of notices) {
        const bytes = readFileSync(
          resolve(repositoryRoot, directory, notice.path),
        );
        if (
          sha256(bytes) !== notice.sha256 ||
          bytes.length !== notice.byteLength
        )
          throw new Error(`Embedded provider notice differs: ${name}`);
      }
      return {
        type: "library",
        name,
        version,
        "bom-ref": `${providerReference}:${name}@${version}`,
        purl: `pkg:npm/${name}@${version}`,
        licenses: [{ license: { id: license } }],
        properties: [{ name: "owlapi:embedded-provider-role", value: role }],
        ...(name === manifest.upstream.name
          ? {
              modified: true,
              pedigree: {
                patches: manifest.sourceChanges.map((change) => ({
                  type: "unofficial",
                  diff: {
                    text: {
                      contentType: "application/json",
                      content: JSON.stringify(change),
                    },
                  },
                })),
              },
            }
          : {}),
      };
    },
  );
  const provider = {
    type: "file",
    name: fileName,
    "bom-ref": providerReference,
    hashes: [{ alg: "SHA-256", content: manifest.output.sha256 }],
    properties: [
      {
        name: "owlapi:embedded-provider-manifest-sha256",
        value: sha256(manifestBytes),
      },
    ],
    components,
  };
  const result = structuredClone(document);
  const rootReference = result.metadata?.component?.["bom-ref"];
  if (!rootReference)
    throw new Error("The npm SBOM has no root component reference");
  result.components ??= [];
  const existing = result.components.find(({ name }) => name === fileName);
  if (existing && JSON.stringify(existing) !== JSON.stringify(provider))
    throw new Error("The SBOM already describes a different embedded provider");
  if (!existing) {
    result.components.push(provider);
    result.dependencies ??= [];
    let rootDependency = result.dependencies.find(
      ({ ref }) => ref === rootReference,
    );
    if (!rootDependency) {
      rootDependency = { ref: rootReference, dependsOn: [] };
      result.dependencies.push(rootDependency);
    }
    rootDependency.dependsOn ??= [];
    rootDependency.dependsOn.push(providerReference);
    result.dependencies.push({
      ref: providerReference,
      dependsOn: components.map((component) => component["bom-ref"]),
    });
    // The build manifest identifies incorporation, not complete intra-bundle
    // dependency edges. Omit those entries rather than asserting false leaves.
  }
  const errors = await new JsonStrictValidator("1.6").validate(
    JSON.stringify(result),
  );
  if (errors)
    throw new Error(
      `Embedded-provider CycloneDX validation failed: ${JSON.stringify(errors)}`,
    );
  return result;
}
