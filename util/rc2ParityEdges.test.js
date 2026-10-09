import { readFileSync } from "node:fs";
import {
  IRI,
  OWLOntologyManager,
  AddImport,
  AddOntologyAnnotation,
} from "../model/index.js";
import { Imports } from "../model/parameters/index.js";
import { EntitySearcher } from "../search/index.js";
import {
  AnnotationValueShortFormProvider,
  OWLEntityRenamer,
  OWLEntityRemover,
} from "./index.js";
import { ManchesterOWLSyntaxOWLObjectRendererImpl } from "../manchestersyntax/renderer/index.js";

const native = JSON.parse(
  readFileSync(
    new URL(
      "./owlapi-reference/fixtures/rc2/parity-edges-observations.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const axiomPayload = (axiom) =>
  axiom.kind === "OWLDeclarationAxiom"
    ? `Declaration|${axiom.entity.iri.value}`
    : `SubClassOf|${axiom.subClass.iri.value}|${axiom.superClass.iri.value}`;
const setup = () => {
  const m = new OWLOntologyManager();
  const f = m.getOWLDataFactory();
  const a = f.getOWLClass(IRI.create("urn:edge:A"));
  const b = f.getOWLClass(IRI.create("urn:edge:B"));
  return { m, f, a, b };
};

test("native closure counts retain per-ontology multiplicity while axiom sets deduplicate", () => {
  const { m, f, a, b } = setup();
  const root = m.createOntology(
    f.getOWLOntologyID(IRI.create("urn:edge:root")),
  );
  const child = m.createOntology(
    f.getOWLOntologyID(IRI.create("urn:edge:child")),
  );
  m.addAxiom(root, f.getOWLSubClassOfAxiom(a, b));
  m.addAxiom(child, f.getOWLSubClassOfAxiom(a, b));
  m.applyChange(
    new AddImport(
      root,
      f.getOWLImportsDeclaration(IRI.create("urn:edge:child")),
    ),
  );
  expect([
    root.getAxiomCount(Imports.INCLUDED),
    root.getAxiomCount("OWLSubClassOfAxiom", Imports.INCLUDED),
    root.getLogicalAxiomCount(Imports.INCLUDED),
    root.getAxioms(Imports.INCLUDED).size,
  ]).toEqual(native.scopeCounts);
  m.addAxiom(
    child,
    f.getOWLAnnotationAssertionAxiom(
      f.getRDFSLabel(),
      b.iri,
      f.getOWLLiteral("import label"),
    ),
  );
  const provider = new AnnotationValueShortFormProvider(
    [f.getRDFSLabel()],
    new Map(),
    { ontologies: () => [root] },
  );
  expect(provider.getShortForm(b)).toBe(native.importLabel);
  m.removeAxiom(child, [...child.getAnnotationAssertionAxioms(b.iri)][0]);
  expect(provider.getShortForm(b)).toBe("B");
});

test("native annotation search deduplicates each ontology and retains repeated ontology streams", () => {
  const { m, f, a } = setup();
  const root = m.createOntology();
  const label = f.getOWLAnnotation(f.getRDFSLabel(), f.getOWLLiteral("x"));
  m.addAxiom(
    root,
    f.getOWLAnnotationAssertionAxiom(f.getRDFSLabel(), a.iri, label.value),
  );
  m.addAxiom(
    root,
    f.getOWLAnnotationAssertionAxiom(f.getRDFSLabel(), a.iri, label.value, [
      label,
    ]),
  );
  expect([
    EntitySearcher.getAnnotations(a, root).length,
    EntitySearcher.getAnnotationObjects(a, root).length,
    EntitySearcher.getAnnotations(a, [root, root], f.getRDFSLabel()).length,
  ]).toEqual(native.annotationCounts);
});

test("native inverse endpoints and anyURI reference rules include self and literal targets", () => {
  const { m, f, b } = setup();
  const root = m.createOntology();
  const p = f.getOWLObjectProperty(IRI.create("urn:edge:p"));
  m.addAxiom(root, f.getOWLInverseObjectPropertiesAxiom(p, p));
  expect(
    EntitySearcher.getInverses(p, root).map((value) => value.iri.value),
  ).toEqual(native.selfInverse);
  const target = IRI.create("urn:edge:literalIRI");
  const literal = f.getOWLLiteral(
    target.value,
    f.getOWLDatatype(IRI.create("http://www.w3.org/2001/XMLSchema#anyURI")),
  );
  m.addAxiom(
    root,
    f.getOWLDataPropertyAssertionAxiom(
      f.getOWLDataProperty(IRI.create("urn:edge:d")),
      f.getOWLNamedIndividual(IRI.create("urn:edge:i")),
      literal,
    ),
  );
  m.addAxiom(
    root,
    f.getOWLAnnotationAssertionAxiom(f.getRDFSLabel(), b.iri, literal),
  );
  expect(root.getReferencingAxioms(target).size).toBe(native.anyURIReferences);
});

test("native transformation lists preserve duplicate declarations, map batches and ontology entries", () => {
  const { m, f, a, b } = setup();
  const ontology = m.createOntology();
  m.addAxiom(ontology, f.getOWLDeclarationAxiom(a));
  m.addAxiom(ontology, f.getOWLSubClassOfAxiom(a, b));
  m.applyChange(
    new AddOntologyAnnotation(
      ontology,
      f.getOWLAnnotation(f.getRDFSLabel(), a.iri),
    ),
  );
  const renamer = new OWLEntityRenamer(m, [ontology, ontology]);
  const names = (changes) => changes.map((change) => change.constructor.name);
  const payloads = (changes) =>
    changes.map(
      (change) =>
        `${change.constructor.name}|${change.getAxiom ? axiomPayload(change.getAxiom()) : change.getAnnotation().value.value}`,
    );
  const next = IRI.create("urn:edge:next");
  expect(names(renamer.changeIRI(a, next))).toEqual(native.renameEntity);
  expect(payloads(renamer.changeIRI(a, next))).toEqual(
    native.renameEntityPayloads,
  );
  expect(
    payloads(
      renamer.changeIRI(
        new Map([
          [a, next],
          [b, IRI.create("urn:edge:nextB")],
        ]),
      ),
    ),
  ).toEqual(native.renameMapPayloads);
  expect(payloads(renamer.changeIRI(a.iri, next))).toEqual(
    native.renameIRIPayloads,
  );
  expect(
    names(
      renamer.changeIRI(
        new Map([
          [a, next],
          [b, IRI.create("urn:edge:nextB")],
        ]),
      ),
    ),
  ).toEqual(native.renameMap);
  expect(names(renamer.changeIRI(a.iri, next))).toEqual(native.renameIRI);
  const remover = new OWLEntityRemover([ontology, ontology]);
  remover.visit(a);
  expect(names(remover.getChanges())).toEqual(native.remove);
  expect(payloads(remover.getChanges())).toEqual(native.removePayloads);
  expect(ontology.getAxiomCount()).toBe(2);
});

test.each(native.renameMatrix)(
  "native rename $mode keeps payloads, applies once and leaves unselected imports unchanged",
  (row) => {
    const { m, f, a, b } = setup();
    const owned = m.createOntology();
    const unselected = m.createOntology(
      f.getOWLOntologyID(IRI.create(`urn:edge:unselected:${row.mode}`)),
    );
    m.addAxioms(owned, [
      f.getOWLDeclarationAxiom(a),
      f.getOWLDeclarationAxiom(b),
      f.getOWLSubClassOfAxiom(a, b),
    ]);
    m.addAxiom(unselected, f.getOWLSubClassOfAxiom(a, b));
    m.applyChange(
      new AddImport(
        owned,
        f.getOWLImportsDeclaration(unselected.getOntologyID().ontologyIRI),
      ),
    );
    const replacements = new Map([[a, row.mode === "self" ? a.iri : b.iri]]);
    if (row.mode === "chain") replacements.set(b, IRI.create("urn:edge:nextB"));
    const proposed = new OWLEntityRenamer(m, [owned]).changeIRI(replacements);
    // Java has no ordering guarantee across the ontology's axiom stream. Retain
    // every complete payload and compare its multiset, including duplicates.
    expect(
      proposed
        .map(
          (change) =>
            `${change.constructor.name}|${axiomPayload(change.getAxiom())}`,
        )
        .sort(),
    ).toEqual([...row.changes].sort());
    expect([...owned.getAxioms()].map(axiomPayload).sort()).toEqual(row.before);
    m.applyChanges(proposed);
    expect([...owned.getAxioms()].map(axiomPayload).sort()).toEqual(row.after);
    expect([...unselected.getAxioms()].map(axiomPayload).sort()).toEqual(
      row.unselected,
    );
  },
);

test.each(Object.entries(native.literals))(
  "renderer matches native literal object %s",
  (id, [lexical, rendered]) => {
    const { f } = setup();
    const type = id.split("|")[0];
    // Compare equal model literals. Java's factory canonicalizes numeric input;
    // the existing JS model intentionally retains authored lexical values.
    const value = f.getOWLLiteral(
      lexical,
      f.getOWLDatatype(IRI.create(`http://www.w3.org/2001/XMLSchema#${type}`)),
    );
    expect(new ManchesterOWLSyntaxOWLObjectRendererImpl().render(value)).toBe(
      rendered,
    );
  },
);
