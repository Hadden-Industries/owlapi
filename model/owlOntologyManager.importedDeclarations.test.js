import { jest } from "@jest/globals";
import { OWLManager } from "../apibinding/owlManager.js";
import { StringDocumentSource } from "../io/stringDocumentSource.js";
import { IRI } from "./structural.js";
import { OWLObjectKind } from "./kinds.js";

const strict = { parsingMode: "strict", collectWarnings: true };
const prefixes = `@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix dcterms: <http://purl.org/dc/terms/> .`;
const contributor = "http://purl.org/dc/terms/contributor";
const source = (text, iri, contentType = "text/turtle") =>
  new StringDocumentSource(text, {
    contentType,
    documentIRI: IRI.create(iri),
  });
const turtle = (text, iri) => source(`${prefixes}\n${text}`, iri);

const managerWithDocuments = (documents) => {
  const requests = [];
  const manager = OWLManager.createOWLOntologyManager({
    documentLoader: {
      load(iri) {
        requests.push(iri.value);
        return documents.get(iri.value);
      },
    },
  });
  return { manager, requests };
};

describe("canonical parsing with imported declarations", () => {
  test("compatible property normalization is shared by discovery and reconstruction", async () => {
    const leaf = turtle(
      `<urn:leaf> a owl:Ontology. <urn:p> a rdf:Property; rdfs:range xsd:string.`,
      "urn:leaf",
    );
    const configuration = { parsingMode: "compatible", collectWarnings: true };
    for (const preloaded of [false, true]) {
      const { manager } = managerWithDocuments(new Map([["urn:leaf", leaf]]));
      if (preloaded)
        await manager.loadOntologyFromOntologyDocument(leaf, configuration);
      const loaded = await manager.loadOntologyGraphFromOntologyDocument(
        turtle(
          `<urn:root> a owl:Ontology; owl:imports <urn:leaf>. <urn:a> <urn:p> "value".`,
          "urn:root",
        ),
        configuration,
      );
      expect([...loaded.ontology.getAxioms()].map(({ kind }) => kind)).toEqual([
        OWLObjectKind.DATA_PROPERTY_ASSERTION_AXIOM,
      ]);
      expect(
        [...loaded.importsClosure]
          .flatMap((ontology) => [...ontology.getAxioms()])
          .filter(({ kind }) => kind === OWLObjectKind.DECLARATION_AXIOM),
      ).toHaveLength(1);
    }
  });
  test("header discovery uses the same implicit annotation categories as reconstruction", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const root = await manager.loadOntologyFromOntologyDocument(
      turtle(
        `<urn:long-current> a owl:Ontology; <urn:previous> <urn:old>.
       <urn:old> a owl:Ontology. <urn:previous> rdfs:subPropertyOf owl:priorVersion.`,
        "urn:long-current",
      ),
      strict,
    );
    expect(root.getOntologyID().ontologyIRI.value).toBe("urn:long-current");
    expect(root.getAnnotations().size).toBe(1);
  });

  test.each([
    "TransitiveProperty",
    "SymmetricProperty",
    "InverseFunctionalProperty",
  ])(
    "OWL 1 %s declaration context is identical for fresh and preloaded imports",
    async (type) => {
      const leaf = turtle(
        `<urn:leaf> a owl:Ontology. <urn:p> a owl:${type}.`,
        "urn:leaf",
      );
      const rootSource = turtle(
        `<urn:root> a owl:Ontology; owl:imports <urn:leaf>. <urn:a> <urn:p> <urn:b>.`,
        "urn:root",
      );
      const results = [];
      for (const preloaded of [false, true]) {
        const { manager } = managerWithDocuments(new Map([["urn:leaf", leaf]]));
        if (preloaded)
          await manager.loadOntologyFromOntologyDocument(leaf, strict);
        results.push(
          await manager.loadOntologyFromOntologyDocument(rootSource, strict),
        );
      }
      expect([...results[0].getAxioms()]).toEqual([...results[1].getAxioms()]);
      expect([...results[0].getAxioms()].map(({ kind }) => kind)).toEqual([
        OWLObjectKind.OBJECT_PROPERTY_ASSERTION_AXIOM,
      ]);
    },
  );

  test("import retrieval does not consume a document's reconstruction time budget", async () => {
    let clock = 0;
    const now = jest
      .spyOn(globalThis.performance, "now")
      .mockImplementation(() => clock);
    try {
      const manager = OWLManager.createOWLOntologyManager({
        documentLoader: {
          load() {
            clock += 2000;
            return turtle(
              `<urn:leaf> a owl:Ontology. dcterms:contributor a owl:AnnotationProperty.`,
              "urn:leaf",
            );
          },
        },
      });
      const root = await manager.loadOntologyFromOntologyDocument(
        turtle(
          `<urn:root> a owl:Ontology; owl:imports <urn:leaf>; dcterms:contributor <urn:author>.`,
          "urn:root",
        ),
        { ...strict, timeoutMs: 1000 },
      );
      expect(root.getAnnotations().size).toBe(1);
    } finally {
      now.mockRestore();
    }
  });

  test.each(["Turtle", "RDF/XML"])(
    "%s root annotations use a transitive declaration without localizing it",
    async (format) => {
      const { manager, requests } = managerWithDocuments(
        new Map([
          [
            "urn:middle",
            turtle(
              `<urn:middle> a owl:Ontology; owl:imports <urn:leaf>.`,
              "urn:middle",
            ),
          ],
          [
            "urn:leaf",
            turtle(
              `<urn:leaf> a owl:Ontology; dcterms:contributor <urn:imported-author>.
            dcterms:contributor a owl:AnnotationProperty.`,
              "urn:leaf",
            ),
          ],
        ]),
      );
      const root =
        format === "Turtle"
          ? turtle(
              `<urn:root> a owl:Ontology; owl:imports <urn:middle>;
            dcterms:contributor <urn:root-author>.`,
              "urn:root",
            )
          : source(
              `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:owl="http://www.w3.org/2002/07/owl#" xmlns:dcterms="http://purl.org/dc/terms/">
            <owl:Ontology rdf:about="urn:root"><owl:imports rdf:resource="urn:middle"/>
            <dcterms:contributor rdf:resource="urn:root-author"/></owl:Ontology></rdf:RDF>`,
              "urn:root",
              "application/rdf+xml",
            );
      const result = await manager.loadOntologyGraphFromOntologyDocument(
        root,
        strict,
      );
      expect(requests).toEqual(["urn:middle", "urn:leaf"]);
      expect(result.importsClosure).toHaveLength(3);
      expect(
        [...result.ontology.getAnnotations()].map(
          (annotation) => annotation.value.value,
        ),
      ).toEqual(["urn:root-author"]);
      expect(result.ontology.getAxioms().size).toBe(0);
      expect(
        result.documents.every(
          ({ context }) => context.diagnostics.length === 0,
        ),
      ).toBe(true);
    },
  );

  test("declarations cross a cycle in both directions", async () => {
    const { manager, requests } = managerWithDocuments(
      new Map([
        [
          "urn:leaf",
          turtle(
            `<urn:leaf> a owl:Ontology; owl:imports <urn:root>; <urn:root-annotation> "leaf".
        dcterms:contributor a owl:AnnotationProperty.`,
            "urn:leaf",
          ),
        ],
      ]),
    );
    const result = await manager.loadOntologyGraphFromOntologyDocument(
      turtle(
        `<urn:root> a owl:Ontology; owl:imports <urn:leaf>; dcterms:contributor <urn:author>.
      <urn:root-annotation> a owl:AnnotationProperty.`,
        "urn:root",
      ),
      strict,
    );
    expect(requests).toEqual(["urn:leaf"]);
    expect(result.importsClosure).toHaveLength(2);
    expect(
      result.importsClosure.every(
        (ontology) => ontology.getAnnotations().size === 1,
      ),
    ).toBe(true);
    expect(
      result.importsClosure.every(
        (ontology) => ontology.getAxioms().size === 1,
      ),
    ).toBe(true);
  });

  test("already-managed imported declarations are available without reloading", async () => {
    const { manager, requests } = managerWithDocuments(new Map());
    await manager.loadOntologyFromOntologyDocument(
      turtle(
        `<urn:leaf> a owl:Ontology. dcterms:contributor a owl:AnnotationProperty.`,
        "urn:leaf",
      ),
      strict,
    );
    const root = await manager.loadOntologyFromOntologyDocument(
      turtle(
        `<urn:root> a owl:Ontology; owl:imports <urn:leaf>; dcterms:contributor <urn:author>.`,
        "urn:root",
      ),
      strict,
    );
    expect(root.getAnnotations().size).toBe(1);
    expect(requests).toEqual([]);
  });

  test.each([false, true])(
    "does not borrow declarations from a sibling or unrelated ontology (preloaded=%s)",
    async (preloaded) => {
      const sibling = turtle(
        `<urn:sibling> a owl:Ontology. dcterms:contributor a owl:AnnotationProperty.`,
        "urn:sibling",
      );
      const { manager } = managerWithDocuments(
        new Map([
          ["urn:sibling", sibling],
          [
            "urn:leaf",
            turtle(
              `<urn:leaf> a owl:Ontology.
             <urn:Class> a owl:Class; dcterms:contributor <urn:author>.`,
              "urn:leaf",
            ),
          ],
        ]),
      );
      if (preloaded)
        await manager.loadOntologyFromOntologyDocument(sibling, strict);
      await expect(
        manager.loadOntologyFromOntologyDocument(
          turtle(
            `<urn:root> a owl:Ontology; owl:imports <urn:sibling>, <urn:leaf>.`,
            "urn:root",
          ),
          strict,
        ),
      ).rejects.toMatchObject({ code: "UNSUPPORTED_CONSTRUCT" });
      const ontologyID = (iri) =>
        manager.getOWLDataFactory().getOWLOntologyID(IRI.create(iri));
      expect(manager.getOntology(ontologyID("urn:root"))).toBeUndefined();
      expect(manager.getOntology(ontologyID("urn:leaf"))).toBeUndefined();
      expect(Boolean(manager.getOntology(ontologyID("urn:sibling")))).toBe(
        preloaded,
      );
    },
  );

  test("uses imported property and datatype declarations without copying imported axioms", async () => {
    const { manager } = managerWithDocuments(
      new Map([
        [
          "urn:leaf",
          new StringDocumentSource(
            `Ontology(<urn:leaf>
        Declaration(DataProperty(<urn:value>))
        Declaration(ObjectProperty(<urn:link>))
        Declaration(Datatype(<urn:datatype>))
        Declaration(AnnotationProperty(<${contributor}>)))`,
            { documentIRI: IRI.create("urn:leaf") },
          ),
        ],
      ]),
    );
    const root = await manager.loadOntologyFromOntologyDocument(
      turtle(
        `<urn:root> a owl:Ontology; owl:imports <urn:leaf>.
      <urn:item> <urn:value> "typed"^^<urn:datatype>; <urn:link> <urn:other>.
      <urn:Class> a owl:Class; rdfs:subClassOf [ a owl:Restriction; owl:onProperty <urn:value>; owl:someValuesFrom <urn:datatype> ].`,
        "urn:root",
      ),
      strict,
    );
    const kinds = [...root.getAxioms()].map((axiom) => axiom.kind);
    expect(kinds).toContain(OWLObjectKind.DATA_PROPERTY_ASSERTION_AXIOM);
    expect(kinds).toContain(OWLObjectKind.OBJECT_PROPERTY_ASSERTION_AXIOM);
    expect(
      [...root.getAxioms()].filter(
        (axiom) => axiom.kind === OWLObjectKind.DECLARATION_AXIOM,
      ),
    ).toHaveLength(1);
  });

  test("strict mode still requires declarations for non-built-in ontology annotations", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    await expect(
      manager.loadOntologyGraphFromOntologyDocument(
        turtle(
          `<urn:root> a owl:Ontology; dcterms:title "Title"@en; dcterms:contributor <urn:author>.`,
          "urn:root",
        ),
        strict,
      ),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_CONSTRUCT" });
  });

  test("a transitive declaration disambiguates a class annotation assertion", async () => {
    const { manager } = managerWithDocuments(
      new Map([
        [
          "urn:leaf",
          turtle(`dcterms:contributor a owl:AnnotationProperty.`, "urn:leaf"),
        ],
      ]),
    );
    const root = await manager.loadOntologyFromOntologyDocument(
      turtle(
        `<urn:root> a owl:Ontology; owl:imports <urn:leaf>.
       <urn:Class> a owl:Class; dcterms:contributor <urn:author>.`,
        "urn:root",
      ),
      strict,
    );
    expect([...root.getAxioms()].map((axiom) => axiom.kind).sort()).toEqual(
      [
        OWLObjectKind.ANNOTATION_ASSERTION_AXIOM,
        OWLObjectKind.DECLARATION_AXIOM,
      ].sort(),
    );
  });
});
