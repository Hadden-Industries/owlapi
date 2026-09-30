import {
  IRI,
  OWL2DLProfile,
  OWLProfileReport,
  OWLManager,
  OWLOntology,
  OWLStructuralObject,
  OWLObjectKind as K,
  StringDocumentSource,
} from "../index.js";

const profile = new OWL2DLProfile();
const prefix = "Prefix(:=<urn:profile:>) ";
const declarations = `${["A", "B", "C"].map((name) => `Declaration(Class(:${name}))`).join(" ")}
  ${["p", "q", "r", "s"].map((name) => `Declaration(ObjectProperty(:${name}))`).join(" ")}
  Declaration(DataProperty(:data)) Declaration(AnnotationProperty(:note))`;
const document = (body, header = "", declared = declarations) =>
  `${prefix}Ontology(${header} ${declared} ${body})`;
const load = async (body, options = {}) => {
  const manager = OWLManager.createOWLOntologyManager(options.manager);
  const ontology = await manager.loadOntologyFromOntologyDocument(
    new StringDocumentSource(
      document(body, options.header, options.declarations),
      { format: "functional" },
    ),
    { parsingMode: "preserve", ...options.loader },
  );
  return { manager, ontology };
};
const check = async (body, options) => {
  const { ontology } = await load(body, options);
  return profile.checkOntology(ontology, { sourceAssessment: true });
};

test("exposes an immutable Java-shaped asynchronous profile report", async () => {
  const { ontology } = await load("SubClassOf(:A :B)");
  const promise = profile.checkOntology(ontology);
  expect(promise).toBeInstanceOf(Promise);
  const result = await promise;
  expect(result).toBeInstanceOf(OWLProfileReport);
  expect(result.isInProfile()).toBe(true);
  expect(result.getOntology()).toBe(ontology);
  expect(result.getProfile()).toBe(profile);
  expect(result.getViolations()).toEqual([]);
  expect(result.getSourceAssessment()).toBeUndefined();
  expect(Object.isFrozen(result)).toBe(true);
  expect(Object.isFrozen(result.violations)).toBe(true);
  expect(profile.getName()).toBe("OWL 2 DL");
});
test.each(["topObjectProperty", "bottomObjectProperty"])(
  "uses the syntactic composite-property definition for %s",
  async (name) => {
    const builtin = `owl:${name}`;
    expect((await check(`FunctionalObjectProperty(${builtin})`)).status).toBe(
      "invalid",
    );
    expect(
      (await check(`FunctionalObjectProperty(ObjectInverseOf(${builtin}))`))
        .status,
    ).toBe("valid");
    for (const characteristic of [
      "TransitiveObjectProperty",
      "SymmetricObjectProperty",
    ]) {
      expect(
        (
          await check(
            `FunctionalObjectProperty(ObjectInverseOf(${builtin})) ${characteristic}(${builtin})`,
          )
        ).violations,
      ).toContainEqual(
        expect.objectContaining({ code: "NONSIMPLE_OBJECT_PROPERTY" }),
      );
    }
  },
);

