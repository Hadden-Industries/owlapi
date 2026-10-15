import { suiteRevision } from "./conformance/suiteRevision.mjs";
import { readW3cSource } from "./conformance/w3cSource.mjs";
import { MF, RDF, RDFT } from "./conformance/fixtureTerms.mjs";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { Parser as N3Parser } from "n3";
import { formatConformanceJson as formatJson } from "./conformance/jsonPresentation.mjs";

const REVISION = suiteRevision("w3c-rdf-tests", "N-Quads");

const DEFAULT_INPUT_URL = new URL(
  "../.phase13-input/w3c-rdf-tests/rdf/",
  import.meta.url,
);
const CLASSIFICATIONS_URL = new URL(
  "../docs/conformance/classification-manifests.json",
  import.meta.url,
);
const FIXTURE_URL = new URL(
  "../docs/conformance/generated/w3c-nquads.json",
  import.meta.url,
);

const inputUrl = process.argv[2]
  ? pathToFileURL(`${resolve(process.argv[2])}${sep}`)
  : DEFAULT_INPUT_URL;

const suites = [
  {
    assumedBase: "https://w3c.github.io/rdf-tests/rdf/rdf11/rdf-n-quads/",
    archiveUrl: new URL(
      "../docs/conformance/upstream/w3c-rdf-tests/rdf/rdf11/rdf-n-quads/manifest.ttl",
      import.meta.url,
    ),
    expectedCount: 87,
    expectedSha256:
      "4c658a4e111adff512e89ff2c39acf9195109592f54711ce06823dac544c62ca",
    inputUrl: new URL("rdf11/rdf-n-quads/", inputUrl),
    key: "rdf11",
    manifestPath: "rdf/rdf11/rdf-n-quads/manifest.ttl",
  },
  {
    assumedBase:
      "https://w3c.github.io/rdf-tests/rdf/rdf12/rdf-n-quads/syntax/",
    archiveUrl: new URL(
      "../docs/conformance/upstream/w3c-rdf-tests/rdf/rdf12/rdf-n-quads/syntax/manifest.ttl",
      import.meta.url,
    ),
    expectedCount: 27,
    expectedSha256:
      "90d06079b66e5f2d0df598cf451eeaa7b896c11f8869bec6219a40ac6b504768",
    inputUrl: new URL("rdf12/rdf-n-quads/syntax/", inputUrl),
    key: "rdf12Syntax",
    manifestPath: "rdf/rdf12/rdf-n-quads/syntax/manifest.ttl",
  },
];

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

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
    throw new Error("The W3C N-Quads manifest has no mf:entries collection");
  }
  const entries = [];
  const visited = new Set();
  let node = head;
  while (node.value !== `${RDF}nil`) {
    const key = `${node.termType}:${node.value}`;
    if (visited.has(key)) {
      throw new Error("The W3C N-Quads manifest entries form a cyclic list");
    }
    visited.add(key);
    const entry = objectFor(quads, node, `${RDF}first`);
    const rest = objectFor(quads, node, `${RDF}rest`);
    if (!entry || !rest) {
      throw new Error("The W3C N-Quads manifest entries list is incomplete");
    }
    entries.push(entry);
    node = rest;
  }
  return entries;
};

const typeNames = new Map([
  [`${RDFT}TestNQuadsPositiveSyntax`, "POSITIVE_SYNTAX"],
  [`${RDFT}TestNQuadsNegativeSyntax`, "NEGATIVE_SYNTAX"],
]);

