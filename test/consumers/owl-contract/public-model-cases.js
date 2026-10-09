/** Independent public field contracts used by VOWL; supplied handles are the oracle. */
export const PUBLIC_MODEL_CASES = [
  [
    "OWLSubClassOfAxiom",
    ["classA", "classB"],
    { subClass: "classA", superClass: "classB" },
  ],
  [
    "OWLObjectIntersectionOf",
    [["classA", "classB"]],
    { operands: ["classA", "classB"] },
  ],
  [
    "OWLObjectUnionOf",
    [["classA", "classB"]],
    { operands: ["classA", "classB"] },
  ],
  ["OWLObjectComplementOf", ["classA"], { operand: "classA" }],
  [
    "OWLObjectOneOf",
    [["individualA", "individualB"]],
    { individuals: ["individualA", "individualB"] },
  ],
  ["OWLObjectInverseOf", ["propertyP"], { inverse: "propertyP" }],
  ...["SomeValuesFrom", "AllValuesFrom"].map((suffix) => [
    `OWLObject${suffix}`,
    ["propertyP", "classA"],
    { property: "propertyP", filler: "classA" },
  ]),
  [
    "OWLObjectHasValue",
    ["propertyP", "individualA"],
    { property: "propertyP", individual: "individualA" },
  ],
  ["OWLObjectHasSelf", ["propertyP"], { property: "propertyP" }],
  ...["Min", "Max", "Exact"].flatMap((cardinality) => [
    [
      `OWLObject${cardinality}Cardinality`,
      [2, "propertyP", "classA"],
      { cardinality: 2, property: "propertyP", filler: "classA" },
    ],
    [
      `OWLData${cardinality}Cardinality`,
      [2, "dataP", "datatype"],
      { cardinality: 2, property: "dataP", filler: "datatype" },
    ],
  ]),
  ...["SomeValuesFrom", "AllValuesFrom"].map((suffix) => [
    `OWLData${suffix}`,
    [["dataP"], "datatype"],
    { properties: ["dataP"], filler: "datatype" },
  ]),
  [
    "OWLDataHasValue",
    ["dataP", "literal"],
    { property: "dataP", value: "literal" },
  ],
  ...["IntersectionOf", "UnionOf"].map((suffix) => [
    `OWLData${suffix}`,
    [["datatype", "otherDatatype"]],
    { operands: ["datatype", "otherDatatype"] },
  ]),
  ["OWLDataComplementOf", ["datatype"], { operand: "datatype" }],
  [
    "OWLDataOneOf",
    [["literal", "otherLiteral"]],
    { values: ["literal", "otherLiteral"] },
  ],
  [
    "OWLDatatypeRestriction",
    ["datatype", ["facet"]],
    { datatype: "datatype", facetRestrictions: ["facet"] },
  ],
  ...["Equivalent", "Disjoint"].map((suffix) => [
    `OWL${suffix}ClassesAxiom`,
    [["classA", "classB"]],
    { classExpressions: ["classA", "classB"] },
  ]),
  [
    "OWLDisjointUnionAxiom",
    ["classA", ["classB", "classC"]],
    { owlClass: "classA", classExpressions: ["classB", "classC"] },
  ],
  [
    "OWLSubPropertyChainOfAxiom",
    [["propertyP", "propertyQ"], "propertyP"],
    { chain: ["propertyP", "propertyQ"], superProperty: "propertyP" },
  ],
  ...["Object", "Data", "Annotation"].flatMap((category) => {
    const first =
      category === "Object"
        ? "propertyP"
        : category === "Data"
          ? "dataP"
          : "annotationP";
    const second =
      category === "Object"
        ? "propertyQ"
        : category === "Data"
          ? "dataQ"
          : "annotationQ";
    return [
      [
        `OWLSub${category}PropertyOfAxiom`,
        [first, second],
        { subProperty: first, superProperty: second },
      ],
      [
        `OWL${category}PropertyDomainAxiom`,
        [first, category === "Annotation" ? "iriA" : "classA"],
        {
          property: first,
          domain: category === "Annotation" ? "iriA" : "classA",
        },
      ],
      [
        `OWL${category}PropertyRangeAxiom`,
        [
          first,
          category === "Annotation"
            ? "iriA"
            : category === "Data"
              ? "datatype"
              : "classA",
        ],
        {
          property: first,
          range:
            category === "Annotation"
              ? "iriA"
              : category === "Data"
                ? "datatype"
                : "classA",
        },
      ],
      ...(category === "Annotation"
        ? []
        : ["Equivalent", "Disjoint"].map((suffix) => [
            `OWL${suffix}${category}PropertiesAxiom`,
            [[first, second]],
            { properties: [first, second] },
          ])),
    ];
  }),
  [
    "OWLInverseObjectPropertiesAxiom",
    ["propertyP", "propertyQ"],
    { properties: ["propertyP", "propertyQ"] },
  ],
  ...[
    "Functional",
    "InverseFunctional",
    "Reflexive",
    "Irreflexive",
    "Symmetric",
    "Asymmetric",
    "Transitive",
  ].map((characteristic) => [
    `OWL${characteristic}ObjectPropertyAxiom`,
    ["propertyP"],
    { property: "propertyP" },
  ]),
  ["OWLFunctionalDataPropertyAxiom", ["dataP"], { property: "dataP" }],
  [
    "OWLDatatypeDefinitionAxiom",
    ["datatype", "otherDatatype"],
    { datatype: "datatype", dataRange: "otherDatatype" },
  ],
  [
    "OWLHasKeyAxiom",
    ["classA", ["propertyP"], ["dataP"]],
    {
      classExpression: "classA",
      objectProperties: ["propertyP"],
      dataProperties: ["dataP"],
    },
  ],
  [
    "OWLClassAssertionAxiom",
    ["classA", "individualA"],
    { classExpression: "classA", individual: "individualA" },
  ],
  ...["SameIndividual", "DifferentIndividuals"].map((suffix) => [
    `OWL${suffix}Axiom`,
    [["individualA", "individualB"]],
    { individuals: ["individualA", "individualB"] },
  ]),
  ...["", "Negative"].flatMap((negative) => [
    [
      `OWL${negative}ObjectPropertyAssertionAxiom`,
      ["propertyP", "individualA", "individualB"],
      { property: "propertyP", subject: "individualA", value: "individualB" },
    ],
    [
      `OWL${negative}DataPropertyAssertionAxiom`,
      ["dataP", "individualA", "literal"],
      { property: "dataP", subject: "individualA", value: "literal" },
    ],
  ]),
  [
    "OWLAnnotationAssertionAxiom",
    ["annotationP", "iriA", "literal"],
    { property: "annotationP", subject: "iriA", value: "literal" },
  ],
];

export const OWL_CONTRACT_ASSERTIONS = Object.freeze([
  "public package exports and native installation identity",
  "public literal, annotation, entity and structural identity",
  "document graph, loader context, configuration and missing-import errors",
  "RDF parser metadata and retained source evidence",
  "profile validity, uncertainty and parser preservation",
  "imports closure, merger, ontology changes and storage failure contracts",
  "public format metadata and acquisition-independent loader configuration",
  "public import, resource and security error identity and details",
  ...PUBLIC_MODEL_CASES.map(([kind]) => `public model fields: ${kind}`),
  "manager-local immutable writer configuration and configured RDF/XML save",
  "installed rc.2 queries, changes, transforms, renderer, storage and profile contracts",
]);
