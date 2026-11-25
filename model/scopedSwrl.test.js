import {
  OWLManager,
  OWLDocumentFormats,
  StringDocumentSource,
  StringDocumentTarget,
  IRI,
  AXIOM_KINDS,
  AXIOM_KINDS_WITH_SWRL,
  dispatchAxiom,
  OWL_OBJECT_KINDS,
  OWL_OBJECT_KINDS_WITH_SWRL,
  dispatchOwlObject,
} from "../index.js";
import { scopedSwrlCases } from "../util/owlapi-reference/fixtures/swrl/cases.mjs";

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
