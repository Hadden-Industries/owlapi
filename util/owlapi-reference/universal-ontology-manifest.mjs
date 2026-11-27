import assert from "node:assert/strict";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const universalOntologyManifestFile = "universal-ontology.json";
const manifestUrl = new URL(universalOntologyManifestFile, import.meta.url);

export function readUniversalOntologyManifest(file = manifestUrl) {
  const {
    version,
    revision,
    ontologyBase,
    roots,
    external,
    allowedSourceDiagnostics,
  } = JSON.parse(readFileSync(file, "utf8"));
  assert.ok(
    typeof version === "string" && /^\d{8}$/u.test(version),
    "Expected a Universal Ontology version in YYYYMMDD form",
  );
  assert.ok(
    /^[a-f0-9]{40}$/u.test(revision),
    "Expected an exact Universal Ontology Git revision",
  );
  const rootEntries = Object.entries(roots);
  assert.ok(
    rootEntries.length,
    "Expected at least one Universal Ontology root",
  );
  const documents = new Map(
    rootEntries.map(([name, { path, byteLength, sha256 }]) => {
      const ontologyIRI = `${ontologyBase}${path}/`;
      const versionIRI = ontologyIRI + version;
      return [
        name,
        {
          path: `src/${path}/${version}`,
          ontologyIRI,
          versionIRI,
          importIRI: versionIRI,
          byteLength,
          sha256,
          syntax: "rdfxml",
        },
      ];
    }),
  );
  for (const [
    name,
    { path, ontologyIRI, versionIRI = null, ...pin },
  ] of Object.entries(external)) {
    assert.ok(
      !documents.has(name),
      `Duplicate Universal Ontology document ${name}`,
    );
    documents.set(name, {
      ...pin,
      path: `src/${path}`,
      ontologyIRI,
      versionIRI,
      importIRI: ontologyIRI,
    });
  }

  const mappings = [];
  const originals = {};
  for (const {
    path,
    importIRI,
    byteLength,
    sha256,
    syntax,
  } of documents.values()) {
    // These paths are also used as literal non-cone Git sparse-checkout patterns.
    assert.ok(
      /^src(?:\/[a-z0-9._-]+)+$/iu.test(path) &&
        !path.split("/").some((part) => part === "." || part === ".."),
      `Invalid Universal Ontology source path ${path}`,
    );
    assert.ok(
      !Object.hasOwn(originals, path),
      `Duplicate Universal Ontology source path ${path}`,
    );
    mappings.push({ ontologyIRI: importIRI, path });
    originals[path] = { byteLength, sha256, syntax };
  }

  return {
    version,
    revision,
    roots: rootEntries.map(([name, { closure }]) => ({
      name,
      path: documents.get(name).path,
      expectedClosure: [name, ...closure].map((member) => {
        const document = documents.get(member);
        assert.ok(
          document,
          `Unknown Universal Ontology closure member ${member} for ${name}`,
        );
        const { ontologyIRI, versionIRI } = document;
        return { ontologyIRI, versionIRI };
      }),
    })),
    mappings,
    originals,
    allowedSourceDiagnostics,
  };
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const { revision, mappings } = readUniversalOntologyManifest();
  const output = process.env.GITHUB_OUTPUT;
  assert.ok(output, "GitHub Actions output path is required");
  const patterns = mappings.map(({ path }) => `/${path}`).join("\n");
  appendFileSync(
    output,
    `revision=${revision}\nsparse_checkout<<PATHS\n${patterns}\nPATHS\n`,
  );
}
