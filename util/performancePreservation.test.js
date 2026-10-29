import { OWLManager } from "../apibinding/index.js";
import { readFileSync } from "node:fs";
import {
  IRI,
  OWLDataFactory,
  OWLObjectKind,
  OWLOntology,
  OWLOntologyLoaderConfiguration,
  OWLOntologyWriterConfiguration,
  OWLStructuralObject,
} from "../model/index.js";
import { normalizeStructuralSet } from "../model/structural.js";
import { compareOntologies } from "../internal/model/ontologyStructuralIsomorphism.js";
import { EntitySearcher } from "../search/index.js";
import { RDFXMLDocumentFormat, OWLDocumentFormats } from "../formats/index.js";
import { StringDocumentTarget } from "../io/index.js";
import { OWLOntologyImportsClosureSetProvider } from "./index.js";
import { readOntologySnapshot } from "../model/owlOntology.js";
import { readOntologyWriterConfiguration } from "../model/owlOntologyWriterConfiguration.js";
import { owlXmlStorer } from "../internal/storage/owlxml/owlXmlStorer.js";
import { defaultDocumentStoragePolicy } from "../internal/behavior/ontologyBehaviorContext.js";

test("loader copies retain the complete public field layout and admitted symbol values", () => {
  const extension = Symbol("consumer metadata");
  const defaults = new OWLOntologyLoaderConfiguration();
  const native = new OWLOntologyLoaderConfiguration({
    ...defaults,
    maxQuads: 23,
  });
  const nativeCopy = native.setConnectionTimeout(17);
  expect(Object.keys(nativeCopy)).toEqual(Object.keys(native));
  expect({ ...nativeCopy }).toEqual({ ...native });
  expect(nativeCopy.getConnectionTimeout()).toBe(17);
  expect(native.getConnectionTimeout()).toBe(20000);
  expect({ ...native.with({ maxRetries: 2 }) }).toEqual({
    ...native,
    maxRetries: 2,
  });
  const original = new OWLOntologyLoaderConfiguration({
    [extension]: "retained",
  });
  for (const copy of [
    original.with({}),
    original.setConnectionTimeout(17),
    original.setStrict(false),
  ]) {
    expect(Reflect.ownKeys(copy)).toEqual([
      ...Object.keys(defaults),
      extension,
    ]);
    expect(copy[extension]).toBe("retained");
    expect(Object.isFrozen(copy)).toBe(true);
    expect(copy.maxQuads).toBe(5000000);
  }
  expect(original.isStrict()).toBe(true);
  const introduced = defaults.with({
    maxRetries: 2,
    [extension]: "introduced",
  });
  for (const copy of [
    introduced.with({}),
    introduced.setStrict(false),
    introduced.setConnectionTimeout(17),
  ]) {
    expect(copy[extension]).toBe("introduced");
    expect(Object.isFrozen(copy)).toBe(true);
  }
});

const doubleSubnormalObservations = JSON.parse(
  readFileSync(
    new URL(
      "./owlapi-reference/fixtures/double-subnormal-java25.json",
      import.meta.url,
    ),
    "utf8",
  ),
).observations;
test.each(doubleSubnormalObservations)(
  "Java double spelling matches JDK raw bits $bits",
  ({ lexical: input, expected }) => {
    const datatype = IRI.create("http://www.w3.org/2001/XMLSchema#double");
    const java = new OWLDataFactory({ behaviorProfileId: "java-owlapi-5.5.1" });
    expect(java.getOWLLiteral(input, datatype).lexicalForm).toBe(expected);
    expect(
      new OWLDataFactory().getOWLLiteral(input, datatype).lexicalForm,
    ).toBe(input);
  },
);

test.each(["java-writer", "normative"])(
  "OWL/XML %s preserves escaped Unicode and exact output byte limits",
  (presentation) => {
    const manager = OWLManager.createOWLOntologyManager();
    const factory = manager.getOWLDataFactory();
    const ontology = manager.createOntology();
    manager.addAxiom(
      ontology,
      factory.getOWLAnnotationAssertionAxiom(
        factory.getRDFSLabel(),
        IRI.create("urn:xml:byte-limit"),
        factory.getOWLLiteral("<>&\r\n\téΩ😀"),
      ),
    );
    const snapshot = readOntologySnapshot(ontology);
    const writer = readOntologyWriterConfiguration(
      new OWLOntologyWriterConfiguration(),
    );
    const policy = {
      ...defaultDocumentStoragePolicy,
      owlXmlPresentation: presentation,
    };
    const render = (maxOutputBytes) =>
      owlXmlStorer.render(snapshot, OWLDocumentFormats.OWL_XML, writer, {
        ...policy,
        maxOutputBytes,
      });
    const text = render(Infinity);
    expect(text).toContain("&lt;&gt;&amp;&#13;");
    expect(text).toContain("éΩ😀");
    const bytes = new TextEncoder().encode(text).length;
    expect(bytes).toBeGreaterThan(text.length);
    expect(render(bytes)).toBe(text);
    expect(() => render(bytes - 1)).toThrow(
      expect.objectContaining({
        code: "RESOURCE_LIMIT_EXCEEDED",
        resource: "outputBytes",
        limit: bytes - 1,
      }),
    );
  },
);

