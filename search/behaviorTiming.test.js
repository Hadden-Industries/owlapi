import { OWLManager } from "../apibinding/index.js";
import { IRI, AddImport, RemoveImport } from "../model/index.js";
import { OWLOntologyImportsClosureSetProvider } from "../util/index.js";
import { EntitySearcher } from "./index.js";
import {
  SyntacticLocalityModuleExtractor,
  LocalityClass,
} from "../modularity/locality/index.js";

test.each(["java-owlapi-5.5.1", "normative-v1"])(
  "%s search reads current axioms only when consumed",
  (behaviorProfileId) => {
    const manager = OWLManager.createOWLOntologyManager({ behaviorProfileId });
    const ontology = manager.createOntology();
    const factory = manager.getOWLDataFactory();
    const a = factory.getOWLClass(IRI.create("urn:timing:A"));
    const b = factory.getOWLClass(IRI.create("urn:timing:B"));
    let iterations = 0;
    const ontologies = {
      *[Symbol.iterator]() {
        iterations++;
        yield ontology;
      },
    };
    const direct = EntitySearcher.getSuperClasses(a, ontology);
    const deferred = EntitySearcher.getSuperClasses(a, ontologies);
    expect(iterations).toBe(0);
    const axiom = factory.getOWLSubClassOfAxiom(a, b);
    manager.addAxiom(ontology, axiom);
    expect([...direct]).toEqual([b]);
    expect([...deferred]).toEqual([b]);
    expect(iterations).toBe(1);
    expect(() => [...deferred]).toThrow(/consum/);
    const removed = EntitySearcher.getSuperClasses(a, ontology);
    manager.removeAxiom(ontology, axiom);
    expect([...removed]).toEqual([]);
  },
);

test("empty locality seeds invoke no filter callback", async () => {
  const manager = OWLManager.createOWLOntologyManager();
  const factory = manager.getOWLDataFactory();
  const a = factory.getOWLClass(IRI.create("urn:timing:A"));
  const extractor = new SyntacticLocalityModuleExtractor(LocalityClass.BOTTOM, [
    factory.getOWLSubClassOfAxiom(
      factory.getOWLClass(IRI.create("http://www.w3.org/2002/07/owl#Thing")),
      a,
    ),
  ]);
  let calls = 0;
  expect(
    await extractor.extract([], () => {
      calls++;
      return true;
    }),
  ).toEqual([]);
  expect(calls).toBe(0);
});

test.each(["java-owlapi-5.5.1", "normative-v1"])(
  "%s closure provider reads membership at call time and preserves each returned snapshot",
  (behaviorProfileId) => {
    const manager = OWLManager.createOWLOntologyManager({ behaviorProfileId });
    const factory = manager.getOWLDataFactory();
    const root = manager.createOntology(
      factory.getOWLOntologyID(IRI.create("urn:timing:root")),
    );
    const child = manager.createOntology(
      factory.getOWLOntologyID(IRI.create("urn:timing:child")),
    );
    const provider = new OWLOntologyImportsClosureSetProvider(manager, root);
    const beforeImport = provider.ontologies();
    const declaration = factory.getOWLImportsDeclaration(
      IRI.create("urn:timing:child"),
    );
    manager.applyChange(new AddImport(root, declaration));
    expect([...beforeImport]).toEqual([root]);
    expect([...provider.ontologies()]).toEqual([root, child]);
    const beforeRemoval = provider.ontologies();
    manager.applyChange(new RemoveImport(root, declaration));
    expect([...beforeRemoval]).toEqual([root, child]);
    expect([...provider.ontologies()]).toEqual([root]);
  },
);
