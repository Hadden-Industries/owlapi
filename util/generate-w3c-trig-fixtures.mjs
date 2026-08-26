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
  "../.phase14-input/w3c-rdf-tests/rdf/",
  import.meta.url,
);
const CLASSIFICATIONS_URL = new URL(
  "../docs/conformance/classification-manifests.json",
  import.meta.url,
);
const FIXTURE_URL = new URL(
  "../docs/conformance/generated/w3c-trig.json",
  import.meta.url,
);
const N3JS_RDF12_EVALUATION_GAPS = new Set([
  // Keep this list exact: every entry was rerun after the N3.js 2.3.0 update,
  // and all other formerly excluded RDF 1.2 evaluation cases now pass.
  "rdf12Eval:trig12-rt-07",
  "rdf12Eval:trig12-rt-08",
  "rdf12Eval:trig12-annotation-03",
  "rdf12Eval:trig12-annotation-04",
  "rdf12Eval:trig12-annotation-09",
]);
const RDF12_GAP_REASON =
  "N3.js 2.3.0 does not yet reproduce the pinned RDF 1.2 TriG reifier/annotation evaluation result; the case remains inventoried for dependency replacement or an upstream fix.";

const inputUrl = process.argv[2]
  ? pathToFileURL(`${resolve(process.argv[2])}${sep}`)
  : DEFAULT_INPUT_URL;

const suites = [
  {
    archiveUrl: new URL(
      "../docs/conformance/upstream/w3c-rdf-tests/rdf/rdf11/rdf-trig/manifest.ttl",
      import.meta.url,
    ),
    expectedCount: 357,
    expectedSha256:
      "151cee87899fe6efc049c4ea606c5ea44a7074469e147df8e56df67b69e87ae2",
    inputUrl: new URL("rdf11/rdf-trig/", inputUrl),
    key: "rdf11",
    manifestPath: "rdf/rdf11/rdf-trig/manifest.ttl",
  },
  {
    archiveUrl: new URL(
      "../docs/conformance/upstream/w3c-rdf-tests/rdf/rdf12/rdf-trig/syntax/manifest.ttl",
      import.meta.url,
    ),
    expectedCount: 35,
    expectedSha256:
      "dd7edf4f760dc6c30fff3ed874ac1796130a253ebe4abaf37f8ac6b3721f0086",
    inputUrl: new URL("rdf12/rdf-trig/syntax/", inputUrl),
    key: "rdf12Syntax",
    manifestPath: "rdf/rdf12/rdf-trig/syntax/manifest.ttl",
  },
  {
    archiveUrl: new URL(
      "../docs/conformance/upstream/w3c-rdf-tests/rdf/rdf12/rdf-trig/eval/manifest.ttl",
      import.meta.url,
    ),
    expectedCount: 26,
    expectedSha256:
      "e341c4f3a810602ca7c26a677735740d5409298d7dba22782b03e878ff41a9d5",
    inputUrl: new URL("rdf12/rdf-trig/eval/", inputUrl),
    key: "rdf12Eval",
    manifestPath: "rdf/rdf12/rdf-trig/eval/manifest.ttl",
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
    throw new Error("The W3C TriG manifest has no mf:entries collection");
  }
  const entries = [];
  const visited = new Set();
  let node = head;
  while (node.value !== `${RDF}nil`) {
    const key = `${node.termType}:${node.value}`;
    if (visited.has(key)) {
      throw new Error("The W3C TriG manifest entries form a cyclic list");
    }
    visited.add(key);
    const entry = objectFor(quads, node, `${RDF}first`);
    const rest = objectFor(quads, node, `${RDF}rest`);
    if (!entry || !rest) {
      throw new Error("The W3C TriG manifest entries list is incomplete");
    }
    entries.push(entry);
    node = rest;
  }
  return entries;
};

const typeNames = new Map([
  [`${RDFT}TestTrigEval`, "EVALUATION"],
  [`${RDFT}TestTrigPositiveSyntax`, "POSITIVE_SYNTAX"],
  [`${RDFT}TestTrigNegativeSyntax`, "NEGATIVE_SYNTAX"],
]);

const relativeReference = (term, assumedBase, predicate) => {
  if (term?.termType !== "NamedNode" || !term.value.startsWith(assumedBase)) {
    throw new Error(`Unexpected ${predicate} IRI in W3C TriG manifest`);
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
      `Unexpected ${suite.key} W3C TriG manifest SHA-256: ${manifestSha256}`,
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
    throw new Error(`${suite.key} W3C TriG manifest has no assumed base`);
  }
  const quads = new N3Parser({
    baseIRI: new URL("manifest.ttl", assumedBase).href,
    format: "text/turtle",
  }).parse(manifestText);
  const entries = manifestEntries(quads);
  if (entries.length !== suite.expectedCount) {
    throw new Error(
      `Unexpected ${suite.key} W3C TriG inventory: ${entries.length}`,
    );
  }
  manifestEntryCounts[suite.key] = entries.length;

  for (const entry of entries) {
    const id = entry.value.match(/#([^#]+)$/u)?.[1];
    if (!id) {
      throw new Error("A W3C TriG manifest entry has no fragment ID");
    }
    const type = typeNames.get(objectFor(quads, entry, `${RDF}type`)?.value);
    if (!type) {
      throw new Error(`Unsupported W3C TriG test type for ${id}`);
    }
    const actionTerm = objectFor(quads, entry, `${MF}action`);
    const action = relativeReference(actionTerm, assumedBase, "mf:action");
    const source = await readFile(new URL(action, suite.inputUrl), "utf8");
    const classification = N3JS_RDF12_EVALUATION_GAPS.has(`${suite.key}:${id}`)
      ? "EXCLUDED_WITH_REASON"
      : "REQUIRED";
    const test = {
      action,
      baseIRI: actionTerm.value,
      classification,
      ...(classification === "REQUIRED"
        ? {}
        : {
            exclusionReason: RDF12_GAP_REASON,
            reasonCategory: "N3JS_RDF12_TRIG_EVALUATION_GAP",
          }),
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
        format: "N-Quads",
      })
        .parse(expectedText)
        .map(encodeQuad)
        .sort((left, right) =>
          JSON.stringify(left).localeCompare(JSON.stringify(right), "en"),
        );
      test.result = result;
    } else if (resultTerm) {
      throw new Error(`Non-evaluation W3C TriG test ${id} has a result`);
    }
    tests.push(test);
  }
}

