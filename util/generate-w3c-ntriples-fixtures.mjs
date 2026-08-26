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
  "../.phase12-input/w3c-rdf-tests/rdf/",
  import.meta.url,
);
const CLASSIFICATIONS_URL = new URL(
  "../docs/conformance/classification-manifests.json",
  import.meta.url,
);
const FIXTURE_URL = new URL(
  "../docs/conformance/generated/w3c-ntriples.json",
  import.meta.url,
);

const inputUrl = process.argv[2]
  ? pathToFileURL(`${resolve(process.argv[2])}${sep}`)
  : DEFAULT_INPUT_URL;

const suites = [
  {
    assumedBase: "https://w3c.github.io/rdf-tests/rdf/rdf11/rdf-n-triples/",
    archiveUrl: new URL(
      "../docs/conformance/upstream/w3c-rdf-tests/rdf/rdf11/rdf-n-triples/manifest.ttl",
      import.meta.url,
    ),
    expectedCount: 70,
    expectedSha256:
      "65b748e9e15783c6e9808dad663ee9e139803ceee2fb9a0704fbe00ddbdafc7b",
    inputUrl: new URL("rdf11/rdf-n-triples/", inputUrl),
    key: "rdf11",
    manifestPath: "rdf/rdf11/rdf-n-triples/manifest.ttl",
  },
  {
    assumedBase:
      "https://w3c.github.io/rdf-tests/rdf/rdf12/rdf-n-triples/syntax/",
    archiveUrl: new URL(
      "../docs/conformance/upstream/w3c-rdf-tests/rdf/rdf12/rdf-n-triples/syntax/manifest.ttl",
      import.meta.url,
    ),
    expectedCount: 29,
    expectedSha256:
      "cd80d5bd8ae702cafcd78bc238d31a17aba7913b78eecadb5b55683e22feb3d7",
    inputUrl: new URL("rdf12/rdf-n-triples/syntax/", inputUrl),
    key: "rdf12Syntax",
    manifestPath: "rdf/rdf12/rdf-n-triples/syntax/manifest.ttl",
  },
];

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const formatJson = (value) =>
  formatWithPrettier(JSON.stringify(value), { parser: "json" });

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
    throw new Error("The W3C N-Triples manifest has no mf:entries collection");
  }
  const entries = [];
  const visited = new Set();
  let node = head;
  while (node.value !== `${RDF}nil`) {
    const key = `${node.termType}:${node.value}`;
    if (visited.has(key)) {
      throw new Error("The W3C N-Triples manifest entries form a cyclic list");
    }
    visited.add(key);
    const entry = objectFor(quads, node, `${RDF}first`);
    const rest = objectFor(quads, node, `${RDF}rest`);
    if (!entry || !rest) {
      throw new Error("The W3C N-Triples manifest entries list is incomplete");
    }
    entries.push(entry);
    node = rest;
  }
  return entries;
};

const typeNames = new Map([
  [`${RDFT}TestNTriplesPositiveSyntax`, "POSITIVE_SYNTAX"],
  [`${RDFT}TestNTriplesNegativeSyntax`, "NEGATIVE_SYNTAX"],
]);

const relativeReference = (term, assumedBase, predicate) => {
  if (term?.termType !== "NamedNode" || !term.value.startsWith(assumedBase)) {
    throw new Error(`Unexpected ${predicate} IRI in W3C N-Triples manifest`);
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
      `Unexpected ${suite.key} W3C N-Triples manifest SHA-256: ${manifestSha256}`,
    );
  }
  manifestHashes[suite.key] = manifestSha256;
  await mkdir(new URL("./", suite.archiveUrl), { recursive: true });
  await writeFile(suite.archiveUrl, manifestBytes);

  const manifestText = manifestBytes.toString("utf8");
  const declaredBase = manifestText.match(
    /mf:assumedTestBase\s+<([^>]+)>/u,
  )?.[1];
  const assumedBase = declaredBase || suite.assumedBase;
  if (assumedBase !== suite.assumedBase) {
    throw new Error(`Unexpected ${suite.key} W3C N-Triples assumed base`);
  }
  const quads = new N3Parser({
    baseIRI: new URL("manifest.ttl", assumedBase).href,
    format: "text/turtle",
  }).parse(manifestText);
  const entries = manifestEntries(quads);
  if (entries.length !== suite.expectedCount) {
    throw new Error(
      `Unexpected ${suite.key} W3C N-Triples inventory: ${entries.length}`,
    );
  }
  manifestEntryCounts[suite.key] = entries.length;

  for (const entry of entries) {
    const id = entry.value.match(/#([^#]+)$/u)?.[1];
    if (!id) {
      throw new Error("A W3C N-Triples manifest entry has no fragment ID");
    }
    const type = typeNames.get(objectFor(quads, entry, `${RDF}type`)?.value);
    if (!type) {
      throw new Error(`Unsupported W3C N-Triples test type for ${id}`);
    }
    const actionTerm = objectFor(quads, entry, `${MF}action`);
    const action = relativeReference(actionTerm, assumedBase, "mf:action");
    tests.push({
      action,
      baseIRI: actionTerm.value,
      id,
      source: await readFile(new URL(action, suite.inputUrl), "utf8"),
      suite: suite.key,
      type,
    });
  }
}

const identities = tests.map(({ id, suite }) => `${suite}:${id}`);
if (new Set(identities).size !== tests.length) {
  throw new Error(
    "The classified W3C N-Triples test identities are not unique",
  );
}

const count = (type) => tests.filter((test) => test.type === type).length;
const counts = {
  negativeSyntax: count("NEGATIVE_SYNTAX"),
  positiveSyntax: count("POSITIVE_SYNTAX"),
  required: tests.length,
};
if (
  counts.negativeSyntax !== 51 ||
  counts.positiveSyntax !== 48 ||
  counts.required !== 99
) {
  throw new Error(
    `Unexpected classified W3C N-Triples counts: ${JSON.stringify(counts)}`,
  );
}

const classifications = JSON.parse(await readFile(CLASSIFICATIONS_URL, "utf8"));
const classification = classifications.manifests.find(
  ({ id }) => id === "w3c-rdf-tests.ntriples",
);
if (!classification) {
  throw new Error("Missing w3c-rdf-tests.ntriples classification manifest");
}
Object.assign(classification, {
  entries: tests.map(({ action, id, suite, type }) => ({
    action,
    classification: "REQUIRED",
    id,
    sourceManifest: suite,
    testType: type,
  })),
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
  runner: "internal/parsing/ntriples/nTriples.conformance.test.js",
  runnerParsingPolicy:
    "Every positive-syntax case must parse at the exact N-Triples syntax seam and produce only default-graph RDF/JS quads; every negative-syntax case must reject before RDF-to-OWL reconstruction.",
  runnerScope:
    "Exercise the exact-format N-Triples syntax-to-RDF/JS boundary independently for the pinned RDF 1.1 manifest and RDF 1.2 syntax manifest; OWL reconstruction remains separately governed by the shared RDF-to-OWL translator.",
  sourceTestCount: counts.required,
});

await writeFile(CLASSIFICATIONS_URL, await formatJson(classifications), "utf8");
await writeFile(
  FIXTURE_URL,
  await formatJson({
    counts,
    generatedBy: "util/generate-w3c-ntriples-fixtures.mjs",
    manifests: manifestHashes,
    revision: REVISION,
    schemaVersion: 1,
    tests,
  }),
  "utf8",
);

process.stdout.write(
  `Generated ${counts.required} W3C N-Triples fixtures (${counts.positiveSyntax} positive syntax, ${counts.negativeSyntax} negative syntax).\n`,
);
