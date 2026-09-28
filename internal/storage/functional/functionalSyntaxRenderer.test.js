import { readFileSync } from "node:fs";
import { OWLManager } from "../../../apibinding/index.js";
import {
  OWLOntologyStorageError,
  StringDocumentSource,
} from "../../../io/index.js";
import {
  IRI,
  OWLDataFactory,
  OWLObjectKind,
  OWLStructuralObject,
  OWL_OBJECT_KINDS,
} from "../../../model/index.js";
import { OntologyState } from "../../model/ontologyState.js";
import { compareOntologies } from "../../model/ontologyStructuralIsomorphism.js";
import {
  FUNCTIONAL_SYNTAX_RENDERER_KINDS,
  renderFunctionalSyntax,
} from "./functionalSyntaxRenderer.js";

describe("Functional Syntax structural rendering", () => {
  it("declares an explicit renderer branch for every current structural kind", () => {
    expect([...FUNCTIONAL_SYNTAX_RENDERER_KINDS].sort()).toEqual(
      [...OWL_OBJECT_KINDS].sort(),
    );
  });

  it("renders named, versioned, and anonymous ontology headers without generated identifiers", () => {
    const factory = new OWLDataFactory();
    const named = new OntologyState({
      ontologyID: factory.getOWLOntologyID(
        IRI.create("urn:storage:root"),
        IRI.create("urn:storage:version"),
      ),
    }).createSnapshot();
    expect(renderFunctionalSyntax(named)).toBe(
      "Ontology(<urn:storage:root> <urn:storage:version>\n)\n",
    );
    expect(renderFunctionalSyntax(new OntologyState().createSnapshot())).toBe(
      "Ontology(\n)\n",
    );
  });

  it("round-trips every structural kind through the strict parser without loading imports", async () => {
    let loaderCalls = 0;
    const newManager = () =>
      OWLManager.createOWLOntologyManager({
        documentLoader: {
          load() {
            loaderCalls += 1;
            throw new Error("Unexpected external load");
          },
        },
      });
    const manager = newManager();
    const fixture = readFileSync(
      new URL(
        "../../../util/owlapi-reference/fixtures/storage/functional-all-kinds.ofn",
        import.meta.url,
      ),
      "utf8",
    );
    const original = await manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource(fixture),
      { parsingMode: "strict" },
    );
    const snapshot = new OntologyState({
      ontologyID: original.getOntologyID(),
      directAxioms: original.getAxioms(),
      directOntologyAnnotations: original.getAnnotations(),
      authoredImportDeclarations: original.getImportsDeclarations(),
    }).createSnapshot();
    const encounteredKinds = new Set();
    const visited = new Set();
    const visit = (value) => {
      if (!value || typeof value !== "object" || visited.has(value)) return;
      visited.add(value);
      if (value.kind) encounteredKinds.add(value.kind);
      for (const child of Object.values(value)) visit(child);
    };
    visit(snapshot);
    expect([...encounteredKinds].sort()).toEqual(
      OWL_OBJECT_KINDS.filter(
        (kind) => kind !== OWLObjectKind.IMPORTS_DECLARATION,
      ).sort(),
    );
    expect(original.getImportsDeclarations().size).toBe(0);
    const text = renderFunctionalSyntax(snapshot);
    expect(text).toMatch(/^Ontology\(/);
    expect(text).not.toContain("Prefix(");
    expect(renderFunctionalSyntax(snapshot)).toBe(text);
    const freshManager = newManager();
    const reloaded = await freshManager.loadOntologyFromOntologyDocument(
      new StringDocumentSource(text),
      { parsingMode: "strict" },
    );
    expect(compareOntologies(original, reloaded)).toEqual({
      equal: true,
      mismatch: null,
    });
    expect(freshManager.importsClosure(reloaded)).toEqual([reloaded]);
    expect(loaderCalls).toBe(0);
  });

  it("preserves literal lexical characters, language tags, full Unicode IRIs, and sorted direct imports", async () => {
    const factory = new OWLDataFactory();
    const lexicalForm = 'quoted "text" \\ \t\n\r\nΔ 😀 e\u0301';
    const annotation = factory.getOWLAnnotation(
      factory.getOWLAnnotationProperty(IRI.create("https://example.org/Δ#😀")),
      factory.getOWLLiteral(lexicalForm, "en-us"),
    );
    const imports = ["urn:z", "urn:a"].map((iri) =>
      factory.getOWLImportsDeclaration(IRI.create(iri)),
    );
    const snapshot = new OntologyState({
      authoredImportDeclarations: imports,
      directOntologyAnnotations: [annotation],
    }).createSnapshot();
    const text = renderFunctionalSyntax(snapshot);
    expect(text.indexOf("Import(<urn:a>)")).toBeLessThan(
      text.indexOf("Import(<urn:z>)"),
    );
    expect(text).toContain(
      '<https://example.org/Δ#😀> "quoted \\"text\\" \\\\ \t\n\r\nΔ 😀 e\u0301"@en-us',
    );
    const manager = OWLManager.createOWLOntologyManager();
    const reloaded = await manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource(text.replaceAll(/Import\(<urn:[az]>\)\n/g, "")),
      { parsingMode: "strict" },
    );
    expect([...reloaded.getAnnotations()][0].value.lexicalForm).toBe(
      lexicalForm,
    );
    expect(
      renderFunctionalSyntax(
        new OntologyState({
          authoredImportDeclarations: [...imports].reverse(),
          directOntologyAnnotations: [annotation],
        }).createSnapshot(),
      ),
    ).toBe(text);
  });

  it("allocates document-local labels preserving sharing and distinct document scopes", async () => {
    const factory = new OWLDataFactory();
    const left = factory.getOWLAnonymousIndividual(
      "same label",
      "left document",
    );
    const right = factory.getOWLAnonymousIndividual(
      "same label",
      "right document",
    );
    const property = factory.getOWLObjectProperty(IRI.create("urn:p"));
    const snapshot = new OntologyState({
      directAxioms: [
        factory.getOWLObjectPropertyAssertionAxiom(property, left, right),
        factory.getOWLObjectPropertyAssertionAxiom(property, left, left),
      ],
    }).createSnapshot();
    const text = renderFunctionalSyntax(snapshot);
    expect(text).toContain(
      "ObjectPropertyAssertion(<urn:p> _:genid0 _:genid0)",
    );
    expect(text).toContain(
      "ObjectPropertyAssertion(<urn:p> _:genid0 _:genid1)",
    );
    expect(text).not.toContain("same label");
    const manager = OWLManager.createOWLOntologyManager();
    const reloaded = await manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource(text),
      { parsingMode: "strict" },
    );
    expect(
      new Set(
        [...reloaded.getAxioms()].flatMap((axiom) => [
          axiom.subject.structuralKey(),
          axiom.value.structuralKey(),
        ]),
      ).size,
    ).toBe(2);
  });

  it("preserves Unicode control characters allowed by the OWL quotedString production", async () => {
    const factory = new OWLDataFactory();
    const lexicalForm = "\u0000\u0001\b\f\t\r\n\u001f";
    const annotation = factory.getOWLAnnotation(
      factory.getRDFSLabel(),
      factory.getOWLLiteral(lexicalForm),
    );
    const text = renderFunctionalSyntax(
      new OntologyState({
        directOntologyAnnotations: [annotation],
      }).createSnapshot(),
    );
    const manager = OWLManager.createOWLOntologyManager();
    const reloaded = await manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource(text),
      { parsingMode: "strict" },
    );
    expect([...reloaded.getAnnotations()][0].value.lexicalForm).toBe(
      lexicalForm,
    );
  });

  it.each([
    [
      "relative IRI",
      (f) => f.getOWLAnnotation(f.getRDFSLabel(), IRI.create("relative/path")),
    ],
    [
      "invalid IRI",
      (f) => f.getOWLAnnotation(f.getRDFSLabel(), IRI.create("urn:bad>iri")),
    ],
    [
      "invalid language",
      (f) =>
        f.getOWLAnnotation(
          f.getRDFSLabel(),
          f.getOWLLiteral("value", "not a language tag"),
        ),
    ],
    [
      "privateuse instead of langtag",
      (f) =>
        f.getOWLAnnotation(
          f.getRDFSLabel(),
          f.getOWLLiteral("value", "x-private"),
        ),
    ],
    [
      "irregular grandfathered instead of langtag",
      (f) =>
        f.getOWLAnnotation(
          f.getRDFSLabel(),
          f.getOWLLiteral("value", "i-klingon"),
        ),
    ],
    [
      "unpaired surrogate",
      (f) => f.getOWLAnnotation(f.getRDFSLabel(), f.getOWLLiteral("\ud800")),
    ],
    [
      "unhandled kind",
      (f) =>
        f.getOWLAnnotation(
          f.getRDFSLabel(),
          new OWLStructuralObject(
            OWLObjectKind.LITERAL,
            {
              lexicalForm: "value",
              language: "",
              datatype: new OWLStructuralObject("FutureDatatypeKind", {}, []),
            },
            [],
          ),
        ),
    ],
  ])(
    "rejects %s as an explicit representability failure",
    (_, makeAnnotation) => {
      const snapshot = new OntologyState({
        directOntologyAnnotations: [makeAnnotation(new OWLDataFactory())],
      }).createSnapshot();
      expect(() => renderFunctionalSyntax(snapshot)).toThrow(
        OWLOntologyStorageError,
      );
      expect(() => renderFunctionalSyntax(snapshot)).toThrow(
        expect.objectContaining({ reason: "ONTOLOGY_NOT_REPRESENTABLE" }),
      );
    },
  );
});
