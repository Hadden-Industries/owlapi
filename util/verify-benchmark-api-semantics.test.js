import { OWLManager } from "../apibinding/index.js";
import { AddAxiom, IRI } from "../model/index.js";
import { OWL2RLProfile } from "../profiles/index.js";
import { OWLDocumentFormats } from "../formats/index.js";
import { StringDocumentSource } from "../io/index.js";
import { canonicalJson } from "../scripts/canonical-json.mjs";
import { runComparison } from "./owlapi-reference/compare-java-js.mjs";
import {
  canonicalizeOntology,
  canonicalizeOntologyChange,
  canonicalizeOwlObject,
  canonicalizeProfileReport,
  classifyApiWorkloadRow,
  expectedGeneratedLoadWorkload,
  observeJsApiSemantics,
} from "./verify-benchmark-api-semantics.mjs";
import { prepareSharedFixtureDirectory } from "./benchmark-owlapi-java-parity.mjs";

const XSD_STRING = "http://www.w3.org/2001/XMLSchema#string";
const XSD_INTEGER = "http://www.w3.org/2001/XMLSchema#integer";
const XSD_DECIMAL = "http://www.w3.org/2001/XMLSchema#decimal";
const MIN_INCLUSIVE = "http://www.w3.org/2001/XMLSchema#minInclusive";

function buildAll38AxiomsSample(df, ns = "urn:test:ast#") {
  const c = df.getOWLClass(IRI.create(`${ns}C`));
  const d = df.getOWLClass(IRI.create(`${ns}D`));
  const e = df.getOWLClass(IRI.create(`${ns}E`));
  const op = df.getOWLObjectProperty(IRI.create(`${ns}op`));
  const oq = df.getOWLObjectProperty(IRI.create(`${ns}oq`));
  const dp = df.getOWLDataProperty(IRI.create(`${ns}dp`));
  const dq = df.getOWLDataProperty(IRI.create(`${ns}dq`));
  const ap = df.getOWLAnnotationProperty(IRI.create(`${ns}ap`));
  const rdfsLabel = df.getRDFSLabel();
  const dt = df.getOWLDatatype(IRI.create(`${ns}dt`));
  const xsdStr = df.getOWLDatatype(IRI.create(XSD_STRING));
  const xsdInt = df.getOWLDatatype(IRI.create(XSD_INTEGER));
  const xsdDec = df.getOWLDatatype(IRI.create(XSD_DECIMAL));
  const ind1 = df.getOWLNamedIndividual(IRI.create(`${ns}ind1`));
  const ind2 = df.getOWLNamedIndividual(IRI.create(`${ns}ind2`));
  const anon = df.getOWLAnonymousIndividual("b0");
  const lit = df.getOWLLiteral("hello", "en");
  const intLit = df.getOWLLiteral("5", xsdInt);
  const ann = df.getOWLAnnotation(rdfsLabel, df.getOWLLiteral("tag"));

  const someExpr = df.getOWLObjectSomeValuesFrom(
    df.getOWLObjectInverseOf(op),
    df.getOWLObjectUnionOf([
      df.getOWLObjectComplementOf(d),
      df.getOWLObjectOneOf([ind1, ind2]),
      df.getOWLObjectHasValue(op, ind1),
      df.getOWLObjectHasSelf(op),
      df.getOWLObjectMinCardinality(1, op, d),
      df.getOWLObjectMaxCardinality(2, op),
      df.getOWLObjectExactCardinality(1, op, c),
    ]),
  );
  const dataExpr = df.getOWLObjectIntersectionOf([
    df.getOWLDataSomeValuesFrom([dp], xsdStr),
    df.getOWLDataAllValuesFrom([dp], xsdStr),
    df.getOWLDataHasValue(dp, lit),
    df.getOWLDataMinCardinality(1, dp, xsdInt),
    df.getOWLDataMaxCardinality(2, dp),
    df.getOWLDataExactCardinality(1, dp, xsdDec),
  ]);
  const drRestr = df.getOWLDatatypeRestriction(xsdInt, [
    df.getOWLFacetRestriction(IRI.create(MIN_INCLUSIVE), intLit),
  ]);
  const drComplex = df.getOWLDataIntersectionOf([
    drRestr,
    df.getOWLDataUnionOf([xsdInt, xsdDec]),
    df.getOWLDataComplementOf(xsdStr),
    df.getOWLDataOneOf([lit]),
  ]);

  return [
    df.getOWLDeclarationAxiom(c, [ann]),
    df.getOWLSubClassOfAxiom(c, someExpr, [ann]),
    df.getOWLEquivalentClassesAxiom([c, d, dataExpr]),
    df.getOWLDisjointClassesAxiom([d, c]),
    df.getOWLDisjointUnionAxiom(c, [d, e]),
    df.getOWLSubObjectPropertyOfAxiom(op, oq),
    df.getOWLSubPropertyChainOfAxiom([op, oq], oq),
    df.getOWLEquivalentObjectPropertiesAxiom([oq, op]),
    df.getOWLDisjointObjectPropertiesAxiom([op, oq]),
    df.getOWLObjectPropertyDomainAxiom(op, c),
    df.getOWLObjectPropertyRangeAxiom(op, d),
    df.getOWLInverseObjectPropertiesAxiom(op, oq),
    df.getOWLFunctionalObjectPropertyAxiom(op),
    df.getOWLInverseFunctionalObjectPropertyAxiom(op),
    df.getOWLReflexiveObjectPropertyAxiom(op),
    df.getOWLIrreflexiveObjectPropertyAxiom(op),
    df.getOWLSymmetricObjectPropertyAxiom(op),
    df.getOWLAsymmetricObjectPropertyAxiom(oq),
    df.getOWLTransitiveObjectPropertyAxiom(oq),
    df.getOWLSubDataPropertyOfAxiom(dp, dq),
    df.getOWLEquivalentDataPropertiesAxiom([dp, dq]),
    df.getOWLDisjointDataPropertiesAxiom([dq, dp]),
    df.getOWLDataPropertyDomainAxiom(dp, c),
    df.getOWLDataPropertyRangeAxiom(dp, drComplex),
    df.getOWLFunctionalDataPropertyAxiom(dp),
    df.getOWLDatatypeDefinitionAxiom(dt, drRestr),
    df.getOWLHasKeyAxiom(c, [op], [dp]),
    df.getOWLSameIndividualAxiom([ind2, ind1]),
    df.getOWLDifferentIndividualsAxiom([ind1, ind2]),
    df.getOWLClassAssertionAxiom(c, ind1),
    df.getOWLObjectPropertyAssertionAxiom(op, ind1, anon),
    df.getOWLNegativeObjectPropertyAssertionAxiom(op, ind1, ind2),
    df.getOWLDataPropertyAssertionAxiom(dp, ind1, lit),
    df.getOWLNegativeDataPropertyAssertionAxiom(dp, ind2, intLit),
    df.getOWLAnnotationAssertionAxiom(rdfsLabel, c.iri, lit),
    df.getOWLSubAnnotationPropertyOfAxiom(ap, rdfsLabel),
    df.getOWLAnnotationPropertyDomainAxiom(ap, c.iri),
    df.getOWLAnnotationPropertyRangeAxiom(ap, d.iri),
  ];
}

