import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { Parser as N3Parser } from "n3";
import { format as formatWithPrettier } from "prettier";

const REVISION = "12774b0ebb385d17651b396654b19254d0fefbfa";
const MF = "http://www.w3.org/2001/sw/DataAccess/tests/test-manifest#";
const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const RDFT = "http://www.w3.org/ns/rdftest#";
const DEFAULT_INPUT_URL = new URL(
  "../.phase9-input/w3c-rdf-tests/rdf/",
  import.meta.url,
);
const CLASSIFICATIONS_URL = new URL(
  "../docs/conformance/classification-manifests.json",
  import.meta.url,
);
const FIXTURE_URL = new URL(
  "../docs/conformance/generated/w3c-turtle.json",
  import.meta.url,
);

const inputUrl = process.argv[2]
  ? pathToFileURL(`${resolve(process.argv[2])}${sep}`)
  : DEFAULT_INPUT_URL;

const suites = [
  {
    archiveUrl: new URL(
      "../docs/conformance/upstream/w3c-rdf-tests/rdf/rdf11/rdf-turtle/manifest.ttl",
      import.meta.url,
    ),
    expectedCount: 313,
    expectedSha256:
      "b90a85ee867279b7688033dc18088789580f0bcc2c59600b8c5796889414cf36",
    inputUrl: new URL("rdf11/rdf-turtle/", inputUrl),
    key: "rdf11",
    manifestPath: "rdf/rdf11/rdf-turtle/manifest.ttl",
  },
  {
    archiveUrl: new URL(
      "../docs/conformance/upstream/w3c-rdf-tests/rdf/rdf12/rdf-turtle/syntax/manifest.ttl",
      import.meta.url,
    ),
    expectedCount: 74,
    expectedSha256:
      "cd097ec4c5b312b04897eb9fcf0e7429381967936dfe14194fff9c7027a7203b",
    inputUrl: new URL("rdf12/rdf-turtle/syntax/", inputUrl),
    key: "rdf12Syntax",
    manifestPath: "rdf/rdf12/rdf-turtle/syntax/manifest.ttl",
  },
];

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const formatJson = (value) =>
  formatWithPrettier(JSON.stringify(value), { parser: "json" });

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

const objectFor = (quads, subject, predicate) =>
  quads.find(
    (quad) =>
      quad.subject.equals(subject) && quad.predicate.value === predicate,
  )?.object;

const manifestEntries = (quads) => {
  const head = quads.find(
    ({ predicate }) => predicate.value === `${MF}entries`,
  )?.object;
  if (!head) {
    throw new Error("The W3C Turtle manifest has no mf:entries collection");
  }
  const entries = [];
  const visited = new Set();
  let node = head;
  while (node.value !== `${RDF}nil`) {
    const key = `${node.termType}:${node.value}`;
    if (visited.has(key)) {
      throw new Error("The W3C Turtle manifest entries form a cyclic list");
    }
    visited.add(key);
    const entry = objectFor(quads, node, `${RDF}first`);
    const rest = objectFor(quads, node, `${RDF}rest`);
    if (!entry || !rest) {
      throw new Error("The W3C Turtle manifest entries list is incomplete");
    }
    entries.push(entry);
    node = rest;
  }
  return entries;
};

const typeNames = new Map([
  [`${RDFT}TestTurtleEval`, "EVALUATION"],
  [`${RDFT}TestTurtlePositiveSyntax`, "POSITIVE_SYNTAX"],
  [`${RDFT}TestTurtleNegativeSyntax`, "NEGATIVE_SYNTAX"],
]);

const relativeReference = (term, assumedBase, predicate) => {
  if (term?.termType !== "NamedNode" || !term.value.startsWith(assumedBase)) {
    throw new Error(`Unexpected ${predicate} IRI in W3C Turtle manifest`);
  }
  return term.value.slice(assumedBase.length);
};

const tests = [];
const manifestHashes = {};
const manifestEntryCounts = {};

