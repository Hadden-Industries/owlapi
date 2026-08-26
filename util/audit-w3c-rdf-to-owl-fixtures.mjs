import { readFile } from "node:fs/promises";

import { OWLOntologyLoaderConfiguration } from "../io/index.js";
import { IRI } from "../model/index.js";
import { RdfToOwlTranslator } from "../internal/mapping/rdfToOwlTranslator.js";
import {
  rdfDataFactory,
  rdfDatasetFactory,
} from "../internal/rdfjs/environment.js";

const FIXTURE_URL = new URL(
  "../docs/conformance/generated/w3c-owl2-rdf-to-owl.json",
  import.meta.url,
);

const decodeTerm = ([type, value, language, datatype]) => {
  if (type === "N") {
    return rdfDataFactory.namedNode(value);
  }
  if (type === "B") {
    return rdfDataFactory.blankNode(value);
  }
  if (type === "L") {
    return language
      ? rdfDataFactory.literal(value, language)
      : rdfDataFactory.literal(value, rdfDataFactory.namedNode(datatype));
  }
  throw new TypeError(`Unknown term encoding: ${type}`);
};

const constructDataset = ({ quads }) =>
  rdfDatasetFactory.dataset(
    quads.map(([subject, predicate, object]) =>
      rdfDataFactory.quad(
        decodeTerm(subject),
        decodeTerm(predicate),
        decodeTerm(object),
      ),
    ),
  );

const fixture = JSON.parse(await readFile(FIXTURE_URL, "utf8"));
const caseFilter = process.argv
  .find((argument) => argument.startsWith("--case="))
  ?.slice("--case=".length);
const parsingMode = process.argv.includes("--strict") ? "strict" : "compatible";
const configuration = new OWLOntologyLoaderConfiguration({ parsingMode });
const failures = new Map();
const diagnostics = new Map();
const documentDiagnostics = [];
let passed = 0;

for (const document of fixture.documents.filter(
  ({ caseId }) => caseFilter === undefined || caseId === caseFilter,
)) {
  try {
    const result = await new RdfToOwlTranslator().translate(
      constructDataset(document),
      {
        configuration,
        documentIRI: IRI.create(document.baseIRI),
      },
    );
    passed += 1;
    if (result.context.diagnostics.length > 0) {
      const predicateCounts = Object.create(null);
      for (const { predicate } of result.context.diagnostics) {
        predicateCounts[predicate || "(none)"] =
          (predicateCounts[predicate || "(none)"] || 0) + 1;
      }
      documentDiagnostics.push({
        caseId: document.caseId,
        diagnosticCount: result.context.diagnostics.length,
        diagnostics: caseFilter ? result.context.diagnostics : undefined,
        predicateCounts,
        property: document.property,
      });
    }
    for (const diagnostic of result.context.diagnostics) {
      const key = `${diagnostic.code}\u0000${diagnostic.predicate || ""}`;
      const entry = diagnostics.get(key) || {
        code: diagnostic.code,
        count: 0,
        predicate: diagnostic.predicate,
        samples: [],
      };
      entry.count += 1;
      if (entry.samples.length < 5) {
        entry.samples.push(`${document.caseId} / ${document.property}`);
      }
      diagnostics.set(key, entry);
    }
  } catch (error) {
    const key = `${error.code || error.name}\u0000${error.message}`;
    const entry = failures.get(key) || {
      code: error.code || error.name,
      count: 0,
      message: error.message,
      samples: [],
    };
    entry.count += 1;
    if (entry.samples.length < 10) {
      entry.samples.push(`${document.caseId} / ${document.property}`);
    }
    failures.set(key, entry);
  }
}

process.stdout.write(
  `${JSON.stringify(
    {
      diagnosticGroups: [...diagnostics.values()].sort(
        (left, right) => right.count - left.count,
      ),
      documentDiagnostics: process.argv.includes("--details")
        ? documentDiagnostics
        : undefined,
      failureGroups: [...failures.values()].sort(
        (left, right) => right.count - left.count,
      ),
      parsingMode,
      passed,
      total: caseFilter
        ? fixture.documents.filter(({ caseId }) => caseId === caseFilter).length
        : fixture.documents.length,
    },
    null,
    2,
  )}\n`,
);
