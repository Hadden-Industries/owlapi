import {
  comparisonIdentity,
  comparisonImportRequests,
  exactComparedDocuments,
  matchesOntologyClosure,
} from "./comparison-evidence.mjs";

export const rdfXmlExpansionKind = "rdfxml-expansion";
export const rdfXmlCharacterReferenceKind = "rdfxml-character-references";
// Bind the source, derivative, dependencies and the exact conversion recipe.
const approvedDerivations = new Map([
  [
    "obo-ovae-entity-free",
    "ce7400b032e0634831f20509f7d8f41aee5351ce82338beabb0707e6b26099a1",
  ],
  [
    "obo-ogg-archive-ce-entity-free",
    "5f5ec69d9597ce5246655889ce0918d29d5a0624cff451b881e85123ac8dab97",
  ],
  [
    "obo-ogg-archive-dm-entity-free",
    "dace61092e86c054b27020af8bfc63bbd07841ee7eb2250e282469ec7d54b3d3",
  ],
  [
    "obo-omit-entity-free",
    "4ce70902bb3916e701767b08509575edd50d168ad01fa01743dd2c126516b8f1",
  ],
  [
    "obo-import-ncro-2015-12-10-ncro-entity-free",
    "ae82660298ff3e3e5fcc9a52fb4eec206c09eb54afdddb72d84127852a77bb44",
  ],
  [
    "obo-po-character-references",
    "c852e7e72a6341a16e2ec8e2ae36876212dc5bc3fab4bd697135fdd27105c82e",
  ],
]);

const fixtureWitness = (fixture) => ({
  id: fixture.id,
  suite: fixture.suite ?? null,
  role: fixture.role,
  byteLength: fixture.byteLength,
  sha256: fixture.sha256,
  syntax: fixture.syntax,
  documentIRI: fixture.documentIRI,
  ontologyIRI: fixture.ontologyIRI ?? null,
  basePolicy: fixture.basePolicy,
  acquisition: fixture.acquisition,
  imports: fixture.imports ?? [],
  mappedImports: fixture.mappedImports ?? [],
  source: fixture.source,
});

/** Resolve the exact original RDF/XML and its imports behind a derivative. */
export function rdfXmlDerivationSource(fixture, catalogue) {
  const source = fixture.source;
  const approved = approvedDerivations.get(fixture.id);
  const supported = [
    rdfXmlExpansionKind,
    rdfXmlCharacterReferenceKind,
  ].includes(source.kind);
  if (!approved && !supported) return null;
  const original = catalogue.fixtures.find(
    ({ id }) => id === source.originalId,
  );
  const taxonomyIds = [
    ...new Set([
      ...(original?.imports ?? []),
      ...(original?.mappedImports ?? []),
    ]),
  ].sort();
  const taxonomy = taxonomyIds.map((wanted) =>
    catalogue.fixtures.find(({ id }) => id === wanted),
  );
  if (
    !approved ||
    !supported ||
    !original ||
    taxonomy.some((module) => !module) ||
    comparisonIdentity({
      original: fixtureWitness(original),
      derivative: fixtureWitness(fixture),
      taxonomy: taxonomy.map(fixtureWitness),
    }) !== approved
  )
    throw new Error(
      "RDF/XML expansion requires the approved original, derivative, imports and limits",
    );
  if (source.kind === rdfXmlCharacterReferenceKind)
    return { kind: source.kind, original, count: source.count };
  const {
    recipe,
    entityExpansionLimit,
    totalEntitySizeLimit,
    expectedClosure,
  } = source;
  return {
    kind: source.kind,
    original,
    recipe,
    expectedClosure,
    limits: { entityExpansionLimit, totalEntitySizeLimit },
  };
}

/** Require an independent Java comparison of the archived and derived documents. */
export function matchesOriginalRdfXml(definition, js, native) {
  const { document, limits } = definition.originalRdfXml;
  const observed = native.originalRdfXml;
  return (
    observed?.comparison?.status === "match" &&
    observed.source?.sha256 === document.sha256 &&
    observed.source?.byteLength === document.byteLength &&
    comparisonImportRequests(definition.imports, js, observed).java &&
    matchesOntologyClosure(
      observed.closure,
      definition.requiredImportClosure,
    ) &&
    native.xmlSettings?.["jdk.xml.entityExpansionLimit"] ===
      String(limits.entityExpansionLimit) &&
    native.xmlSettings?.["jdk.xml.totalEntitySizeLimit"] ===
      String(limits.totalEntitySizeLimit) &&
    native.xmlSettings?.["javax.xml.accessExternalDTD"] === "" &&
    native.xmlSettings?.["javax.xml.accessExternalSchema"] === ""
  );
}

/** Compare each document in the pinned derivative's actual import closure. */
export function compareExpandedRdfXmlDocuments(definition, js, native) {
  // A direct load without imports already compares the entire closure as the root model.
  if (definition.imports.length === 0)
    return native.structure?.status ?? "inconclusive";

  const comparisons = native.documentComparisons;
  const required = new Set([
    definition.input.documentIRI,
    ...definition.imports.map(({ documentIRI }) => documentIRI),
  ]);
  if (
    !exactComparedDocuments(js.documentModels, comparisons) ||
    comparisons.length !== required.size ||
    comparisons.some(({ documentIRI }) => !required.has(documentIRI))
  )
    return "inconclusive";
  const verdicts = comparisons.map(({ comparison }) => comparison?.status);
  if (verdicts.includes("mismatch")) return "mismatch";
  return verdicts.every((verdict) => verdict === "match")
    ? "match"
    : "inconclusive";
}
