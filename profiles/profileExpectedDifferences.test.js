import { OWLOntologyManager } from "../model/index.js";
import { StringDocumentSource } from "../io/index.js";
import { OWL2ELProfile, OWL2RLProfile } from "./index.js";

const declarations = `Declaration(Class(:A)) Declaration(Class(:B))
Declaration(ObjectProperty(:p)) Declaration(ObjectProperty(:q))
Declaration(ObjectProperty(:r)) Declaration(ObjectProperty(:s)) Declaration(DataProperty(:d))
Declaration(NamedIndividual(:i)) Declaration(NamedIndividual(:j))`;
const assess = async (body, profile = new OWL2RLProfile()) => {
  const ontology =
    await new OWLOntologyManager().loadOntologyFromOntologyDocument(
      new StringDocumentSource(
        `Prefix(:=<urn:approved:>) Ontology(${declarations} ${body})`,
      ),
    );
  return profile.checkOntology(ontology);
};

test.each([
  "topObjectProperty",
  "bottomObjectProperty",
  "topDataProperty",
  "bottomDataProperty",
])(
  "RC2-PRF-DIFF-002 excludes %s in declarations and assertions",
  async (name) => {
    const iri = `<http://www.w3.org/2002/07/owl#${name}>`;
    const object = name.includes("Object");
    for (const body of [
      `Declaration(${object ? "ObjectProperty" : "DataProperty"}(${iri}))`,
      object
        ? `ObjectPropertyAssertion(${iri} :i :j)`
        : `DataPropertyAssertion(${iri} :i "value")`,
    ]) {
      const report = await assess(body);
      expect(report.status).toBe("invalid");
      expect(report.violations).toContainEqual(
        expect.objectContaining({ code: "PROFILE_PROPERTY_NOT_ALLOWED" }),
      );
    }
  },
);

test.each([
  [
    "transitive inherited ranges",
    "SubObjectPropertyOf(:q :s) SubObjectPropertyOf(:s :p) ObjectPropertyRange(:p :A)",
    "ObjectPropertyRange(:r :A)",
    true,
  ],
  [
    "equivalent inherited ranges",
    "EquivalentObjectProperties(:q :s) SubObjectPropertyOf(:s :p) ObjectPropertyRange(:p :A)",
    "ObjectPropertyRange(:r :A)",
    true,
  ],
  [
    "cycles terminate",
    "SubObjectPropertyOf(:q :s) SubObjectPropertyOf(:s :q) ObjectPropertyRange(:s :A)",
    "ObjectPropertyRange(:r :A)",
    true,
  ],
  [
    "every imposed head range is required",
    "ObjectPropertyRange(:q :A)",
    "ObjectPropertyRange(:r :A) ObjectPropertyRange(:r :B)",
    false,
  ],
  [
    "head ranges are inherited too",
    "ObjectPropertyRange(:q :A) SubObjectPropertyOf(:r :s) ObjectPropertyRange(:s :A)",
    "",
    true,
  ],
  [
    "inherited missing head range rejects",
    "SubObjectPropertyOf(:r :s) ObjectPropertyRange(:s :A)",
    "",
    false,
  ],
])("RC2-PRF-DIFF-003 %s", async (_name, edges, ranges, valid) => {
  const report = await assess(
    `SubObjectPropertyOf(ObjectPropertyChain(:p :q) :r) ${edges} ${ranges}`,
    new OWL2ELProfile(),
  );
  expect(report.status).toBe(valid ? "valid" : "invalid");
  if (!valid)
    expect(report.violations).toContainEqual(
      expect.objectContaining({
        code: "EL_CHAIN_RANGE_NOT_IMPOSED_ON_LAST_PROPERTY",
      }),
    );
});

test.each([
  [
    "ObjectIntersectionOf(:A ObjectUnionOf(:A ObjectSomeValuesFrom(:p :B)))",
    true,
  ],
  ["ObjectSomeValuesFrom(:p ObjectUnionOf(:A ObjectOneOf(:i :j)))", true],
  [
    "ObjectUnionOf(:A DataSomeValuesFrom(:d <http://www.w3.org/2001/XMLSchema#string>))",
    true,
  ],
  ["ObjectSomeValuesFrom(:p ObjectAllValuesFrom(:q :A))", false],
  ["ObjectUnionOf(:A ObjectComplementOf(:B))", false],
  ["ObjectUnionOf(:A ObjectMaxCardinality(1 :p :B))", false],
])("RC2-PRF-DIFF-004 nested subclass grammar %s", async (expression, valid) => {
  const report = await assess(`DisjointClasses(:B ${expression})`);
  expect(report.status).toBe(valid ? "valid" : "invalid");
  if (!valid)
    expect(report.violations).toContainEqual(
      expect.objectContaining({ code: "PROFILE_CLASS_POSITION_NOT_ALLOWED" }),
    );
});

test("RC2-PRF-DIFF-001 does not admit an excluded datatype or bypass common lexical checks", async () => {
  const excluded = await assess(
    "Declaration(Datatype(<http://www.w3.org/2001/XMLSchema#duration>))",
  );
  expect(excluded.violations).toContainEqual(
    expect.objectContaining({ code: "PROFILE_DATATYPE_NOT_ALLOWED" }),
  );
  const malformed = await assess(
    'DataPropertyAssertion(:d :i "-1"^^<http://www.w3.org/2001/XMLSchema#unsignedInt>)',
  );
  expect(malformed.violations).toContainEqual(
    expect.objectContaining({ code: "LITERAL_LEXICAL_SPACE" }),
  );
});
