import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

import { Parser as N3Parser } from "n3";
import { format as formatWithPrettier } from "prettier";

const REVISION = "ad541a5f0479f0798608c4801369d97b8e08b36f";
const EXPECTED_MANIFEST_SHA256 =
  "027679cf7d460cdc401ccf2aab3546dfbdfad64badcdd15f225948f5643f6370";
const DEFAULT_INPUT_URL = new URL(
  "../.phase6-input/w3c-rdf-tests/rdf/rdf11/rdf-xml/",
  import.meta.url,
);
const UPSTREAM_MANIFEST_URL = new URL(
  "../docs/conformance/upstream/w3c-rdf-tests/rdf/rdf11/rdf-xml/manifest.ttl",
  import.meta.url,
);
const CLASSIFICATIONS_URL = new URL(
  "../docs/conformance/classification-manifests.json",
  import.meta.url,
);
const FIXTURE_URL = new URL(
  "../docs/conformance/generated/w3c-rdfxml.json",
  import.meta.url,
);

const inputUrl = process.argv[2]
  ? new URL(
      `${process.argv[2].replace(/[/\\]?$/u, "/")}`,
      `file:///${process.cwd().replaceAll("\\", "/")}/`,
    )
  : DEFAULT_INPUT_URL;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const formatJson = (value) =>
  formatWithPrettier(JSON.stringify(value), { parser: "json" });

