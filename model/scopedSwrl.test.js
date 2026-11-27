import {
  OWLManager,
  OWLDataFactory,
  OWLStructuralObject,
  OWLDocumentFormats,
  StringDocumentSource,
  StringDocumentTarget,
  StreamDocumentSource,
  StreamDocumentTarget,
  OWLOntologyMerger,
  OWL2DLProfile,
  OWL2ELProfile,
  OWL2QLProfile,
  OWL2RLProfile,
  IRI,
  AXIOM_KINDS,
  AXIOM_KINDS_WITH_SWRL,
  dispatchAxiom,
  OWL_OBJECT_KINDS,
  OWL_OBJECT_KINDS_WITH_SWRL,
  dispatchOwlObject,
} from "../index.js";
import { scopedSwrlCases } from "../util/owlapi-reference/scoped-swrl-fixtures.mjs";
import { jest } from "@jest/globals";
import { CompactRdfGraph } from "../internal/rdfjs/compactRdfGraph.js";

const cases = new Map(
  (await scopedSwrlCases()).map((entry) => [entry.id, entry]),
);
const createManager = () =>
  OWLManager.createOWLOntologyManager({
    behaviorProfileId: "java-owlapi-5.5.1",
  });
const sourceOf = (entry) =>
  new StringDocumentSource(entry.text, {
    documentIRI: "urn:owlapi:fixture:" + entry.id,
    format:
      entry.format === "functional"
        ? OWLDocumentFormats.FUNCTIONAL
        : OWLDocumentFormats.RDF_XML,
  });
const read = (manager, entry, options = {}) =>
  manager.loadOntologyFromOntologyDocument(
    sourceOf(entry),
    manager.getOntologyLoaderConfiguration().setStrict(false).with(options),
  );

test("individual comparison atoms and anonymous class predicates survive both rule formats", async () => {
  const manager = createManager();
  const ontology = await read(manager, {
    id: "individual-comparison-rule",
    format: "functional",
    text: `Prefix(:=<urn:test:rule#>)
      Ontology(<urn:test:rule>
        Declaration(Class(:C))
        DLSafeRule(Body(
          SameIndividualAtom(Variable(:x) Variable(:y))
          DifferentIndividualsAtom(Variable(:x) Variable(:z))
        ) Head(ClassAtom(ObjectComplementOf(:C) Variable(:x))))
      )`,
  });
  const [rule] = ontology.getAxiomsByType("SWRLRule");
  expect(rule.body.map((atom) => atom.kind)).toEqual([
    "SWRLSameIndividualAtom",
    "SWRLDifferentIndividualsAtom",
  ]);
  expect(rule.head[0].predicate.kind).toBe("OWLObjectComplementOf");
  expect(rule.body[1].secondArgument.iri.value).toBe("urn:test:rule#z");
  for (const format of [
    OWLDocumentFormats.FUNCTIONAL,
    OWLDocumentFormats.RDF_XML,
  ]) {
    const target = new StringDocumentTarget();
    await manager.saveOntology(ontology, format, target);
    const reloaded = await createManager().loadOntologyFromOntologyDocument(
      new StringDocumentSource(target.toString(), { format }),
      { parsingMode: "compatible" },
    );
    expect(reloaded.containsAxiom(rule)).toBe(true);
  }
});

test.each(["simple", "simple-functional"])(
  "%s exposes one logical rule before any writer runs",
  async (id) => {
    const ontology = await read(createManager(), cases.get(id));
    const axioms = [...ontology.getAxioms()];
    const rules = axioms.filter((a) => a.kind === "SWRLRule");
    expect(rules).toHaveLength(1);
    expect(axioms).toHaveLength(4);
    const [rule] = rules;
    expect(rule.body.map((atom) => atom.kind)).toEqual([
      "SWRLClassAtom",
      "SWRLObjectPropertyAtom",
    ]);
    expect(rule.head.map((atom) => atom.predicate.iri.value)).toEqual([
      "urn:owlapi:test:swrl#q",
    ]);
    expect(rule.head[0].firstArgument.iri.value).toBe("urn:swrl:var#x");
    expect(rule.head[0].secondArgument.iri.value).toBe("urn:swrl#x");
    expect([...ontology.getIndividualsInSignature()]).toEqual([]);
  },
);