test.each([
  [
    "property categories",
    "Declaration(DataProperty(:p))",
    "PROPERTY_CATEGORY_COLLISION",
  ],
  [
    "class/datatype",
    "Declaration(Datatype(:A)) DatatypeDefinition(:A xsd:string)",
    "CLASS_DATATYPE_COLLISION",
  ],
  [
    "reserved class",
    "Declaration(Class(owl:topObjectProperty))",
    "RESERVED_ENTITY_IRI",
  ],
  [
    "reserved property",
    "Declaration(ObjectProperty(owl:Thing))",
    "RESERVED_ENTITY_IRI",
  ],
  [
    "reserved individual",
    "Declaration(NamedIndividual(owl:Thing))",
    "RESERVED_ENTITY_IRI",
  ],
  [
    "unknown built-in datatype",
    "Declaration(Datatype(xsd:madeUp))",
    "RESERVED_ENTITY_IRI",
  ],
  [
    "ill-typed annotation",
    'AnnotationAssertion(:note :A "256"^^xsd:unsignedByte)',
    "LITERAL_LEXICAL_SPACE",
  ],
  [
    "nested annotation literal",
    'SubClassOf(Annotation(Annotation(:note "bad"^^xsd:integer) :note "ok") :A :B)',
    "LITERAL_LEXICAL_SPACE",
  ],
  [
    "unknown literal datatype",
    'AnnotationAssertion(:note :A "opaque"^^:type)',
    "DATATYPE_DEFINITION_COUNT",
  ],
  [
    "defined literal datatype",
    'Declaration(Datatype(:type)) DatatypeDefinition(:type xsd:string) AnnotationAssertion(:note :A "opaque"^^:type)',
    "DEFINED_DATATYPE_LITERAL",
  ],
  [
    "defined restriction base",
    'Declaration(Datatype(:type)) DatatypeDefinition(:type xsd:string) DataPropertyRange(:data DatatypeRestriction(:type xsd:length "1"^^xsd:integer))',
    "DEFINED_DATATYPE_RESTRICTION",
  ],
  [
    "invalid bound",
    'DataPropertyRange(:data DatatypeRestriction(xsd:byte xsd:minInclusive "300"^^xsd:integer))',
    "FACET_VALUE_OUTSIDE_BASE_SPACE",
  ],
  [
    "multiple datatype definitions",
    "Declaration(Datatype(:type)) DatatypeDefinition(:type xsd:string) DatatypeDefinition(:type xsd:integer)",
    "DATATYPE_DEFINITION_COUNT",
  ],
  [
    "distinct annotated datatype definitions",
    'Declaration(Datatype(:type)) DatatypeDefinition(Annotation(rdfs:comment "one") :type xsd:string) DatatypeDefinition(Annotation(rdfs:comment "two") :type xsd:string)',
    "DATATYPE_DEFINITION_COUNT",
  ],
  [
    "redefined built-in",
    "DatatypeDefinition(xsd:string xsd:integer)",
    "DATATYPE_DEFINITION_COUNT",
  ],
  [
    "cyclic definitions",
    "Declaration(Datatype(:x)) Declaration(Datatype(:y)) DatatypeDefinition(:x DataUnionOf(xsd:string :y)) DatatypeDefinition(:y :x)",
    "CYCLIC_DATATYPE_DEFINITION",
  ],
  [
    "top data property",
    'DataPropertyAssertion(owl:topDataProperty :a "x")',
    "TOP_DATA_PROPERTY_POSITION",
  ],
  [
    "top property declaration",
    "Declaration(DataProperty(owl:topDataProperty))",
    "TOP_DATA_PROPERTY_POSITION",
  ],
  [
    "nary data range",
    "SubClassOf(:A DataSomeValuesFrom(:data :data xsd:string))",
    "DATA_RANGE_ARITY",
  ],
])(
  "rejects %s across the complete structural model",
  async (_name, body, code) => {
    const result = await check(body);
    expect(result.status).toBe("invalid");
    expect(result.violations).toEqual(
      expect.arrayContaining([expect.objectContaining({ code })]),
    );
    expect(result.sourceAssessment.status).toBe("invalid");
  },
);

test.each([
  "SubClassOf(:A :B) Declaration(NamedIndividual(:A)) ClassAssertion(:A :A)",
  "SubDataPropertyOf(:data owl:topDataProperty)",
  "AnnotationAssertion(:note :A owl:Thing)",
  'DataPropertyRange(:data DatatypeRestriction(xsd:byte xsd:minInclusive "254/2"^^owl:rational))',
  "Declaration(Datatype(:type)) DatatypeDefinition(:type DataUnionOf(xsd:integer xsd:string)) DataPropertyRange(:data :type)",
])("accepts independent legal DL cases: %s", async (body) =>
  expect((await check(body)).status).toBe("valid"),
);