test("class search retains indexed filtering of admitted structural arrays", () => {
  const df = new OWLDataFactory();
  const a = df.getOWLClass(IRI.create("urn:search-array:A"));
  const b = df.getOWLClass(IRI.create("urn:search-array:B"));
  const c = df.getOWLClass(IRI.create("urn:search-array:C"));
  const values = [a, b];
  values[Symbol.iterator] = function* () {
    yield a;
    yield c;
  };
  Object.freeze(values);
  const axiom = new OWLStructuralObject(
    OWLObjectKind.EQUIVALENT_CLASSES_AXIOM,
    { classExpressions: values, annotations: Object.freeze([]) },
    [values, []],
  );
  const ontology = new OWLOntology({ axioms: [axiom] });
  expect([...EntitySearcher.getEquivalentClasses(a, ontology)]).toEqual([b]);
});

test("literal construction retains public field order and foreign tuple conversion", () => {
  const df = new OWLDataFactory();
  const iri = IRI.create("urn:literal:foreign-datatype");
  let conversions = 0;
  const datatype = Object.freeze({
    kind: OWLObjectKind.DATATYPE,
    iri,
    structuralKey: () => "foreign-datatype",
    toStructuralTuple() {
      conversions += 1;
      return [OWLObjectKind.DATATYPE, iri];
    },
  });
  const literal = df.getOWLLiteral("retained", datatype);
  expect(Object.keys(literal)).toEqual([
    "kind",
    "datatype",
    "language",
    "lexicalForm",
  ]);
  expect(literal.datatype).toBe(datatype);
  expect(conversions).toBe(1);
  expect(literal.toStructuralTuple()).toEqual([
    OWLObjectKind.LITERAL,
    "retained",
    "",
    [OWLObjectKind.DATATYPE, iri.toStructuralTuple()],
  ]);
  expect(Object.isFrozen(literal)).toBe(true);
  df.getOWLDatatype = () => undefined;
  expect(df.getOWLLiteral("native override").datatype).toBeUndefined();
});

test.each(["java-owlapi-5.5.1", "normative-v1"])(
  "%s cached annotation views retain nested matches, liveness and per-ontology multiplicity",
  (behaviorProfileId) => {
    const manager = OWLManager.createOWLOntologyManager({ behaviorProfileId });
    const ontology = manager.createOntology();
    const df = manager.getOWLDataFactory();
    const subject = IRI.create("urn:performance:subject");
    const outer = df.getRDFSLabel();
    const nestedProperty = df.getOWLAnnotationProperty(
      IRI.create("urn:performance:nested"),
    );
    const nested = df.getOWLAnnotation(
      nestedProperty,
      df.getOWLLiteral("nested"),
    );
    const assertion = df.getOWLAnnotationAssertionAxiom(
      outer,
      subject,
      df.getOWLLiteral("outer"),
      [nested],
    );
    manager.addAxiom(ontology, assertion);
    expect([
      ...EntitySearcher.getAnnotations(
        subject,
        [ontology, ontology],
        nestedProperty,
      ),
    ]).toEqual([nested, nested]);
    expect([
      ...EntitySearcher.getAnnotationObjects(
        subject,
        [ontology],
        nestedProperty,
      ),
    ]).toEqual([]);
    const deferred = EntitySearcher.getAnnotations(subject, ontology);
    manager.removeAxiom(ontology, assertion);
    expect([...deferred]).toEqual([]);
    expect(() => [...deferred]).toThrow(/consum/);
    manager.addAxiom(ontology, assertion);
    const iterator = EntitySearcher.getAnnotations(
      subject,
      [ontology, ontology],
      nestedProperty,
    )[Symbol.iterator]();
    expect(iterator.next().value).toBe(nested);
    manager.removeAxiom(ontology, assertion);
    expect(iterator.next().value).toBe(nested);
    expect([...EntitySearcher.getAnnotations(subject, ontology)]).toEqual([]);
  },
);

test("structural set normalization consumes custom array iterators completely", () => {
  const manager = OWLManager.createOWLOntologyManager();
  const df = manager.getOWLDataFactory();
  const a = df.getOWLClass(IRI.create("urn:performance:A"));
  const b = df.getOWLClass(IRI.create("urn:performance:B"));
  const c = df.getOWLClass(IRI.create("urn:performance:C"));
  const input = [a, b];
  input[Symbol.iterator] = function* () {
    yield c;
    yield b;
    yield a;
  };
  expect(normalizeStructuralSet(input, "operands")).toEqual([a, b, c]);
});