const identities = tests.map(({ id, suite }) => `${suite}:${id}`);
if (new Set(identities).size !== tests.length) {
  throw new Error("The classified W3C TriG test identities are not unique");
}
const duplicateIds = new Set(
  tests
    .map(({ id }) => id)
    .filter((id, index, ids) => ids.indexOf(id) !== ids.lastIndexOf(id)),
);
for (const test of tests) {
  if (duplicateIds.has(test.id)) {
    // The RDF 1.2 syntax and evaluation manifests reuse two fragment IDs.
    // Preserve both source identities rather than collapsing either entry.
    test.id = `${test.suite}:${test.id}`;
  }
}

const count = (type) => tests.filter((test) => test.type === type).length;
const counts = {
  evaluation: count("EVALUATION"),
  excluded: tests.filter(
    ({ classification }) => classification === "EXCLUDED_WITH_REASON",
  ).length,
  negativeSyntax: count("NEGATIVE_SYNTAX"),
  positiveSyntax: count("POSITIVE_SYNTAX"),
  required: tests.filter(({ classification }) => classification === "REQUIRED")
    .length,
  source: tests.length,
};
if (
  counts.evaluation !== 169 ||
  counts.excluded !== 5 ||
  counts.negativeSyntax !== 126 ||
  counts.positiveSyntax !== 123 ||
  counts.required !== 413 ||
  counts.source !== 418
) {
  throw new Error(
    `Unexpected classified W3C TriG counts: ${JSON.stringify(counts)}`,
  );
}

const classifications = JSON.parse(await readFile(CLASSIFICATIONS_URL, "utf8"));
const classification = classifications.manifests.find(
  ({ id }) => id === "w3c-rdf-tests.trig",
);
if (!classification) {
  throw new Error("Missing w3c-rdf-tests.trig classification manifest");
}
Object.assign(classification, {
  entries: tests.map(
    ({ action, classification, id, reasonCategory, result, suite, type }) => ({
      action,
      classification,
      id,
      ...(reasonCategory === undefined ? {} : { reasonCategory }),
      ...(result === undefined ? {} : { result }),
      sourceManifest: suite,
      testType: type,
    }),
  ),
  evaluationTestCount: counts.evaluation,
  excludedReasonCategories: {
    N3JS_RDF12_TRIG_EVALUATION_GAP: RDF12_GAP_REASON,
  },
  excludedTestCount: counts.excluded,
  localManifestArtifacts: suites.map(
    ({ manifestPath }) =>
      `docs/conformance/upstream/w3c-rdf-tests/${manifestPath}`,
  ),
  manifestEntryCount: counts.source,
  manifestEntryCounts,
  manifestSha256: manifestHashes,
  negativeSyntaxTestCount: counts.negativeSyntax,
  positiveSyntaxTestCount: counts.positiveSyntax,
  requiredTestCount: counts.required,
  revision: REVISION,
  runner: "internal/parsing/trig/trig.conformance.test.js",
  runnerParsingPolicy:
    "Every RDF 1.1 and RDF 1.2 evaluation case must produce a canonical RDF/JS dataset graph-isomorphic to its N-Quads result; every positive-syntax case must parse at the exact TriG syntax seam; every negative-syntax case must reject before graph selection or RDF-to-OWL reconstruction.",
  runnerScope:
    "Exercise the exact-format TriG syntax-to-RDF/JS boundary independently for the pinned RDF 1.1 manifest and RDF 1.2 syntax and evaluation manifests; OWL reconstruction remains separately governed by the shared RDF-to-OWL translator.",
  sourceTestCount: counts.source,
});

await writeFile(CLASSIFICATIONS_URL, await formatJson(classifications), "utf8");
await writeFile(
  FIXTURE_URL,
  await formatJson({
    counts,
    generatedBy: "util/generate-w3c-trig-fixtures.mjs",
    manifests: manifestHashes,
    revision: REVISION,
    schemaVersion: 1,
    tests,
  }),
  "utf8",
);

process.stdout.write(
  `Generated ${counts.source} W3C TriG fixtures (${counts.required} required, ${counts.excluded} excluded with reason).\n`,
);