test("keeps declaration qualification separate from the formal profile verdict", async () => {
  const result = await check("SubClassOf(:A :B)", { declarations: "" });
  expect(result.status).toBe("invalid");
  expect(result.violations.map(({ code }) => code)).toEqual([
    "UNDECLARED_ENTITY",
    "UNDECLARED_ENTITY",
  ]);
  expect(result.sourceAssessment.status).toBe("valid");
  expect(result.sourceAssessment.qualifications).toHaveLength(2);
});
test("uses per-object original-arity evidence without relaxing the formal profile", async () => {
  const result = await check(
    "SubClassOf(:A ObjectIntersectionOf(:B :B)) EquivalentClasses(:B :B)",
  );
  expect(result.status).toBe("invalid");
  expect(
    result.violations.every(({ code }) => code === "SET_CONSTRUCTOR_ARITY"),
  ).toBe(true);
  expect(result.sourceAssessment.status).toBe("valid");
});
test.each([
  ["ObjectMinCardinality(1 :q :A)", ""],
  ["ObjectMaxCardinality(1 ObjectInverseOf(:q) :A)", ""],
  ["ObjectExactCardinality(1 :q :A)", ""],
  ["ObjectHasSelf(:q)", ""],
  [":A", "FunctionalObjectProperty(:q)"],
  [":A", "InverseFunctionalObjectProperty(:q)"],
  [":A", "IrreflexiveObjectProperty(:q)"],
  [":A", "AsymmetricObjectProperty(:q)"],
  [":A", "DisjointObjectProperties(:q :r)"],
])("checks simplicity for %s %s", async (expression, axiom) => {
  const result = await check(
    `TransitiveObjectProperty(:p) SubObjectPropertyOf(:p :q) SubClassOf(:B ${expression}) ${axiom}`,
  );
  expect(result.violations).toContainEqual(
    expect.objectContaining({ code: "NONSIMPLE_OBJECT_PROPERTY" }),
  );
});

test.each([
  ["SubObjectPropertyOf(:p :q) SubObjectPropertyOf(:q :p)", true],
  ["SubObjectPropertyOf(ObjectPropertyChain(:p :p) :p)", true],
  ["SubObjectPropertyOf(ObjectPropertyChain(:p :q) :p)", true],
  ["SubObjectPropertyOf(ObjectPropertyChain(:q :p) :p)", true],
  ["SubObjectPropertyOf(ObjectPropertyChain(:p :q :p) :p)", false],
  [
    "SubObjectPropertyOf(ObjectPropertyChain(:p :q) :r) SubObjectPropertyOf(:r :p)",
    false,
  ],
  [
    "SubObjectPropertyOf(ObjectPropertyChain(:p :s) :q) EquivalentObjectProperties(:p :q)",
    false,
  ],
  ["SubObjectPropertyOf(ObjectPropertyChain(:p :p) ObjectInverseOf(:p))", true],
  [
    "SubObjectPropertyOf(ObjectPropertyChain(:p :p) :q) SubObjectPropertyOf(ObjectPropertyChain(:r :r) :s) SubObjectPropertyOf(:q :r) SubObjectPropertyOf(:s :p)",
    true,
  ],
  [
    "SubObjectPropertyOf(ObjectPropertyChain(:p :p) ObjectInverseOf(:q)) SubObjectPropertyOf(ObjectPropertyChain(ObjectInverseOf(:q) ObjectInverseOf(:q)) :r) SubObjectPropertyOf(:r ObjectInverseOf(:p))",
    false,
  ],
])(
  "checks literal regularity with distinct hierarchy/order relations",
  async (body, valid) => {
    const result = await check(body);
    expect(result.status).toBe(valid ? "valid" : "invalid");
    expect(
      result.violations.some(
        ({ code }) => code === "IRREGULAR_PROPERTY_HIERARCHY",
      ),
    ).toBe(!valid);
  },
);

