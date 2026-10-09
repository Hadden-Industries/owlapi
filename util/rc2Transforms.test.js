import { readFileSync } from "node:fs";
import {
  AddAxiom,
  IRI,
  OWLDataFactory,
  OWLOntologyManager,
  OWLOntology,
  AddOntologyAnnotation,
  OWL_OBJECT_KINDS,
  OWLStructuralObject,
} from "../model/index.js";
import { StringDocumentSource, ResourceLimitError } from "../io/index.js";
import { compareOntologies } from "../internal/model/ontologyStructuralIsomorphism.js";
import { OWLObjectDuplicator } from "./owlObjectDuplicator.js";
import { OWLEntityRenamer } from "./owlEntityRenamer.js";
import { OWLEntityRemover } from "./owlEntityRemover.js";

const f = new OWLDataFactory();
const old = IRI.create("urn:transform:old");
const next = IRI.create("urn:transform:next");
const c = f.getOWLClass(old);
const d = f.getOWLClass(next);
const i = f.getOWLNamedIndividual(old);
const anon = f.getOWLAnonymousIndividual("original");
const nativeTransforms = JSON.parse(
  readFileSync(
    new URL(
      "./owlapi-reference/fixtures/rc2/transform-observations.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

test.each(
  nativeTransforms.observations.map((row) => [row.subset, row.reverse, row]),
)(
  "native typed-map subset %i reverse=%s preserves raw-IRI priority and punning",
  (_subset, _reverse, row) => {
    const manager = new OWLOntologyManager();
    const shared = IRI.create("urn:transform:shared");
    const entities = nativeTransforms.entityKinds.map((kind) =>
      f[`getOWL${kind}`](shared),
    );
    const entries = entities
      .map((entity, index) => [
        entity,
        IRI.create(`urn:transform:replacement:${index}`),
      ])
      .filter((_entry, index) => Math.floor(row.subset / 2 ** index) % 2 !== 0);
    if (row.reverse) entries.reverse();
    const duplicator = new OWLObjectDuplicator(new Map(entries), manager);
    expect(duplicator.duplicateObject(shared).value).toBe(row.rawIRI);
    expect(
      entities.map((entity) => duplicator.duplicateObject(entity).iri.value),
    ).toEqual(row.typedIRIs);
  },
);

test("duplicator captures structural maps, distinguishes punned entities and owns anonymous lifetime", () => {
  const manager = new OWLOntologyManager();
  const map = new Map([[f.getOWLClass(IRI.create(old.value)), next]]);
  const duplicate = new OWLObjectDuplicator(map, manager);
  map.clear();
  expect(duplicate.duplicateObject(c).equals(d)).toBe(true);
  expect(duplicate.duplicateObject(i).equals(i)).toBe(true);
  expect(duplicate.duplicateObject(old).equals(next)).toBe(true);
  const first = duplicate.duplicateObject(anon);
  expect(first.equals(anon)).toBe(false);
  expect(duplicate.duplicateObject(anon).equals(first)).toBe(true);
  expect(
    new OWLObjectDuplicator(manager).duplicateObject(anon).equals(first),
  ).toBe(false);
  expect(
    new OWLObjectDuplicator(manager, new Map([[old, next]]))
      .duplicateObject(i)
      .iri.equals(next),
  ).toBe(true);
  const literal = f.getOWLLiteral("lexical", "en");
  const replacement = f.getOWLLiteral("replacement", "en");
  expect(
    new OWLObjectDuplicator(
      new Map(),
      new Map([[literal, replacement]]),
      manager,
    )
      .duplicateObject(literal)
      .equals(replacement),
  ).toBe(true);
  expect(() => duplicate.duplicateObject(f.getOWLOntologyID(old))).toThrow(
    TypeError,
  );
});

const fixture = () => {
  const manager = new OWLOntologyManager();
  const ontology = manager.createOntology(
    f.getOWLOntologyID(IRI.create("urn:transform:ontology")),
  );
  manager.addAxioms(ontology, [
    f.getOWLClassAssertionAxiom(c, anon),
    f.getOWLDeclarationAxiom(i),
    f.getOWLAnnotationAssertionAxiom(f.getRDFSLabel(), old, old),
    f.getOWLAnnotationAssertionAxiom(
      f.getRDFSLabel(),
      IRI.create("urn:transform:unrelated"),
      old,
    ),
  ]);
  manager.applyChange(
    new AddOntologyAnnotation(
      ontology,
      f.getOWLAnnotation(f.getRDFSLabel(), old),
    ),
  );
  return { manager, ontology };
};

test("typed renaming proposes native-shaped changes without application or anonymous remapping", () => {
  const { manager, ontology } = fixture();
  const renamer = new OWLEntityRenamer(manager, [ontology]);
  const changes = renamer.changeIRI(c, next);
  expect(changes).toHaveLength(6);
  expect(ontology.containsEntityInSignature(c)).toBe(true);
  const additions = changes
    .filter((change) => change instanceof AddAxiom)
    .map((change) => change.getAxiom());
  expect(
    additions.some((ax) => ax.equals(f.getOWLClassAssertionAxiom(d, anon))),
  ).toBe(true);
  expect(
    additions.some((ax) =>
      ax.equals(f.getOWLAnnotationAssertionAxiom(f.getRDFSLabel(), next, next)),
    ),
  ).toBe(true);
  expect(renamer.changeIRI(old, next)).toHaveLength(10);
  expect(renamer.changeIRI(c, old)).toEqual([]);
  manager.applyChanges(changes);
  expect(ontology.containsEntityInSignature(d)).toBe(true);
  expect(ontology.containsEntityInSignature(i)).toBe(true);
  expect(
    [...ontology.getReferencedAnonymousIndividuals()][0].equals(anon),
  ).toBe(true);
});

test("remover includes subject annotations, preserves unrelated IRI values and repeats until reset", () => {
  const { ontology } = fixture();
  const remover = new OWLEntityRemover(ontology);
  remover.visit(c);
  remover.visit(c);
  expect(remover.getChanges()).toHaveLength(4);
  const result = remover.getChanges();
  result.length = 0;
  expect(remover.getChanges()).toHaveLength(4);
  expect(ontology.getAxiomCount()).toBe(4);
  remover.reset();
  expect(remover.getChanges()).toEqual([]);
  expect(() => remover.visit(old)).toThrow(TypeError);
});

test("duplication preserves the complete structural fixture modulo a consistent anonymous bijection", async () => {
  const source = readFileSync(
    new URL(
      "./owlapi-reference/fixtures/storage/functional-all-kinds.ofn",
      import.meta.url,
    ),
    "utf8",
  );
  const manager = new OWLOntologyManager();
  const ontology = await manager.loadOntologyFromOntologyDocument(
    new StringDocumentSource(source),
    { parsingMode: "strict" },
  );
  const duplicator = new OWLObjectDuplicator(manager);
  const axioms = [...ontology.getAxioms()].map((axiom) =>
    duplicator.duplicateObject(axiom),
  );
  const annotations = [...ontology.getAnnotations()].map((annotation) =>
    duplicator.duplicateObject(annotation),
  );
  const copied = new OWLOntology({
    ontologyID: ontology.getOntologyID(),
    axioms,
    annotations,
  });
  expect(compareOntologies(ontology, copied).equal).toBe(true);
  const seen = new Set();
  const pending = [...ontology.getAxioms(), ...ontology.getAnnotations()];
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== "object") continue;
    if (value.kind) {
      seen.add(value.kind);
      expect(() => duplicator.duplicateObject(value)).not.toThrow();
    }
    pending.push(...Object.values(value));
  }
  expect([...seen].sort()).toEqual(
    OWL_OBJECT_KINDS.filter(
      (kind) => kind !== "OWLOntologyID" && kind !== "OWLImportsDeclaration",
    ).sort(),
  );
});

test("typed collisions normalize canonical sets and never replace literal lexical text", () => {
  const manager = new OWLOntologyManager();
  const duplicator = new OWLObjectDuplicator(new Map([[c, next]]), manager);
  const expression = f.getOWLObjectIntersectionOf([c, d]);
  const result = duplicator.duplicateObject(expression);
  expect(result.operands).toHaveLength(1);
  expect(result.operands[0].equals(d)).toBe(true);
  const literal = f.getOWLLiteral(old.value);
  expect(duplicator.duplicateObject(literal).lexicalForm).toBe(old.value);
});

test("replacement maps reject inconsistent canonical fields before capture", () => {
  const manager = new OWLOntologyManager();
  const literal = f.getOWLLiteral("original");
  const forged = new OWLStructuralObject(
    literal.kind,
    {
      lexicalForm: "forged",
      datatype: literal.datatype,
      language: literal.language,
    },
    literal.toStructuralTuple().slice(1),
  );
  expect(
    () =>
      new OWLObjectDuplicator(new Map(), new Map([[literal, forged]]), manager),
  ).toThrow();
});

test("transforms enforce structural depth without changing the source", () => {
  const manager = new OWLOntologyManager();
  let expression = c;
  for (let depth = 0; depth < 513; depth++)
    expression = f.getOWLObjectComplementOf(expression);
  expect(() =>
    new OWLObjectDuplicator(manager).duplicateObject(expression),
  ).toThrow(ResourceLimitError);
  expect(expression.kind).toBe("OWLObjectComplementOf");
});
