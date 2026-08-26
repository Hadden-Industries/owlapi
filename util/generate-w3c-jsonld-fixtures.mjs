import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { format as formatWithPrettier } from "prettier";

const REVISION = "ffdb326121ea89b7b8280e76a5caea923834bcef";
const TEST_BASE = "https://w3c.github.io/json-ld-api/tests/";
const DEFAULT_INPUT_URL = new URL(
  "../.phase15-input/w3c-json-ld-api/tests/",
  import.meta.url,
);
const CLASSIFICATIONS_URL = new URL(
  "../docs/conformance/classification-manifests.json",
  import.meta.url,
);
const GENERATED_URL = new URL(
  "../docs/conformance/generated/w3c-jsonld.json",
  import.meta.url,
);
const ARCHIVE_URL = new URL(
  "../docs/conformance/upstream/w3c-json-ld-api/tests/",
  import.meta.url,
);
const EXPECTED_HASHES = Object.freeze({
  fromRdf: "7257466aa9cb9cc4d8cd7e345cd522056b5d2283b6a907783aca118c1afd05c8",
  toRdf: "aeb5b24dd17a3d1b5fae5f39f75f796a9e7fbe7e717dfcb10f47619fbe00e41e",
});
const GENERALIZED_RDF_EXCLUSION =
  "This test requires generalized RDF with blank-node predicates. Ordinary RDF/JS and the OWL 2 RDF mapping require property predicates to be IRIs, so generalized RDF cannot enter the RDF-to-OWL ingestion boundary.";
const FROM_RDF_REASON =
  "JSON-LD from-RDF serialization is outside the Phase 15 ontology-ingestion adapter; the adapter's governed direction is JSON-LD to RDF/JS.";
const JSONLDJS_GAPS = new Map([
  [
    "c037",
    "jsonld.js 9.0.0 does not apply the pinned property-scoped context when the scoped property is an alias of @nest.",
  ],
  [
    "c038",
    "jsonld.js 9.0.0 does not reproduce the pinned nested property-scoped context expansion for the Bibframe case.",
  ],
  [
    "er56",
    "jsonld.js 9.0.0 accepts the pinned invalid @context keyword redefinition instead of raising the required error.",
  ],
]);

const inputUrl = process.argv[2]
  ? pathToFileURL(`${resolve(process.argv[2])}${sep}`)
  : DEFAULT_INPUT_URL;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const formatJson = (value) =>
  formatWithPrettier(JSON.stringify(value), { parser: "json" });