for (const suite of suites) {
  const manifestBytes = await readFile(new URL("manifest.ttl", suite.inputUrl));
  const manifestSha256 = sha256(manifestBytes);
  if (manifestSha256 !== suite.expectedSha256) {
    throw new Error(
      `Unexpected ${suite.key} W3C Turtle manifest SHA-256: ${manifestSha256}`,
    );
  }
  manifestHashes[suite.key] = manifestSha256;
  await mkdir(new URL("./", suite.archiveUrl), { recursive: true });
  await writeFile(suite.archiveUrl, manifestBytes);

  const manifestText = manifestBytes.toString("utf8");
  const assumedBase = manifestText.match(
    /mf:assumedTestBase\s+<([^>]+)>/u,
  )?.[1];
  if (!assumedBase) {
    throw new Error(`${suite.key} W3C Turtle manifest has no assumed base`);
  }
  const quads = new N3Parser({
    baseIRI: new URL("manifest.ttl", assumedBase).href,
    format: "text/turtle",
  }).parse(manifestText);
  const entries = manifestEntries(quads);
  if (entries.length !== suite.expectedCount) {
    throw new Error(
      `Unexpected ${suite.key} W3C Turtle inventory: ${entries.length}`,
    );
  }
  manifestEntryCounts[suite.key] = entries.length;

  for (const entry of entries) {
    const id = entry.value.match(/#([^#]+)$/u)?.[1];
    if (!id) {
      throw new Error("A W3C Turtle manifest entry has no fragment ID");
    }
    const type = typeNames.get(objectFor(quads, entry, `${RDF}type`)?.value);
    if (!type) {
      throw new Error(`Unsupported W3C Turtle test type for ${id}`);
    }
    const actionTerm = objectFor(quads, entry, `${MF}action`);
    const action = relativeReference(actionTerm, assumedBase, "mf:action");
    const source = await readFile(new URL(action, suite.inputUrl), "utf8");
    const test = {
      action,
      baseIRI: actionTerm.value,
      id,
      source,
      suite: suite.key,
      type,
    };
    const resultTerm = objectFor(quads, entry, `${MF}result`);
    if (type === "EVALUATION") {
      const result = relativeReference(resultTerm, assumedBase, "mf:result");
      const expectedText = await readFile(
        new URL(result, suite.inputUrl),
        "utf8",
      );
      test.expectedQuads = new N3Parser({
        baseIRI: resultTerm.value,
        format: "N-Triples",
      })
        .parse(expectedText)
        .map(encodeQuad)
        .sort((left, right) =>
          JSON.stringify(left).localeCompare(JSON.stringify(right), "en"),
        );
      test.result = result;
    } else if (resultTerm) {
      throw new Error(`Non-evaluation W3C Turtle test ${id} has a result`);
    }
    tests.push(test);
  }
}

const identities = tests.map(({ id, suite }) => `${suite}:${id}`);
if (new Set(identities).size !== tests.length) {
  throw new Error("The classified W3C Turtle test identities are not unique");
}

const count = (type) => tests.filter((test) => test.type === type).length;
const counts = {
  evaluation: count("EVALUATION"),
  negativeSyntax: count("NEGATIVE_SYNTAX"),
  positiveSyntax: count("POSITIVE_SYNTAX"),
  required: tests.length,
};
if (
  counts.evaluation !== 145 ||
  counts.negativeSyntax !== 127 ||
  counts.positiveSyntax !== 115 ||
  counts.required !== 387
) {
  throw new Error(
    `Unexpected classified W3C Turtle counts: ${JSON.stringify(counts)}`,
  );
}

const classifications = JSON.parse(await readFile(CLASSIFICATIONS_URL, "utf8"));
const classification = classifications.manifests.find(
  ({ id }) => id === "w3c-rdf-tests.turtle",
);
if (!classification) {
  throw new Error("Missing w3c-rdf-tests.turtle classification manifest");
}
Object.assign(classification, {
  entries: tests.map(({ action, id, result, suite, type }) => ({
    action,
    classification: "REQUIRED",
    id,
    ...(result === undefined ? {} : { result }),
    sourceManifest: suite,
    testType: type,
  })),
  evaluationTestCount: counts.evaluation,
  localManifestArtifacts: suites.map(
    ({ manifestPath }) =>
      `docs/conformance/upstream/w3c-rdf-tests/${manifestPath}`,
  ),
  manifestEntryCount: counts.required,
  manifestEntryCounts,
  manifestSha256: manifestHashes,
  negativeSyntaxTestCount: counts.negativeSyntax,
  positiveSyntaxTestCount: counts.positiveSyntax,
  requiredTestCount: counts.required,
  revision: REVISION,
  runner: "internal/parsing/turtle/turtle.conformance.test.js",
  runnerParsingPolicy:
    "Every RDF 1.1 evaluation case must produce a canonical RDF/JS dataset graph-isomorphic to its N-Triples result; every positive-syntax case must parse at the Turtle syntax seam; every negative-syntax case must reject before RDF-to-OWL reconstruction.",
  runnerScope:
    "Exercise the exact-format Turtle syntax-to-RDF/JS boundary independently for the pinned RDF 1.1 manifest and RDF 1.2 syntax manifest; OWL reconstruction remains separately governed by the shared RDF-to-OWL translator.",
  sourceTestCount: counts.required,
});

await writeFile(CLASSIFICATIONS_URL, await formatJson(classifications), "utf8");
await writeFile(
  FIXTURE_URL,
  await formatJson({
    counts,
    generatedBy: "util/generate-w3c-turtle-fixtures.mjs",
    manifests: manifestHashes,
    revision: REVISION,
    schemaVersion: 1,
    tests,
  }),
  "utf8",
);

process.stdout.write(
  `Generated ${counts.required} W3C Turtle fixtures (${counts.evaluation} evaluation, ${counts.positiveSyntax} positive syntax, ${counts.negativeSyntax} negative syntax).\n`,
);
