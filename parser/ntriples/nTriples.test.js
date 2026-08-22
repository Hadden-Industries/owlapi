import {
  OWLDocumentFormats,
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../io/index.js";
import { OWLManager } from "../../manager/index.js";
import { OWLObjectKind } from "../../model/index.js";
import owl2vowl from "../../../owl2vowl/js/index.js";

import { detectNTriples, nTriplesParserDescriptor } from "./descriptor.js";

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const OWL = "http://www.w3.org/2002/07/owl#";
const source = (text, options) => new StringDocumentSource(text, options);

describe("N-Triples parser descriptor", () => {
  it.each([
    [
      "MATCH",
      "NTRIPLES_TRIPLE",
      "# leading comment\n<urn:test:s> <urn:test:p> <urn:test:o> .",
    ],
    ["MATCH", "NTRIPLES_TRIPLE", '_:subject <urn:test:p> "value"@en .'],
    ["NO_MATCH", "NTRIPLES_TURTLE_DIRECTIVE", "@prefix ex: <urn:test:> ."],
    [
      "NO_MATCH",
      "NTRIPLES_NQUADS_STATEMENT",
      "<urn:s> <urn:p> <urn:o> <urn:graph> .",
    ],
    [
      "NO_MATCH",
      "NTRIPLES_NQUADS_STATEMENT",
      "<urn:s> <urn:p> <<( <urn:quoted-s> <urn:quoted-p> <urn:quoted-o> )>> <urn:graph> .",
    ],
    [
      "NO_MATCH",
      "NTRIPLES_SIGNATURE_ABSENT",
      '<?xml version="1.0"?>\n<rdf:RDF>\n<owl:Class rdf:about="urn:test:A"/>\n</rdf:RDF>',
    ],
    [
      "NO_MATCH",
      "NTRIPLES_SIGNATURE_ABSENT",
      "<!-- vocabulary -->\n<rdf:RDF>\n</rdf:RDF>",
    ],
    ["NO_MATCH", "NTRIPLES_SIGNATURE_ABSENT", "ex:s ex:p ex:o ."],
    ["NO_MATCH", "NTRIPLES_SIGNATURE_ABSENT", "Ontology(<urn:test:o>)"],
    ["INDETERMINATE", "NTRIPLES_EMPTY", "# comments only\n"],
  ])("returns %s with %s", (result, reasonCode, text) => {
    expect(detectNTriples(source(text))).toMatchObject({ reasonCode, result });
  });

  it("publishes a distinct immutable exact-format descriptor", () => {
    expect(nTriplesParserDescriptor).toMatchObject({
      format: OWLDocumentFormats.N_TRIPLES,
      id: "ntriples",
      supportsCompatibleRecovery: false,
    });
    expect(Object.isFrozen(nTriplesParserDescriptor)).toBe(true);
  });
});

describe("N-Triples manager integration", () => {
  it("loads the exact N-Triples format through the shared RDF translator", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(
      source(
        `<urn:test:ontology> <${RDF}type> <${OWL}Ontology> .
         <urn:test:A> <${RDF}type> <${OWL}Class> .`,
        { documentIRI: "https://example.com/root.nt", fileName: "root.nt" },
      ),
      new OWLOntologyLoaderConfiguration({
        format: OWLDocumentFormats.N_TRIPLES,
      }),
    );

    expect(ontology.getOntologyID().ontologyIRI.value).toBe(
      "urn:test:ontology",
    );
    expect(
      ontology.getAxiomsByType(OWLObjectKind.DECLARATION_AXIOM),
    ).toHaveProperty("size", 1);
  });

  it("auto-detects the narrower syntax before Turtle", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const result = await manager.loadOntologyGraphFromOntologyDocument(
      source(`<urn:test:A> <${RDF}type> <${OWL}Class> .`, {
        documentIRI: "https://example.com/root.nt",
        fileName: "root.nt",
      }),
    );

    expect(result.documents[0].context).toMatchObject({
      format: OWLDocumentFormats.N_TRIPLES,
      prefixes: {},
    });
  });

  it("loads N-Triples inside a Functional Syntax import closure", async () => {
    const manager = OWLManager.createOWLOntologyManager({
      documentLoader: {
        async load() {
          return `<urn:test:Imported> <${RDF}type> <${OWL}Class> .`;
        },
      },
    });
    const result = await manager.loadOntologyGraphFromOntologyDocument(
      "Ontology(<urn:test:root> Import(<urn:test:imported>))",
    );

    const imported = result.documents.find(
      ({ context }) => context.format === OWLDocumentFormats.N_TRIPLES,
    );
    expect(result.documents).toHaveLength(2);
    expect(imported).toBeDefined();
    expect(
      [...imported.ontology.getClassesInSignature()].map(
        ({ iri }) => iri.value,
      ),
    ).toContain("urn:test:Imported");
  });

  it("feeds the production VOWL builder without a legacy parser", async () => {
    const result = await owl2vowl(
      `<urn:test:Person> <${RDF}type> <${OWL}Class> .`,
      {
        documentIRI: "https://example.com/ontology.nt",
        fileName: "ontology.nt",
      },
    );

    expect(result.classAttribute.map(({ iri }) => iri)).toEqual([
      "urn:test:Person",
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  it("keeps later N3.js-backed dataset formats unregistered", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const document = source("<urn:s> <urn:p> <urn:o> <urn:g> .");

    for (const format of [
      OWLDocumentFormats.N_QUADS,
      OWLDocumentFormats.TRIG,
    ]) {
      await expect(
        manager.loadOntologyFromOntologyDocument(
          document,
          new OWLOntologyLoaderConfiguration({ format }),
        ),
      ).rejects.toThrow(`No parser is registered for format: ${format.key}`);
    }
  });
});
