import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../io/index.js";
import { OWLManager } from "../../manager/index.js";
import { AXIOM_KINDS } from "../../model/index.js";

const MANCHESTER_FIXTURE_URL = new URL(
  "../../../../util/owlapi-reference/fixtures/manchester/phase3-structural.omn",
  import.meta.url,
);
const FUNCTIONAL_FIXTURE_URL = new URL(
  "../../../../util/owlapi-reference/fixtures/manchester/phase3-structural.ofn",
  import.meta.url,
);
const FIXTURE_SHA256 = Object.freeze({
  functional:
    "a5e59f739bd7adcb7320b59dd3e2018e9342e1969e1c3cdc40897eb06d3d58ee",
  manchester:
    "1228427c7788fb6c71977eafdd74afb344e28de8c72b14a48efcc2261750cbf7",
});

const structuralKeys = (values) =>
  [...values].map((value) => value.structuralKey()).sort();

const load = async (text, fileName) => {
  const manager = OWLManager.createOWLOntologyManager();
  return manager.loadOntologyFromOntologyDocument(
    new StringDocumentSource(text, {
      documentIRI: "urn:owlapi-js:phase3:fixture-document",
      fileName,
    }),
    new OWLOntologyLoaderConfiguration({
      missingImportHandling: "diagnostic",
    }),
  );
};

describe("W3C Manchester grammar mapping conformance", () => {
  it("pins the project-owned Manchester and Functional structural pair", () => {
    const manchester = readFileSync(MANCHESTER_FIXTURE_URL);
    const functional = readFileSync(FUNCTIONAL_FIXTURE_URL);

    expect(createHash("sha256").update(manchester).digest("hex")).toBe(
      FIXTURE_SHA256.manchester,
    );
    expect(createHash("sha256").update(functional).digest("hex")).toBe(
      FIXTURE_SHA256.functional,
    );
  });

  it("maps the Manchester grammar pair to the same structural ontology", async () => {
    const manchester = await load(
      readFileSync(MANCHESTER_FIXTURE_URL, "utf8"),
      "phase3-structural.omn",
    );
    const functional = await load(
      readFileSync(FUNCTIONAL_FIXTURE_URL, "utf8"),
      "phase3-structural.ofn",
    );

    expect(manchester.getOntologyID()).toEqual(functional.getOntologyID());
    expect(structuralKeys(manchester.getImportsDeclarations())).toEqual(
      structuralKeys(functional.getImportsDeclarations()),
    );
    expect(structuralKeys(manchester.getAnnotations())).toEqual(
      structuralKeys(functional.getAnnotations()),
    );
    expect(structuralKeys(manchester.getAxioms())).toEqual(
      structuralKeys(functional.getAxioms()),
    );
    expect([...manchester.getAxioms()].map(({ kind }) => kind).sort()).toEqual(
      expect.arrayContaining([...AXIOM_KINDS].sort()),
    );
  });
});