test("the declarations-only control exposes the three declared entities", async () => {
  const ontology = await read(createManager(), cases.get("declarations"));
  expect(
    [...ontology.getAxioms()].map((a) => a.entity.iri.value).sort(),
  ).toEqual([
    "urn:owlapi:test:swrl#C",
    "urn:owlapi:test:swrl#p",
    "urn:owlapi:test:swrl#q",
  ]);
});

const ruleOf = (ontology) => [...ontology.getAxiomsByType("SWRLRule")][0];

test("rule set identity preserves encounter order, roles and existing visitor contracts", async () => {
  const m = createManager();
  const o = await read(m, cases.get("duplicates"));
  const a = ruleOf(o);
  const b = ruleOf(await read(createManager(), cases.get("reordered")));
  expect(a.body.map((atom) => atom.predicate.iri.value)).toEqual(
    [...b.body].reverse().map((atom) => atom.predicate.iri.value),
  );
  expect(a.equals(b)).toBe(true);
  expect(a.structuralKey()).toBe(b.structuralKey());
  expect([...o.getLogicalAxioms()]).toEqual([a]);
  m.addAxiom(o, b);
  expect(o.getAxiomCount()).toBe(3);
  m.removeAxiom(o, b);
  expect(o.containsAxiom(a)).toBe(false);
  m.addAxiom(o, a);
  expect(o.containsAxiomIgnoreAnnotations(b)).toBe(true);
  for (const [dispatch, oldDomain, extended] of [
    [dispatchAxiom, AXIOM_KINDS, AXIOM_KINDS_WITH_SWRL],
    [dispatchOwlObject, OWL_OBJECT_KINDS, OWL_OBJECT_KINDS_WITH_SWRL],
  ]) {
    const handlers = Object.fromEntries(
      oldDomain.map((kind) => [kind, (v) => v.kind]),
    );
    expect(
      dispatch([...o.getAxiomsByType("OWLDeclarationAxiom")][0], handlers),
    ).toBe("OWLDeclarationAxiom");
    expect(() => dispatch(a, handlers)).toThrow(/SWRLRule/);
    expect(() => dispatch(a, handlers, extended)).toThrow(/Missing handler/);
    for (const kind of extended) handlers[kind] = (v) => v.kind;
    expect(dispatch(a, handlers, extended)).toBe("SWRLRule");
  }
});

test.each(["unsupported-first", "unsupported-last"])(
  "%s rejects the entire document with warnings disabled",
  async (id) => {
    const m = createManager();
    await expect(
      read(m, cases.get(id), { collectWarnings: false }),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_CONSTRUCT",
      construct: "http://www.w3.org/2003/11/swrl#BuiltinAtom",
    });
    const identity = m
      .getOWLDataFactory()
      .getOWLOntologyID(IRI.create("urn:owlapi:test:swrl:simple"));
    expect(m.getOntology(identity)).toBeUndefined();
    expect(ruleOf(await read(m, cases.get("simple"))).body).toHaveLength(2);
  },
);

test("Functional storage describes the public model and distinguishes a changed head predicate", async () => {
  const m = createManager(),
    o = await read(m, cases.get("simple"));
  const target = new StringDocumentTarget();
  await m.saveOntology(o, OWLDocumentFormats.FUNCTIONAL, target);
  const text = target.toString();
  expect(text).toContain(
    "Head(ObjectPropertyAtom(<urn:owlapi:test:swrl#q> Variable(<urn:swrl:var#x>) Variable(<urn:swrl#x>)))",
  );
  const from = (text) =>
    read(createManager(), { id: "written", format: "functional", text });
  expect(ruleOf(await from(text)).equals(ruleOf(o))).toBe(true);
  const changed = await from(
    text.replace(
      "Head(ObjectPropertyAtom(<urn:owlapi:test:swrl#q>",
      "Head(ObjectPropertyAtom(<urn:owlapi:test:swrl#p>",
    ),
  );
  expect(changed.getAxiomCount()).toBe(o.getAxiomCount());
  expect(ruleOf(changed).equals(ruleOf(o))).toBe(false);
});