test("equal axiom counts cannot substitute for the saved ontology's structure", () => {
  const manager = OWLManager.createOWLOntologyManager();
  const df = manager.getOWLDataFactory();
  const left = manager.createOntology();
  const right = manager.createOntology();
  manager.addAxiom(
    left,
    df.getOWLDeclarationAxiom(df.getOWLClass(IRI.create("urn:performance:A"))),
  );
  manager.addAxiom(
    right,
    df.getOWLDeclarationAxiom(df.getOWLClass(IRI.create("urn:performance:B"))),
  );
  expect(left.getAxiomCount()).toBe(right.getAxiomCount());
  expect(compareOntologies(left, right).equal).toBe(false);
});

test("a native manager override remains observable through a closure provider", () => {
  const manager = OWLManager.createOWLOntologyManager();
  const root = manager.createOntology();
  const other = manager.createOntology();
  let calls = 0;
  manager.getImportsClosure = function (value) {
    expect(this).toBe(manager);
    expect(value).toBe(root);
    calls += 1;
    return [other];
  };
  const provider = new OWLOntologyImportsClosureSetProvider(manager, root);
  expect([...provider.ontologies()]).toEqual([other]);
  expect(calls).toBe(1);
});

test("foreign closure functions are invoked without consulting their call property", () => {
  const manager = OWLManager.createOWLOntologyManager();
  const root = manager.createOntology();
  const foreign = {
    getImportsClosure() {
      return [root];
    },
  };
  foreign.getImportsClosure.call = () => {
    throw new Error("unrelated function property");
  };
  const provider = new OWLOntologyImportsClosureSetProvider(foreign, root);
  expect([...provider.ontologies()]).toEqual([root]);
});

test("Java writer copies preserve labels when anonymous IDs are enabled", () => {
  // Released 5.5.1 jar SHA-256 747b1a5269fee2992487dcde946f16dfbc14aa458d50854994a0485cf263ce07.
  // Independent WriterSemanticProbe observes false,4,true,true,true after this chain.
  const oracle = JSON.parse(
    readFileSync(
      new URL(
        "./owlapi-reference/fixtures/writer-copy-semantics-java551.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const configuration = new OWLOntologyWriterConfiguration({
    behaviorProfileId: "java-owlapi-5.5.1",
  })
    .withIndenting(false)
    .withIndentSize(2)
    .withBannersEnabled(false)
    .withLabelsAsBanner(true)
    .withSaveIdsForAllAnonymousIndividuals(true);
  expect([
    configuration.isIndenting(),
    configuration.getIndentSize(),
    configuration.shouldUseBanners(),
    configuration.isLabelsAsBanner(),
    configuration.shouldSaveIdsForAllAnonymousIndividuals(),
  ]).toEqual(oracle.observations.saveIds);
  expect(configuration.withLabelsAsBanner(true)).toBe(configuration);
  expect(configuration.withIndentSize(3).isLabelsAsBanner()).toBe(true);
});

test("search arrays retain indexed admission rather than consulting a second iterator", () => {
  const manager = OWLManager.createOWLOntologyManager();
  const ontology = manager.createOntology();
  const df = manager.getOWLDataFactory();
  const a = df.getOWLClass(IRI.create("urn:performance:A"));
  const b = df.getOWLClass(IRI.create("urn:performance:B"));
  manager.addAxiom(ontology, df.getOWLSubClassOfAxiom(a, b));
  const input = [ontology];
  input[Symbol.iterator] = () => {
    throw new Error("must not re-enumerate an admitted array");
  };
  expect([...EntitySearcher.getSuperClasses(a, input)]).toEqual([b]);
});

test("repeated RDF saves observe new snapshots, format prefixes and writer settings", async () => {
  const manager = OWLManager.createOWLOntologyManager();
  const df = manager.getOWLDataFactory();
  const ontology = manager.createOntology(
    df.getOWLOntologyID(IRI.create("urn:performance:ontology")),
  );
  const format = new RDFXMLDocumentFormat();
  const before = new StringDocumentTarget();
  await manager.saveOntology(ontology, format, before);
  manager.addAxiom(
    ontology,
    df.getOWLDeclarationAxiom(
      df.getOWLClass(IRI.create("urn:performance:NewClass")),
    ),
  );
  format.setPrefix("perf:", "urn:performance:");
  manager.setOntologyWriterConfiguration(
    new OWLOntologyWriterConfiguration().withIndenting(false),
  );
  const after = new StringDocumentTarget();
  await manager.saveOntology(ontology, format, after);
  expect(before.toString()).not.toContain("NewClass");
  expect(after.toString()).toContain("NewClass");
  expect(after.toString()).toContain('xmlns:perf="urn:performance:"');
});
