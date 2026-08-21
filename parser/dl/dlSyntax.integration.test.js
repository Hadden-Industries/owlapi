import { readFileSync } from "node:fs";

import owl2vowl from "../../../owl2vowl/js/index.js";
import { OWLDocumentFormats, StringDocumentSource } from "../../io/index.js";
import { OWLManager } from "../../manager/index.js";
import { OWLObjectKind } from "../../model/index.js";

describe("OWL DL Syntax integration", () => {
  it("is detected and loaded by the default public ontology manager", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const result = await manager.loadOntologyGraphFromOntologyDocument(
      new StringDocumentSource("Person ⊑ Agent\n", {
        documentIRI: "urn:test:dl-integration",
        fileName: "ontology.dl",
      }),
    );

    expect(result.documents[0].context.format).toBe(OWLDocumentFormats.DL);
    expect(
      result.ontology.getAxiomsByType(OWLObjectKind.SUBCLASS_OF_AXIOM).size,
    ).toBe(1);
  });

  it("loads a DL document in a Functional Syntax import closure", async () => {
    const manager = OWLManager.createOWLOntologyManager({
      documentLoader: {
        async load() {
          return "Imported ⊑ Concept\n";
        },
      },
    });
    const result = await manager.loadOntologyGraphFromOntologyDocument(
      "Ontology(<urn:test:root> Import(<urn:test:imported>))",
    );
    const imported = result.documents.find(
      ({ context }) => context.format === OWLDocumentFormats.DL,
    );
    const [axiom] = imported.ontology.getAxioms();

    expect(result.documents).toHaveLength(2);
    expect(axiom.subClass.iri.value).toBe("urn:test:imported#Imported");
    expect(axiom.superClass.iri.value).toBe("urn:test:imported#Concept");
  });

  it("feeds the production VOWL builder without a legacy parser path", async () => {
    const result = await owl2vowl("Person ⊑ Agent\n", {
      documentIRI: "https://example.com/dl-ontology",
      fileName: "ontology.dl",
    });
    const classIris = result.classAttribute.map(({ iri }) => iri).sort();

    expect(classIris).toEqual([
      "https://example.com/dl-ontology#Agent",
      "https://example.com/dl-ontology#Person",
    ]);
  });

  it("converts the complete Phase 10 structural fixture through WebVOWL", async () => {
    const result = await owl2vowl(
      readFileSync(
        new URL(
          "../../../../util/owlapi-reference/fixtures/dl/phase10-structural.dl",
          import.meta.url,
        ),
        "utf8",
      ),
      {
        documentIRI: "urn:test:phase10",
        fileName: "phase10-structural.dl",
      },
    );
    const classIris = result.classAttribute.map(({ iri }) => iri);
    const propertyIris = result.propertyAttribute
      .map(({ iri }) => iri)
      .filter(Boolean);

    expect(classIris).toEqual(
      expect.arrayContaining([
        "urn:test:phase10#Agent",
        "urn:test:phase10#Parent",
        "urn:test:phase10#Person",
      ]),
    );
    expect(propertyIris).toEqual(
      expect.arrayContaining([
        "urn:test:phase10#hasChild",
        "urn:test:phase10#hasFriend",
        "urn:test:phase10#hasParent",
        "urn:test:phase10#related",
      ]),
    );
    expect(result.diagnostics).toEqual([]);
  });
});