test.each([
  ["SameIndividual(_:a :i)", "ANONYMOUS_INDIVIDUAL_POSITION"],
  ["DifferentIndividuals(_:a :i)", "ANONYMOUS_INDIVIDUAL_POSITION"],
  [
    "NegativeObjectPropertyAssertion(:p _:a :i)",
    "ANONYMOUS_INDIVIDUAL_POSITION",
  ],
  [
    'NegativeDataPropertyAssertion(:data _:a "x")',
    "ANONYMOUS_INDIVIDUAL_POSITION",
  ],
  ["SubClassOf(:A ObjectOneOf(_:a))", "ANONYMOUS_INDIVIDUAL_POSITION"],
  ["SubClassOf(:A ObjectHasValue(:p _:a))", "ANONYMOUS_INDIVIDUAL_POSITION"],
  [
    "ObjectPropertyAssertion(:p _:a _:b) ObjectPropertyAssertion(:p _:b _:c) ObjectPropertyAssertion(:p _:c _:a)",
    "ANONYMOUS_GRAPH_NOT_FOREST",
  ],
  [
    "ObjectPropertyAssertion(:p _:a _:b) ObjectPropertyAssertion(:q _:a _:b)",
    "MULTIPLE_ANONYMOUS_EDGE_ASSERTIONS",
  ],
  [
    "ObjectPropertyAssertion(:p _:a :i) ObjectPropertyAssertion(:p _:a :j)",
    "ANONYMOUS_TREE_WITHOUT_ROOT",
  ],
])("enforces anonymous-individual restrictions", async (body, code) => {
  expect((await check(body)).violations).toContainEqual(
    expect.objectContaining({ code }),
  );
});

test.each([false, true])(
  "checks root/import simplicity in either direction (swap=%s)",
  async (swap) => {
    const parts = [
      "TransitiveObjectProperty(:p)",
      "SubClassOf(:A ObjectMinCardinality(1 :p :B))",
    ];
    if (swap) parts.reverse();
    const result = await check(parts[0], {
      header: "<urn:profile:root> Import(<urn:profile:import>)",
      manager: {
        documentLoader: {
          load: async () =>
            new StringDocumentSource(
              document(parts[1], "<urn:profile:import>"),
              { format: "functional" },
            ),
        },
      },
    });
    expect(result.closure).toHaveLength(2);
    expect(result.violations).toContainEqual(
      expect.objectContaining({ code: "NONSIMPLE_OBJECT_PROPERTY" }),
    );
  },
);

test("checks imported literals even in annotation-only axioms", async () => {
  const result = await check("", {
    header: "<urn:profile:root> Import(<urn:profile:import>)",
    manager: {
      documentLoader: {
        load: async () =>
          new StringDocumentSource(
            document(
              'AnnotationAssertion(:note :A "bad"^^xsd:integer)',
              "<urn:profile:import>",
            ),
            { format: "functional" },
          ),
      },
    },
  });
  expect(result.violations).toContainEqual(
    expect.objectContaining({ code: "LITERAL_LEXICAL_SPACE", scope: 1 }),
  );
});
test("closure authority cannot be replaced through a public manager method", async () => {
  const { manager, ontology } = await load("", {
    header: "<urn:profile:root> Import(<urn:profile:import>)",
    manager: {
      documentLoader: {
        load: async () =>
          new StringDocumentSource(
            document(
              'AnnotationAssertion(:note :A "bad"^^xsd:integer)',
              "<urn:profile:import>",
            ),
            { format: "functional" },
          ),
      },
    },
  });
  manager.importsClosure = () => Object.freeze([ontology]);
  manager.getImportsClosure = () => new Set([ontology]);
  const result = await profile.checkOntology(ontology, {
    sourceAssessment: true,
  });
  expect(result.closure).toHaveLength(2);
  expect(result.status).toBe("invalid");
  expect(result.sourceAssessment.status).toBe("invalid");
  expect(result.violations).toContainEqual(
    expect.objectContaining({ code: "LITERAL_LEXICAL_SPACE", scope: 1 }),
  );
});
test("deduplicates only identical annotated datatype definitions across imports", async () => {
  const definition =
    'Declaration(Datatype(:type)) DatatypeDefinition(Annotation(rdfs:comment "same") :type xsd:string)';
  const result = await check(definition, {
    header: "<urn:profile:root> Import(<urn:profile:import>)",
    manager: {
      documentLoader: {
        load: async () =>
          new StringDocumentSource(
            document(definition, "<urn:profile:import>"),
            { format: "functional" },
          ),
      },
    },
  });
  expect(result.status).toBe("valid");
  expect(result.sourceAssessment.status).toBe("valid");
});
test.each([
  ["profileWork", "<a></a>".repeat(1000), { maxWork: 500 }],
  ["profileDepth", "<a>".repeat(64) + "</a>".repeat(64), { maxDepth: 20 }],
])(
  "bounds XML facet %s before classifying its value",
  async (resource, lexical, limits) => {
    const { ontology } = await load(
      `DataPropertyRange(:data DatatypeRestriction(xsd:string xsd:pattern "${lexical}"^^rdf:XMLLiteral))`,
      { declarations: "Declaration(DataProperty(:data))" },
    );
    const result = await profile.checkOntology(ontology, limits);
    expect(result.status).toBe("unverified");
    expect(result.violations).toEqual([]);
    expect(result.unverifiedChecks).toContainEqual(
      expect.objectContaining({ code: "RESOURCE_LIMIT_EXCEEDED", resource }),
    );
  },
);

