import {
  OWLManager,
  OWL2DLProfile,
  StringDocumentSource,
  StringDocumentTarget,
  OWLDocumentFormats,
} from "../index.js";

const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const prefixes = `@prefix : <urn:rdfs:> . @prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <${RDF}> . @prefix rdfs: <${RDFS}> . @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .`;
const load = async (body, options = {}) => {
  const manager = OWLManager.createOWLOntologyManager(options);
  const result = await manager.loadOntologyGraphFromOntologyDocument(
    new StringDocumentSource(`${prefixes}\n${body}`, { format: "turtle" }),
    { parsingMode: "preserve" },
  );
  return { manager, root: result.ontology, ...result };
};
const structureOf = (result) =>
  result.documents.find(({ ontology }) => ontology === result.root).context
    .sourceStructure;
const check = (ontology) =>
  new OWL2DLProfile().checkOntology(ontology, { sourceAssessment: true });

test("retains generic roles, explicit relations and memberships without inventing OWL axioms", async () => {
  const result = await load(
    ":A a rdfs:Class; rdfs:subClassOf :B . :B a rdfs:Class; rdfs:subClassOf :A . :p a rdf:Property; rdfs:domain :A; rdfs:range :B; rdfs:subPropertyOf :q . :q a rdf:Property . :i a :A .",
  );
  const structure = structureOf(result);
  expect(result.root.getAxioms().size).toBe(0);
  expect(structure.statements).toHaveLength(10);
  expect(structure.roles).toEqual(
    expect.arrayContaining([
      { iri: "urn:rdfs:A", type: RDFS + "Class", origin: "declaration" },
      { iri: "urn:rdfs:p", type: RDF + "Property", origin: "declaration" },
    ]),
  );
  expect(Object.isFrozen(structure.statements[0].annotations)).toBe(true);
  expect((await check(result.root)).sourceAssessment.status).toBe("valid");
});
test("retains a generic anonymous class identity without naming or merging it", async () => {
  const result = await load(
    "_:a a rdfs:Class . _:b a rdfs:Class . :i a _:a . :j a _:b .",
  );
  const roles = structureOf(result).roles.filter(
    ({ type }) => type === RDFS + "Class",
  );
  expect(roles).toHaveLength(2);
  expect(roles[0].subject.equals(roles[1].subject)).toBe(false);
  expect((await check(result.root)).sourceAssessment.status).toBe("valid");
});
test("validates literals in retained axiom annotations before filtering", async () => {
  const result = await load(
    ':A a rdfs:Class . :B a rdfs:Class . :A rdfs:subClassOf :B . [] a owl:Axiom; owl:annotatedSource :A; owl:annotatedProperty rdfs:subClassOf; owl:annotatedTarget :B; rdfs:comment "bad"^^xsd:integer .',
  );
  const report = await check(result.root);
  expect(report.status).toBe("valid");
  expect(report.sourceAssessment.status).toBe("invalid");
  expect(report.sourceAssessment.violations).toContainEqual(
    expect.objectContaining({ code: "LITERAL_LEXICAL_SPACE" }),
  );
});
test("checks an OWL expression used only in a retained RDFS domain against closure-wide simplicity", async () => {
  const result = await load(
    ':A a owl:Class . :p a rdf:Property; rdfs:domain [ a owl:Restriction; owl:onProperty :op; owl:minQualifiedCardinality "1"^^xsd:nonNegativeInteger; owl:onClass :A ] . :op a owl:ObjectProperty, owl:TransitiveProperty .',
  );
  const report = await check(result.root);
  expect(report.status).toBe("valid");
  expect(report.sourceAssessment.status).toBe("invalid");
  expect(report.sourceAssessment.violations).toContainEqual(
    expect.objectContaining({ code: "NONSIMPLE_OBJECT_PROPERTY" }),
  );
});
test("checks parsed orphan expression literals even without a retained axiom", async () => {
  const result = await load(
    '[] a rdfs:Datatype; owl:oneOf ("bad"^^xsd:integer) .',
  );
  expect(result.root.getAxioms().size).toBe(0);
  const report = await check(result.root);
  expect(report.status).toBe("valid");
  expect(report.sourceAssessment.violations).toContainEqual(
    expect.objectContaining({ code: "LITERAL_LEXICAL_SPACE" }),
  );
});
test("rejects class/data range mixtures across separate imported documents", async () => {
  const result = await load(
    ":root a owl:Ontology; owl:imports :import . :p a rdf:Property; rdfs:range xsd:string .",
    {
      documentLoader: {
        load: async () =>
          new StringDocumentSource(
            `${prefixes} :import a owl:Ontology . :p a rdf:Property; rdfs:range :A . :A a rdfs:Class .`,
            { format: "turtle" },
          ),
      },
    },
  );
  const report = await check(result.root);
  expect(report.closure).toHaveLength(2);
  expect(report.sourceAssessment.violations).toContainEqual(
    expect.objectContaining({ code: "SOURCE_RANGE_CATEGORY_COLLISION" }),
  );
});
test("supplies imported generic roles without fabricating local declarations", async () => {
  const result = await load(
    ":root a owl:Ontology; owl:imports :import . :p rdfs:domain :A .",
    {
      documentLoader: {
        load: async () =>
          new StringDocumentSource(
            `${prefixes} :import a owl:Ontology . :p a rdf:Property . :A a rdfs:Class .`,
            { format: "turtle" },
          ),
      },
    },
  );
  expect(structureOf(result).statements).toHaveLength(1);
  expect((await check(result.root)).sourceAssessment.status).toBe("valid");
});
test.each([
  OWLDocumentFormats.FUNCTIONAL,
  OWLDocumentFormats.RDF_XML,
  OWLDocumentFormats.TURTLE,
  OWLDocumentFormats.OWL_XML,
])(
  "fails atomically when %s cannot represent retained RDFS",
  async (format) => {
    const result = await load(":A a rdfs:Class .");
    const target = new StringDocumentTarget();
    await result.manager.saveOntology(
      result.manager.createOntology(),
      format,
      target,
    );
    const previous = target.toString();
    expect(previous.length).toBeGreaterThan(0);
    await expect(
      result.manager.saveOntology(result.root, format, target),
    ).rejects.toMatchObject({
      reason: "ONTOLOGY_NOT_REPRESENTABLE",
      sourceKind: "retained-rdfs",
    });
    expect(target.toString()).toBe(previous);
  },
);
test.each([
  "_:p a rdf:Property .",
  ':p a rdf:Property; rdfs:domain "bad" .',
  ":p a rdf:Property; rdfs:range :unknown .",
  ":A a rdfs:Class; rdfs:subClassOf xsd:string .",
  ':p a rdf:Property . :i :p "generic assertion is not an OWL exclusion" .',
])("never repairs unsupported or ambiguous RDFS: %s", async (body) => {
  await expect(load(body)).rejects.toThrow();
});

