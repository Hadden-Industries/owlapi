import {
  OWLDocumentFormats,
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../io/index.js";
import { OWLManager } from "../../manager/index.js";
import { IRI, OWLObjectKind } from "../../model/index.js";

import { detectRdfXml, rdfXmlParserDescriptor } from "./descriptor.js";

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
const OWL = "http://www.w3.org/2002/07/owl#";

const configuration = (values) => new OWLOntologyLoaderConfiguration(values);
const source = (text, options) => new StringDocumentSource(text, options);

const ontologyDocument = ({
  body = "",
  imports,
  ontologyIRI = "urn:test:ontology",
} = {}) => `
  <rdf:RDF
    xmlns:rdf="${RDF}"
    xmlns:rdfs="${RDFS}"
    xmlns:owl="${OWL}"
    xmlns:ex="urn:test:"
  >
    <owl:Ontology rdf:about="${ontologyIRI}">
      ${imports ? `<owl:imports rdf:resource="${imports}"/>` : ""}
      <rdfs:label xml:lang="en">RDF/XML ontology</rdfs:label>
    </owl:Ontology>
    ${body}
  </rdf:RDF>
`;

describe("RDF/XML parser descriptor", () => {
  it.each([
    {
      expected: "MATCH",
      reasonCode: "RDFXML_RDF_ROOT",
      text: `<rdf:RDF xmlns:rdf="${RDF}"/>`,
    },
    {
      expected: "NO_MATCH",
      reasonCode: "RDFXML_OWLXML_ROOT",
      text: `<Ontology xmlns="${OWL}"/>`,
    },
    {
      expected: "INDETERMINATE",
      reasonCode: "RDFXML_NODE_ROOT_POSSIBLE",
      text: `<owl:Class xmlns:owl="${OWL}" xmlns:rdf="${RDF}" rdf:about="urn:test:A"/>`,
    },
    {
      expected: "NO_MATCH",
      reasonCode: "RDFXML_NOT_XML",
      text: "Ontology(<urn:test:ontology>)",
    },
    {
      expected: "INDETERMINATE",
      reasonCode: "RDFXML_ROOT_INDETERMINATE",
      text: '<?xml version="1.0"?><rdf:RDF',
    },
  ])("returns $expected with $reasonCode", ({ expected, reasonCode, text }) => {
    expect(detectRdfXml(source(text))).toMatchObject({
      reasonCode,
      result: expected,
    });
  });

  it("publishes immutable RDF/XML metadata without compatible recovery", () => {
    expect(rdfXmlParserDescriptor).toMatchObject({
      format: OWLDocumentFormats.RDF_XML,
      id: "rdf-xml",
      supportsCompatibleRecovery: false,
    });
    expect(Object.isFrozen(rdfXmlParserDescriptor)).toBe(true);
  });
});

describe("RDF/XML manager integration", () => {
  it("loads RDF/XML through the default manager and shared RDF translator", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(
      source(
        ontologyDocument({
          body: `
            <owl:Class rdf:about="urn:test:A">
              <rdfs:subClassOf rdf:resource="urn:test:B"/>
            </owl:Class>
            <owl:Class rdf:about="urn:test:B"/>
          `,
        }),
        {
          contentType: "application/rdf+xml",
          documentIRI: "https://example.com/ontologies/root.rdf",
          fileName: "root.rdf",
        },
      ),
    );

    expect(ontology.getOntologyID().ontologyIRI.value).toBe(
      "urn:test:ontology",
    );
    expect([...ontology.getAnnotations()][0]).toMatchObject({
      property: { iri: { value: `${RDFS}label` } },
      value: { language: "en", lexicalForm: "RDF/XML ontology" },
    });
    expect(new Set([...ontology.getAxioms()].map(({ kind }) => kind))).toEqual(
      new Set([
        OWLObjectKind.DECLARATION_AXIOM,
        OWLObjectKind.SUBCLASS_OF_AXIOM,
      ]),
    );
    expect(
      [...ontology.getClassesInSignature()].map(({ iri }) => iri.value).sort(),
    ).toEqual(["urn:test:A", "urn:test:B"]);
  });

  it("accepts an RDF node element as the document root", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(
      `<owl:Class xmlns:owl="${OWL}" xmlns:rdf="${RDF}" rdf:about="urn:test:TypedRoot"/>`,
    );

    expect(
      [...ontology.getClassesInSignature()].map(({ iri }) => iri.value),
    ).toEqual(["urn:test:TypedRoot"]);
  });

  it("supports explicit RDF/XML selection and an empty anonymous ontology", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(
      `<rdf:RDF xmlns:rdf="${RDF}"/>`,
      configuration({ format: OWLDocumentFormats.RDF_XML }),
    );

    expect(ontology.getOntologyID().ontologyIRI).toBeUndefined();
    expect(ontology.getOntologyID().versionIRI).toBeUndefined();
    expect(ontology.getAxioms()).toEqual(new Set());
  });

  it("loads and registers an RDF/XML import closure", async () => {
    const importedIRI = IRI.create("urn:test:imported");
    let loadCalls = 0;
    const manager = OWLManager.createOWLOntologyManager({
      documentLoader: {
        load(documentIRI) {
          loadCalls += 1;
          expect(documentIRI).toEqual(importedIRI);
          return ontologyDocument({
            body: `<owl:Class rdf:about="urn:test:ImportedClass"/>`,
            ontologyIRI: importedIRI.value,
          });
        },
      },
    });

    const root = await manager.loadOntologyFromOntologyDocument(
      ontologyDocument({ imports: importedIRI.value }),
    );

    expect(root.getImportsDeclarations()).toHaveProperty("size", 1);
    expect(loadCalls).toBe(1);
    expect(
      manager.getOntology(
        manager.getOWLDataFactory().getOWLOntologyID(importedIRI),
      ),
    ).toBeDefined();
  });

  it("rolls back manager state when RDF/XML parsing fails", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontologyIRI = IRI.create("urn:test:transactional-rdfxml");

    await expect(
      manager.loadOntologyFromOntologyDocument(
        source(
          ontologyDocument({ ontologyIRI: ontologyIRI.value }).replace(
            "</rdf:RDF>",
            "",
          ),
          { fileName: "broken.rdf" },
        ),
      ),
    ).rejects.toMatchObject({ code: "XML_PARSE_ERROR" });
    expect(
      manager.getOntology(
        manager.getOWLDataFactory().getOWLOntologyID(ontologyIRI),
      ),
    ).toBeUndefined();
  });
});