test.each([
  ["work", "<a></a>".repeat(2000), { maxWork: 100 }],
  ["depth", "<a>".repeat(300) + "</a>".repeat(300), { maxDepth: 20 }],
])(
  "charges XML literal %s to the profile resource policy",
  async (_name, lexical, options) => {
    const { ontology } = await load(
      `AnnotationAssertion(:note :A "${lexical}"^^rdf:XMLLiteral)`,
    );
    const result = await profile.checkOntology(ontology, {
      ...options,
      sourceAssessment: true,
    });
    expect(result.status).toBe("unverified");
    expect(result.sourceAssessment.status).toBe("unverified");
    expect(result.unverifiedChecks).toContainEqual(
      expect.objectContaining({ code: "RESOURCE_LIMIT_EXCEEDED" }),
    );
  },
);
test("never trusts caller-supplied metadata as source evidence", async () => {
  const original = await load("SubClassOf(:A :B)", { declarations: "" });
  const copy = new OWLOntology({
    axioms: original.ontology.getAxioms(),
    documentMetadata: {
      sourceStructure: Object.freeze({ version: 1, policy: "preserve" }),
    },
  });
  const result = await profile.checkOntology(copy, { sourceAssessment: true });
  expect(result.sourceAssessment.status).toBe("invalid");
  expect(result.sourceAssessment.unverifiedChecks).toContainEqual({
    code: "SOURCE_EVIDENCE_UNVERIFIED",
    scope: 0,
  });
});
test("marks mutation-invalidated source evidence stale", async () => {
  const { manager, ontology } = await load("");
  const factory = manager.getOWLDataFactory();
  manager.addAxiom(
    ontology,
    factory.getOWLDeclarationAxiom(
      factory.getOWLClass(IRI.create("urn:profile:New")),
    ),
  );
  const result = await profile.checkOntology(ontology, {
    sourceAssessment: true,
  });
  expect(result.status).toBe("valid");
  expect(result.sourceAssessment.status).toBe("unverified");
  expect(result.sourceAssessment.unverifiedChecks).toContainEqual({
    code: "SOURCE_EVIDENCE_STALE",
    scope: 0,
  });
});
test("does not certify an unresolved unmanaged import closure", async () => {
  const factory = OWLManager.createOWLOntologyManager().getOWLDataFactory();
  const ontology = new OWLOntology({
    imports: [factory.getOWLImportsDeclaration(IRI.create("urn:missing"))],
  });
  const result = await profile.checkOntology(ontology);
  expect(result.status).toBe("unverified");
  expect(result.isInProfile()).toBe(false);
  expect(result.unverifiedChecks).toContainEqual({
    code: "IMPORT_CLOSURE_INCOMPLETE",
  });
});
test("reports bounded incomplete work without a valid verdict", async () => {
  const { ontology } = await load("SubClassOf(:A :B)");
  const result = await profile.checkOntology(ontology, {
    maxWork: 1,
    sourceAssessment: true,
  });
  expect(result.status).toBe("unverified");
  expect(result.sourceAssessment.status).toBe("unverified");
  expect(result.unverifiedChecks).toContainEqual(
    expect.objectContaining({ code: "RESOURCE_LIMIT_EXCEEDED" }),
  );
});
test("uses the intrinsic AbortSignal brand and state", async () => {
  const { ontology } = await load("");
  await expect(
    profile.checkOntology(ontology, {
      signal: Object.create(AbortSignal.prototype),
    }),
  ).rejects.toThrow(TypeError);
  const controller = new AbortController();
  Object.defineProperty(controller.signal, "aborted", {
    get() {
      throw new Error("caller getter executed");
    },
  });
  controller.abort();
  await expect(
    profile.checkOntology(ontology, { signal: controller.signal }),
  ).rejects.toMatchObject({ name: "AbortError" });
});

