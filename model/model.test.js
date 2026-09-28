import { IRI, OWLDataFactory, OWLOntology } from "./index.js";

describe("OWL structural model", () => {
  it("rejects malformed objects that merely claim the IRI kind", () => {
    expect(() => IRI.create({ kind: "IRI", value: "urn:malformed" })).toThrow(
      TypeError,
    );
  });

  it("treats unordered class-expression operands as a structural set", () => {
    const factory = new OWLDataFactory();
    const classA = factory.getOWLClass(IRI.create("https://example.com/A"));
    const classB = factory.getOWLClass(IRI.create("https://example.com/B"));

    const left = factory.getOWLObjectIntersectionOf([classA, classB]);
    const right = factory.getOWLObjectIntersectionOf([classB, classA, classA]);

    expect(left.equals(right)).toBe(true);
  });

  it("orders structural sets independently of the host locale", () => {
    const factory = new OWLDataFactory();
    const ascii = factory.getOWLClass(IRI.create("urn:example:z"));
    const nonAscii = factory.getOWLClass(IRI.create("urn:example:ä"));

    const expression = factory.getOWLObjectIntersectionOf([nonAscii, ascii]);

    expect(expression.operands).toEqual([ascii, nonAscii]);
  });

  it("includes axiom annotations in ordinary structural equality", () => {
    const factory = new OWLDataFactory();
    const classA = factory.getOWLClass(IRI.create("https://example.com/A"));
    const classB = factory.getOWLClass(IRI.create("https://example.com/B"));
    const label = factory.getOWLAnnotation(
      factory.getRDFSLabel(),
      factory.getOWLLiteral("preferred", "en"),
    );

    const unannotated = factory.getOWLSubClassOfAxiom(classA, classB);
    const annotated = factory.getOWLSubClassOfAxiom(classA, classB, [label]);

    expect(annotated.equals(unannotated)).toBe(false);
    expect(annotated.equalsIgnoreAnnotations(unannotated)).toBe(true);
  });

  it("stores structurally unique axioms and exposes direct signature queries", () => {
    const factory = new OWLDataFactory();
    const classA = factory.getOWLClass(IRI.create("https://example.com/A"));
    const classB = factory.getOWLClass(IRI.create("https://example.com/B"));
    const axiom = factory.getOWLSubClassOfAxiom(classA, classB);
    const duplicate = factory.getOWLSubClassOfAxiom(classA, classB);
    const ontology = new OWLOntology({ axioms: [axiom, duplicate] });

    expect(ontology.getAxioms()).toEqual(new Set([axiom]));
    expect(ontology.getClassesInSignature()).toEqual(new Set([classA, classB]));
    expect(ontology.getReferencingAxioms(classA)).toEqual(new Set([axiom]));
  });

  it("exposes only defensive collections from the frozen ontology façade", () => {
    const factory = new OWLDataFactory();
    const cls = factory.getOWLClass(IRI.create("urn:ontology-facade:Class"));
    const axiom = factory.getOWLDeclarationAxiom(cls);
    const ontology = new OWLOntology({ axioms: [axiom] });
    const returnedAxioms = ontology.getAxioms();

    returnedAxioms.clear();

    expect(Object.isFrozen(ontology)).toBe(true);
    expect(Reflect.ownKeys(ontology)).toEqual([]);
    expect(ontology.getAxioms()).toEqual(new Set([axiom]));
  });

  it("does not reveal manager-owned state capabilities to constructor proxies", () => {
    const factory = new OWLDataFactory();
    const ontologyID = factory.getOWLOntologyID(
      IRI.create("urn:ontology-facade:proxy"),
    );
    const axiom = factory.getOWLDeclarationAxiom(
      factory.getOWLClass(IRI.create("urn:ontology-facade:Injected")),
    );
    const observedPropertyKeys = [];
    let suppliedSnapshot = {
      authoredImportDeclarations: [],
      directAxioms: [],
      directOntologyAnnotations: [],
      ontologyID,
    };
    const constructorOptions = new Proxy(
      { ontologyID },
      {
        get(target, propertyKey, receiver) {
          observedPropertyKeys.push(propertyKey);
          if (typeof propertyKey === "symbol") {
            return () => suppliedSnapshot;
          }
          return Reflect.get(target, propertyKey, receiver);
        },
      },
    );
    const ontology = new OWLOntology(constructorOptions);

    suppliedSnapshot = { ...suppliedSnapshot, directAxioms: [axiom] };

    expect(
      observedPropertyKeys.filter((key) => typeof key === "symbol"),
    ).toEqual([]);
    expect(ontology.getOntologyID()).toBe(ontologyID);
    expect(ontology.getAxioms()).toEqual(new Set());
  });

  it("includes nested ontology annotation properties in the signature", () => {
    const factory = new OWLDataFactory();
    const outerProperty = factory.getRDFSLabel();
    const nestedProperty = factory.getOWLAnnotationProperty(
      IRI.create("http://www.w3.org/2000/01/rdf-schema#comment"),
    );
    const annotation = factory.getOWLAnnotation(
      outerProperty,
      factory.getOWLLiteral("outer", "en"),
      [
        factory.getOWLAnnotation(
          nestedProperty,
          factory.getOWLLiteral("nested", "en"),
        ),
      ],
    );
    const ontology = new OWLOntology({ annotations: [annotation] });

    expect(ontology.getAnnotationPropertiesInSignature()).toEqual(
      new Set([nestedProperty, outerProperty]),
    );
  });

  it("preserves ontology identity, anonymous-individual scope, and entity categories", () => {
    const factory = new OWLDataFactory();
    const ontologyIri = IRI.create("https://example.com/ontology");
    const versionIri = IRI.create("https://example.com/ontology/1");
    const entities = {
      annotationProperty: factory.getOWLAnnotationProperty(
        IRI.create("https://example.com/note"),
      ),
      class: factory.getOWLClass(IRI.create("https://example.com/Person")),
      dataProperty: factory.getOWLDataProperty(
        IRI.create("https://example.com/age"),
      ),
      datatype: factory.getOWLDatatype(IRI.create("https://example.com/Age")),
      individual: factory.getOWLNamedIndividual(
        IRI.create("https://example.com/Alice"),
      ),
      objectProperty: factory.getOWLObjectProperty(
        IRI.create("https://example.com/knows"),
      ),
    };
    const ontology = new OWLOntology({
      axioms: Object.values(entities).map((entity) =>
        factory.getOWLDeclarationAxiom(entity),
      ),
      imports: [
        factory.getOWLImportsDeclaration(
          IRI.create("https://example.com/base"),
        ),
      ],
      ontologyID: factory.getOWLOntologyID(ontologyIri, versionIri),
    });
    const localAnonymous = factory.getOWLAnonymousIndividual("node", "doc-a");
    const foreignAnonymous = factory.getOWLAnonymousIndividual("node", "doc-b");

    expect(ontology.getOntologyID().ontologyIRI).toBe(ontologyIri);
    expect(ontology.getClassesInSignature()).toEqual(new Set([entities.class]));
    expect(ontology.getObjectPropertiesInSignature()).toEqual(
      new Set([entities.objectProperty]),
    );
    expect(ontology.getDataPropertiesInSignature()).toEqual(
      new Set([entities.dataProperty]),
    );
    expect(ontology.getAnnotationPropertiesInSignature()).toEqual(
      new Set([entities.annotationProperty]),
    );
    expect(ontology.getIndividualsInSignature()).toEqual(
      new Set([entities.individual]),
    );
    expect(ontology.getDatatypesInSignature()).toEqual(
      new Set([entities.datatype]),
    );
    expect(localAnonymous.equals(foreignAnonymous)).toBe(false);
    expect(Object.isFrozen(ontology.getOntologyID())).toBe(true);
  });

  it("keeps anonymous ontology IDs distinct without inventing ontology IRIs", () => {
    const factory = new OWLDataFactory();
    const first = factory.getOWLOntologyID();
    const second = factory.getOWLOntologyID();

    expect(first.ontologyIRI).toBeUndefined();
    expect(first.versionIRI).toBeUndefined();
    expect(first.equals(second)).toBe(false);
  });

  it("keeps anonymous individuals out of the named-individual signature", () => {
    const factory = new OWLDataFactory();
    const cls = factory.getOWLClass(IRI.create("https://example.com/Class"));
    const named = factory.getOWLNamedIndividual(
      IRI.create("https://example.com/Named"),
    );
    const anonymous = factory.getOWLAnonymousIndividual("anonymous", "doc");
    const ontology = new OWLOntology({
      axioms: [
        factory.getOWLClassAssertionAxiom(cls, named),
        factory.getOWLClassAssertionAxiom(cls, anonymous),
      ],
    });

    expect(ontology.getIndividualsInSignature()).toEqual(new Set([named]));
  });

  it("rejects invalid ontology contents at the model boundary", () => {
    const factory = new OWLDataFactory();
    const cls = factory.getOWLClass(IRI.create("https://example.com/Class"));
    const literal = factory.getOWLLiteral("value");

    expect(() => new OWLOntology({ axioms: [cls] })).toThrow(TypeError);
    expect(() => new OWLOntology({ annotations: [literal] })).toThrow(
      TypeError,
    );
    expect(() => new OWLOntology({ imports: [cls] })).toThrow(TypeError);
    expect(() => new OWLOntology({ ontologyID: cls })).toThrow(TypeError);
    expect(() => new OWLOntology().getReferencingAxioms(cls.iri)).toThrow(
      TypeError,
    );
  });
});
