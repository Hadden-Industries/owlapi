import { readFileSync } from "node:fs";
import { IRI, OWLDataFactory, OWLOntologyManager } from "../model/index.js";
import { SimpleShortFormProvider } from "./simpleShortFormProvider.js";
import { AnnotationValueShortFormProvider } from "./annotationValueShortFormProvider.js";

const f = new OWLDataFactory();
const comment = f.getOWLAnnotationProperty(
  IRI.create("http://www.w3.org/2000/01/rdf-schema#comment"),
);
const nativeProviders = JSON.parse(
  readFileSync(
    new URL(
      "./owlapi-reference/fixtures/rc2/provider-observations.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
test.each(nativeProviders.observations.map((row) => [row.id, row]))(
  "native annotation priority and ontology order %s",
  (_id, row) => {
    const manager = new OWLOntologyManager();
    const entity = f.getOWLClass(IRI.create("urn:provider:entity"));
    const members = row.values.map((descriptor, index) => {
      const ontology = manager.createOntology();
      const value = descriptor.iri
        ? IRI.create(descriptor.iri)
        : descriptor.anonymous
          ? f.getOWLAnonymousIndividual(descriptor.anonymous)
          : f.getOWLLiteral(
              descriptor.lexical,
              descriptor.datatype
                ? f.getOWLDatatype(IRI.create(descriptor.datatype))
                : descriptor.language,
            );
      manager.addAxiom(
        ontology,
        f.getOWLAnnotationAssertionAxiom(
          index === 0 || row.properties === 0 ? f.getRDFSLabel() : comment,
          entity.iri,
          value,
        ),
      );
      return ontology;
    });
    if (row.reverseOntologies) members.reverse();
    const properties =
      row.properties === 0
        ? [f.getRDFSLabel()]
        : row.properties === 1
          ? [f.getRDFSLabel(), comment]
          : [comment, f.getRDFSLabel()];
    const provider = new AnnotationValueShortFormProvider(
      properties,
      new Map(properties.map((property) => [property, row.preferences])),
      { ontologies: () => members },
    );
    expect(provider.getShortForm(entity)).toBe(row.shortForm);
  },
);
test.each([
  ["urn:render:A", "A"],
  ["https://example.test/path/B", "B"],
  ["https://example.test/path/", "<https://example.test/path/>"],
  ["https://example.test/#space%20name", "name"],
  ["urn:render:two words", "words"],
  ["urn:render:", "<urn:render:>"],
])("simple short form follows native suffix for %s", (iri, expected) => {
  const provider = new SimpleShortFormProvider();
  expect(provider.getShortForm(f.getOWLClass(IRI.create(iri)))).toBe(expected);
  expect(provider.dispose()).toBeUndefined();
  expect(() => provider.getShortForm(IRI.create(iri))).toThrow(TypeError);
});

test("annotation provider captures priorities and reflects live member revisions and provider membership", () => {
  const manager = new OWLOntologyManager();
  const ontology = manager.createOntology();
  const a = f.getOWLClass(IRI.create("urn:render:A"));
  const b = f.getOWLClass(IRI.create("urn:render:B"));
  const label = f.getRDFSLabel();
  manager.addAxioms(ontology, [
    f.getOWLAnnotationAssertionAxiom(
      label,
      a.iri,
      f.getOWLLiteral("Zulu", "en"),
    ),
    f.getOWLAnnotationAssertionAxiom(
      label,
      a.iri,
      f.getOWLLiteral("Alpha", "fr"),
    ),
  ]);
  const properties = [label],
    languages = new Map([[label, ["en", "fr"]]]);
  let members = [ontology];
  const provider = new AnnotationValueShortFormProvider(properties, languages, {
    ontologies: () => members,
  });
  properties.length = 0;
  languages.get(label).reverse();
  expect(provider.getShortForm(a)).toBe("Zulu");
  expect(provider.getShortForm(b)).toBe("B");
  manager.addAxiom(
    ontology,
    f.getOWLAnnotationAssertionAxiom(
      label,
      a.iri,
      f.getOWLLiteral("A label with spaces", "en"),
    ),
  );
  expect(provider.getShortForm(a)).toBe("A label with spaces");
  const preferences = provider.getPreferredLanguageMap();
  preferences.get(label).length = 0;
  expect(provider.getPreferredLanguageMap().get(label)).toEqual(["en", "fr"]);
  expect(provider.getAnnotationProperties()).toEqual([label]);
  members = [];
  expect(provider.getShortForm(a)).toBe("A");
  expect(provider.dispose()).toBeUndefined();
});

test("language mismatch falls back; IRI values use native IRI short forms", () => {
  const manager = new OWLOntologyManager();
  const ontology = manager.createOntology();
  const label = f.getRDFSLabel();
  const a = f.getOWLClass(IRI.create("urn:render:unmatched"));
  const b = f.getOWLClass(IRI.create("urn:render:iriLabel"));
  manager.addAxioms(ontology, [
    f.getOWLAnnotationAssertionAxiom(
      label,
      a.iri,
      f.getOWLLiteral("German", "de"),
    ),
    f.getOWLAnnotationAssertionAxiom(
      label,
      b.iri,
      IRI.create("urn:render:iriValue"),
    ),
  ]);
  const provider = new AnnotationValueShortFormProvider(
    [label],
    new Map([[label, ["en", "fr"]]]),
    { ontologies: () => [ontology] },
  );
  expect(provider.getShortForm(a)).toBe("unmatched");
  expect(provider.getShortForm(b)).toBe("iriValue");
  expect(
    new AnnotationValueShortFormProvider([label], new Map(), {
      ontologies: () => [ontology],
    }).getShortForm(a),
  ).toBe("German");
});