const definitionBlocks = (manifest) => {
  const lines = manifest.split(/\r\n|\r|\n/u);
  const starts = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(
      /^(#?)<#([^>]+)>\s+a\s+rdft:(TestXMLEval|TestXMLNegativeSyntax);/u,
    );
    if (match) {
      starts.push({
        commented: match[1] === "#",
        id: match[2],
        line: index,
        type: match[3],
      });
    }
  }
  return starts.map((definition, index) => {
    const end = starts[index + 1]?.line ?? lines.length;
    const block = lines
      .slice(definition.line, end)
      .map((line) => (definition.commented ? line.replace(/^#/u, "") : line))
      .join("\n");
    return { ...definition, block };
  });
};

const readReference = (block, predicate, required = true) => {
  const match = block.match(new RegExp(`${predicate}\\s+<([^>]+)>`, "u"));
  if (!match && required) {
    throw new Error(`Missing ${predicate} in W3C RDF/XML definition`);
  }
  return match?.[1];
};

const encodeTerm = (term) => {
  switch (term.termType) {
    case "NamedNode":
      return ["N", term.value];
    case "BlankNode":
      return ["B", term.value];
    case "Literal":
      return [
        "L",
        term.value,
        term.language,
        term.direction || "",
        term.datatype.value,
      ];
    case "DefaultGraph":
      return ["D"];
    case "Quad":
      return [
        "Q",
        encodeTerm(term.subject),
        encodeTerm(term.predicate),
        encodeTerm(term.object),
        encodeTerm(term.graph),
      ];
    default:
      throw new TypeError(`Unsupported RDF fixture term: ${term.termType}`);
  }
};

const encodeQuad = (quad) => [
  encodeTerm(quad.subject),
  encodeTerm(quad.predicate),
  encodeTerm(quad.object),
  encodeTerm(quad.graph),
];

const manifestBytes = await readFile(new URL("manifest.ttl", inputUrl));
const manifestSha256 = sha256(manifestBytes);
if (manifestSha256 !== EXPECTED_MANIFEST_SHA256) {
  throw new Error(`Unexpected W3C RDF/XML manifest SHA-256: ${manifestSha256}`);
}
const archivedManifest = await readFile(UPSTREAM_MANIFEST_URL);
if (sha256(archivedManifest) !== EXPECTED_MANIFEST_SHA256) {
  throw new Error("The archived W3C RDF/XML manifest does not match the pin");
}

const manifest = manifestBytes.toString("utf8");
const assumedBase = manifest.match(/mf:assumedTestBase\s+<([^>]+)>/u)?.[1];
if (!assumedBase) {
  throw new Error("The W3C RDF/XML manifest has no assumed test base");
}
const entryBlock = manifest.match(/mf:entries\s*\(([\s\S]*?)\)\s*\./u)?.[1];
if (!entryBlock) {
  throw new Error("The W3C RDF/XML manifest has no mf:entries collection");
}
const activeIds = [...entryBlock.matchAll(/^\s*<#([^>]+)>/gmu)].map(
  (match) => match[1],
);
const activeIdSet = new Set(activeIds);
const definitions = definitionBlocks(manifest);
const byId = new Map(
  definitions.map((definition) => [definition.id, definition]),
);

if (
  activeIds.length !== 166 ||
  activeIdSet.size !== 166 ||
  definitions.length !== 173 ||
  byId.size !== 173
) {
  throw new Error(
    `Unexpected W3C RDF/XML inventory: ${activeIds.length} entries and ${definitions.length} definitions`,
  );
}
for (const id of activeIds) {
  if (!byId.has(id)) {
    throw new Error(`The W3C RDF/XML entry ${id} has no definition`);
  }
}

const tests = [];
const entries = [];
for (const id of activeIds) {
  const definition = byId.get(id);
  const action = readReference(definition.block, "mf:action");
  const result = readReference(
    definition.block,
    "mf:result",
    definition.type === "TestXMLEval",
  );
  const source = await readFile(new URL(action, inputUrl), "utf8");
  const test = {
    action,
    baseIRI: new URL(action, assumedBase).href,
    id,
    source,
    type: definition.type === "TestXMLEval" ? "EVALUATION" : "NEGATIVE_SYNTAX",
  };
  const entry = {
    action,
    classification: "REQUIRED",
    id,
    testType: test.type,
  };
  if (result) {
    const expectedText = await readFile(new URL(result, inputUrl), "utf8");
    const parser = new N3Parser({
      baseIRI: new URL(result, assumedBase).href,
      format: "N-Triples",
    });
    test.expectedQuads = parser
      .parse(expectedText)
      .map(encodeQuad)
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right), "en"),
      );
    test.result = result;
    entry.result = result;
  }
  tests.push(test);
  entries.push(entry);
}

const excludedSourceDefinitions = definitions
  .filter(({ id }) => !activeIdSet.has(id))
  .map((definition) => ({
    classification: "EXCLUDED_WITH_REASON",
    id: definition.id,
    reasonCategory: "COMMENTED_OUT_UPSTREAM",
    testType:
      definition.type === "TestXMLEval" ? "EVALUATION" : "NEGATIVE_SYNTAX",
  }));
const evaluationTestCount = tests.filter(
  ({ type }) => type === "EVALUATION",
).length;
const negativeSyntaxTestCount = tests.filter(
  ({ type }) => type === "NEGATIVE_SYNTAX",
).length;
if (
  evaluationTestCount !== 126 ||
  negativeSyntaxTestCount !== 40 ||
  excludedSourceDefinitions.length !== 7
) {
  throw new Error(
    `Unexpected classified W3C RDF/XML inventory: ${evaluationTestCount} evaluation, ${negativeSyntaxTestCount} negative, ${excludedSourceDefinitions.length} excluded`,
  );
}

const classifications = JSON.parse(await readFile(CLASSIFICATIONS_URL, "utf8"));
const classification = classifications.manifests.find(
  ({ id }) => id === "w3c-rdf-tests.rdfxml",
);
if (!classification) {
  throw new Error("Missing w3c-rdf-tests.rdfxml classification manifest");
}
Object.assign(classification, {
  entries,
  evaluationTestCount,
  excludedDefinitionCount: excludedSourceDefinitions.length,
  excludedReasonCategories: {
    COMMENTED_OUT_UPSTREAM:
      "The definition is fully commented out in the pinned upstream Turtle manifest and is not a member of its mf:entries collection.",
  },
  excludedSourceDefinitions,
  localManifestArtifact:
    "docs/conformance/upstream/w3c-rdf-tests/rdf/rdf11/rdf-xml/manifest.ttl",
  manifestEntryCount: tests.length,
  manifestSha256,
  negativeSyntaxTestCount,
  requiredTestCount: tests.length,
  runner: "internal/parsing/rdfxml/rdfXml.conformance.test.js",
  runnerParsingPolicy:
    "Every active evaluation case must produce an RDF/JS dataset graph-isomorphic to its N-Triples result; every active negative-syntax case must reject before RDF-to-OWL reconstruction.",
  runnerScope:
    "Exercise the RDF/XML syntax-to-RDF/JS boundary independently; accepted syntax may then proceed through the separately governed shared RDF-to-OWL translator.",
  sourceDefinitionCount: definitions.length,
  sourceTestCount: tests.length,
});

await writeFile(CLASSIFICATIONS_URL, await formatJson(classifications), "utf8");
await writeFile(
  FIXTURE_URL,
  await formatJson({
    counts: {
      evaluation: evaluationTestCount,
      negativeSyntax: negativeSyntaxTestCount,
      required: tests.length,
    },
    generatedBy: "util/generate-w3c-rdfxml-fixtures.mjs",
    manifestSha256,
    revision: REVISION,
    schemaVersion: 1,
    tests,
  }),
  "utf8",
);

process.stdout.write(
  `Generated ${tests.length} W3C RDF/XML fixtures (${evaluationTestCount} evaluation, ${negativeSyntaxTestCount} negative).\n`,
);