test.each([
  ":p a rdf:Property; rdfs:range :C; rdfs:domain :C .",
  ":p a rdf:Property; rdfs:domain :C; rdfs:range :C .",
  ":p rdfs:range :C . :p rdfs:domain :C . :p a rdf:Property .",
])(
  "discovers domain roles before range dispatch regardless of order: %s",
  async (body) => {
    const result = await load(body);
    expect(result.root.getAxioms().size).toBe(0);
    expect(structureOf(result).statements).toHaveLength(3);
    expect((await check(result.root)).sourceAssessment.status).toBe("valid");
  },
);

test.each([false, true])(
  "does not manufacture OWL axioms from domain-seeded RDFS classes (reverse=%s)",
  async (reverse) => {
    const statements = [
      ":C rdfs:subClassOf :D .",
      ":p rdfs:subPropertyOf :q .",
      ":q rdfs:domain :C .",
      ":p a rdf:Property .",
      ":i a :D .",
    ];
    if (reverse) statements.reverse();
    const result = await load(statements.join("\n"));
    expect(result.root.getAxioms().size).toBe(0);
    expect(structureOf(result).statements).toHaveLength(5);
    expect((await check(result.root)).sourceAssessment.status).toBe("valid");
  },
);

test.each([false, true])(
  "propagates imported use roles before root range and membership reconstruction (cycle=%s)",
  async (cycle) => {
    const documents = new Map([
      [
        "urn:rdfs:middle",
        ":middle a owl:Ontology; owl:imports :leaf . :C rdfs:subClassOf :D .",
      ],
      [
        "urn:rdfs:leaf",
        `:leaf a owl:Ontology ${cycle ? "; owl:imports :middle" : ""} . :C a rdfs:Class .`,
      ],
    ]);
    const result = await load(
      ":root a owl:Ontology; owl:imports :middle . :q a rdf:Property; rdfs:range :D . :i a :D .",
      {
        documentLoader: {
          load: async (iri) =>
            new StringDocumentSource(
              `${prefixes} ${documents.get(iri.value)}`,
              { format: "turtle" },
            ),
        },
      },
    );
    expect(result.documents).toHaveLength(3);
    for (const { ontology } of result.documents)
      expect(ontology.getAxioms().size).toBe(0);
    expect(structureOf(result).statements).toHaveLength(3);
    expect((await check(result.root)).sourceAssessment.status).toBe("valid");
  },
);

