import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../../index.js";
import { OWLManager } from "../../../index.js";

const FIXTURE_ROOT = new URL(
  "../../../util/owlapi-reference/fixtures/dl/",
  import.meta.url,
);
const FIXTURE_SHA256 = Object.freeze({
  dl: "9f649a0d9a7ca149c7b07fd54a64ca0b3999fc066bb2283a4263a6007655466e",
  functional:
    "4cca45b5da6f195d02c3b1346285a32199337d498a7598e92af7d3e40d692b03",
  java: "4054ff3b7659f61af47cf8ae2cfdc8e06c69911c58e35cc381ff1073f04de45f",
  rdfxml: "afca58de24642031be02ae8b33f69d0118c5dc853f2a48a8261fe4bca272fadc",
  turtle: "9d3e30b4ac77bafd8a350ca0b4555d650ddb57d615e838d31aee03cd454af123",
});

const hash = (fileName) =>
  createHash("sha256")
    .update(readFileSync(new URL(fileName, FIXTURE_ROOT)))
    .digest("hex");

describe("project-owned OWLAPI DL dialect conformance", () => {
  it("pins the complete cross-format and Java-oracle fixture set", () => {
    expect({
      dl: hash("phase10-structural.dl"),
      functional: hash("phase10-structural.ofn"),
      java: hash("phase10-structural.java.json"),
      rdfxml: hash("phase10-structural.rdf"),
      turtle: hash("phase10-structural.ttl"),
    }).toEqual(FIXTURE_SHA256);
  });

  it("loads the pinned DL document in strict mode without recovery", async () => {
    const ontology =
      await OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
        new StringDocumentSource(
          readFileSync(new URL("phase10-structural.dl", FIXTURE_ROOT), "utf8"),
          {
            documentIRI: "urn:test:phase10",
            fileName: "phase10-structural.dl",
          },
        ),
        new OWLOntologyLoaderConfiguration({
          format: "dl",
          parsingMode: "strict",
        }),
      );
    const oracle = JSON.parse(
      readFileSync(
        new URL("phase10-structural.java.json", FIXTURE_ROOT),
        "utf8",
      ),
    );

    expect(ontology.getAxioms()).toHaveProperty(
      "size",
      oracle.snapshot.axioms.length,
    );
  });
});
