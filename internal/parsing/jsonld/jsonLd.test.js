import {
  OWLDocumentFormats,
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../../index.js";
import { OWLManager } from "../../../index.js";
import { rdfDataFactory } from "../../rdfjs/environment.js";

import { detectJsonLd, jsonLdParserDescriptor } from "./descriptor.js";

const source = (text, options = {}) => new StringDocumentSource(text, options);

describe("JSON-LD parser descriptor", () => {
  it.each([
    ["MATCH", "JSON_LD_KEYWORD", '{"@context":{"ex":"urn:test:"}}'],
    ["MATCH", "JSON_LD_KEYWORD", '[{"@id":"urn:test:subject"}]'],
    ["NO_MATCH", "JSON_LD_PLAIN_JSON", '{"name":"Alice","age":30}'],
    ["NO_MATCH", "JSON_LD_XML", "<rdf:RDF />"],
    ["NO_MATCH", "JSON_LD_OTHER_SYNTAX", "@prefix ex: <urn:test:> ."],
    ["INDETERMINATE", "JSON_LD_EMPTY", "  \n"],
  ])("returns %s with %s", (result, reasonCode, text) => {
    expect(detectJsonLd(source(text))).toMatchObject({ reasonCode, result });
  });

  it("treats the exact JSON-LD media type as authoritative", () => {
    expect(
      detectJsonLd(source("{}", { contentType: "application/ld+json" })),
    ).toMatchObject({
      reasonCode: "JSON_LD_CONTENT_TYPE",
      result: "MATCH",
    });
  });

  it("publishes an immutable independent format descriptor", () => {
    expect(jsonLdParserDescriptor).toMatchObject({
      format: OWLDocumentFormats.JSON_LD,
      id: "jsonld",
      supportsCompatibleRecovery: false,
    });
    expect(Object.isFrozen(jsonLdParserDescriptor)).toBe(true);
  });
});

describe("JSON-LD manager integration", () => {
  it("loads structural OWL and publishes immutable JSON-LD context metadata", async () => {
    const result =
      await OWLManager.createOWLOntologyManager().loadOntologyGraphFromOntologyDocument(
        source(
          JSON.stringify({
            "@context": {
              ex: "urn:test:",
              owl: "http://www.w3.org/2002/07/owl#",
            },
            "@id": "ex:Person",
            "@type": "owl:Class",
          }),
          { fileName: "ontology.jsonld" },
        ),
      );

    expect(result.documents[0].context).toMatchObject({
      format: OWLDocumentFormats.JSON_LD,
      jsonLdContexts: [
        {
          ex: "urn:test:",
          owl: "http://www.w3.org/2002/07/owl#",
        },
      ],
    });
    expect(Object.isFrozen(result.documents[0].context.jsonLdContexts)).toBe(
      true,
    );
    expect(Object.isFrozen(result.documents[0].context.jsonLdContexts[0])).toBe(
      true,
    );
    expect(
      [...result.ontology.getClassesInSignature()].map(({ iri }) => iri.value),
    ).toEqual(["urn:test:Person"]);
  });

  it("does not let a JSON object with the JSON-LD media type fall through to TriG", async () => {
    const result =
      await OWLManager.createOWLOntologyManager().loadOntologyGraphFromOntologyDocument(
        source("{}", { contentType: "application/ld+json" }),
      );

    expect(result.documents[0].context.format).toBe(OWLDocumentFormats.JSON_LD);
  });

  it("honors and retains immutable JSON-LD format parameters", async () => {
    const format = OWLDocumentFormats.JSON_LD.withParameter("expandContext", {
      ex: "urn:test:",
      owl: "http://www.w3.org/2002/07/owl#",
    });
    const result =
      await OWLManager.createOWLOntologyManager().loadOntologyGraphFromOntologyDocument(
        source(JSON.stringify({ "@id": "ex:Person", "@type": "owl:Class" })),
        new OWLOntologyLoaderConfiguration({ format }),
      );

    expect(result.documents[0].context.format).toBe(format);
    expect(
      [...result.ontology.getClassesInSignature()].map(({ iri }) => iri.value),
    ).toEqual(["urn:test:Person"]);
  });

  it("applies the shared RDF dataset graph policies to JSON-LD named graphs", async () => {
    const document = JSON.stringify([
      {
        "@id": "urn:test:Default",
        "@type": "http://www.w3.org/2002/07/owl#Class",
      },
      {
        "@graph": [
          {
            "@id": "urn:test:Named",
            "@type": "http://www.w3.org/2002/07/owl#Class",
          },
        ],
        "@id": "urn:test:graph",
      },
    ]);
    const load = (values) =>
      OWLManager.createOWLOntologyManager().loadOntologyGraphFromOntologyDocument(
        source(document, { contentType: "application/ld+json" }),
        new OWLOntologyLoaderConfiguration(values),
      );
    const iris = (result) =>
      [...result.ontology.getClassesInSignature()]
        .map(({ iri }) => iri.value)
        .sort();

    await expect(load({})).rejects.toMatchObject({
      code: "AMBIGUOUS_RDF_DATASET",
    });
    expect(
      iris(await load({ rdfDatasetGraphPolicy: "defaultGraphOnly" })),
    ).toEqual(["urn:test:Default"]);
    expect(
      iris(
        await load({
          rdfDatasetGraphPolicy: "selectGraph",
          selectedGraph: rdfDataFactory.namedNode("urn:test:graph"),
        }),
      ),
    ).toEqual(["urn:test:Named"]);
    expect(iris(await load({ rdfDatasetGraphPolicy: "merge" }))).toEqual([
      "urn:test:Default",
      "urn:test:Named",
    ]);
  });

  it("loads JSON-LD ontology imports through the manager loader", async () => {
    const importedIRI = "urn:test:jsonld-imported";
    const manager = OWLManager.createOWLOntologyManager({
      documentLoader: {
        load: async (iri, options) => {
          expect(iri.value).toBe(importedIRI);
          expect(options.purpose).toBeUndefined();
          return source(
            JSON.stringify({
              "@id": importedIRI,
              "@type": "http://www.w3.org/2002/07/owl#Ontology",
            }),
            { contentType: "application/ld+json", documentIRI: importedIRI },
          );
        },
      },
    });
    const result = await manager.loadOntologyGraphFromOntologyDocument(
      source(
        JSON.stringify({
          "@id": "urn:test:jsonld-root",
          "@type": "http://www.w3.org/2002/07/owl#Ontology",
          "http://www.w3.org/2002/07/owl#imports": { "@id": importedIRI },
        }),
        {
          contentType: "application/ld+json",
          documentIRI: "urn:test:jsonld-root-document",
        },
      ),
    );

    expect(result.importsClosure).toHaveLength(2);
    expect(result.documents.map(({ context }) => context.format)).toEqual([
      OWLDocumentFormats.JSON_LD,
      OWLDocumentFormats.JSON_LD,
    ]);
  });
});