const relativeReference = (term, assumedBase, predicate) => {
  if (term?.termType !== "NamedNode" || !term.value.startsWith(assumedBase)) {
    throw new Error(`Unexpected ${predicate} IRI in W3C N-Quads manifest`);
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
      `Unexpected ${suite.key} W3C N-Quads manifest SHA-256: ${manifestSha256}`,
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
    throw new Error(`Unexpected ${suite.key} W3C N-Quads assumed base`);
  }
  const quads = new N3Parser({
    baseIRI: new URL("manifest.ttl", assumedBase).href,
    format: "text/turtle",
  }).parse(manifestText);
  const entries = manifestEntries(quads);
  if (entries.length !== suite.expectedCount) {
    throw new Error(
      `Unexpected ${suite.key} W3C N-Quads inventory: ${entries.length}`,
    );
  }
  manifestEntryCounts[suite.key] = entries.length;

  for (const entry of entries) {
    const id = entry.value.match(/#([^#]+)$/u)?.[1];
    if (!id) {
      throw new Error("A W3C N-Quads manifest entry has no fragment ID");
    }
    const type = typeNames.get(objectFor(quads, entry, `${RDF}type`)?.value);
    if (!type) {
      throw new Error(`Unsupported W3C N-Quads test type for ${id}`);
    }
    const actionTerm = objectFor(quads, entry, `${MF}action`);
    const action = relativeReference(actionTerm, assumedBase, "mf:action");
    const source = await readW3cSource(
      new URL(action, suite.inputUrl),
      actionTerm.value,
      REVISION,
    );
    const expectedQuads =
      type === "POSITIVE_SYNTAX"
        ? new N3Parser({ format: "N-Quads" }).parse(source)
        : [];
    tests.push({
      action,
      baseIRI: actionTerm.value,
      ...(type === "POSITIVE_SYNTAX"
        ? {
            expectedGraphTermTypes: expectedQuads
              .map(({ graph }) => graph.termType)
              .sort(),
            expectedQuadCount: expectedQuads.length,
          }
        : {}),
      id,
      source,
      suite: suite.key,
      type,
    });
  }
}

const identities = tests.map(({ id, suite }) => `${suite}:${id}`);
if (new Set(identities).size !== tests.length) {
  throw new Error("The classified W3C N-Quads test identities are not unique");
}

const count = (type) => tests.filter((test) => test.type === type).length;
const counts = {
  negativeSyntax: count("NEGATIVE_SYNTAX"),
  positiveSyntax: count("POSITIVE_SYNTAX"),
  required: tests.length,
};
if (
  counts.negativeSyntax !== 54 ||
  counts.positiveSyntax !== 60 ||
  counts.required !== 114
) {
  throw new Error(
    `Unexpected classified W3C N-Quads counts: ${JSON.stringify(counts)}`,
  );
}

const classifications = JSON.parse(await readFile(CLASSIFICATIONS_URL, "utf8"));
const classification = classifications.manifests.find(
  ({ id }) => id === "w3c-rdf-tests.nquads",
);
if (!classification) {
  throw new Error("Missing w3c-rdf-tests.nquads classification manifest");
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
  runner: "internal/parsing/nquads/nQuads.conformance.test.js",
  runnerParsingPolicy:
    "Every positive-syntax case must parse at the exact N-Quads syntax seam while preserving RDF/JS graph terms; every negative-syntax case must reject before graph selection or RDF-to-OWL reconstruction.",
  runnerScope:
    "Exercise the exact-format N-Quads syntax-to-RDF/JS boundary independently for the pinned RDF 1.1 manifest and RDF 1.2 syntax manifest; dataset graph selection and OWL reconstruction remain separately governed.",
  sourceTestCount: counts.required,
});

await writeFile(CLASSIFICATIONS_URL, await formatJson(classifications), "utf8");
await writeFile(
  FIXTURE_URL,
  await formatJson({
    counts,
    generatedBy: "util/generate-w3c-nquads-fixtures.mjs",
    manifests: manifestHashes,
    revision: REVISION,
    schemaVersion: 1,
    tests,
  }),
  "utf8",
);

process.stdout.write(
  `Generated ${counts.required} W3C N-Quads fixtures (${counts.positiveSyntax} positive syntax, ${counts.negativeSyntax} negative syntax).\n`,
);