test("identical lists preserve both roles while a cycle or distinct overlapping tails fail", async () => {
  const m = createManager(),
    shared = cases.get("shared-list");
  const rule = ruleOf(await read(m, shared));
  expect(rule.body).toHaveLength(1);
  expect(rule.body[0].equals(rule.head[0])).toBe(true);
  await expect(
    read(createManager(), cases.get("crossed-list")),
  ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR" });
  const text = shared.text.replace(
    '<rdf:rest rdf:resource="http://www.w3.org/1999/02/22-rdf-syntax-ns#nil"/>',
    '<rdf:rest rdf:nodeID="shared"/>',
  );
  await expect(
    read(createManager(), { ...shared, text }),
  ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR" });
  await expect(
    read(createManager(), cases.get("simple"), { maxRdfListLength: 1 }),
  ).rejects.toMatchObject({
    code: "RESOURCE_LIMIT_EXCEEDED",
    resource: "maxRdfListLength",
  });
});

test("both formats retain empty sides, require both Functional groups, and allow free head variables", async () => {
  for (const id of ["empty-rdf", "empty-functional"]) {
    const rule = ruleOf(await read(createManager(), cases.get(id)));
    expect([rule.body, rule.head]).toEqual([[], []]);
  }
  await expect(
    read(createManager(), cases.get("missing-head")),
  ).rejects.toMatchObject({
    code: "UNPARSABLE_ONTOLOGY",
    errors: expect.arrayContaining([
      expect.objectContaining({ code: "OWL_SYNTAX_ERROR" }),
    ]),
  });
  const free = ruleOf(await read(createManager(), cases.get("free-head")));
  expect(free.body[0].argument.iri.value).not.toBe(
    free.head[0].argument.iri.value,
  );
});

test("rule ownership retains ordinary statements about a referenced variable", async () => {
  const e = cases.get("simple");
  const text = e.text.replace(
    "</rdf:RDF>",
    '<rdf:Description rdf:about="urn:swrl#x"><rdfs:label xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#">ordinary</rdfs:label></rdf:Description></rdf:RDF>',
  );
  const o = await read(createManager(), { ...e, text });
  expect(
    [...o.getAxiomsByType("OWLAnnotationAssertionAxiom")].map(
      (a) => a.value.lexicalForm,
    ),
  ).toEqual(["ordinary"]);
  expect(ruleOf(o).body).toHaveLength(2);
});

test.each([
  OWLDocumentFormats.FUNCTIONAL,
  OWLDocumentFormats.RDF_XML,
  OWLDocumentFormats.TURTLE,
])(
  "an edited annotated rule round-trips through %o and a fragmented byte source",
  async (format) => {
    const m = createManager(),
      o = await read(m, cases.get("annotated"), {
        loadAnnotationAxioms: false,
      }),
      a = ruleOf(o);
    expect(
      a.annotations.map((n) => [
        n.property.iri.value,
        n.value.lexicalForm,
        n.value.language,
        n.value.datatype.iri.value,
      ]),
    ).toEqual(
      expect.arrayContaining([
        [
          "http://www.w3.org/2000/01/rdf-schema#label",
          "Incompatible links",
          "en",
          "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString",
        ],
        [
          "http://www.w3.org/2000/01/rdf-schema#comment",
          "Both endpoints are excluded.",
          "",
          "http://www.w3.org/2001/XMLSchema#string",
        ],
        [
          "urn:owlapi:test:swrl#enabled",
          "false",
          "",
          "http://www.w3.org/2001/XMLSchema#boolean",
        ],
      ]),
    );
    expect(a.annotations).toHaveLength(3);
    expect(a.head.map((atom) => atom.argument.iri.value)).toEqual([
      "urn:swrl#x",
      "urn:swrl:var#x",
    ]);
    expect(
      o.containsAxiomIgnoreAnnotations(a.getAxiomWithoutAnnotations()),
    ).toBe(true);
    const df = m.getOWLDataFactory(),
      edit = df.getOWLDeclarationAxiom(
        df.getOWLClass(IRI.create("urn:edited")),
      );
    m.addAxiom(o, edit);
    const target = new StringDocumentTarget();
    await m.saveOntology(o, format, target);
    const bytes = new TextEncoder().encode(target.toString());
    const stream = new StreamDocumentSource(
      function* () {
        for (let start = 0; start < bytes.length; start += 7)
          yield bytes.subarray(start, start + 7);
      },
      { format, documentIRI: "urn:written" },
    );
    const fresh = createManager();
    const loaded = await fresh.loadOntologyFromOntologyDocument(
      stream,
      fresh.getOntologyLoaderConfiguration().setStrict(false),
    );
    expect(ruleOf(loaded).equals(a)).toBe(true);
    expect(loaded.containsAxiom(edit)).toBe(true);
    expect([...loaded.getIndividualsInSignature()]).toEqual([]);
  },
);

test("the named Java language checkers and the normative grammar retain their separate contracts", async () => {
  const m = createManager(),
    o = await read(m, cases.get("simple"));
  const options = { behaviorProfileId: "java-owlapi-5.5.1" };
  expect(
    (await new OWL2DLProfile(options).checkOntology(o)).isInProfile(),
  ).toBe(true);
  for (const Checker of [OWL2ELProfile, OWL2QLProfile, OWL2RLProfile]) {
    const report = await new Checker(options).checkOntology(o);
    expect(report.getViolations().map((v) => v.code)).toContain(
      "PROFILE_AXIOM_NOT_ALLOWED",
    );
  }
  const normative = OWLManager.createOWLOntologyManager();
  await expect(
    read(normative, cases.get("simple-functional")),
  ).rejects.toMatchObject({ code: "UNSUPPORTED_CONSTRUCT" });
  const copy = new OWLOntologyMerger({
    ontologies: () => [o],
  }).createMergedOntology(normative, IRI.create("urn:merged"));
  expect(copy.containsAxiom(ruleOf(o))).toBe(true);
  expect((await new OWL2DLProfile().checkOntology(copy)).isInProfile()).toBe(
    false,
  );
  for (const format of [
    OWLDocumentFormats.FUNCTIONAL,
    OWLDocumentFormats.RDF_XML,
    OWLDocumentFormats.TURTLE,
  ]) {
    const target = new StringDocumentTarget();
    await expect(
      normative.saveOntology(copy, format, target),
    ).rejects.toMatchObject({ reason: "ONTOLOGY_NOT_REPRESENTABLE" });
    expect(target.toString()).toBe("");
  }
  await expect(
    m.saveOntology(o, OWLDocumentFormats.OWL_XML, new StringDocumentTarget()),
  ).rejects.toThrow();
});

test("unsupported constants and rule annotations refuse publication", async () => {
  const sample = cases.get("simple"),
    annotated = cases.get("annotated");
  const constant = {
    ...sample,
    text: sample.text.replace(
      '<swrl:Variable rdf:about="urn:swrl#x"/>',
      '<owl:NamedIndividual rdf:about="urn:swrl#x"/>',
    ),
  };
  const nested = {
    ...annotated,
    text: annotated.text
      .replace("<swrl:Imp>", '<swrl:Imp rdf:nodeID="rule">')
      .replace(
        "</rdf:RDF>",
        '<owl:Annotation><owl:annotatedSource rdf:nodeID="rule"/><owl:annotatedProperty rdf:resource="http://www.w3.org/2000/01/rdf-schema#comment"/><owl:annotatedTarget>Both endpoints are excluded.</owl:annotatedTarget><rdfs:label>nested</rdfs:label></owl:Annotation></rdf:RDF>',
      ),
  };
  for (const entry of [cases.get("iri-annotation"), constant, nested]) {
    const m = createManager();
    await expect(
      read(m, entry, { loadAnnotationAxioms: false, collectWarnings: false }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_CONSTRUCT" });
    expect(ruleOf(await read(m, sample))).toBeDefined();
  }
});

test("an interrupted export cannot publish completion or change the managed rule", async () => {
  const m = createManager(),
    o = await read(m, cases.get("annotated")),
    a = ruleOf(o);
  let delivered = 0,
    finished = false;
  const sink = new StreamDocumentTarget(async (chunks) => {
    for await (const chunk of chunks) {
      delivered += chunk.length;
      throw new Error("sink interrupted");
    }
    finished = true;
  });
  await expect(
    m.saveOntology(o, OWLDocumentFormats.FUNCTIONAL, sink),
  ).rejects.toThrow();
  expect(delivered).toBeGreaterThan(0);
  expect(finished).toBe(false);
  expect(ruleOf(o).equals(a)).toBe(true);
});

function manyRules(count) {
  const simple = cases.get("simple");
  const rows = Array.from(
    { length: count },
    (_, i) =>
      '<swrl:Imp><swrl:body rdf:parseType="Collection"><swrl:ClassAtom><swrl:classPredicate rdf:resource="urn:rule:predicate:' +
      i +
      '"/><swrl:argument1 rdf:resource="urn:swrl#x"/></swrl:ClassAtom></swrl:body></swrl:Imp>',
  ).join("");
  const ordinary = Array.from(
    { length: count * 4 },
    (_, i) => '<owl:Class rdf:about="urn:ordinary:' + i + '"/>',
  ).join("");
  return {
    ...simple,
    text: simple.text.replace(
      /<swrl:Imp>[\s\S]*?<\/swrl:Imp>/u,
      rows + ordinary,
    ),
  };
}

test("more rules and ordinary axioms use a bounded number of whole-graph traversals", async () => {
  const scans = jest.spyOn(CompactRdfGraph.prototype, "statements");
  try {
    const counts = [];
    for (const n of [4, 64]) {
      scans.mockClear();
      const o = await read(createManager(), manyRules(n));
      expect(o.getAxiomsByType("SWRLRule").size).toBe(n);
      expect(o.getAxiomsByType("OWLDeclarationAxiom").size).toBe(n * 4 + 3);
      counts.push(scans.mock.calls.length);
    }
    expect(counts[0]).toBeGreaterThan(0);
    expect(counts[1]).toBeLessThanOrEqual(counts[0] + 2);
  } finally {
    scans.mockRestore();
  }
});

test("cancellation during atom reconstruction discards the pending document", async () => {
  const controller = new AbortController(),
    manager = createManager();
  const getClass = OWLDataFactory.prototype.getOWLClass;
  const hook = jest
    .spyOn(OWLDataFactory.prototype, "getOWLClass")
    .mockImplementation(function (iri) {
      if (iri.value === "urn:rule:predicate:12") controller.abort();
      return getClass.call(this, iri);
    });
  try {
    await expect(
      read(manager, manyRules(32), { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(controller.signal.aborted).toBe(true);
    const id = manager
      .getOWLDataFactory()
      .getOWLOntologyID(IRI.create("urn:owlapi:test:swrl:simple"));
    expect(manager.getOntology(id)).toBeUndefined();
  } finally {
    hook.mockRestore();
  }
  expect(ruleOf(await read(manager, cases.get("simple")))).toBeDefined();
});

test.each(["empty-rdf", "shared-list"])(
  "%s consumes unused variable types without adding individuals",
  async (id) => {
    const o = await read(createManager(), cases.get(id));
    expect(o.getAxiomCount()).toBe(4);
    expect([...o.getIndividualsInSignature()]).toEqual([]);
  },
);

test("named rule subjects retain their separate ordinary assertions", async () => {
  const sample = cases.get("simple");
  const text = sample.text
    .replace("<swrl:Imp>", '<swrl:Imp rdf:about="urn:named-rule">')
    .replace(
      "</rdf:RDF>",
      '<owl:NamedIndividual rdf:about="urn:named-rule"><owl:sameAs rdf:resource="urn:alias"/></owl:NamedIndividual></rdf:RDF>',
    );
  const o = await read(createManager(), { ...sample, text });
  expect(ruleOf(o)).toBeDefined();
  expect(o.getAxiomsByType("OWLSameIndividualAxiom").size).toBe(1);
});

test.each([OWLDocumentFormats.RDF_XML, OWLDocumentFormats.TURTLE])(
  "rule-free class assertions and literal predicate annotations survive RDF storage (%o)",
  async (format) => {
    async function roundTrip(text) {
      const m = createManager(),
        o = await read(m, { format: "functional", id: "roles", text });
      const t = new StringDocumentTarget();
      await m.saveOntology(o, format, t);
      const fresh = createManager();
      return [
        o,
        await fresh.loadOntologyFromOntologyDocument(
          new StringDocumentSource(t.toString(), { format }),
          fresh.getOntologyLoaderConfiguration().setStrict(false),
        ),
      ];
    }
    const variable = "<http://www.w3.org/2003/11/swrl#Variable>";
    const [source, ordinary] = await roundTrip(
      "Ontology(Declaration(Class(" +
        variable +
        ")) Declaration(NamedIndividual(<urn:x>)) ClassAssertion(" +
        variable +
        " <urn:x>))",
    );
    expect(ordinary.getAxiomCount()).toBe(source.getAxiomCount());
    await expect(
      roundTrip(
        "Ontology(ClassAssertion(" +
          variable +
          " <urn:x>) DLSafeRule(Body() Head()))",
      ),
    ).rejects.toMatchObject({ reason: "ONTOLOGY_NOT_REPRESENTABLE" });
    await expect(
      roundTrip(
        "Ontology(ClassAssertion(<http://www.w3.org/2003/11/swrl#Imp> <urn:x>))",
      ),
    ).rejects.toMatchObject({ reason: "ONTOLOGY_NOT_REPRESENTABLE" });
    for (const p of [
      "http://www.w3.org/1999/02/22-rdf-syntax-ns#value",
      "http://www.w3.org/2002/07/owl#sameAs",
      "http://www.w3.org/2002/07/owl#reviewTag",
    ]) {
      const [before, after] = await roundTrip(
        "Ontology(DLSafeRule(Annotation(<" + p + '> "value") Body() Head()))',
      );
      expect(ruleOf(before).equals(ruleOf(after))).toBe(true);
    }
  },
);

test("manager changes require array-valued body and head even on an empty rule", async () => {
  const m = createManager(),
    o = await read(m, cases.get("empty-functional")),
    r = ruleOf(o),
    part = r.toStructuralTuple().slice(1);
  for (const side of ["body", "head", "annotations"]) {
    const bad = new OWLStructuralObject(
      "SWRLRule",
      { body: r.body, head: r.head, annotations: r.annotations, [side]: "" },
      part,
      { componentsWithoutAnnotations: part.slice(0, 2) },
    );
    expect(() => m.addAxiom(o, bad)).toThrow();
  }
});

test("an extra argument on a unary atom is a syntax error", async () => {
  const sample = cases.get("simple");
  const text = sample.text.replace(
    "</swrl:ClassAtom>",
    '<swrl:argument2 rdf:resource="urn:swrl:var#x"/></swrl:ClassAtom>',
  );
  await expect(
    read(createManager(), { ...sample, text }),
  ).rejects.toMatchObject({
    code: "OWL_SYNTAX_ERROR",
    predicate: "http://www.w3.org/2003/11/swrl#argument2",
  });
});

test("explicit rule fields and both supplied identities must agree on admission", async () => {
  const m = createManager(),
    o = await read(m, cases.get("simple")),
    r = ruleOf(o);
  const parts = r.toStructuralTuple().slice(1),
    sides = parts.slice(0, 2);
  const build = (body, canon) =>
    new OWLStructuralObject(
      "SWRLRule",
      { body, head: r.head, annotations: r.annotations },
      parts,
      { componentsWithoutAnnotations: canon },
    );
  for (const bad of [
    build(Object.freeze([...r.body, ...r.body]), sides),
    build(r.body, []),
  ])
    expect(() => m.addAxiom(o, bad)).toThrow();
  const df = m.getOWLDataFactory(),
    property = df.getOWLAnnotationProperty(IRI.create("urn:note"));
  expect(() =>
    r.getAnnotatedAxiom([
      df.getOWLAnnotation(property, IRI.create("urn:target")),
    ]),
  ).toThrow(/direct literal/u);
});

test.each([OWLDocumentFormats.RDF_XML, OWLDocumentFormats.TURTLE])(
  "RDF writes distinguish annotation IRIs and structural predicates in the same namespace (%o)",
  async (format) => {
    const m = createManager(),
      src = cases.get("simple-functional");
    const iri = "http://www.w3.org/2003/11/swrl#reviewTag";
    const source = (p) => ({
      ...src,
      text: src.text.replace(
        "DLSafeRule(",
        "Declaration(AnnotationProperty(<" +
          p +
          ">)) DLSafeRule(Annotation(<" +
          p +
          '> "reviewed") ',
      ),
    });
    const o = await read(m, source(iri)),
      target = new StringDocumentTarget();
    await m.saveOntology(o, format, target);
    const fresh = createManager();
    const reloaded = await fresh.loadOntologyFromOntologyDocument(
      new StringDocumentSource(target.toString(), { format }),
      fresh.getOntologyLoaderConfiguration().setStrict(false),
    );
    expect(ruleOf(reloaded).equals(ruleOf(o))).toBe(true);
    const other = createManager(),
      colliding = await read(
        other,
        source("http://www.w3.org/2003/11/swrl#body"),
      );
    const previous = target.toString();
    await expect(
      other.saveOntology(colliding, format, target),
    ).rejects.toMatchObject({ reason: "ONTOLOGY_NOT_REPRESENTABLE" });
    expect(target.toString()).toBe(previous);
  },
);