test.each([
  ["owl:Class", "rdfs:Class"],
  ["owl:ObjectProperty", "rdf:Property"],
  ["owl:DatatypeProperty", "rdf:Property"],
  ["owl:AnnotationProperty", "rdf:Property"],
])(
  "preserves annotated generic declarations alongside %s",
  async (specific, generic) => {
    const result = await load(
      `:A a ${specific}, ${generic} . [] a owl:Axiom; owl:annotatedSource :A; owl:annotatedProperty rdf:type; owl:annotatedTarget ${generic}; rdfs:comment "bad"^^xsd:integer .`,
    );
    const structure = structureOf(result);
    expect(structure.statements).toHaveLength(1);
    expect(structure.statements[0].annotations).toHaveLength(1);
    const report = await check(result.root);
    expect(report.status).toBe("valid");
    expect(report.sourceAssessment.violations).toContainEqual(
      expect.objectContaining({ code: "LITERAL_LEXICAL_SPACE" }),
    );
    for (const format of [
      OWLDocumentFormats.FUNCTIONAL,
      OWLDocumentFormats.RDF_XML,
      OWLDocumentFormats.TURTLE,
      OWLDocumentFormats.OWL_XML,
    ]) {
      const target = new StringDocumentTarget();
      await result.manager.saveOntology(
        result.manager.createOntology(),
        format,
        target,
      );
      const previous = target.toString();
      await expect(
        result.manager.saveOntology(result.root, format, target),
      ).rejects.toMatchObject({ reason: "ONTOLOGY_NOT_REPRESENTABLE" });
      expect(target.toString()).toBe(previous);
    }
  },
);

test.each(["", ":B a rdfs:Class ."])(
  "checks generic class/datatype collisions without unrelated payload: %s",
  async (extra) => {
    const result = await load(
      `:A a rdfs:Class, rdfs:Datatype; owl:equivalentClass xsd:string . ${extra}`,
    );
    expect(
      (await check(result.root)).sourceAssessment.violations,
    ).toContainEqual(
      expect.objectContaining({ code: "SOURCE_CLASS_DATATYPE_COLLISION" }),
    );
  },
);