describe("Canonical structural AST & full API equivalence witnesses", () => {
  test("canonicalizeOwlObject covers all 38 axiom kinds, is invariant to set operand order, and detects single-component mutations", () => {
    const m = OWLManager.createOWLOntologyManager({
      behaviorProfileId: "java-owlapi-5.5.1",
    });
    const df = m.getOWLDataFactory();
    const axioms = buildAll38AxiomsSample(df);
    expect(new Set(axioms.map((a) => a.kind)).size).toBe(38);

    const projected = axioms.map((a) => canonicalizeOwlObject(a));
    expect(projected).toHaveLength(38);
    expect(typeof canonicalJson(projected)).toBe("string");

    // Set operands (e.g. DisjointClasses, SameIndividual) are order-invariant.
    const c = df.getOWLClass(IRI.create("urn:test:ast#C"));
    const d = df.getOWLClass(IRI.create("urn:test:ast#D"));
    const dj1 = canonicalizeOwlObject(df.getOWLDisjointClassesAxiom([c, d]));
    const dj2 = canonicalizeOwlObject(df.getOWLDisjointClassesAxiom([d, c]));
    expect(canonicalJson(dj1)).toBe(canonicalJson(dj2));

    // Ordered SubPropertyChain preserves order sensitivity.
    const op = df.getOWLObjectProperty(IRI.create("urn:test:ast#op"));
    const oq = df.getOWLObjectProperty(IRI.create("urn:test:ast#oq"));
    const ch1 = canonicalJson(
      canonicalizeOwlObject(df.getOWLSubPropertyChainOfAxiom([op, oq], oq)),
    );
    const ch2 = canonicalJson(
      canonicalizeOwlObject(df.getOWLSubPropertyChainOfAxiom([oq, op], oq)),
    );
    expect(ch1).not.toBe(ch2);

    // Mutating annotation, cardinality, literal language, or datatype changes canonical AST.
    const ann1 = df.getOWLAnnotation(df.getRDFSLabel(), df.getOWLLiteral("a"));
    const ann2 = df.getOWLAnnotation(df.getRDFSLabel(), df.getOWLLiteral("b"));
    expect(
      canonicalJson(
        canonicalizeOwlObject(df.getOWLDeclarationAxiom(c, [ann1])),
      ),
    ).not.toBe(
      canonicalJson(
        canonicalizeOwlObject(df.getOWLDeclarationAxiom(c, [ann2])),
      ),
    );
    expect(
      canonicalJson(
        canonicalizeOwlObject(df.getOWLObjectMinCardinality(1, op, c)),
      ),
    ).not.toBe(
      canonicalJson(
        canonicalizeOwlObject(df.getOWLObjectMinCardinality(2, op, c)),
      ),
    );
    expect(
      canonicalJson(canonicalizeOwlObject(df.getOWLLiteral("hi", "en"))),
    ).not.toBe(
      canonicalJson(canonicalizeOwlObject(df.getOWLLiteral("hi", "fr"))),
    );
  });

  test("canonicalizeProfileReport normalizes OWL2RL violation category and canonicalizeOntologyChange captures change details", async () => {
    const bp = { behaviorProfileId: "java-owlapi-5.5.1" };
    const m = OWLManager.createOWLOntologyManager(bp);
    const df = m.getOWLDataFactory();
    const ont = m.createOntology(
      df.getOWLOntologyID(IRI.create("urn:bench:profile-test")),
    );
    const c = df.getOWLClass(IRI.create("urn:bench:profile-test#C0"));
    const d = df.getOWLClass(IRI.create("urn:bench:profile-test#D0"));
    const op = df.getOWLObjectProperty(IRI.create("urn:bench:profile-test#op"));
    const subAxiom = df.getOWLSubClassOfAxiom(
      c,
      df.getOWLObjectSomeValuesFrom(op, d),
    );
    m.addAxioms(ont, [
      df.getOWLDeclarationAxiom(c),
      df.getOWLDeclarationAxiom(d),
      df.getOWLDeclarationAxiom(op),
      subAxiom,
    ]);
    const report = await new OWL2RLProfile(bp).checkOntology(ont);
    const projectedReport = canonicalizeProfileReport(report);
    expect(projectedReport).toEqual({
      profileName: "OWL 2 RL",
      inProfile: false,
      violationCount: 1,
      violations: [
        {
          axiomKind: "OWLSubClassOfAxiom",
          violationCategory: "NonSuperClassExpression",
          expressionKind: "OWLObjectSomeValuesFrom",
        },
      ],
    });
    const decl = df.getOWLDeclarationAxiom(c);
    const add = new AddAxiom(ont, decl);
    expect(canonicalizeOntologyChange(add)).toEqual({
      changeKind: "AddAxiom",
      ontologyIRI: "urn:bench:profile-test",
      axiom: canonicalizeOwlObject(decl),
    });
  });

  test("classifyApiWorkloadRow enforces strict semantic equality and rejects same-count mutations", () => {
    const identical = { values: ["a", "b"] };
    expect(
      classifyApiWorkloadRow({
        groupId: "model.IRI.create",
        behaviorProfileId: "java-owlapi-5.5.1",
        javaObservation: identical,
        jsObservation: { values: ["a", "b"] },
      }),
    ).toMatchObject({
      status: "passed",
      admission: "independently-witnessed",
      reasonId: "equivalent-workload",
      semanticMatch: true,
    });

    // Negative control: same length/checksum count, mutated IRI must fail!
    expect(
      classifyApiWorkloadRow({
        groupId: "model.IRI.create",
        behaviorProfileId: "java-owlapi-5.5.1",
        javaObservation: { values: ["a", "b"] },
        jsObservation: { values: ["a", "c"] },
      }),
    ).toMatchObject({
      status: "failed",
      admission: "failed",
      reasonId: "structural-mismatch",
      semanticMatch: false,
    });

    // Writer configuration known difference: Java resets indentSize=4 and
    // useBanners=true across copy setters while normative-v1 preserves caller values.
    const writerDefaults = {
      indenting: true,
      indentSize: 4,
      useBanners: true,
      labelsAsBanner: false,
      saveIdsForAllAnonymousIndividuals: false,
    };
    const writerJava = {
      defaults: writerDefaults,
      steps: [
        {
          indenting: false,
          indentSize: 4,
          useBanners: true,
          labelsAsBanner: true,
          saveIdsForAllAnonymousIndividuals: true,
        },
        {
          indenting: false,
          indentSize: 4,
          useBanners: true,
          labelsAsBanner: true,
          saveIdsForAllAnonymousIndividuals: true,
        },
      ],
    };
    const writerNormOk = {
      defaults: { ...writerDefaults },
      steps: [
        {
          indenting: false,
          indentSize: 2,
          useBanners: false,
          labelsAsBanner: true,
          saveIdsForAllAnonymousIndividuals: true,
        },
        {
          indenting: false,
          indentSize: 3,
          useBanners: false,
          labelsAsBanner: true,
          saveIdsForAllAnonymousIndividuals: true,
        },
      ],
    };
    expect(
      classifyApiWorkloadRow({
        groupId: "config.OWLOntologyWriterConfiguration",
        behaviorProfileId: "normative-v1",
        javaObservation: writerJava,
        jsObservation: writerNormOk,
      }),
    ).toMatchObject({
      status: "observed",
      admission: "known-behavioral-difference",
      reasonId: "writer-copy-policy",
    });
    expect(
      classifyApiWorkloadRow({
        groupId: "config.OWLOntologyWriterConfiguration",
        behaviorProfileId: "java-owlapi-5.5.1",
        javaObservation: writerJava,
        jsObservation: writerNormOk,
      }).status,
    ).toBe("failed");
    expect(
      classifyApiWorkloadRow({
        groupId: "config.OWLOntologyWriterConfiguration",
        behaviorProfileId: "normative-v1",
        javaObservation: writerJava,
        jsObservation: {
          defaults: writerDefaults,
          steps: [
            { ...writerNormOk.steps[0], indentSize: 3 },
            writerNormOk.steps[1],
          ],
        },
      }).status,
    ).toBe("failed");
    expect(
      classifyApiWorkloadRow({
        groupId: "config.OWLOntologyWriterConfiguration",
        behaviorProfileId: "normative-v1",
        javaObservation: writerJava,
        jsObservation: {
          defaults: writerDefaults,
          steps: [
            { ...writerNormOk.steps[0], labelsAsBanner: false },
            writerNormOk.steps[1],
          ],
        },
      }).status,
    ).toBe("failed");
    expect(
      classifyApiWorkloadRow({
        groupId: "config.OWLOntologyWriterConfiguration",
        behaviorProfileId: "normative-v1",
        javaObservation: writerJava,
        jsObservation: {
          defaults: writerDefaults,
          steps: [
            { ...writerNormOk.steps[0], indenting: true },
            writerNormOk.steps[1],
          ],
        },
      }).status,
    ).toBe("failed");

    // Literals known difference: ONLY l2.language whitespace differs under normative-v1.
    const litJava = {
      sets: [
        {
          l1: { lexicalForm: "plain_0", datatypeIRI: XSD_STRING, language: "" },
          l2: {
            lexicalForm: "lang_0",
            datatypeIRI: XSD_STRING,
            language: "en-gb",
          },
          l3: { lexicalForm: "0", datatypeIRI: XSD_INTEGER, language: "" },
        },
      ],
    };
    const litNormOk = {
      sets: [
        {
          ...litJava.sets[0],
          l2: { ...litJava.sets[0].l2, language: " en-gb " },
        },
      ],
    };
    expect(
      classifyApiWorkloadRow({
        groupId: "factory.literals",
        behaviorProfileId: "normative-v1",
        javaObservation: litJava,
        jsObservation: litNormOk,
      }),
    ).toMatchObject({
      status: "observed",
      admission: "known-behavioral-difference",
      reasonId: "literal-language-policy",
    });
    expect(
      classifyApiWorkloadRow({
        groupId: "factory.literals",
        behaviorProfileId: "normative-v1",
        javaObservation: litJava,
        jsObservation: {
          sets: [
            {
              ...litNormOk.sets[0],
              l1: {
                lexicalForm: "changed",
                datatypeIRI: XSD_STRING,
                language: "",
              },
            },
          ],
        },
      }).status,
    ).toBe("failed");

    // RDFParserMetaData: ONLY guessedDeclarations may differ.
    const metaJava = {
      tripleCount: 101,
      headerState: "HEADER_PARSED_MULTIPLE_TIMES",
      unparsedTriples: [],
      guessedDeclarations: [["urn:a", "OWLClass"]],
    };
    expect(
      classifyApiWorkloadRow({
        groupId: "load.rdfParserMetaData",
        behaviorProfileId: "java-owlapi-5.5.1",
        javaObservation: metaJava,
        jsObservation: {
          ...metaJava,
          guessedDeclarations: [
            ["urn:a", "OWLClass"],
            ["urn:b", "OWLClass"],
          ],
        },
      }),
    ).toMatchObject({
      status: "observed",
      admission: "known-behavioral-difference",
      reasonId: "rdf-metadata",
    });
    expect(
      classifyApiWorkloadRow({
        groupId: "load.rdfParserMetaData",
        behaviorProfileId: "java-owlapi-5.5.1",
        javaObservation: metaJava,
        jsObservation: {
          ...metaJava,
          tripleCount: 102,
          guessedDeclarations: [],
        },
      }).status,
    ).toBe("failed");

    // EntitySignatureLookups: ONLY punnedExcl / punnedIncl may differ.
    const lookupJava = {
      perClass: [{ classIRI: "urn:a", containsExcl: true }],
      punnedExcl: ["urn:pun"],
      punnedIncl: ["urn:pun"],
      anonExcl: ["b0"],
      anonIncl: ["b0"],
    };
    expect(
      classifyApiWorkloadRow({
        groupId: "ontology.entitySignatureLookups",
        behaviorProfileId: "java-owlapi-5.5.1",
        javaObservation: lookupJava,
        jsObservation: { ...lookupJava, punnedExcl: [], punnedIncl: [] },
      }),
    ).toMatchObject({
      status: "observed",
      admission: "known-behavioral-difference",
      reasonId: "entity-punning",
    });
    expect(
      classifyApiWorkloadRow({
        groupId: "ontology.entitySignatureLookups",
        behaviorProfileId: "java-owlapi-5.5.1",
        javaObservation: lookupJava,
        jsObservation: { ...lookupJava, anonExcl: [] },
      }).status,
    ).toBe("failed");

    // Manchester renderer: whitespace-only diffs accepted under renderer-presentation; token diff fails.
    expect(
      classifyApiWorkloadRow({
        groupId: "renderer.ManchesterOWLSyntaxOWLObjectRendererImpl",
        behaviorProfileId: "java-owlapi-5.5.1",
        javaObservation: {
          axioms: ["A SubClassOf B"],
          complexExpressions: ["D and\n    op some D"],
        },
        jsObservation: {
          axioms: ["A SubClassOf B"],
          complexExpressions: ["D\n and (\n    op some D)"],
        },
      }).status,
    ).toBe("failed");
    expect(
      classifyApiWorkloadRow({
        groupId: "renderer.ManchesterOWLSyntaxOWLObjectRendererImpl",
        behaviorProfileId: "java-owlapi-5.5.1",
        javaObservation: {
          axioms: ["A SubClassOf B"],
          complexExpressions: ["D and op some D"],
        },
        jsObservation: {
          axioms: ["A SubClassOf B"],
          complexExpressions: ["D\n and op some D"],
        },
      }),
    ).toMatchObject({
      status: "observed",
      admission: "known-behavioral-difference",
      reasonId: "renderer-presentation",
    });

    // OWLOntologyImportsClosureSetProvider: semantic match -> unequal-work, mismatch -> failed.
    expect(
      classifyApiWorkloadRow({
        groupId: "util.OWLOntologyImportsClosureSetProvider",
        behaviorProfileId: "normative-v1",
        javaObservation: { closureIRIs: ["urn:a", "urn:b"] },
        jsObservation: { closureIRIs: ["urn:a", "urn:b"] },
      }),
    ).toMatchObject({
      status: "observed",
      admission: "unequal-work",
      reasonId: "closure-materialization",
      semanticMatch: true,
    });
    expect(
      classifyApiWorkloadRow({
        groupId: "util.OWLOntologyImportsClosureSetProvider",
        behaviorProfileId: "normative-v1",
        javaObservation: { closureIRIs: ["urn:a", "urn:b"] },
        jsObservation: { closureIRIs: ["urn:a"] },
      }).status,
    ).toBe("failed");

    // Save cross-runtime reload failure must fail closed even when source ontologies match.
    const ontSnap = {
      sourceBefore: identical,
      sourceAfter: identical,
      ownReload: identical,
    };
    expect(
      classifyApiWorkloadRow({
        groupId: "save.functional",
        behaviorProfileId: "java-owlapi-5.5.1",
        javaObservation: ontSnap,
        jsObservation: ontSnap,
        crossRuntimeReloads: {
          jsLoadedJavaSave: { ontologyIRI: "wrong" },
          javaLoadedJsSave: identical,
        },
      }).status,
    ).toBe("failed");

    // Save functional under normative-v1 passes ONLY when Java save is verified via compatible reload
    // alongside normative-v1's intentional strict reserved-prefix refusal and Java accepts JS save.
    const reservedPrefixError = {
      reloadError: {
        name: "OWLSyntaxError",
        code: "OWL_SYNTAX_ERROR",
        message: "The reserved prefix owl: cannot be declared",
      },
    };
    expect(
      classifyApiWorkloadRow({
        groupId: "save.functional",
        behaviorProfileId: "normative-v1",
        javaObservation: ontSnap,
        jsObservation: ontSnap,
        crossRuntimeReloads: {
          jsLoadedJavaSave: reservedPrefixError,
          jsCompatibleLoadedJavaSave: identical,
          javaLoadedJsSave: identical,
        },
      }),
    ).toMatchObject({
      status: "passed",
      admission: "independently-witnessed",
      reasonId: "equivalent-workload-strict-reserved-prefix-cross-reload",
      semanticMatch: true,
    });
    expect(
      classifyApiWorkloadRow({
        groupId: "save.functional",
        behaviorProfileId: "normative-v1",
        javaObservation: ontSnap,
        jsObservation: ontSnap,
        crossRuntimeReloads: {
          jsLoadedJavaSave: reservedPrefixError,
          javaLoadedJsSave: identical,
        },
      }),
    ).toMatchObject({
      status: "failed",
      admission: "failed",
      reasonId: "structural-mismatch",
      firstDifference: {
        path: "$.crossRuntime.jsLoadedJavaSave.$keys",
      },
    });
    expect(
      classifyApiWorkloadRow({
        groupId: "save.functional",
        behaviorProfileId: "normative-v1",
        javaObservation: ontSnap,
        jsObservation: ontSnap,
        crossRuntimeReloads: {
          jsLoadedJavaSave: reservedPrefixError,
          jsCompatibleLoadedJavaSave: identical,
          javaLoadedJsSave: { values: ["wrong"] },
        },
      }).status,
    ).toBe("failed");
    expect(
      classifyApiWorkloadRow({
        groupId: "save.functional",
        behaviorProfileId: "normative-v1",
        javaObservation: ontSnap,
        jsObservation: ontSnap,
        crossRuntimeReloads: {
          jsLoadedJavaSave: {
            reloadError: {
              name: "OWLSyntaxError",
              code: "OWL_SYNTAX_ERROR",
              message: "Unexpected token",
            },
          },
          jsCompatibleLoadedJavaSave: identical,
          javaLoadedJsSave: identical,
        },
      }).status,
    ).toBe("failed");
    expect(
      classifyApiWorkloadRow({
        groupId: "save.functional",
        behaviorProfileId: "java-owlapi-5.5.1",
        javaObservation: ontSnap,
        jsObservation: ontSnap,
        crossRuntimeReloads: {
          jsLoadedJavaSave: reservedPrefixError,
          jsCompatibleLoadedJavaSave: identical,
          javaLoadedJsSave: identical,
        },
      }).status,
    ).toBe("failed");
    expect(
      classifyApiWorkloadRow({
        groupId: "save.turtle",
        behaviorProfileId: "normative-v1",
        javaObservation: ontSnap,
        jsObservation: ontSnap,
        crossRuntimeReloads: {
          jsLoadedJavaSave: reservedPrefixError,
          jsCompatibleLoadedJavaSave: identical,
          javaLoadedJsSave: identical,
        },
      }).status,
    ).toBe("failed");

    // OWLObjectDuplicator: fresh remapped blank nodes are accepted only under strict alpha-equivalence.
    const dupJava = {
      copies: [
        {
          kind: "OWLObjectPropertyAssertionAxiom",
          subject: {
            kind: "OWLNamedIndividual",
            iri: { kind: "IRI", value: "urn:a#ind0" },
          },
          property: {
            kind: "OWLObjectProperty",
            iri: { kind: "IRI", value: "urn:a#op0" },
          },
          value: {
            kind: "OWLAnonymousIndividual",
            nodeID: "genid2147483648",
            documentScope: "",
          },
          annotations: [],
        },
        {
          kind: "OWLObjectPropertyAssertionAxiom",
          subject: {
            kind: "OWLNamedIndividual",
            iri: { kind: "IRI", value: "urn:a#ind1" },
          },
          property: {
            kind: "OWLObjectProperty",
            iri: { kind: "IRI", value: "urn:a#op0" },
          },
          value: {
            kind: "OWLAnonymousIndividual",
            nodeID: "genid2147483648",
            documentScope: "",
          },
          annotations: [],
        },
        {
          kind: "OWLObjectPropertyAssertionAxiom",
          subject: {
            kind: "OWLNamedIndividual",
            iri: { kind: "IRI", value: "urn:a#ind2" },
          },
          property: {
            kind: "OWLObjectProperty",
            iri: { kind: "IRI", value: "urn:a#op0" },
          },
          value: {
            kind: "OWLAnonymousIndividual",
            nodeID: "genid2147483649",
            documentScope: "",
          },
          annotations: [],
        },
      ],
    };
    const dupJs = {
      copies: [
        {
          ...dupJava.copies[0],
          value: {
            kind: "OWLAnonymousIndividual",
            nodeID: "0",
            documentScope: "owlapi:duplicator:0",
          },
        },
        {
          ...dupJava.copies[1],
          value: {
            kind: "OWLAnonymousIndividual",
            nodeID: "0",
            documentScope: "owlapi:duplicator:0",
          },
        },
        {
          ...dupJava.copies[2],
          value: {
            kind: "OWLAnonymousIndividual",
            nodeID: "1",
            documentScope: "owlapi:duplicator:0",
          },
        },
      ],
    };
    expect(
      classifyApiWorkloadRow({
        groupId: "util.OWLObjectDuplicator",
        behaviorProfileId: "java-owlapi-5.5.1",
        javaObservation: dupJava,
        jsObservation: dupJs,
      }),
    ).toMatchObject({
      status: "passed",
      admission: "independently-witnessed",
      reasonId: "equivalent-workload-alpha-bnodes",
      semanticMatch: true,
    });
    expect(
      classifyApiWorkloadRow({
        groupId: "util.OWLObjectDuplicator",
        behaviorProfileId: "java-owlapi-5.5.1",
        javaObservation: dupJava,
        jsObservation: {
          copies: [
            dupJs.copies[0],
            dupJs.copies[1],
            {
              ...dupJs.copies[2],
              value: {
                kind: "OWLAnonymousIndividual",
                nodeID: "bnode_0",
                documentScope: "",
              },
            },
          ],
        },
      }).status,
    ).toBe("failed");
    expect(
      classifyApiWorkloadRow({
        groupId: "util.OWLObjectDuplicator",
        behaviorProfileId: "java-owlapi-5.5.1",
        javaObservation: dupJava,
        jsObservation: {
          copies: [dupJs.copies[0], dupJs.copies[1], dupJs.copies[1]],
        },
      }).status,
    ).toBe("failed");
    expect(
      classifyApiWorkloadRow({
        groupId: "util.OWLObjectDuplicator",
        behaviorProfileId: "java-owlapi-5.5.1",
        javaObservation: dupJava,
        jsObservation: {
          copies: [
            dupJs.copies[0],
            dupJs.copies[1],
            {
              ...dupJs.copies[2],
              property: {
                kind: "OWLObjectProperty",
                iri: { kind: "IRI", value: "urn:a#wrongProp" },
              },
            },
          ],
        },
      }).status,
    ).toBe("failed");

    // Headerless load.* (dl, krss2, krss1): observed only when JS matches expectedLoadOntology
    // and Java matches up to its deterministic headerless base IRI.
    const replaceBase = (ont, jsBase, javaBase) => ({
      ...ont,
      axioms: ont.axioms.map((ax) => ({
        ...ax,
        subClass: {
          ...ax.subClass,
          iri: {
            kind: "IRI",
            value: `${javaBase}${ax.subClass.iri.value.slice(jsBase.length)}`,
          },
        },
        superClass: {
          ...ax.superClass,
          iri: {
            kind: "IRI",
            value: `${javaBase}${ax.superClass.iri.value.slice(jsBase.length)}`,
          },
        },
      })),
    });
    for (const [syntax, javaBase] of [
      ["dl", "http://www.semanticweb.org/ontologies/Ontology7806350647501#"],
      ["krss2", "OntologyID(Anonymous-56)#"],
      ["krss1", "http://www.w3.org/2002/07/owl#"],
    ]) {
      const expectedLoad = expectedGeneratedLoadWorkload(syntax, 2);
      const javaLoad = replaceBase(
        expectedLoad,
        `urn:bench:load:${syntax}#`,
        javaBase,
      );
      expect(
        classifyApiWorkloadRow({
          groupId: `load.${syntax}`,
          behaviorProfileId: "normative-v1",
          javaObservation: javaLoad,
          jsObservation: expectedLoad,
          expectedLoadOntology: expectedLoad,
        }),
      ).toMatchObject({
        status: "observed",
        admission: "known-behavioral-difference",
        reasonId: "headerless-base-iri",
        semanticMatch: false,
      });
      expect(
        classifyApiWorkloadRow({
          groupId: `load.${syntax}`,
          behaviorProfileId: "normative-v1",
          javaObservation: replaceBase(
            expectedLoad,
            `urn:bench:load:${syntax}#`,
            "urn:unexpected#",
          ),
          jsObservation: expectedLoad,
          expectedLoadOntology: expectedLoad,
        }).status,
      ).toBe("failed");
      expect(
        classifyApiWorkloadRow({
          groupId: `load.${syntax}`,
          behaviorProfileId: "normative-v1",
          javaObservation: { ...javaLoad, axioms: javaLoad.axioms.slice(0, 1) },
          jsObservation: expectedLoad,
          expectedLoadOntology: expectedLoad,
        }).status,
      ).toBe("failed");
      expect(
        classifyApiWorkloadRow({
          groupId: `load.${syntax}`,
          behaviorProfileId: "normative-v1",
          javaObservation: javaLoad,
          jsObservation: {
            ...expectedLoad,
            axioms: expectedLoad.axioms.slice(0, 1),
          },
          expectedLoadOntology: expectedLoad,
        }).status,
      ).toBe("failed");
    }
    for (const [groupId, javaObservation, jsObservation] of [
      ["load.rdfParserMetaData", { tripleCount: 1 }, {}],
      ["ontology.entitySignatureLookups", {}, { perClass: [] }],
      ["util.OWLObjectDuplicator", { copies: [] }, {}],
      ["config.OWLOntologyWriterConfiguration", { defaults: {} }, {}],
    ]) {
      expect(
        classifyApiWorkloadRow({
          groupId,
          behaviorProfileId: "normative-v1",
          javaObservation,
          jsObservation,
        }),
      ).toMatchObject({
        status: "failed",
        admission: "failed",
        reasonId: "structural-mismatch",
      });
    }
    expect(
      classifyApiWorkloadRow({
        groupId: "load.dl",
        behaviorProfileId: "normative-v1",
        javaObservation: {},
        jsObservation: { partial: true },
        expectedLoadOntology: expectedGeneratedLoadWorkload("dl", 2),
      }),
    ).toMatchObject({
      status: "failed",
      admission: "failed",
      reasonId: "structural-mismatch",
    });
  });

  test("expectedGeneratedLoadWorkload independently matches all 12 generated load.* syntaxes", async () => {
    const count = 4;
    const fixtures = prepareSharedFixtureDirectory({
      syntaxCount: count,
      importClosureCount: 3,
    });
    try {
      const m = OWLManager.createOWLOntologyManager({
        behaviorProfileId: "java-owlapi-5.5.1",
      });
      const formatEntries = [
        ["functional", OWLDocumentFormats.FUNCTIONAL],
        ["manchester", OWLDocumentFormats.MANCHESTER],
        ["owlxml", OWLDocumentFormats.OWL_XML],
        ["rdfxml", OWLDocumentFormats.RDF_XML],
        ["turtle", OWLDocumentFormats.TURTLE],
        ["ntriples", OWLDocumentFormats.N_TRIPLES],
        ["nquads", OWLDocumentFormats.N_QUADS],
        ["trig", OWLDocumentFormats.TRIG],
        ["jsonld", OWLDocumentFormats.JSON_LD],
        ["dl", OWLDocumentFormats.DL],
        ["krss2", OWLDocumentFormats.KRSS2],
        ["krss1", OWLDocumentFormats.KRSS1],
      ];
      for (const [name, format] of formatEntries) {
        const ont = await m.loadOntologyFromOntologyDocument(
          new StringDocumentSource(fixtures.syntaxTexts[name], {
            documentIRI: `urn:bench:load:${name}`,
            format,
          }),
        );
        expect(canonicalJson(canonicalizeOntology(ont))).toBe(
          canonicalJson(expectedGeneratedLoadWorkload(name, count)),
        );
      }
    } finally {
      fixtures.cleanup();
    }
  });

  test("observeJsApiSemantics covers all 70 workloads on a compact shared fixture", async () => {
    const fixtures = prepareSharedFixtureDirectory({
      syntaxCount: 4,
      importClosureCount: 3,
    });
    try {
      const observed = await observeJsApiSemantics("java-owlapi-5.5.1", {
        fixtures,
        syntaxCount: 4,
        importClosureCount: 3,
      });
      expect(Object.keys(observed.workloads)).toHaveLength(70);
      expect(Object.keys(observed.savedTexts).sort()).toEqual([
        "functional",
        "owlxml",
        "rdfxml",
        "turtle",
      ]);
      expect(
        observed.workloads["locality.extract.BOTTOM"].seedEntities.map(
          (entity) => entity.iri.value,
        ),
      ).toEqual(
        Array.from({ length: 20 }, (_, i) => `urn:bench:util#C${i}`).sort(),
      );
    } finally {
      fixtures.cleanup();
    }
  }, 30000);

  test("compare-java-js lists all 140 api-semantics cases across both profiles", async () => {
    const listed = await runComparison({
      action: "list",
      suite: "api-semantics",
    });
    expect(listed.cases).toHaveLength(140);
    expect(new Set(listed.cases.map((c) => c.caseId)).size).toBe(140);
    expect(new Set(listed.cases.map((c) => c.input)).size).toBe(70);
    expect(
      listed.cases.filter((c) => c.behaviorProfileId === "java-owlapi-5.5.1"),
    ).toHaveLength(70);
    expect(
      listed.cases.filter((c) => c.behaviorProfileId === "normative-v1"),
    ).toHaveLength(70);
  });
});