test("rejects a stored structural key that disagrees with public fields", async () => {
  const factory = OWLManager.createOWLOntologyManager().getOWLDataFactory();
  const a = factory.getOWLClass(IRI.create("urn:profile:A")),
    b = factory.getOWLClass(IRI.create("urn:profile:B"));
  const annotations = Object.freeze([]);
  const forged = new OWLStructuralObject(
    K.SUBCLASS_OF_AXIOM,
    { subClass: a, superClass: b, annotations },
    [a, a, annotations],
  );
  const result = await profile.checkOntology(
    new OWLOntology({ axioms: [forged] }),
  );
  expect(result.status).toBe("invalid");
  expect(result.violations).toContainEqual({
    code: "STRUCTURAL_OBJECT_INVALID",
  });
});
test("refuses source qualification after source annotations were filtered", async () => {
  const { ontology } = await load(
    'AnnotationAssertion(:note :A "bad"^^xsd:integer)',
    { loader: { loadAnnotationAxioms: false } },
  );
  const result = await profile.checkOntology(ontology, {
    sourceAssessment: true,
  });
  expect(result.sourceAssessment.status).not.toBe("valid");
  expect(result.sourceAssessment.unverifiedChecks).toContainEqual({
    code: "SOURCE_EVIDENCE_UNVERIFIED",
    scope: 0,
  });
});
test("detects mutation between closure capture and report completion", async () => {
  const { manager, ontology } = await load("");
  const checking = profile.checkOntology(ontology, { sourceAssessment: true });
  const factory = manager.getOWLDataFactory();
  manager.addAxiom(
    ontology,
    factory.getOWLDeclarationAxiom(
      factory.getOWLClass(IRI.create("urn:profile:Added")),
    ),
  );
  const result = await checking;
  expect(result.isInProfile()).toBe(false);
  expect(result.unverifiedChecks).toContainEqual({
    code: "ONTOLOGY_CHANGED_DURING_CHECK",
  });
  expect(result.sourceAssessment.status).toBe("unverified");
});
test("handles cancellation after work starts", async () => {
  const { ontology } = await load("");
  const controller = new AbortController();
  const checking = profile.checkOntology(ontology, {
    signal: controller.signal,
  });
  controller.abort();
  await expect(checking).rejects.toMatchObject({ name: "AbortError" });
});
test.each([{ timeoutMs: 0 }, { maxDepth: 0 }, { maxLiteralLength: 1 }])(
  "never certifies a bounded unfinished check: %j",
  async (options) => {
    const { ontology } = await load('AnnotationAssertion(:note :A "long")');
    const result = await profile.checkOntology(ontology, options);
    expect(result.status).toBe("unverified");
    expect(result.unverifiedChecks).toContainEqual(
      expect.objectContaining({ code: "RESOURCE_LIMIT_EXCEEDED" }),
    );
  },
);