test("selects an explicit class for a generic domain but refuses an ambiguous generic range", async () => {
  const declarations =
    ":C a owl:Class, rdfs:Datatype; owl:equivalentClass xsd:string . :p a rdf:Property .";
  const result = await load(`${declarations} :p rdfs:domain :C .`);
  expect(
    structureOf(result).statements.find(
      ({ predicate }) => predicate.value === RDFS + "domain",
    ).object.kind,
  ).toBe("OWLClass");
  expect((await check(result.root)).sourceAssessment.violations).toContainEqual(
    expect.objectContaining({ code: "CLASS_DATATYPE_COLLISION" }),
  );
  await expect(
    load(`${declarations} :p rdfs:range :C .`),
  ).rejects.toMatchObject({ reason: "RDF_AMBIGUOUS_RANGE_ROLE" });
});

test("uses the same discovery and preservation path for RDF/XML", async () => {
  const manager = OWLManager.createOWLOntologyManager();
  const result = await manager.loadOntologyGraphFromOntologyDocument(
    new StringDocumentSource(
      `<rdf:RDF xmlns:rdf="${RDF}" xmlns:rdfs="${RDFS}" xmlns:owl="http://www.w3.org/2002/07/owl#">
    <rdf:Property rdf:about="urn:rdfs:p"><rdfs:range rdf:resource="urn:rdfs:C"/><rdfs:domain rdf:resource="urn:rdfs:C"/></rdf:Property>
    </rdf:RDF>`,
      { format: "rdfxml" },
    ),
    { parsingMode: "preserve" },
  );
  expect(result.ontology.getAxioms().size).toBe(0);
  expect(result.documents[0].context.sourceStructure.statements).toHaveLength(
    3,
  );
  expect((await check(result.ontology)).sourceAssessment.status).toBe("valid");
});

test("rejects annotations on unrepresentable structural anchors instead of reattaching them", async () => {
  await expect(
    load(`:A a owl:Class; owl:equivalentClass [a owl:Class; owl:intersectionOf _:list] .
  _:list a rdf:List; rdf:first :A; rdf:rest [rdf:first :A; rdf:rest rdf:nil] .
  [] a owl:Axiom; owl:annotatedSource _:list; owl:annotatedProperty rdf:type; owl:annotatedTarget rdf:List; rdfs:comment "kept only with its owner" .`),
  ).rejects.toMatchObject({ reason: "RDF_ANNOTATION_ANCHOR_UNSUPPORTED" });
});

test.each([
  [
    ":p a owl:TransitiveProperty .",
    ":A a owl:Class . :p rdfs:domain :A .",
    "OWLObjectPropertyDomainAxiom",
  ],
  [
    ":C a owl:Class; rdfs:subClassOf :D .",
    ":q a rdf:Property; rdfs:range :D .",
    undefined,
  ],
  [":C rdfs:subClassOf :D .", ":q a rdf:Property; rdfs:range :D .", undefined],
  [":i a :D .", ":q a rdf:Property; rdfs:range :D .", undefined],
  [
    ":C a owl:Class; rdfs:subClassOf [a owl:Restriction; owl:onProperty :p; owl:someValuesFrom xsd:string] .",
    ":A a owl:Class . :p rdfs:domain :A .",
    "OWLDataPropertyDomainAxiom",
  ],
  [
    ":C a owl:Class; rdfs:subClassOf [a owl:Restriction; owl:onProperty :p; owl:hasValue :i] .",
    ":A a owl:Class . :p rdfs:domain :A .",
    "OWLObjectPropertyDomainAxiom",
  ],
])(
  "supplies imported roles established by OWL use: %s",
  async (leaf, body, axiomKind) => {
    const result = await load(
      `:root a owl:Ontology; owl:imports :leaf . ${body}`,
      {
        documentLoader: {
          load: async () =>
            new StringDocumentSource(
              `${prefixes} :leaf a owl:Ontology . ${leaf}`,
              { format: "turtle" },
            ),
        },
      },
    );
    if (axiomKind)
      expect(
        [...result.root.getAxioms()].some(({ kind }) => kind === axiomKind),
      ).toBe(true);
    else
      expect(
        structureOf(result).statements.some(
          ({ predicate }) => predicate.value === RDFS + "range",
        ),
      ).toBe(true);
    const leafOntology = result.documents.find(
      ({ ontology }) => ontology !== result.root,
    ).ontology;
    expect(
      [...leafOntology.getAxioms()].filter(
        ({ kind, entity }) =>
          kind === "OWLDeclarationAxiom" && entity.iri.value === "urn:rdfs:p",
      ),
    ).toHaveLength(0);
    expect((await check(result.root)).sourceAssessment.status).toBe("valid");
  },
);