const readJson = async (url) => JSON.parse(await readFile(url, "utf8"));
const idFor = (entry) => entry["@id"].replace(/^#t/u, "");
const testType = (entry) => {
  if (entry["@type"].includes("jld:NegativeEvaluationTest")) {
    return "NEGATIVE_EVALUATION";
  }
  if (entry["@type"].includes("jld:PositiveSyntaxTest")) {
    return "POSITIVE_SYNTAX";
  }
  return "POSITIVE_EVALUATION";
};
const exclusionFor = (entry) => {
  const dependencyGap = JSONLDJS_GAPS.get(idFor(entry));
  if (dependencyGap) {
    return {
      exclusionReason: dependencyGap,
      reasonCategory: "JSONLDJS_9_CONFORMANCE_GAP",
    };
  }
  if (entry.requires === "GeneralizedRdf") {
    return {
      exclusionReason: GENERALIZED_RDF_EXCLUSION,
      reasonCategory: "JSONLD_GENERALIZED_RDF_OUTSIDE_OWL_INGESTION",
    };
  }
  return undefined;
};

const parametersFor = (entry) => {
  const parameters = {};
  if (entry.option?.specVersion === "json-ld-1.0") {
    parameters.processingMode = "json-ld-1.0";
  }
  if (entry.option?.processingMode !== undefined) {
    parameters.processingMode = entry.option.processingMode;
  }
  if (entry.option?.expandContext !== undefined) {
    parameters.expandContext =
      typeof entry.option.expandContext === "string"
        ? new URL(entry.option.expandContext, TEST_BASE).href
        : entry.option.expandContext;
  }
  if (entry.option?.rdfDirection !== undefined) {
    parameters.rdfDirection = entry.option.rdfDirection;
  }
  // `useJCS` selects the W3C expected-result profile. Canonical rdf:JSON is an
  // ingestion invariant, so exposing a switch that permits non-canonical
  // lexical forms would add an invalid public mode rather than compatibility.
  return parameters;
};

const manifestBytes = {};
const manifests = {};
for (const name of ["toRdf", "fromRdf"]) {
  const bytes = await readFile(new URL(`${name}-manifest.jsonld`, inputUrl));
  const observed = sha256(bytes);
  if (observed !== EXPECTED_HASHES[name]) {
    throw new Error(`Unexpected ${name} manifest SHA-256: ${observed}`);
  }
  manifestBytes[name] = bytes;
  manifests[name] = JSON.parse(bytes);
}

const toRdfEntries = [];
const generatedTests = [];
for (const entry of manifests.toRdf.sequence) {
  const exclusion = exclusionFor(entry);
  const classification = exclusion ? "EXCLUDED_WITH_REASON" : "REQUIRED";
  const type = testType(entry);
  const parameters = parametersFor(entry);
  const inventoryEntry = {
    action: entry.input,
    classification,
    ...(exclusion || {}),
    id: idFor(entry),
    ...(Object.keys(parameters).length === 0 ? {} : { parameters }),
    testType: type,
    ...(entry.expect ? { result: entry.expect } : {}),
  };
  toRdfEntries.push(inventoryEntry);
  generatedTests.push({
    ...inventoryEntry,
    baseIRI: entry.option?.base || new URL(entry.input, TEST_BASE).href,
    ...(entry.expect
      ? {
          expected: await readFile(new URL(entry.expect, inputUrl), "utf8"),
        }
      : {}),
    source: await readFile(new URL(entry.input, inputUrl), "utf8"),
  });
}

const fromRdfEntries = manifests.fromRdf.sequence.map((entry) => ({
  action: entry.input,
  classification: "NOT_APPLICABLE",
  exclusionReason: FROM_RDF_REASON,
  id: idFor(entry),
  reasonCategory: "JSONLD_FROM_RDF_OUT_OF_SCOPE",
  testType: testType(entry),
  ...(entry.expect ? { result: entry.expect } : {}),
}));

// Remote contexts are resolved from this immutable generated map during tests;
// conformance never grants the processor ambient network access.
const resources = {};
const collectResources = async (relativeDirectory) => {
  for (const entry of await readdir(new URL(relativeDirectory, inputUrl), {
    withFileTypes: true,
  })) {
    const relative = `${relativeDirectory}${entry.name}`;
    if (entry.isDirectory()) {
      await collectResources(`${relative}/`);
    } else if (/\.json(?:ld)?$/u.test(entry.name)) {
      resources[new URL(relative, TEST_BASE).href] = await readFile(
        new URL(relative, inputUrl),
        "utf8",
      );
    }
  }
};
await collectResources("toRdf/");
for (const relative of ["context.jsonld", "vocab_context.jsonld"]) {
  resources[new URL(relative, TEST_BASE).href] = await readFile(
    new URL(relative, inputUrl),
    "utf8",
  );
}

const classifications = await readJson(CLASSIFICATIONS_URL);
const replacementIds = new Set([
  "w3c-json-ld-api.from-rdf",
  "w3c-json-ld-api.to-rdf",
]);
classifications.manifests = classifications.manifests.filter(
  ({ id }) => !replacementIds.has(id),
);
classifications.manifests.push(
  {
    classificationOwnerPhases: [15],
    entries: toRdfEntries,
    id: "w3c-json-ld-api.to-rdf",
    paths: ["tests/toRdf-manifest.jsonld"],
    revision: REVISION,
    suite: "w3c-json-ld-api",
  },
  {
    classificationOwnerPhases: [15],
    entries: fromRdfEntries,
    id: "w3c-json-ld-api.from-rdf",
    paths: ["tests/fromRdf-manifest.jsonld"],
    revision: REVISION,
    suite: "w3c-json-ld-api",
  },
);

const counts = (entries) =>
  Object.fromEntries(
    ["REQUIRED", "NOT_APPLICABLE", "EXCLUDED_WITH_REASON"].map((value) => [
      value,
      entries.filter(({ classification }) => classification === value).length,
    ]),
  );
const generated = {
  counts: {
    fromRdf: counts(fromRdfEntries),
    toRdf: counts(toRdfEntries),
  },
  manifests: EXPECTED_HASHES,
  resources,
  revision: REVISION,
  schemaVersion: 1,
  tests: generatedTests,
};

await mkdir(new URL("./", GENERATED_URL), { recursive: true });
await mkdir(ARCHIVE_URL, { recursive: true });
await writeFile(CLASSIFICATIONS_URL, await formatJson(classifications));
await writeFile(GENERATED_URL, await formatJson(generated));
await writeFile(
  new URL("toRdf-manifest.jsonld", ARCHIVE_URL),
  manifestBytes.toRdf,
);
await writeFile(
  new URL("fromRdf-manifest.jsonld", ARCHIVE_URL),
  manifestBytes.fromRdf,
);
await writeFile(
  new URL("LICENSE.md", ARCHIVE_URL),
  await readFile(new URL("LICENSE.md", inputUrl)),
);

console.log(
  `Generated ${toRdfEntries.length} to-RDF and ${fromRdfEntries.length} from-RDF classifications at ${REVISION}.`,
);
