import { readFileSync } from "node:fs";
import { IRI, OWLDataFactory, OWLOntologyManager } from "../../model/index.js";
import { StringDocumentSource } from "../../io/index.js";
import { ResourceLimitError } from "../../io/errors.js";
import { ManchesterOWLSyntaxOWLObjectRendererImpl } from "./index.js";

const native = JSON.parse(
  readFileSync(
    new URL(
      "../../util/owlapi-reference/fixtures/rc2/renderer-observations.json",
      import.meta.url,
    ),
    "utf8",
  ),
).observations;
const f = new OWLDataFactory();
const a = f.getOWLClass(IRI.create("urn:render:A"));
const b = f.getOWLClass(IRI.create("https://example.test/path/B"));
const p = f.getOWLObjectProperty(IRI.create("urn:render:p"));
const d = f.getOWLDataProperty(IRI.create("urn:render:d"));
const integer = f.getOWLDatatype(
  IRI.create("http://www.w3.org/2001/XMLSchema#integer"),
);
const string = f.getOWLDatatype(
  IRI.create("http://www.w3.org/2001/XMLSchema#string"),
);
const cases = {
  class: a,
  iri: a.iri,
  inverse: f.getOWLObjectInverseOf(p),
  someUnion: f.getOWLObjectSomeValuesFrom(p, f.getOWLObjectUnionOf([a, b])),
  complementIntersection: f.getOWLObjectComplementOf(
    f.getOWLObjectIntersectionOf([a, b]),
  ),
  nestedIntersection: f.getOWLObjectIntersectionOf([
    a,
    f.getOWLObjectUnionOf([a, b]),
  ]),
  min: f.getOWLObjectMinCardinality(2, p, a),
  self: f.getOWLObjectHasSelf(p),
  oneOf: f.getOWLObjectOneOf([
    f.getOWLNamedIndividual(IRI.create("urn:render:i")),
  ]),
  lang: f.getOWLLiteral('line\nquote"slash\\tab\t', "en"),
  string: f.getOWLLiteral("text"),
  integer: f.getOWLLiteral("01", integer),
  dataSome: f.getOWLDataSomeValuesFrom([d], string),
  annotation: f.getOWLAnnotation(f.getRDFSLabel(), f.getOWLLiteral("label")),
  nestedAnnotation: f.getOWLAnnotation(
    f.getRDFSLabel(),
    f.getOWLLiteral("label"),
    [
      f.getOWLAnnotation(
        f.getOWLAnnotationProperty(
          IRI.create("http://www.w3.org/2000/01/rdf-schema#comment"),
        ),
        f.getOWLLiteral("nested"),
      ),
    ],
  ),
  allUnion: f.getOWLObjectAllValuesFrom(p, f.getOWLObjectUnionOf([a, b])),
  maxUnion: f.getOWLObjectMaxCardinality(2, p, f.getOWLObjectUnionOf([a, b])),
  topDataIntersection: f.getOWLDataIntersectionOf([integer, string]),
  topDataUnion: f.getOWLDataUnionOf([integer, string]),
  topDataComplement: f.getOWLDataComplementOf(integer),
  dataOneOf: f.getOWLDataOneOf([
    f.getOWLLiteral("a"),
    f.getOWLLiteral("b", "fr"),
  ]),
  boolean: f.getOWLLiteral(
    "true",
    IRI.create("http://www.w3.org/2001/XMLSchema#boolean"),
  ),
  decimal: f.getOWLLiteral(
    "01.0",
    IRI.create("http://www.w3.org/2001/XMLSchema#decimal"),
  ),
  double: f.getOWLLiteral(
    "10.0",
    IRI.create("http://www.w3.org/2001/XMLSchema#double"),
  ),
};

test.each(Object.keys(cases))(
  "renderer matches native %s spelling, precedence and whitespace",
  (id) => {
    expect(
      new ManchesterOWLSyntaxOWLObjectRendererImpl().render(cases[id]),
    ).toBe(native.cases[id]);
  },
);

test("all native axiom vectors match with a single documented anonymous bijection", async () => {
  const manager = new OWLOntologyManager();
  const ontology = await manager.loadOntologyFromOntologyDocument(
    new StringDocumentSource(
      readFileSync(
        new URL(
          "../../util/owlapi-reference/fixtures/storage/functional-all-kinds.ofn",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
    { parsingMode: "strict" },
  );
  expect(ontology.getReferencedAnonymousIndividuals().size).toBe(1);
  const normalize = (text) =>
    text.replaceAll(/_:[A-Za-z0-9_-]+/gu, "_:anonymous");
  const renderer = new ManchesterOWLSyntaxOWLObjectRendererImpl();
  expect(
    [...ontology.getAxioms()]
      .map((axiom) => normalize(renderer.render(axiom)))
      .sort(),
  ).toEqual(native.axioms.map(({ rendered }) => normalize(rendered)).sort());
});

test("custom short forms remain plain text and unsupported roots fail", () => {
  const renderer = new ManchesterOWLSyntaxOWLObjectRendererImpl();
  renderer.setShortFormProvider({ getShortForm: () => "two words' quote" });
  expect(renderer.render(a)).toBe(native.customSpaceQuote);
  expect(() => renderer.render(f.getOWLOntologyID(a.iri))).toThrow(TypeError);
  expect(() => renderer.setShortFormProvider({})).toThrow(TypeError);
  renderer.setShortFormProvider({ getShortForm: async () => "label" });
  expect(() => renderer.render(a)).toThrow(TypeError);
});

test("anonymous labels preserve distinct scoped identities and terminate on collisions", () => {
  const values = [
    f.getOWLAnonymousIndividual("genid0", "one"),
    f.getOWLAnonymousIndividual("genid0", "two"),
    f.getOWLAnonymousIndividual("genid1", "three"),
  ];
  const text = new ManchesterOWLSyntaxOWLObjectRendererImpl().render(
    f.getOWLObjectOneOf(values),
  );
  expect(new Set(text.match(/_:[A-Za-z0-9_-]+/gu)).size).toBe(3);
  expect(text).not.toContain("_:_:");
});

test("deep shared subexpressions are bounded before providers run", () => {
  let expression = a;
  for (let depth = 0; depth < 513; depth += 1)
    expression = f.getOWLObjectComplementOf(expression);
  const renderer = new ManchesterOWLSyntaxOWLObjectRendererImpl();
  let called = false;
  renderer.setShortFormProvider({
    getShortForm() {
      called = true;
      return "label";
    },
  });
  expect(() => renderer.render(expression)).toThrow(ResourceLimitError);
  expect(called).toBe(false);
});