test("imports use roles from a non-RDF source without inventing declarations", async () => {
  const result = await load(
    ":root a owl:Ontology; owl:imports :leaf . :A a owl:Class . :p rdfs:domain :A .",
    {
      documentLoader: {
        load: async () =>
          new StringDocumentSource(
            "Ontology(<urn:rdfs:leaf> TransitiveObjectProperty(<urn:rdfs:p>))",
            { format: "functional" },
          ),
      },
    },
  );
  expect(
    [...result.root.getAxioms()].some(
      ({ kind }) => kind === "OWLObjectPropertyDomainAxiom",
    ),
  ).toBe(true);
  expect((await check(result.root)).sourceAssessment.status).toBe("valid");
});

test.each([
  "AsymmetricProperty",
  "InverseFunctionalProperty",
  "IrreflexiveProperty",
  "ReflexiveProperty",
  "SymmetricProperty",
  "TransitiveProperty",
])(
  "discovers imported object-only %s use without declarations",
  async (type) => {
    const result = await load(
      ":root a owl:Ontology; owl:imports :leaf . :p rdfs:domain :A .",
      {
        documentLoader: {
          load: async () =>
            new StringDocumentSource(
              `${prefixes} :leaf a owl:Ontology . :p a owl:${type} .`,
              { format: "turtle" },
            ),
        },
      },
    );
    expect([...result.root.getAxioms()].map(({ kind }) => kind)).toEqual([
      "OWLObjectPropertyDomainAxiom",
    ]);
    expect(
      [...result.importsClosure]
        .flatMap((ontology) => [...ontology.getAxioms()])
        .some(({ kind }) => kind === "OWLDeclarationAxiom"),
    ).toBe(false);
    expect((await check(result.root)).sourceAssessment.status).toBe("valid");
  },
);

test.each([false, true])(
  "a bare subclass unlocks imported restriction roles (cycle=%s)",
  async (cycle) => {
    const documents = new Map([
      [
        "urn:rdfs:middle",
        ":middle a owl:Ontology; owl:imports :leaf . :E rdfs:subClassOf [a owl:Restriction; owl:onProperty :p; owl:someValuesFrom :C] .",
      ],
      [
        "urn:rdfs:leaf",
        `:leaf a owl:Ontology ${cycle ? "; owl:imports :root" : ""} . :C rdfs:subClassOf :D .`,
      ],
    ]);
    const result = await load(
      ":root a owl:Ontology; owl:imports :middle . :p rdfs:domain :A .",
      {
        documentLoader: {
          load: async (iri) =>
            new StringDocumentSource(
              `${prefixes} ${documents.get(iri.value)}`,
              { format: "turtle" },
            ),
        },
      },
    );
    expect([...result.root.getAxioms()].map(({ kind }) => kind)).toEqual([
      "OWLObjectPropertyDomainAxiom",
    ]);
    expect(
      [...result.importsClosure]
        .flatMap((ontology) => [...ontology.getAxioms()])
        .some(({ kind }) => kind === "OWLDeclarationAxiom"),
    ).toBe(false);
    expect((await check(result.root)).sourceAssessment.status).toBe("valid");
  },
);

test.each([false, true])(
  "an incidental label cannot resolve a cyclic ambiguous restriction (label=%s)",
  async (label) => {
    await expect(
      load(
        ':root a owl:Ontology; owl:imports :middle; rdfs:comment "value"^^:D . :C a owl:Class; rdfs:subClassOf [a owl:Restriction; owl:onProperty :p; owl:someValuesFrom :D] .',
        {
          documentLoader: {
            load: async () =>
              new StringDocumentSource(
                `${prefixes} :middle a owl:Ontology; owl:imports :root . :z a owl:ObjectProperty; rdfs:range :D . ${label ? ':p rdfs:label "echo" .' : ""}`,
                { format: "turtle" },
              ),
          },
        },
      ),
    ).rejects.toMatchObject({ reason: "RDF_AMBIGUOUS_PROPERTY_ROLE" });
  },
);

test.each(["", ":p a owl:ObjectProperty .", ":p a owl:DatatypeProperty ."])(
  "conditional restrictions cannot supply their own cyclic role evidence: %s",
  async (declaration) => {
    const loading = load(
      `:root a owl:Ontology; owl:imports :middle; rdfs:comment "value"^^:D . :C a owl:Class; rdfs:subClassOf [a owl:Restriction; owl:onProperty :p; owl:someValuesFrom :D] . ${declaration}`,
      {
        documentLoader: {
          load: async () =>
            new StringDocumentSource(
              `${prefixes} :middle a owl:Ontology; owl:imports :root . :z a owl:ObjectProperty; rdfs:range :D . :M a owl:Class; rdfs:subClassOf [a owl:Restriction; owl:onProperty :p; owl:someValuesFrom :E] .`,
              { format: "turtle" },
            ),
        },
      },
    );
    if (!declaration)
      await expect(loading).rejects.toMatchObject({
        reason: "RDF_AMBIGUOUS_PROPERTY_ROLE",
      });
    else {
      const result = await loading;
      const restrictions = [...result.importsClosure]
        .flatMap((ontology) => [...ontology.getAxioms()])
        .filter(({ kind }) => kind === "OWLSubClassOfAxiom")
        .map(({ superClass }) => superClass.kind);
      expect(restrictions).toHaveLength(2);
      expect(new Set(restrictions)).toEqual(
        new Set([
          declaration.includes("ObjectProperty")
            ? "OWLObjectSomeValuesFrom"
            : "OWLDataSomeValuesFrom",
        ]),
      );
    }
  },
);

test.each(
  [false, true].flatMap((reverse) =>
    ["", "ObjectProperty", "DatatypeProperty"].map((type) => [reverse, type]),
  ),
)(
  "withdraws a local role when competing evidence arrives (reverse=%s, type=%s)",
  async (reverse, type) => {
    const parts = [
      ':root a owl:Ontology; rdfs:comment "value"^^:D . :C a owl:Class; rdfs:subClassOf [a owl:Restriction; owl:onProperty :p; owl:someValuesFrom :D] .',
      ":z a owl:ObjectProperty; rdfs:range :D .",
    ];
    if (reverse) parts.reverse();
    const loading = load(
      `${parts.join("\n")} ${type ? `:p a owl:${type} .` : ""}`,
    );
    if (!type)
      await expect(loading).rejects.toMatchObject({
        reason: "RDF_AMBIGUOUS_PROPERTY_ROLE",
      });
    else {
      const result = await loading;
      const restriction = [...result.root.getAxioms()].find(
        ({ kind }) => kind === "OWLSubClassOfAxiom",
      ).superClass;
      expect(restriction.kind).toBe(
        type === "ObjectProperty"
          ? "OWLObjectSomeValuesFrom"
          : "OWLDataSomeValuesFrom",
      );
    }
  },
);

test.each([false, true])(
  "recomputes generic roles after later specific evidence (reverse=%s)",
  async (reverse) => {
    const statements = [
      ":p a rdf:Property; rdfs:domain :X .",
      ":X rdfs:subClassOf :Y .",
      ":A a owl:Class; rdfs:subClassOf [a owl:Restriction; owl:onProperty :p; owl:someValuesFrom :C] .",
      ":B rdfs:subClassOf :C .",
    ];
    if (reverse) statements.reverse();
    const result = await load(statements.join("\n"));
    expect([...result.root.getAxioms()]).toContainEqual(
      expect.objectContaining({
        kind: "OWLSubClassOfAxiom",
        subClass: expect.objectContaining({
          iri: expect.objectContaining({ value: "urn:rdfs:X" }),
        }),
        superClass: expect.objectContaining({
          iri: expect.objectContaining({ value: "urn:rdfs:Y" }),
        }),
      }),
    );
    expect(structureOf(result).statements).toHaveLength(1);
    expect(structureOf(result).roles).not.toContainEqual(
      expect.objectContaining({ iri: "urn:rdfs:Y", type: RDFS + "Class" }),
    );
    expect((await check(result.root)).sourceAssessment.status).toBe("valid");
  },
);

test.each(
  ["B, :C", "C, :B"].flatMap((operands) =>
    ["B", "C"].map((target) => [operands, target]),
  ),
)(
  "sibling equivalent-class statements retain independent role evidence (%s, target=%s)",
  async (operands, target) => {
    const result = await load(
      `:A a owl:Class; owl:equivalentClass :${operands} . :q a rdf:Property; rdfs:range :${target} .`,
    );
    expect(
      [...result.root.getAxioms()].filter(
        ({ kind }) => kind === "OWLEquivalentClassesAxiom",
      ),
    ).toHaveLength(2);
    expect((await check(result.root)).sourceAssessment.status).toBe("valid");
  },
);

test.each([false, true])(
  "separates imported proof rules despite shared XML bases and blank labels (cycle=%s)",
  async (cycle) => {
    const rdfDocument = (name, property, imported, declaration) => `
      <rdf:RDF xmlns:rdf="${RDF}" xmlns:rdfs="${RDFS}"
        xmlns:owl="http://www.w3.org/2002/07/owl#"
        xml:base="https://example.test/shared-base/">
        <owl:Ontology rdf:about="urn:proof:${name}">
          ${imported ? `<owl:imports rdf:resource="urn:proof:${imported}"/>` : ""}
        </owl:Ontology>
        ${declaration ? '<owl:ObjectProperty rdf:about="urn:proof:p"/>' : ""}
        <owl:Class rdf:about="urn:proof:${name}Class">
          <rdfs:subClassOf rdf:nodeID="r"/>
        </owl:Class>
        <owl:Restriction rdf:nodeID="r">
          <owl:onProperty rdf:resource="urn:proof:${property}"/>
          <owl:someValuesFrom rdf:resource="urn:proof:D"/>
        </owl:Restriction>
      </rdf:RDF>`;
    const sources = {
      "urn:proof:a": new StringDocumentSource(
        rdfDocument("a", "p", cycle ? "b" : "", true),
        { format: "rdfxml", documentIRI: "urn:proof:a-bytes" },
      ),
      "urn:proof:b": new StringDocumentSource(
        rdfDocument("b", "q", "a", false),
        { format: "rdfxml", documentIRI: "urn:proof:b-bytes" },
      ),
    };
    const manager = OWLManager.createOWLOntologyManager({
      documentLoader: { load: async (iri) => sources[iri.value] },
    });
    const loaded = await manager.loadOntologyGraphFromOntologyDocument(
      sources["urn:proof:b"],
      { parsingMode: "preserve" },
    );
    const restrictions = [...loaded.importsClosure]
      .flatMap((ontology) => [...ontology.getAxioms()])
      .filter(({ kind }) => kind === "OWLSubClassOfAxiom")
      .map(({ superClass }) => superClass);
    expect(restrictions).toHaveLength(2);
    expect(restrictions.map(({ kind }) => kind)).toEqual([
      "OWLObjectSomeValuesFrom",
      "OWLObjectSomeValuesFrom",
    ]);
    expect(
      restrictions.map(({ property }) => property.iri.value).sort(),
    ).toEqual(["urn:proof:p", "urn:proof:q"]);
    expect((await check(loaded.ontology)).sourceAssessment.status).toBe(
      "valid",
    );
  },
);
