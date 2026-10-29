import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { format as prettierFormat, resolveConfig } from "prettier";
import { OWLManager } from "../apibinding/index.js";
import { OWLDocumentFormats, RDFXMLDocumentFormat } from "../formats/index.js";
import { StringDocumentSource, StringDocumentTarget } from "../io/index.js";
import { NodeDocumentLoader } from "../io/node/index.js";
import { ManchesterOWLSyntaxOWLObjectRendererImpl } from "../manchestersyntax/renderer/index.js";
import {
  AXIOM_KINDS,
  CLASS_EXPRESSION_KINDS,
  OWL_OBJECT_KINDS,
  AddAxiom,
  AddImport,
  AddOntologyAnnotation,
  IRI,
  OWLOntologyLoaderConfiguration,
  OWLOntologyWriterConfiguration,
  RemoveAxiom,
  RemoveImport,
  RemoveOntologyAnnotation,
  SetOntologyID,
  StructuralSet,
  dispatchAxiom,
  dispatchClassExpression,
  dispatchOwlObject,
} from "../model/index.js";
import { AxiomAnnotations, Imports } from "../model/parameters/index.js";
import {
  LocalityClass,
  SyntacticLocalityModuleExtractor,
} from "../modularity/locality/index.js";
import {
  OWL2DLProfile,
  OWL2ELProfile,
  OWL2QLProfile,
  OWL2RLProfile,
} from "../profiles/index.js";
import { EntitySearcher } from "../search/index.js";
import {
  AnnotationValueShortFormProvider,
  OWLEntityRemover,
  OWLEntityRenamer,
  OWLObjectDuplicator,
  OWLOntologyImportsClosureSetProvider,
  OWLOntologyMerger,
  SimpleShortFormProvider,
} from "../util/index.js";
import { runJavaObservation } from "./owlapi-reference/run-java-observation.mjs";

const require = createRequire(import.meta.url);
const {
  GENERATOR_VERSION,
  generateBenchmarkFixture,
} = require("./generate-owlapi-benchmark-fixtures.cjs");

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, "..");
const DEFAULT_JAVA_SOURCE_PATH = path.resolve(
  MODULE_DIR,
  "owlapi-reference/BenchmarkPublicApiSurface.java",
);
export const DEFAULT_JAVA_BASELINE_PATH = path.resolve(
  REPO_ROOT,
  "docs/performance/java-owlapi-5.5.1-baseline.json",
);

const XSD_STRING_IRI = IRI.create("http://www.w3.org/2001/XMLSchema#string");
const XSD_INTEGER_IRI = IRI.create("http://www.w3.org/2001/XMLSchema#integer");
const XSD_DECIMAL_IRI = IRI.create("http://www.w3.org/2001/XMLSchema#decimal");
const XSD_FLOAT_IRI = IRI.create("http://www.w3.org/2001/XMLSchema#float");
const XSD_BOOLEAN_IRI = IRI.create("http://www.w3.org/2001/XMLSchema#boolean");
const MIN_INCLUSIVE_IRI = IRI.create(
  "http://www.w3.org/2001/XMLSchema#minInclusive",
);

const RICH_NS = "urn:bench:rich#";
const IMPORT_NS = "urn:bench:rich:import#";
const RICH_COUNT = 60;
const IMPORT_COUNT = 20;

export const BEHAVIOR_PROFILES = Object.freeze([
  "java-owlapi-5.5.1",
  "normative-v1",
]);

export const BENCHMARK_DEFINITIONS = Object.freeze([
  {
    id: "manager.createOWLOntologyManager",
    category: "Manager & Configuration",
    apiSymbols: ["OWLManager.createOWLOntologyManager", "OWLOntologyManager"],
    description:
      "Instantiate 100 OWLOntologyManager instances and read their data factory.",
  },
  {
    id: "config.OWLOntologyLoaderConfiguration",
    category: "Manager & Configuration",
    apiSymbols: ["OWLOntologyLoaderConfiguration"],
    description:
      "Chain 8 immutable loader configuration setters and getters 500 times.",
  },
  {
    id: "config.OWLOntologyWriterConfiguration",
    category: "Manager & Configuration",
    apiSymbols: ["OWLOntologyWriterConfiguration"],
    description:
      "Chain 5 immutable writer configuration setters and getters 500 times.",
  },
  {
    id: "formats.RDFXMLDocumentFormat.prefixes",
    category: "Manager & Configuration",
    apiSymbols: ["RDFXMLDocumentFormat"],
    description:
      "Exercise prefix registration, default prefix, copyPrefixesFrom, lookup, and clear 200 times.",
  },
  {
    id: "model.IRI.create",
    category: "DataFactory & Structural Model",
    apiSymbols: ["IRI.create"],
    description: "Construct and validate 2,000 IRIs.",
  },
  {
    id: "factory.entities",
    category: "DataFactory & Structural Model",
    apiSymbols: [
      "OWLDataFactory.getOWLClass",
      "OWLDataFactory.getOWLObjectProperty",
      "OWLDataFactory.getOWLDataProperty",
      "OWLDataFactory.getOWLAnnotationProperty",
      "OWLDataFactory.getOWLDatatype",
      "OWLDataFactory.getOWLNamedIndividual",
      "OWLDataFactory.getOWLAnonymousIndividual",
      "OWLDataFactory.getOWLOntologyID",
      "OWLDataFactory.getOWLImportsDeclaration",
    ],
    description:
      "Construct 500 sets of all 10 entity, ontology-ID, and import-declaration types.",
  },
  {
    id: "factory.literals",
    category: "DataFactory & Structural Model",
    apiSymbols: ["OWLDataFactory.getOWLLiteral"],
    description:
      "Construct 500 sets of plain, language-tagged, integer, decimal, float, and boolean literals.",
  },
  {
    id: "factory.classExpressions",
    category: "DataFactory & Structural Model",
    apiSymbols: ["OWLDataFactory"],
    description:
      "Construct 200 sets of all 18 OWL 2 class expression and property inverse kinds.",
  },
  {
    id: "factory.dataRanges",
    category: "DataFactory & Structural Model",
    apiSymbols: ["OWLDataFactory"],
    description:
      "Construct 200 sets of all 6 OWL 2 data range and facet restriction kinds.",
  },
  {
    id: "factory.axioms",
    category: "DataFactory & Structural Model",
    apiSymbols: ["OWLDataFactory"],
    description: "Construct ~1,500 axioms spanning all 38 OWL 2 axiom types.",
  },
  {
    id: "model.structuralEqualityAndSet",
    category: "DataFactory & Structural Model",
    apiSymbols: [
      "OWLStructuralObject.equals",
      "OWLStructuralObject.equalsIgnoreAnnotations",
      "StructuralSet",
    ],
    description:
      "Insert and query 1,000 axioms in a structural set and test structural equality.",
  },
  {
    id: "model.axiomAnnotationsTransform",
    category: "DataFactory & Structural Model",
    apiSymbols: [
      "OWLStructuralObject.getAnnotatedAxiom",
      "OWLStructuralObject.getAxiomWithoutAnnotations",
    ],
    description: "Annotate and strip annotations on 500 axioms.",
  },
  {
    id: "model.dispatch",
    category: "DataFactory & Structural Model",
    apiSymbols: [
      "dispatchOwlObject",
      "dispatchAxiom",
      "dispatchClassExpression",
    ],
    description:
      "Dispatch 500 axioms (object + axiom visitors) and 120 complex class expressions.",
  },
  {
    id: "load.functional",
    category: "Parsing & Loading",
    apiSymbols: [
      "OWLOntologyManager.loadOntologyFromOntologyDocument",
      "StringDocumentSource",
    ],
    description: "Parse a 100-class Functional Syntax ontology document.",
  },
  {
    id: "load.manchester",
    category: "Parsing & Loading",
    apiSymbols: [
      "OWLOntologyManager.loadOntologyFromOntologyDocument",
      "StringDocumentSource",
    ],
    description: "Parse a 100-class Manchester OWL Syntax ontology document.",
  },
  {
    id: "load.owlxml",
    category: "Parsing & Loading",
    apiSymbols: [
      "OWLOntologyManager.loadOntologyFromOntologyDocument",
      "StringDocumentSource",
    ],
    description: "Parse a 100-class OWL/XML ontology document.",
  },
  {
    id: "load.rdfxml",
    category: "Parsing & Loading",
    apiSymbols: [
      "OWLOntologyManager.loadOntologyFromOntologyDocument",
      "StringDocumentSource",
    ],
    description: "Parse a 100-class RDF/XML ontology document.",
  },
  {
    id: "load.turtle",
    category: "Parsing & Loading",
    apiSymbols: [
      "OWLOntologyManager.loadOntologyFromOntologyDocument",
      "StringDocumentSource",
    ],
    description: "Parse a 100-class Turtle ontology document.",
  },
  {
    id: "load.ntriples",
    category: "Parsing & Loading",
    apiSymbols: [
      "OWLOntologyManager.loadOntologyFromOntologyDocument",
      "StringDocumentSource",
    ],
    description: "Parse a 100-class N-Triples ontology document.",
  },
  {
    id: "load.nquads",
    category: "Parsing & Loading",
    apiSymbols: [
      "OWLOntologyManager.loadOntologyFromOntologyDocument",
      "StringDocumentSource",
    ],
    description: "Parse a 100-class N-Quads ontology document.",
  },
  {
    id: "load.trig",
    category: "Parsing & Loading",
    apiSymbols: [
      "OWLOntologyManager.loadOntologyFromOntologyDocument",
      "StringDocumentSource",
    ],
    description: "Parse a 100-class TriG ontology document.",
  },
  {
    id: "load.jsonld",
    category: "Parsing & Loading",
    apiSymbols: [
      "OWLOntologyManager.loadOntologyFromOntologyDocument",
      "StringDocumentSource",
    ],
    description: "Parse a 100-class JSON-LD ontology document.",
  },
  {
    id: "load.dl",
    category: "Parsing & Loading",
    apiSymbols: [
      "OWLOntologyManager.loadOntologyFromOntologyDocument",
      "StringDocumentSource",
    ],
    description: "Parse a 100-class DL Syntax ontology document.",
  },
  {
    id: "load.krss2",
    category: "Parsing & Loading",
    apiSymbols: [
      "OWLOntologyManager.loadOntologyFromOntologyDocument",
      "StringDocumentSource",
    ],
    description: "Parse a 100-class KRSS2 ontology document.",
  },
  {
    id: "load.krss1",
    category: "Parsing & Loading",
    apiSymbols: [
      "OWLOntologyManager.loadOntologyFromOntologyDocument",
      "StringDocumentSource",
    ],
    description: "Parse a 100-class KRSS1 ontology document.",
  },
  {
    id: "load.importsClosure",
    category: "Parsing & Loading",
    apiSymbols: [
      "OWLOntologyManager.loadOntologyFromOntologyDocument",
      "NodeDocumentLoader",
    ],
    description:
      "Load an 8-ontology cyclic import closure mapped to local file documents.",
  },
  {
    id: "load.rdfParserMetaData",
    category: "Parsing & Loading",
    apiSymbols: ["RDFParserMetaData"],
    description:
      "Read RDFParserMetaData (triple count, header state, unparsed triples, guessed declarations) 500 times.",
  },
  {
    id: "manager.createAndGetOntology",
    category: "Ontology Lifecycle & Mutations",
    apiSymbols: [
      "OWLOntologyManager.createOntology",
      "OWLOntologyManager.getOntology",
    ],
    description: "Create and look up 100 ontologies by IRI in a manager.",
  },
  {
    id: "manager.addAxioms.bulk",
    category: "Ontology Lifecycle & Mutations",
    apiSymbols: ["OWLOntologyManager.addAxioms"],
    description: "Bulk-add 500 axioms to a managed ontology via addAxioms.",
  },
  {
    id: "manager.addAxiom.singleLoop",
    category: "Ontology Lifecycle & Mutations",
    apiSymbols: ["OWLOntologyManager.addAxiom"],
    description: "Sequentially add 200 axioms one-by-one via addAxiom.",
  },
  {
    id: "manager.removeAxioms.bulk",
    category: "Ontology Lifecycle & Mutations",
    apiSymbols: ["OWLOntologyManager.removeAxioms"],
    description: "Bulk-add and bulk-remove 500 axioms via removeAxioms.",
  },
  {
    id: "manager.removeAxiom.singleLoop",
    category: "Ontology Lifecycle & Mutations",
    apiSymbols: ["OWLOntologyManager.removeAxiom"],
    description:
      "Bulk-add 200 axioms and remove them one-by-one via removeAxiom.",
  },
  {
    id: "manager.applyChanges.mixed",
    category: "Ontology Lifecycle & Mutations",
    apiSymbols: [
      "OWLOntologyManager.applyChanges",
      "AddAxiom",
      "RemoveAxiom",
      "AddOntologyAnnotation",
      "RemoveOntologyAnnotation",
      "AddImport",
      "RemoveImport",
      "SetOntologyID",
    ],
    description:
      "Apply a mixed batch of 125 ontology change objects via applyChanges.",
  },
  {
    id: "manager.getImportsClosure",
    category: "Ontology Lifecycle & Mutations",
    apiSymbols: ["OWLOntologyManager.getImportsClosure"],
    description:
      "Query getImportsClosure 1,000 times on an 8-ontology closure.",
  },
  {
    id: "ontology.getAxioms.excluded",
    category: "Ontology Queries - General & Signature",
    apiSymbols: [
      "OWLOntology.getAxioms",
      "OWLOntology.getAxiomCount",
      "OWLOntology.getAnnotations",
      "OWLOntology.getImportsDeclarations",
      "OWLOntology.getOntologyID",
    ],
    description:
      "Query direct axioms, axiom count, annotations, imports, and ontology ID 200 times.",
  },
  {
    id: "ontology.getAxioms.included",
    category: "Ontology Queries - General & Signature",
    apiSymbols: ["OWLOntology.getAxioms", "OWLOntology.getAxiomCount"],
    description: "Query closure-included axioms and axiom count 200 times.",
  },
  {
    id: "ontology.getLogicalAxioms",
    category: "Ontology Queries - General & Signature",
    apiSymbols: [
      "OWLOntology.getLogicalAxioms",
      "OWLOntology.getLogicalAxiomCount",
    ],
    description:
      "Query logical axioms and counts (Imports.EXCLUDED and INCLUDED) 100 times.",
  },
  {
    id: "ontology.getAxiomsByType",
    category: "Ontology Queries - General & Signature",
    apiSymbols: ["OWLOntology.getAxiomsByType", "OWLOntology.getAxiomCount"],
    description:
      "Query axioms and counts across all 38 axiom types (EXCLUDED and INCLUDED) for 20 passes.",
  },
  {
    id: "ontology.containsAxiom",
    category: "Ontology Queries - General & Signature",
    apiSymbols: [
      "OWLOntology.containsAxiom",
      "OWLOntology.containsAxiomIgnoreAnnotations",
      "OWLOntology.getAxiomsIgnoreAnnotations",
    ],
    description:
      "Test exact and annotation-ignoring axiom containment and retrieval for 200 axioms.",
  },
  {
    id: "ontology.getSignature",
    category: "Ontology Queries - General & Signature",
    apiSymbols: [
      "OWLOntology.getSignature",
      "OWLOntology.getClassesInSignature",
      "OWLOntology.getObjectPropertiesInSignature",
      "OWLOntology.getDataPropertiesInSignature",
      "OWLOntology.getAnnotationPropertiesInSignature",
      "OWLOntology.getIndividualsInSignature",
      "OWLOntology.getDatatypesInSignature",
    ],
    description:
      "Query full and kind-partitioned signatures (EXCLUDED and INCLUDED) 100 times.",
  },
  {
    id: "ontology.entitySignatureLookups",
    category: "Ontology Queries - General & Signature",
    apiSymbols: [
      "OWLOntology.getEntitiesInSignature",
      "OWLOntology.containsEntityInSignature",
      "OWLOntology.getPunnedIRIs",
      "OWLOntology.getReferencedAnonymousIndividuals",
    ],
    description:
      "Query entity-by-IRI signature lookups, punned IRIs, and anonymous individuals for 5 passes.",
  },
  {
    id: "ontology.getReferencingAxioms",
    category: "Ontology Queries - General & Signature",
    apiSymbols: ["OWLOntology.getReferencingAxioms"],
    description:
      "Query referencing axioms (EXCLUDED and INCLUDED) for 50 entities.",
  },
  {
    id: "ontology.classAxiomIndexes",
    category: "Ontology Queries - Specific Axiom Indexes",
    apiSymbols: [
      "OWLOntology.getSubClassAxiomsForSubClass",
      "OWLOntology.getSubClassAxiomsForSuperClass",
      "OWLOntology.getEquivalentClassesAxioms",
      "OWLOntology.getDisjointClassesAxioms",
    ],
    description:
      "Query all 4 class-axiom index getters across 60 classes for 10 passes.",
  },
  {
    id: "ontology.objectPropertyAxiomIndexes",
    category: "Ontology Queries - Specific Axiom Indexes",
    apiSymbols: [
      "OWLOntology.getObjectSubPropertyAxiomsForSubProperty",
      "OWLOntology.getObjectSubPropertyAxiomsForSuperProperty",
      "OWLOntology.getObjectPropertyDomainAxioms",
      "OWLOntology.getObjectPropertyRangeAxioms",
      "OWLOntology.getInverseObjectPropertyAxioms",
      "OWLOntology.getFunctionalObjectPropertyAxioms",
      "OWLOntology.getInverseFunctionalObjectPropertyAxioms",
      "OWLOntology.getSymmetricObjectPropertyAxioms",
      "OWLOntology.getAsymmetricObjectPropertyAxioms",
      "OWLOntology.getReflexiveObjectPropertyAxioms",
      "OWLOntology.getIrreflexiveObjectPropertyAxioms",
      "OWLOntology.getTransitiveObjectPropertyAxioms",
    ],
    description:
      "Query all 12 object-property axiom index getters across 60 properties for 10 passes.",
  },
  {
    id: "ontology.dataPropertyAxiomIndexes",
    category: "Ontology Queries - Specific Axiom Indexes",
    apiSymbols: [
      "OWLOntology.getDataSubPropertyAxiomsForSubProperty",
      "OWLOntology.getDataSubPropertyAxiomsForSuperProperty",
      "OWLOntology.getDataPropertyDomainAxioms",
      "OWLOntology.getDataPropertyRangeAxioms",
      "OWLOntology.getFunctionalDataPropertyAxioms",
    ],
    description:
      "Query all 5 data-property index getters across 60 properties for 10 passes.",
  },
  {
    id: "ontology.annotationAndDeclarationIndexes",
    category: "Ontology Queries - Specific Axiom Indexes",
    apiSymbols: [
      "OWLOntology.getDeclarationAxioms",
      "OWLOntology.getAnnotationAssertionAxioms",
      "OWLOntology.getSubAnnotationPropertyOfAxioms",
      "OWLOntology.getAnnotationPropertyDomainAxioms",
      "OWLOntology.getAnnotationPropertyRangeAxioms",
    ],
    description:
      "Query declaration and annotation-property index getters across 60 entities for 10 passes.",
  },
  {
    id: "ontology.individualAssertionIndexes",
    category: "Ontology Queries - Specific Axiom Indexes",
    apiSymbols: [
      "OWLOntology.getClassAssertionAxioms",
      "OWLOntology.getObjectPropertyAssertionAxioms",
      "OWLOntology.getDataPropertyAssertionAxioms",
      "OWLOntology.getNegativeObjectPropertyAssertionAxioms",
      "OWLOntology.getNegativeDataPropertyAssertionAxioms",
      "OWLOntology.getSameIndividualAxioms",
      "OWLOntology.getDifferentIndividualAxioms",
    ],
    description:
      "Query all 8 individual and class assertion index getters across 60 entities for 10 passes.",
  },
  {
    id: "save.functional",
    category: "Storage / Serialization",
    apiSymbols: ["OWLOntologyManager.saveOntology", "StringDocumentTarget"],
    description: "Serialize a 100-class ontology to Functional Syntax.",
  },
  {
    id: "save.owlxml",
    category: "Storage / Serialization",
    apiSymbols: ["OWLOntologyManager.saveOntology", "StringDocumentTarget"],
    description: "Serialize a 100-class ontology to OWL/XML.",
  },
  {
    id: "save.rdfxml",
    category: "Storage / Serialization",
    apiSymbols: ["OWLOntologyManager.saveOntology", "StringDocumentTarget"],
    description: "Serialize a 100-class ontology to RDF/XML.",
  },
  {
    id: "save.turtle",
    category: "Storage / Serialization",
    apiSymbols: ["OWLOntologyManager.saveOntology", "StringDocumentTarget"],
    description: "Serialize a 100-class ontology to Turtle.",
  },
  {
    id: "search.classHierarchyAndRelations",
    category: "EntitySearcher",
    apiSymbols: [
      "EntitySearcher.getSuperClasses",
      "EntitySearcher.getSubClasses",
      "EntitySearcher.getEquivalentClasses",
      "EntitySearcher.getDisjointClasses",
    ],
    description:
      "Search class hierarchy and disjoint/equivalent relations across 2 ontologies for 5 passes.",
  },
  {
    id: "search.propertyHierarchyAndDomainsRanges",
    category: "EntitySearcher",
    apiSymbols: [
      "EntitySearcher.getSuperProperties",
      "EntitySearcher.getSubProperties",
      "EntitySearcher.getDomains",
      "EntitySearcher.getRanges",
      "EntitySearcher.getInverses",
    ],
    description:
      "Search object/data property hierarchy, domains, ranges, and inverses across 2 ontologies for 5 passes.",
  },
  {
    id: "search.annotations",
    category: "EntitySearcher",
    apiSymbols: [
      "EntitySearcher.getAnnotationAssertionAxioms",
      "EntitySearcher.getAnnotations",
      "EntitySearcher.getAnnotationObjects",
    ],
    description:
      "Search entity annotation assertions, annotations, and annotation objects across 2 ontologies for 5 passes.",
  },
  {
    id: "search.propertyCharacteristics",
    category: "EntitySearcher",
    apiSymbols: [
      "EntitySearcher.isFunctional",
      "EntitySearcher.isInverseFunctional",
      "EntitySearcher.isTransitive",
      "EntitySearcher.isSymmetric",
      "EntitySearcher.isAsymmetric",
      "EntitySearcher.isReflexive",
      "EntitySearcher.isIrreflexive",
    ],
    description:
      "Test all 8 property characteristic predicates across 60 properties for 10 passes.",
  },
  {
    id: "util.SimpleShortFormProvider",
    category: "Utilities",
    apiSymbols: ["SimpleShortFormProvider"],
    description: "Compute short forms for 180 entities across 20 passes.",
  },
  {
    id: "util.AnnotationValueShortFormProvider",
    category: "Utilities",
    apiSymbols: ["AnnotationValueShortFormProvider"],
    description:
      "Compute annotation-value short forms with language fallback across 60 classes for 5 passes.",
  },
  {
    id: "util.OWLOntologyImportsClosureSetProvider",
    category: "Utilities",
    apiSymbols: ["OWLOntologyImportsClosureSetProvider"],
    description:
      "Materialize ontology closure sets 1,000 times via OWLOntologyImportsClosureSetProvider.",
    comparisonLimitation:
      "Java times Stream.count(), which may elide traversal; JS constructs a fresh defensive Set. Equal counts do not qualify equivalent materialization work.",
  },
  {
    id: "util.OWLOntologyMerger",
    category: "Utilities",
    apiSymbols: ["OWLOntologyMerger"],
    description:
      "Merge an 8-ontology import closure in both all-axioms and logical-axioms-only modes.",
  },
  {
    id: "util.OWLObjectDuplicator",
    category: "Utilities",
    apiSymbols: ["OWLObjectDuplicator"],
    description:
      "Duplicate 500 axioms with IRI replacement via OWLObjectDuplicator.",
  },
  {
    id: "util.OWLEntityRenamer",
    category: "Utilities",
    apiSymbols: ["OWLEntityRenamer"],
    description:
      "Compute entity and IRI rename change sets for 10 entities across a 500-axiom ontology.",
  },
  {
    id: "util.OWLEntityRemover",
    category: "Utilities",
    apiSymbols: ["OWLEntityRemover"],
    description:
      "Visit 40 entities (20 classes + 20 object properties) and collect removal changes across a 500-axiom ontology.",
  },
  {
    id: "renderer.ManchesterOWLSyntaxOWLObjectRendererImpl",
    category: "Manchester Object Renderer",
    apiSymbols: ["ManchesterOWLSyntaxOWLObjectRendererImpl"],
    description:
      "Render 300 axioms and 120 complex class expressions to Manchester OWL Syntax.",
  },
  {
    id: "locality.extract.BOTTOM",
    category: "Modularity / Locality",
    apiSymbols: ["SyntacticLocalityModuleExtractor", "LocalityClass.BOTTOM"],
    description:
      "Extract a BOTTOM syntactic locality module from a ~500-axiom base for 20 seed entities.",
  },
  {
    id: "locality.extract.TOP",
    category: "Modularity / Locality",
    apiSymbols: ["SyntacticLocalityModuleExtractor", "LocalityClass.TOP"],
    description:
      "Extract a TOP syntactic locality module from a ~500-axiom base for 20 seed entities.",
  },
  {
    id: "locality.extract.STAR",
    category: "Modularity / Locality",
    apiSymbols: ["SyntacticLocalityModuleExtractor", "LocalityClass.STAR"],
    description:
      "Extract a STAR syntactic locality module from a ~500-axiom base for 20 seed entities.",
  },
  {
    id: "profiles.OWL2DLProfile.checkOntology",
    category: "OWL 2 Language Profiles",
    apiSymbols: ["OWL2DLProfile.checkOntology"],
    description: "Validate a 520-axiom ontology against the OWL 2 DL profile.",
  },
  {
    id: "profiles.OWL2ELProfile.checkOntology",
    category: "OWL 2 Language Profiles",
    apiSymbols: ["OWL2ELProfile.checkOntology"],
    description: "Validate a 520-axiom ontology against the OWL 2 EL profile.",
  },
  {
    id: "profiles.OWL2QLProfile.checkOntology",
    category: "OWL 2 Language Profiles",
    apiSymbols: ["OWL2QLProfile.checkOntology"],
    description: "Validate a 520-axiom ontology against the OWL 2 QL profile.",
  },
  {
    id: "profiles.OWL2RLProfile.checkOntology",
    category: "OWL 2 Language Profiles",
    apiSymbols: ["OWL2RLProfile.checkOntology"],
    description: "Validate a 520-axiom ontology against the OWL 2 RL profile.",
  },
]);

const roundMs = (value) => Math.round(value * 1000) / 1000;

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

const medianInteger = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
};

const maybeGc = () => {
  if (typeof globalThis.gc === "function") {
    globalThis.gc();
  }
};

const buildAxiomBatch = (df, ns, count, recordEntities, target) => {
  const axioms = [];
  const xsdString = df.getOWLDatatype(XSD_STRING_IRI);
  const xsdInteger = df.getOWLDatatype(XSD_INTEGER_IRI);
  const xsdDecimal = df.getOWLDatatype(XSD_DECIMAL_IRI);
  const rdfsLabel = df.getRDFSLabel();

  for (let i = 0; i < count; i += 1) {
    const c = df.getOWLClass(IRI.create(`${ns}C${i}`));
    const d = df.getOWLClass(IRI.create(`${ns}D${i}`));
    const op = df.getOWLObjectProperty(IRI.create(`${ns}op${i}`));
    const q = df.getOWLObjectProperty(IRI.create(`${ns}q${i}`));
    const dp = df.getOWLDataProperty(IRI.create(`${ns}dp${i}`));
    const dp2 = df.getOWLDataProperty(IRI.create(`${ns}dp2${i}`));
    const ap = df.getOWLAnnotationProperty(IRI.create(`${ns}ap${i}`));
    const dt = df.getOWLDatatype(IRI.create(`${ns}dt${i}`));
    const ind = df.getOWLNamedIndividual(IRI.create(`${ns}ind${i}`));
    const ind2 = df.getOWLNamedIndividual(IRI.create(`${ns}ind2${i}`));

    if (recordEntities && target) {
      target.classes.push(c);
      target.superClasses.push(d);
      target.objectProps.push(op);
      target.superObjectProps.push(q);
      target.dataProps.push(dp);
      target.superDataProps.push(dp2);
      target.annProps.push(ap);
      target.datatypes.push(dt);
      target.individuals.push(ind);
      target.otherIndividuals.push(ind2);
    }

    axioms.push(df.getOWLDeclarationAxiom(c));
    axioms.push(df.getOWLDeclarationAxiom(d));
    axioms.push(df.getOWLDeclarationAxiom(op));
    axioms.push(df.getOWLDeclarationAxiom(q));
    axioms.push(df.getOWLDeclarationAxiom(dp));
    axioms.push(df.getOWLDeclarationAxiom(dp2));
    axioms.push(df.getOWLDeclarationAxiom(ap));
    axioms.push(df.getOWLDeclarationAxiom(dt));
    axioms.push(df.getOWLDeclarationAxiom(ind));
    axioms.push(df.getOWLDeclarationAxiom(ind2));

    if (i < 10) {
      const punIri = IRI.create(`${ns}pun${i}`);
      axioms.push(df.getOWLDeclarationAxiom(df.getOWLClass(punIri)));
      axioms.push(df.getOWLDeclarationAxiom(df.getOWLNamedIndividual(punIri)));
    }
    if (i < 20) {
      const anon = df.getOWLAnonymousIndividual(`bnode_${i}`);
      axioms.push(df.getOWLObjectPropertyAssertionAxiom(op, ind, anon));
    }

    const ann = df.getOWLAnnotation(rdfsLabel, df.getOWLLiteral(`sub_${i}`));
    axioms.push(df.getOWLSubClassOfAxiom(c, d, [ann]));
    const someExpr = df.getOWLObjectSomeValuesFrom(op, d);
    const allExpr = df.getOWLObjectAllValuesFrom(op, d);
    const interExpr = df.getOWLObjectIntersectionOf([d, allExpr]);
    if (recordEntities && target) {
      target.complexExpressions.push(someExpr);
      target.complexExpressions.push(interExpr);
    }
    axioms.push(df.getOWLSubClassOfAxiom(c, someExpr));
    axioms.push(df.getOWLEquivalentClassesAxiom([c, interExpr]));
    axioms.push(df.getOWLDisjointClassesAxiom([c, d]));
    if (i < 20) {
      axioms.push(
        df.getOWLDisjointUnionAxiom(c, [d, df.getOWLObjectHasSelf(op)]),
      );
    }

    axioms.push(df.getOWLSubObjectPropertyOfAxiom(op, q));
    if (i < 20) {
      axioms.push(df.getOWLSubPropertyChainOfAxiom([op, q], q));
      axioms.push(df.getOWLEquivalentObjectPropertiesAxiom([op, q]));
    } else if (i < 40) {
      axioms.push(df.getOWLDisjointObjectPropertiesAxiom([op, q]));
    }
    axioms.push(df.getOWLObjectPropertyDomainAxiom(op, c));
    axioms.push(df.getOWLObjectPropertyRangeAxiom(op, d));
    axioms.push(df.getOWLInverseObjectPropertiesAxiom(op, q));
    axioms.push(df.getOWLFunctionalObjectPropertyAxiom(op));
    if (i < 20) {
      axioms.push(df.getOWLInverseFunctionalObjectPropertyAxiom(op));
      axioms.push(df.getOWLSymmetricObjectPropertyAxiom(op));
      axioms.push(df.getOWLReflexiveObjectPropertyAxiom(op));
      axioms.push(df.getOWLTransitiveObjectPropertyAxiom(q));
    } else if (i < 40) {
      axioms.push(df.getOWLAsymmetricObjectPropertyAxiom(q));
      axioms.push(df.getOWLIrreflexiveObjectPropertyAxiom(q));
    }

    axioms.push(df.getOWLSubDataPropertyOfAxiom(dp, dp2));
    if (i < 20) {
      axioms.push(df.getOWLEquivalentDataPropertiesAxiom([dp, dp2]));
    } else if (i < 40) {
      axioms.push(df.getOWLDisjointDataPropertiesAxiom([dp, dp2]));
    }
    axioms.push(df.getOWLDataPropertyDomainAxiom(dp, c));
    axioms.push(df.getOWLDataPropertyRangeAxiom(dp, xsdString));
    axioms.push(df.getOWLFunctionalDataPropertyAxiom(dp));
    if (i < 20) {
      axioms.push(
        df.getOWLDatatypeDefinitionAxiom(
          dt,
          df.getOWLDataIntersectionOf([xsdInteger, xsdDecimal]),
        ),
      );
      axioms.push(df.getOWLHasKeyAxiom(c, [op], [dp]));
    }

    axioms.push(df.getOWLClassAssertionAxiom(c, ind));
    axioms.push(df.getOWLObjectPropertyAssertionAxiom(op, ind, ind2));
    axioms.push(df.getOWLNegativeObjectPropertyAssertionAxiom(q, ind, ind2));
    axioms.push(
      df.getOWLDataPropertyAssertionAxiom(
        dp,
        ind,
        df.getOWLLiteral(`val_${i}`),
      ),
    );
    axioms.push(
      df.getOWLNegativeDataPropertyAssertionAxiom(
        dp2,
        ind,
        df.getOWLLiteral(`neg_${i}`),
      ),
    );
    if (i < 30) {
      axioms.push(df.getOWLSameIndividualAxiom([ind, ind2]));
    } else {
      axioms.push(df.getOWLDifferentIndividualsAxiom([ind, ind2]));
    }

    axioms.push(
      df.getOWLAnnotationAssertionAxiom(
        rdfsLabel,
        c.iri,
        df.getOWLLiteral(`Class ${i}`, "en"),
      ),
    );
    axioms.push(
      df.getOWLAnnotationAssertionAxiom(
        ap,
        c.iri,
        df.getOWLLiteral(`Alt ${i}`, "fr"),
      ),
    );
    axioms.push(df.getOWLSubAnnotationPropertyOfAxiom(ap, rdfsLabel));
    axioms.push(df.getOWLAnnotationPropertyDomainAxiom(ap, c.iri));
    axioms.push(df.getOWLAnnotationPropertyRangeAxiom(ap, d.iri));
  }
  return axioms;
};

const createRichOntologyFixture = (behaviorProfileId) => {
  const manager = OWLManager.createOWLOntologyManager({ behaviorProfileId });
  const df = manager.getOWLDataFactory();
  const importedIRI = IRI.create("urn:bench:rich:imported");
  const mainIRI = IRI.create("urn:bench:rich:main");
  const importedOntology = manager.createOntology(
    df.getOWLOntologyID(importedIRI),
  );
  const mainOntology = manager.createOntology(df.getOWLOntologyID(mainIRI));

  const fixture = {
    manager,
    df,
    mainOntology,
    importedOntology,
    classes: [],
    superClasses: [],
    objectProps: [],
    superObjectProps: [],
    dataProps: [],
    superDataProps: [],
    annProps: [],
    datatypes: [],
    individuals: [],
    otherIndividuals: [],
    allMainAxioms: [],
    complexExpressions: [],
  };

  const importedAxioms = buildAxiomBatch(
    df,
    IMPORT_NS,
    IMPORT_COUNT,
    false,
    null,
  );
  manager.addAxioms(importedOntology, importedAxioms);

  const mainAxioms = buildAxiomBatch(df, RICH_NS, RICH_COUNT, true, fixture);
  fixture.allMainAxioms.push(...mainAxioms);
  manager.addAxioms(mainOntology, mainAxioms);
  manager.applyChange(
    new AddImport(mainOntology, df.getOWLImportsDeclaration(importedIRI)),
  );
  for (let i = 0; i < 5; i += 1) {
    manager.applyChange(
      new AddOntologyAnnotation(
        mainOntology,
        df.getOWLAnnotation(
          df.getRDFSLabel(),
          df.getOWLLiteral(`Ontology Label ${i}`, "en"),
        ),
      ),
    );
  }
  return fixture;
};

const buildProfileOntology = (behaviorProfileId) => {
  const manager = OWLManager.createOWLOntologyManager({ behaviorProfileId });
  const df = manager.getOWLDataFactory();
  const ont = manager.createOntology(
    df.getOWLOntologyID(IRI.create("urn:bench:profile")),
  );
  const xsdString = df.getOWLDatatype(XSD_STRING_IRI);
  const xsdInteger = df.getOWLDatatype(XSD_INTEGER_IRI);
  const axioms = [];
  for (let i = 0; i < 40; i += 1) {
    const c = df.getOWLClass(IRI.create(`urn:bench:profile#C${i}`));
    const d = df.getOWLClass(IRI.create(`urn:bench:profile#D${i}`));
    const op = df.getOWLObjectProperty(IRI.create(`urn:bench:profile#op${i}`));
    const dp = df.getOWLDataProperty(IRI.create(`urn:bench:profile#dp${i}`));
    const ind = df.getOWLNamedIndividual(
      IRI.create(`urn:bench:profile#ind${i}`),
    );
    axioms.push(df.getOWLDeclarationAxiom(c));
    axioms.push(df.getOWLDeclarationAxiom(d));
    axioms.push(df.getOWLDeclarationAxiom(op));
    axioms.push(df.getOWLDeclarationAxiom(dp));
    axioms.push(df.getOWLDeclarationAxiom(ind));
    axioms.push(df.getOWLSubClassOfAxiom(c, d));
    axioms.push(
      df.getOWLSubClassOfAxiom(c, df.getOWLObjectSomeValuesFrom(op, d)),
    );
    axioms.push(df.getOWLObjectPropertyDomainAxiom(op, c));
    axioms.push(df.getOWLObjectPropertyRangeAxiom(op, d));
    axioms.push(df.getOWLDataPropertyDomainAxiom(dp, c));
    axioms.push(df.getOWLDataPropertyRangeAxiom(dp, xsdString));
    axioms.push(df.getOWLClassAssertionAxiom(c, ind));
    axioms.push(
      df.getOWLDataPropertyAssertionAxiom(
        dp,
        ind,
        df.getOWLLiteral(String(i), xsdInteger),
      ),
    );
  }
  manager.addAxioms(ont, axioms);
  return ont;
};

export const prepareSharedFixtureDirectory = ({
  syntaxCount = 100,
  importClosureCount = 8,
} = {}) => {
  const rootDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "owlapi-parity-bench-"),
  );
  const fixturesDir = path.join(rootDir, "fixtures");
  fs.mkdirSync(fixturesDir, { recursive: true });

  const syntaxNames = [
    "functional",
    "manchester",
    "owlxml",
    "rdfxml",
    "turtle",
    "ntriples",
    "nquads",
    "trig",
    "dl",
    "krss2",
    "krss1",
  ];
  const syntaxTexts = {};
  for (const name of syntaxNames) {
    let text = generateBenchmarkFixture(name, { count: syntaxCount });
    if (name === "dl") {
      text = text.trim();
    }
    syntaxTexts[name] = text;
    fs.writeFileSync(path.join(fixturesDir, `${name}.txt`), text, "utf8");
  }

  const jsonldText = JSON.stringify(
    Array.from({ length: syntaxCount }, (_, index) => ({
      "@id": `https://example.org/benchmark#C${index}`,
      "@type": ["http://www.w3.org/2002/07/owl#Class"],
    })),
  );
  syntaxTexts.jsonld = jsonldText;
  fs.writeFileSync(path.join(fixturesDir, "jsonld.txt"), jsonldText, "utf8");

  const rdfMetadataText =
    "@prefix owl: <http://www.w3.org/2002/07/owl#> .\n" +
    "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n" +
    "<urn:bench:rdf-metadata> a owl:Ontology .\n" +
    Array.from(
      { length: 50 },
      (_, index) =>
        `<urn:bench:rdf-metadata#C${index}> a owl:Class ; rdfs:subClassOf <urn:bench:rdf-metadata#D${index}> .`,
    ).join("\n") +
    "\n";
  syntaxTexts["rdf-metadata"] = rdfMetadataText;
  fs.writeFileSync(
    path.join(fixturesDir, "rdf-metadata.txt"),
    rdfMetadataText,
    "utf8",
  );

  const rawClosure = JSON.parse(
    generateBenchmarkFixture("import-closure", { count: importClosureCount }),
  );
  const closureFiles = {};
  const closureFileIRIs = new Map();
  let fileIndex = 0;
  for (const [docIri, rawHeader] of Object.entries(rawClosure.documents)) {
    const memberAxioms = Array.from(
      { length: 15 },
      (_, k) =>
        `Declaration(Class(<${docIri}#C${k}>)) Declaration(Class(<${docIri}#D${k}>)) SubClassOf(<${docIri}#C${k}> <${docIri}#D${k}>)`,
    ).join(" ");
    const enrichedText = `${rawHeader.slice(0, -1)} ${memberAxioms})`;
    const filePath = path.join(fixturesDir, `import-${fileIndex}.ofn`);
    fileIndex += 1;
    fs.writeFileSync(filePath, enrichedText, "utf8");
    closureFiles[docIri] = filePath;
    closureFileIRIs.set(docIri, IRI.create(pathToFileURL(filePath).href));
  }

  return {
    rootDir,
    fixturesDir,
    syntaxTexts,
    importClosure: {
      rootIRI: rawClosure.entry,
      rootText: fs.readFileSync(closureFiles[rawClosure.entry], "utf8"),
      files: closureFiles,
      fileIRIs: closureFileIRIs,
    },
    cleanup() {
      fs.rmSync(rootDir, { recursive: true, force: true });
    },
  };
};

export const runJsProfileBenchmarks = async (
  behaviorProfileId,
  {
    warmupCount = 1,
    runCount = 3,
    filterIds = null,
    sharedFixtures = null,
  } = {},
) => {
  const ownsFixtures = !sharedFixtures;
  const fixtures = sharedFixtures ?? prepareSharedFixtureDirectory();
  const filterSet =
    filterIds && filterIds.length > 0 ? new Set(filterIds) : null;

  try {
    const rich = createRichOntologyFixture(behaviorProfileId);
    const profileOntology = buildProfileOntology(behaviorProfileId);

    const createImportClosureManager = () =>
      OWLManager.createOWLOntologyManager({
        behaviorProfileId,
        documentLoader: new NodeDocumentLoader({ authorize: () => true }),
        iriMappers: [
          {
            getDocumentIRI(iri) {
              return iri.value === fixtures.importClosure.rootIRI
                ? null
                : (fixtures.importClosure.fileIRIs.get(iri.value) ?? null);
            },
          },
        ],
      });

    const closureManager = createImportClosureManager();
    const loadedClosureRoot =
      await closureManager.loadOntologyFromOntologyDocument(
        new StringDocumentSource(fixtures.importClosure.rootText, {
          documentIRI: fixtures.importClosure.rootIRI,
          format: OWLDocumentFormats.FUNCTIONAL,
        }),
      );

    const rdfMetaManager = OWLManager.createOWLOntologyManager({
      behaviorProfileId,
    });
    const rdfMetaOntology =
      await rdfMetaManager.loadOntologyFromOntologyDocument(
        new StringDocumentSource(fixtures.syntaxTexts["rdf-metadata"], {
          documentIRI: "urn:bench:rdf-metadata",
          format: OWLDocumentFormats.TURTLE,
        }),
      );

    const saveManager = OWLManager.createOWLOntologyManager({
      behaviorProfileId,
    });
    const saveOntology = await saveManager.loadOntologyFromOntologyDocument(
      new StringDocumentSource(fixtures.syntaxTexts.functional, {
        documentIRI: "urn:bench:save",
        format: OWLDocumentFormats.FUNCTIONAL,
      }),
    );

    const utilManager = OWLManager.createOWLOntologyManager({
      behaviorProfileId,
    });
    const utilDf = utilManager.getOWLDataFactory();
    const utilOntology = utilManager.createOntology(
      utilDf.getOWLOntologyID(IRI.create("urn:bench:util")),
    );
    const utilAxioms = buildAxiomBatch(
      utilDf,
      "urn:bench:util#",
      20,
      false,
      null,
    );
    utilManager.addAxioms(utilOntology, utilAxioms);
    const utilSeedEntities = [...utilOntology.getClassesInSignature()].slice(
      0,
      20,
    );

    const objVisitorHandlers = Object.freeze(
      Object.fromEntries(OWL_OBJECT_KINDS.map((kind) => [kind, () => 1])),
    );
    const axVisitorHandlers = Object.freeze(
      Object.fromEntries(AXIOM_KINDS.map((kind) => [kind, () => 1])),
    );
    const ceVisitorHandlers = Object.freeze(
      Object.fromEntries(CLASS_EXPRESSION_KINDS.map((kind) => [kind, () => 1])),
    );

    const bulk500 = rich.allMainAxioms.slice(0, 500);
    const single200 = rich.allMainAxioms.slice(0, 200);
    const searchOntologies = [rich.mainOntology, rich.importedOntology];

    const operations = new Map();

    // 1. Manager & Configuration
    operations.set("manager.createOWLOntologyManager", () => {
      let sum = 0;
      for (let i = 0; i < 100; i += 1) {
        const m = OWLManager.createOWLOntologyManager({ behaviorProfileId });
        if (m.getOWLDataFactory() !== null) sum += 1;
      }
      return sum;
    });

    operations.set("config.OWLOntologyLoaderConfiguration", () => {
      let sum = 0;
      for (let i = 0; i < 500; i += 1) {
        const cfg = new OWLOntologyLoaderConfiguration({ behaviorProfileId })
          .setStrict(true)
          .setLoadAnnotationAxioms(false)
          .setConnectionTimeout(15000 + (i % 10))
          .setRetriesToAttempt(3)
          .setFollowRedirects(false)
          .setEntityExpansionLimit("50000")
          .setAuthorizationValue("Bearer token")
          .setAcceptingHTTPCompression(false);
        if (
          cfg.isStrict() &&
          !cfg.isLoadAnnotationAxioms() &&
          cfg.getConnectionTimeout() > 0 &&
          cfg.getRetriesToAttempt() === 3 &&
          !cfg.isFollowRedirects() &&
          cfg.getEntityExpansionLimit().length === 5 &&
          cfg.getAuthorizationValue().length === 12 &&
          !cfg.isAcceptingHTTPCompression()
        ) {
          sum += 1;
        }
      }
      return sum;
    });

    operations.set("config.OWLOntologyWriterConfiguration", () => {
      let sum = 0;
      for (let i = 0; i < 500; i += 1) {
        const cfg = new OWLOntologyWriterConfiguration({ behaviorProfileId })
          .withIndenting(false)
          .withIndentSize(2 + (i % 4))
          .withBannersEnabled(false)
          .withLabelsAsBanner(true)
          .withSaveIdsForAllAnonymousIndividuals(true);
        sum +=
          (cfg.isIndenting() ? 1 : 0) +
          cfg.getIndentSize() +
          (cfg.shouldUseBanners() ? 1 : 0) +
          (cfg.isLabelsAsBanner() ? 1 : 0) +
          (cfg.shouldSaveIdsForAllAnonymousIndividuals() ? 1 : 0);
      }
      return sum;
    });

    operations.set("formats.RDFXMLDocumentFormat.prefixes", () => {
      let sum = 0;
      const src = new RDFXMLDocumentFormat();
      src.setPrefix("src:", "http://example.org/src#");
      for (let i = 0; i < 200; i += 1) {
        const fmt = new RDFXMLDocumentFormat();
        fmt.setPrefix("ex:", `http://example.org/ex${i}#`);
        fmt.setDefaultPrefix("http://example.org/def#");
        fmt.copyPrefixesFrom(src);
        if (
          fmt.containsPrefixMapping("ex:") &&
          fmt.getPrefix("src:") !== null &&
          fmt.getDefaultPrefix() !== null
        ) {
          sum += fmt.getPrefixNames().size + fmt.getPrefixName2PrefixMap().size;
        }
        fmt.unregisterNamespace("http://example.org/def#");
        fmt.clear();
      }
      return sum;
    });

    // 2. DataFactory & Structural Model
    operations.set("model.IRI.create", () => {
      let sum = 0;
      for (let i = 0; i < 2000; i += 1) {
        const iri = IRI.create(`http://example.org/bench/iri#${i}`);
        sum += iri.toString().length;
      }
      return sum;
    });

    operations.set("factory.entities", () => {
      const df = OWLManager.createOWLOntologyManager({
        behaviorProfileId,
      }).getOWLDataFactory();
      let sum = 0;
      for (let i = 0; i < 500; i += 1) {
        const iri = IRI.create(`http://example.org/factory#E${i}`);
        const c = df.getOWLClass(iri);
        const op = df.getOWLObjectProperty(iri);
        const dp = df.getOWLDataProperty(iri);
        const ap = df.getOWLAnnotationProperty(iri);
        const dt = df.getOWLDatatype(iri);
        const ni = df.getOWLNamedIndividual(iri);
        const ai = df.getOWLAnonymousIndividual(`node_${i}`);
        const label = df.getRDFSLabel();
        const id = df.getOWLOntologyID(iri);
        const imp = df.getOWLImportsDeclaration(iri);
        if (c && op && dp && ap && dt && ni && ai && label && id && imp) {
          sum += 10;
        }
      }
      return sum;
    });

    operations.set("factory.literals", () => {
      const df = OWLManager.createOWLOntologyManager({
        behaviorProfileId,
      }).getOWLDataFactory();
      const xsdInt = df.getOWLDatatype(XSD_INTEGER_IRI);
      const xsdDec = df.getOWLDatatype(XSD_DECIMAL_IRI);
      const xsdFloat = df.getOWLDatatype(XSD_FLOAT_IRI);
      const xsdBool = df.getOWLDatatype(XSD_BOOLEAN_IRI);
      let sum = 0;
      for (let i = 0; i < 500; i += 1) {
        const l1 = df.getOWLLiteral(`plain_${i}`);
        const l2 = df.getOWLLiteral(`lang_${i}`, " en-GB ");
        const l3 = df.getOWLLiteral(String(i), xsdInt);
        const l4 = df.getOWLLiteral(`${i}.50`, xsdDec);
        const l5 = df.getOWLLiteral(`${i}.25`, xsdFloat);
        const l6 = df.getOWLLiteral(i % 2 === 0 ? "true" : "false", xsdBool);
        sum +=
          l1.lexicalForm.length +
          l2.language.length +
          l3.lexicalForm.length +
          l4.lexicalForm.length +
          l5.lexicalForm.length +
          l6.lexicalForm.length;
      }
      return sum;
    });

    operations.set("factory.classExpressions", () => {
      const df = rich.df;
      const xsdString = df.getOWLDatatype(XSD_STRING_IRI);
      const lit = df.getOWLLiteral("v");
      let sum = 0;
      for (let i = 0; i < 200; i += 1) {
        const c = rich.classes[i % RICH_COUNT];
        const d = rich.superClasses[i % RICH_COUNT];
        const op = rich.objectProps[i % RICH_COUNT];
        const dp = rich.dataProps[i % RICH_COUNT];
        const ind = rich.individuals[i % RICH_COUNT];
        const inv = df.getOWLObjectInverseOf(op);
        const e1 = df.getOWLObjectIntersectionOf([c, d]);
        const e2 = df.getOWLObjectUnionOf([c, d]);
        const e3 = df.getOWLObjectComplementOf(c);
        const e4 = df.getOWLObjectOneOf([ind]);
        const e5 = df.getOWLObjectSomeValuesFrom(op, c);
        const e6 = df.getOWLObjectAllValuesFrom(inv, d);
        const e7 = df.getOWLObjectHasValue(op, ind);
        const e8 = df.getOWLObjectHasSelf(op);
        const e9 = df.getOWLObjectMinCardinality(1, op, c);
        const e10 = df.getOWLObjectMaxCardinality(2, op, c);
        const e11 = df.getOWLObjectExactCardinality(1, op, c);
        const e12 = df.getOWLDataSomeValuesFrom([dp], xsdString);
        const e13 = df.getOWLDataAllValuesFrom([dp], xsdString);
        const e14 = df.getOWLDataHasValue(dp, lit);
        const e15 = df.getOWLDataMinCardinality(1, dp, xsdString);
        const e16 = df.getOWLDataMaxCardinality(2, dp, xsdString);
        const e17 = df.getOWLDataExactCardinality(1, dp, xsdString);
        if (
          e1 &&
          e2 &&
          e3 &&
          e4 &&
          e5 &&
          e6 &&
          e7 &&
          e8 &&
          e9 &&
          e10 &&
          e11 &&
          e12 &&
          e13 &&
          e14 &&
          e15 &&
          e16 &&
          e17
        ) {
          sum += 18;
        }
      }
      return sum;
    });

    operations.set("factory.dataRanges", () => {
      const df = rich.df;
      const xsdInt = df.getOWLDatatype(XSD_INTEGER_IRI);
      const xsdDec = df.getOWLDatatype(XSD_DECIMAL_IRI);
      const minIncIri = MIN_INCLUSIVE_IRI;
      let sum = 0;
      for (let i = 0; i < 200; i += 1) {
        const lit = df.getOWLLiteral(String(i), xsdInt);
        const facet = df.getOWLFacetRestriction(minIncIri, lit);
        const dr1 = df.getOWLDatatypeRestriction(xsdInt, [facet]);
        const dr2 = df.getOWLDataIntersectionOf([xsdInt, xsdDec]);
        const dr3 = df.getOWLDataUnionOf([xsdInt, xsdDec]);
        const dr4 = df.getOWLDataComplementOf(xsdInt);
        const dr5 = df.getOWLDataOneOf([lit]);
        if (facet && dr1 && dr2 && dr3 && dr4 && dr5) {
          sum += 6;
        }
      }
      return sum;
    });

    operations.set("factory.axioms", () => {
      const df = OWLManager.createOWLOntologyManager({
        behaviorProfileId,
      }).getOWLDataFactory();
      const built = buildAxiomBatch(df, "urn:bench:factory#", 35, false, null);
      return built.length;
    });

    operations.set("model.structuralEqualityAndSet", () => {
      const set = new StructuralSet();
      let sum = 0;
      const n = Math.min(1000, rich.allMainAxioms.length);
      for (let i = 0; i < n; i += 1) {
        const ax = rich.allMainAxioms[i];
        const next = rich.allMainAxioms[(i + 1) % n];
        set.add(ax);
        if (set.has(ax)) sum += 1;
        if (ax.equals(ax)) sum += 1;
        if (!ax.equals(next)) sum += 1;
        if (ax.equalsIgnoreAnnotations(ax)) sum += 1;
      }
      return sum;
    });

    operations.set("model.axiomAnnotationsTransform", () => {
      const extra = rich.df.getOWLAnnotation(
        rich.df.getRDFSLabel(),
        rich.df.getOWLLiteral("extra"),
      );
      const anns = [extra];
      let sum = 0;
      const n = Math.min(500, rich.allMainAxioms.length);
      for (let i = 0; i < n; i += 1) {
        const ax = rich.allMainAxioms[i];
        const annotated = ax.getAnnotatedAxiom(anns);
        const stripped = annotated.getAxiomWithoutAnnotations();
        if (stripped.equalsIgnoreAnnotations(ax)) sum += 1;
      }
      return sum;
    });

    operations.set("model.dispatch", () => {
      let sum = 0;
      const n = Math.min(500, rich.allMainAxioms.length);
      for (let i = 0; i < n; i += 1) {
        const ax = rich.allMainAxioms[i];
        sum += dispatchOwlObject(ax, objVisitorHandlers);
        sum += dispatchAxiom(ax, axVisitorHandlers);
      }
      for (const ce of rich.complexExpressions) {
        sum += dispatchClassExpression(ce, ceVisitorHandlers);
      }
      return sum;
    });

    // 3. Parsing & Loading
    const syntaxFormatEntries = [
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
    for (const [name, fmt] of syntaxFormatEntries) {
      const text = fixtures.syntaxTexts[name];
      operations.set(`load.${name}`, async () => {
        const m = OWLManager.createOWLOntologyManager({ behaviorProfileId });
        const o = await m.loadOntologyFromOntologyDocument(
          new StringDocumentSource(text, {
            documentIRI: `urn:bench:load:${name}`,
            format: fmt,
          }),
        );
        return o.getAxiomCount();
      });
    }

    operations.set("load.importsClosure", async () => {
      const m = createImportClosureManager();
      const root = await m.loadOntologyFromOntologyDocument(
        new StringDocumentSource(fixtures.importClosure.rootText, {
          documentIRI: fixtures.importClosure.rootIRI,
          format: OWLDocumentFormats.FUNCTIONAL,
        }),
      );
      return m.getImportsClosure(root).size;
    });

    operations.set("load.rdfParserMetaData", () => {
      let sum = 0;
      for (let i = 0; i < 500; i += 1) {
        const meta = rdfMetaManager
          .getOntologyFormat(rdfMetaOntology)
          .getOntologyLoaderMetaData();
        sum +=
          meta.getTripleCount() +
          (meta.getHeaderState() !== null ? 1 : 0) +
          meta.getUnparsedTriples().length +
          meta.getGuessedDeclarations().length;
      }
      return sum;
    });

    // 4. Ontology Lifecycle & Mutations
    operations.set("manager.createAndGetOntology", () => {
      const m = OWLManager.createOWLOntologyManager({ behaviorProfileId });
      const df = m.getOWLDataFactory();
      let sum = 0;
      for (let i = 0; i < 100; i += 1) {
        const id = df.getOWLOntologyID(IRI.create(`urn:bench:lifecycle#${i}`));
        const o = m.createOntology(id);
        if (m.getOntology(id) === o) sum += 1;
      }
      return sum;
    });

    operations.set("manager.addAxioms.bulk", () => {
      const m = OWLManager.createOWLOntologyManager({ behaviorProfileId });
      const o = m.createOntology(
        m.getOWLDataFactory().getOWLOntologyID(IRI.create("urn:bench:addbulk")),
      );
      m.addAxioms(o, bulk500);
      return o.getAxiomCount();
    });

    operations.set("manager.addAxiom.singleLoop", () => {
      const m = OWLManager.createOWLOntologyManager({ behaviorProfileId });
      const o = m.createOntology(
        m
          .getOWLDataFactory()
          .getOWLOntologyID(IRI.create("urn:bench:addsingle")),
      );
      for (const ax of single200) {
        m.addAxiom(o, ax);
      }
      return o.getAxiomCount();
    });

    operations.set("manager.removeAxioms.bulk", () => {
      const m = OWLManager.createOWLOntologyManager({ behaviorProfileId });
      const o = m.createOntology(
        m.getOWLDataFactory().getOWLOntologyID(IRI.create("urn:bench:rembulk")),
      );
      m.addAxioms(o, bulk500);
      m.removeAxioms(o, bulk500);
      return o.getAxiomCount();
    });

    operations.set("manager.removeAxiom.singleLoop", () => {
      const m = OWLManager.createOWLOntologyManager({ behaviorProfileId });
      const o = m.createOntology(
        m
          .getOWLDataFactory()
          .getOWLOntologyID(IRI.create("urn:bench:remsingle")),
      );
      m.addAxioms(o, single200);
      for (const ax of single200) {
        m.removeAxiom(o, ax);
      }
      return o.getAxiomCount();
    });

    operations.set("manager.applyChanges.mixed", () => {
      const m = OWLManager.createOWLOntologyManager({ behaviorProfileId });
      const df = m.getOWLDataFactory();
      const o = m.createOntology(
        df.getOWLOntologyID(IRI.create("urn:bench:mixed")),
      );
      const changes = [];
      for (let i = 0; i < 80; i += 1) {
        changes.push(new AddAxiom(o, single200[i]));
      }
      for (let i = 0; i < 40; i += 1) {
        changes.push(new RemoveAxiom(o, single200[i]));
      }
      const ann = df.getOWLAnnotation(df.getRDFSLabel(), df.getOWLLiteral("v"));
      changes.push(new AddOntologyAnnotation(o, ann));
      changes.push(new RemoveOntologyAnnotation(o, ann));
      const imp = df.getOWLImportsDeclaration(IRI.create("urn:bench:imp"));
      changes.push(new AddImport(o, imp));
      changes.push(new RemoveImport(o, imp));
      changes.push(
        new SetOntologyID(
          o,
          df.getOWLOntologyID(IRI.create("urn:bench:mixed2")),
        ),
      );
      m.applyChanges(changes);
      return o.getAxiomCount();
    });

    operations.set("manager.getImportsClosure", () => {
      let sum = 0;
      for (let i = 0; i < 1000; i += 1) {
        sum += closureManager.getImportsClosure(loadedClosureRoot).size;
      }
      return sum;
    });

    // 5. Ontology Queries - General & Signature
    operations.set("ontology.getAxioms.excluded", () => {
      let sum = 0;
      for (let i = 0; i < 200; i += 1) {
        sum +=
          rich.mainOntology.getAxioms(Imports.EXCLUDED).size +
          rich.mainOntology.getAxiomCount(Imports.EXCLUDED) +
          rich.mainOntology.getAnnotations().size +
          rich.mainOntology.getImportsDeclarations().size +
          (rich.mainOntology.getOntologyID() !== null ? 1 : 0);
      }
      return sum;
    });

    operations.set("ontology.getAxioms.included", () => {
      let sum = 0;
      for (let i = 0; i < 200; i += 1) {
        sum +=
          rich.mainOntology.getAxioms(Imports.INCLUDED).size +
          rich.mainOntology.getAxiomCount(Imports.INCLUDED);
      }
      return sum;
    });

    operations.set("ontology.getLogicalAxioms", () => {
      let sum = 0;
      for (let i = 0; i < 100; i += 1) {
        sum +=
          rich.mainOntology.getLogicalAxioms(Imports.EXCLUDED).size +
          rich.mainOntology.getLogicalAxioms(Imports.INCLUDED).size +
          rich.mainOntology.getLogicalAxiomCount(Imports.EXCLUDED) +
          rich.mainOntology.getLogicalAxiomCount(Imports.INCLUDED);
      }
      return sum;
    });

    operations.set("ontology.getAxiomsByType", () => {
      let sum = 0;
      for (let pass = 0; pass < 20; pass += 1) {
        for (const kind of AXIOM_KINDS) {
          sum +=
            rich.mainOntology.getAxiomsByType(kind, Imports.EXCLUDED).size +
            rich.mainOntology.getAxiomsByType(kind, Imports.INCLUDED).size +
            rich.mainOntology.getAxiomCount(kind, Imports.EXCLUDED) +
            rich.mainOntology.getAxiomCount(kind, Imports.INCLUDED);
        }
      }
      return sum;
    });

    operations.set("ontology.containsAxiom", () => {
      let sum = 0;
      for (let i = 0; i < 200; i += 1) {
        const ax = rich.allMainAxioms[i];
        if (
          rich.mainOntology.containsAxiom(
            ax,
            Imports.EXCLUDED,
            AxiomAnnotations.CONSIDER_AXIOM_ANNOTATIONS,
          )
        ) {
          sum += 1;
        }
        if (
          rich.mainOntology.containsAxiom(
            ax,
            Imports.INCLUDED,
            AxiomAnnotations.CONSIDER_AXIOM_ANNOTATIONS,
          )
        ) {
          sum += 1;
        }
        if (
          rich.mainOntology.containsAxiom(
            ax,
            Imports.EXCLUDED,
            AxiomAnnotations.IGNORE_AXIOM_ANNOTATIONS,
          )
        ) {
          sum += 1;
        }
        if (
          rich.mainOntology.containsAxiom(
            ax,
            Imports.INCLUDED,
            AxiomAnnotations.IGNORE_AXIOM_ANNOTATIONS,
          )
        ) {
          sum += 1;
        }
        sum += rich.mainOntology.getAxiomsIgnoreAnnotations(
          ax,
          Imports.EXCLUDED,
        ).size;
        sum += rich.mainOntology.getAxiomsIgnoreAnnotations(
          ax,
          Imports.INCLUDED,
        ).size;
      }
      return sum;
    });

    operations.set("ontology.getSignature", () => {
      let sum = 0;
      for (let i = 0; i < 100; i += 1) {
        for (const imp of [Imports.EXCLUDED, Imports.INCLUDED]) {
          sum +=
            rich.mainOntology.getSignature(imp).size +
            rich.mainOntology.getClassesInSignature(imp).size +
            rich.mainOntology.getObjectPropertiesInSignature(imp).size +
            rich.mainOntology.getDataPropertiesInSignature(imp).size +
            rich.mainOntology.getAnnotationPropertiesInSignature(imp).size +
            rich.mainOntology.getIndividualsInSignature(imp).size +
            rich.mainOntology.getDatatypesInSignature(imp).size;
        }
      }
      return sum;
    });

    operations.set("ontology.entitySignatureLookups", () => {
      let sum = 0;
      for (let pass = 0; pass < 5; pass += 1) {
        for (let i = 0; i < RICH_COUNT; i += 1) {
          const c = rich.classes[i];
          const iri = c.iri;
          sum += rich.mainOntology.getEntitiesInSignature(
            iri,
            Imports.EXCLUDED,
          ).size;
          sum += rich.mainOntology.getEntitiesInSignature(
            iri,
            Imports.INCLUDED,
          ).size;
          if (
            rich.mainOntology.containsEntityInSignature(c, Imports.EXCLUDED)
          ) {
            sum += 1;
          }
          if (
            rich.mainOntology.containsEntityInSignature(iri, Imports.INCLUDED)
          ) {
            sum += 1;
          }
        }
        sum += rich.mainOntology.getPunnedIRIs(Imports.EXCLUDED).size;
        sum += rich.mainOntology.getPunnedIRIs(Imports.INCLUDED).size;
        sum += rich.mainOntology.getReferencedAnonymousIndividuals(
          Imports.EXCLUDED,
        ).size;
        sum += rich.mainOntology.getReferencedAnonymousIndividuals(
          Imports.INCLUDED,
        ).size;
      }
      return sum;
    });

    operations.set("ontology.getReferencingAxioms", () => {
      let sum = 0;
      for (let i = 0; i < 50; i += 1) {
        const c = rich.classes[i];
        sum += rich.mainOntology.getReferencingAxioms(c, Imports.EXCLUDED).size;
        sum += rich.mainOntology.getReferencingAxioms(c, Imports.INCLUDED).size;
      }
      return sum;
    });

    // 6. Ontology Queries - 33 Specific Axiom Indexes
    operations.set("ontology.classAxiomIndexes", () => {
      let sum = 0;
      for (let pass = 0; pass < 10; pass += 1) {
        for (let i = 0; i < RICH_COUNT; i += 1) {
          const c = rich.classes[i];
          const d = rich.superClasses[i];
          sum += rich.mainOntology.getSubClassAxiomsForSubClass(c).size;
          sum += rich.mainOntology.getSubClassAxiomsForSuperClass(d).size;
          sum += rich.mainOntology.getEquivalentClassesAxioms(c).size;
          sum += rich.mainOntology.getDisjointClassesAxioms(c).size;
        }
      }
      return sum;
    });

    operations.set("ontology.objectPropertyAxiomIndexes", () => {
      let sum = 0;
      for (let pass = 0; pass < 10; pass += 1) {
        for (let i = 0; i < RICH_COUNT; i += 1) {
          const op = rich.objectProps[i];
          const q = rich.superObjectProps[i];
          sum +=
            rich.mainOntology.getObjectSubPropertyAxiomsForSubProperty(op).size;
          sum +=
            rich.mainOntology.getObjectSubPropertyAxiomsForSuperProperty(
              q,
            ).size;
          sum += rich.mainOntology.getObjectPropertyDomainAxioms(op).size;
          sum += rich.mainOntology.getObjectPropertyRangeAxioms(op).size;
          sum += rich.mainOntology.getInverseObjectPropertyAxioms(op).size;
          sum += rich.mainOntology.getFunctionalObjectPropertyAxioms(op).size;
          sum +=
            rich.mainOntology.getInverseFunctionalObjectPropertyAxioms(op).size;
          sum += rich.mainOntology.getSymmetricObjectPropertyAxioms(op).size;
          sum += rich.mainOntology.getAsymmetricObjectPropertyAxioms(q).size;
          sum += rich.mainOntology.getReflexiveObjectPropertyAxioms(op).size;
          sum += rich.mainOntology.getIrreflexiveObjectPropertyAxioms(q).size;
          sum += rich.mainOntology.getTransitiveObjectPropertyAxioms(q).size;
        }
      }
      return sum;
    });

    operations.set("ontology.dataPropertyAxiomIndexes", () => {
      let sum = 0;
      for (let pass = 0; pass < 10; pass += 1) {
        for (let i = 0; i < RICH_COUNT; i += 1) {
          const dp = rich.dataProps[i];
          const dp2 = rich.superDataProps[i];
          sum +=
            rich.mainOntology.getDataSubPropertyAxiomsForSubProperty(dp).size;
          sum +=
            rich.mainOntology.getDataSubPropertyAxiomsForSuperProperty(
              dp2,
            ).size;
          sum += rich.mainOntology.getDataPropertyDomainAxioms(dp).size;
          sum += rich.mainOntology.getDataPropertyRangeAxioms(dp).size;
          sum += rich.mainOntology.getFunctionalDataPropertyAxioms(dp).size;
        }
      }
      return sum;
    });

    operations.set("ontology.annotationAndDeclarationIndexes", () => {
      let sum = 0;
      for (let pass = 0; pass < 10; pass += 1) {
        for (let i = 0; i < RICH_COUNT; i += 1) {
          const c = rich.classes[i];
          const ap = rich.annProps[i];
          sum += rich.mainOntology.getDeclarationAxioms(c).size;
          sum += rich.mainOntology.getAnnotationAssertionAxioms(
            c.iri,
            Imports.EXCLUDED,
          ).size;
          sum += rich.mainOntology.getAnnotationAssertionAxioms(
            c.iri,
            Imports.INCLUDED,
          ).size;
          sum += rich.mainOntology.getSubAnnotationPropertyOfAxioms(ap).size;
          sum += rich.mainOntology.getAnnotationPropertyDomainAxioms(ap).size;
          sum += rich.mainOntology.getAnnotationPropertyRangeAxioms(ap).size;
        }
      }
      return sum;
    });

    operations.set("ontology.individualAssertionIndexes", () => {
      let sum = 0;
      for (let pass = 0; pass < 10; pass += 1) {
        for (let i = 0; i < RICH_COUNT; i += 1) {
          const c = rich.classes[i];
          const ind = rich.individuals[i];
          sum += rich.mainOntology.getClassAssertionAxioms(ind).size;
          sum += rich.mainOntology.getClassAssertionAxioms(c).size;
          sum += rich.mainOntology.getObjectPropertyAssertionAxioms(ind).size;
          sum += rich.mainOntology.getDataPropertyAssertionAxioms(ind).size;
          sum +=
            rich.mainOntology.getNegativeObjectPropertyAssertionAxioms(
              ind,
            ).size;
          sum +=
            rich.mainOntology.getNegativeDataPropertyAssertionAxioms(ind).size;
          sum += rich.mainOntology.getSameIndividualAxioms(ind).size;
          sum += rich.mainOntology.getDifferentIndividualAxioms(ind).size;
        }
      }
      return sum;
    });

    // 7. Storage / Serialization
    const saveFormatEntries = [
      ["functional", OWLDocumentFormats.FUNCTIONAL],
      ["owlxml", OWLDocumentFormats.OWL_XML],
      ["rdfxml", OWLDocumentFormats.RDF_XML],
      ["turtle", OWLDocumentFormats.TURTLE],
    ];
    for (const [name, fmt] of saveFormatEntries) {
      operations.set(`save.${name}`, async () => {
        const target = new StringDocumentTarget();
        await saveManager.saveOntology(saveOntology, fmt, target);
        return target.toString().length > 0 ? saveOntology.getAxiomCount() : 0;
      });
    }

    const countIterable = (iterable) => {
      if (typeof iterable?.size === "number") return iterable.size;
      if (typeof iterable?.length === "number") return iterable.length;
      let count = 0;
      for (const item of iterable) {
        if (item !== undefined) count += 1;
      }
      return count;
    };

    // 8. EntitySearcher
    operations.set("search.classHierarchyAndRelations", () => {
      let sum = 0;
      for (let pass = 0; pass < 5; pass += 1) {
        for (let i = 0; i < RICH_COUNT; i += 1) {
          const c = rich.classes[i];
          const d = rich.superClasses[i];
          sum += countIterable(
            EntitySearcher.getSuperClasses(c, searchOntologies),
          );
          sum += countIterable(
            EntitySearcher.getSubClasses(d, searchOntologies),
          );
          sum += countIterable(
            EntitySearcher.getEquivalentClasses(c, searchOntologies),
          );
          sum += countIterable(
            EntitySearcher.getDisjointClasses(c, searchOntologies),
          );
        }
      }
      return sum;
    });

    operations.set("search.propertyHierarchyAndDomainsRanges", () => {
      let sum = 0;
      for (let pass = 0; pass < 5; pass += 1) {
        for (let i = 0; i < RICH_COUNT; i += 1) {
          const op = rich.objectProps[i];
          const q = rich.superObjectProps[i];
          const dp = rich.dataProps[i];
          sum += countIterable(
            EntitySearcher.getSuperProperties(op, searchOntologies),
          );
          sum += countIterable(
            EntitySearcher.getSubProperties(q, searchOntologies),
          );
          sum += countIterable(EntitySearcher.getDomains(op, searchOntologies));
          sum += countIterable(EntitySearcher.getRanges(op, searchOntologies));
          sum += countIterable(
            EntitySearcher.getInverses(op, searchOntologies),
          );
          sum += countIterable(EntitySearcher.getDomains(dp, searchOntologies));
          sum += countIterable(EntitySearcher.getRanges(dp, searchOntologies));
        }
      }
      return sum;
    });

    operations.set("search.annotations", () => {
      const rdfsLabel = rich.df.getRDFSLabel();
      let sum = 0;
      for (let pass = 0; pass < 5; pass += 1) {
        for (let i = 0; i < RICH_COUNT; i += 1) {
          const c = rich.classes[i];
          sum += countIterable(
            EntitySearcher.getAnnotationAssertionAxioms(c, rich.mainOntology),
          );
          sum += countIterable(
            EntitySearcher.getAnnotations(c, rich.mainOntology),
          );
          sum += countIterable(
            EntitySearcher.getAnnotations(c, searchOntologies, rdfsLabel),
          );
          sum += countIterable(
            EntitySearcher.getAnnotationObjects(c, rich.mainOntology),
          );
          sum += countIterable(
            EntitySearcher.getAnnotationObjects(c, searchOntologies, rdfsLabel),
          );
        }
      }
      return sum;
    });

    operations.set("search.propertyCharacteristics", () => {
      let sum = 0;
      for (let pass = 0; pass < 10; pass += 1) {
        for (let i = 0; i < RICH_COUNT; i += 1) {
          const op = rich.objectProps[i];
          const q = rich.superObjectProps[i];
          const dp = rich.dataProps[i];
          if (EntitySearcher.isFunctional(op, searchOntologies)) sum += 1;
          if (EntitySearcher.isFunctional(dp, searchOntologies)) sum += 1;
          if (EntitySearcher.isInverseFunctional(op, searchOntologies)) {
            sum += 1;
          }
          if (EntitySearcher.isTransitive(q, searchOntologies)) sum += 1;
          if (EntitySearcher.isSymmetric(op, searchOntologies)) sum += 1;
          if (EntitySearcher.isAsymmetric(q, searchOntologies)) sum += 1;
          if (EntitySearcher.isReflexive(op, searchOntologies)) sum += 1;
          if (EntitySearcher.isIrreflexive(q, searchOntologies)) sum += 1;
        }
      }
      return sum;
    });

    // 9. Utilities
    operations.set("util.SimpleShortFormProvider", () => {
      const sfp = new SimpleShortFormProvider({ behaviorProfileId });
      let sum = 0;
      for (let pass = 0; pass < 20; pass += 1) {
        for (let i = 0; i < RICH_COUNT; i += 1) {
          sum += sfp.getShortForm(rich.classes[i]).length;
          sum += sfp.getShortForm(rich.objectProps[i]).length;
          sum += sfp.getShortForm(rich.individuals[i]).length;
        }
      }
      sfp.dispose();
      return sum;
    });

    operations.set("util.AnnotationValueShortFormProvider", () => {
      const rdfsLabel = rich.df.getRDFSLabel();
      const langMap = new Map([[rdfsLabel, ["en", "fr"]]]);
      const setProvider = new OWLOntologyImportsClosureSetProvider(
        rich.manager,
        rich.mainOntology,
      );
      const avsfp = new AnnotationValueShortFormProvider(
        [rdfsLabel],
        langMap,
        setProvider,
        new SimpleShortFormProvider({ behaviorProfileId }),
        { behaviorProfileId },
      );
      let sum = 0;
      for (let pass = 0; pass < 5; pass += 1) {
        for (let i = 0; i < RICH_COUNT; i += 1) {
          sum += avsfp.getShortForm(rich.classes[i]).length;
        }
      }
      avsfp.dispose();
      return sum;
    });

    operations.set("util.OWLOntologyImportsClosureSetProvider", () => {
      const provider = new OWLOntologyImportsClosureSetProvider(
        closureManager,
        loadedClosureRoot,
      );
      let sum = 0;
      for (let i = 0; i < 1000; i += 1) {
        sum += countIterable(provider.ontologies());
      }
      return sum;
    });

    operations.set("util.OWLOntologyMerger", () => {
      const provider = new OWLOntologyImportsClosureSetProvider(
        closureManager,
        loadedClosureRoot,
      );
      const dest = OWLManager.createOWLOntologyManager({ behaviorProfileId });
      const mergerAll = new OWLOntologyMerger(provider, false);
      const merged1 = mergerAll.createMergedOntology(
        dest,
        IRI.create("urn:bench:merged:all"),
      );
      const mergerLogical = new OWLOntologyMerger(provider, true);
      const merged2 = mergerLogical.createMergedOntology(
        dest,
        IRI.create("urn:bench:merged:logical"),
      );
      return merged1.getAxiomCount() + merged2.getAxiomCount();
    });

    operations.set("util.OWLObjectDuplicator", () => {
      const entityMap = new Map([
        [rich.classes[0], IRI.create("urn:bench:dup#C0")],
      ]);
      const dup = new OWLObjectDuplicator(entityMap, rich.manager);
      let sum = 0;
      const n = Math.min(500, rich.allMainAxioms.length);
      for (let i = 0; i < n; i += 1) {
        const copy = dup.duplicateObject(rich.allMainAxioms[i]);
        if (copy !== null) sum += 1;
      }
      return sum;
    });

    operations.set("util.OWLEntityRenamer", () => {
      const renamer = new OWLEntityRenamer(utilManager, [utilOntology]);
      let sum = 0;
      for (let i = 0; i < 10; i += 1) {
        const target = utilDf.getOWLClass(IRI.create(`urn:bench:util#C${i}`));
        const replacement = IRI.create(`urn:bench:util#RenamedC${i}`);
        sum += renamer.changeIRI(target, replacement).length;
        sum += renamer.changeIRI(target.iri, replacement).length;
      }
      return sum;
    });

    operations.set("util.OWLEntityRemover", () => {
      const remover = new OWLEntityRemover([utilOntology]);
      for (let i = 0; i < 20; i += 1) {
        remover.visit(utilDf.getOWLClass(IRI.create(`urn:bench:util#C${i}`)));
        remover.visit(
          utilDf.getOWLObjectProperty(IRI.create(`urn:bench:util#op${i}`)),
        );
      }
      const count = remover.getChanges().length;
      remover.reset();
      return count;
    });

    // 10. Manchester Object Renderer
    operations.set("renderer.ManchesterOWLSyntaxOWLObjectRendererImpl", () => {
      const renderer = new ManchesterOWLSyntaxOWLObjectRendererImpl({
        behaviorProfileId,
      });
      renderer.setShortFormProvider(
        new SimpleShortFormProvider({ behaviorProfileId }),
      );
      let sum = 0;
      const n = Math.min(300, rich.allMainAxioms.length);
      for (let i = 0; i < n; i += 1) {
        sum += renderer.render(rich.allMainAxioms[i]).length;
      }
      for (const ce of rich.complexExpressions) {
        sum += renderer.render(ce).length;
      }
      return sum;
    });

    // 11. Modularity / Locality
    for (const [modeName, modeValue] of [
      ["BOTTOM", LocalityClass.BOTTOM],
      ["TOP", LocalityClass.TOP],
      ["STAR", LocalityClass.STAR],
    ]) {
      operations.set(`locality.extract.${modeName}`, async () => {
        const extractor = new SyntacticLocalityModuleExtractor(
          modeValue,
          utilAxioms,
          { behaviorProfileId },
        );
        const extracted = await extractor.extract(utilSeedEntities);
        const baseCount = countIterable(extractor.axiomBase());
        const hasFirst = extractor.containsAxiom(utilAxioms[0]);
        return countIterable(extracted) + baseCount + (hasFirst ? 1 : 0);
      });
    }

    // 12. OWL 2 Language Profiles
    const profileInstances = [
      ["OWL2DLProfile", new OWL2DLProfile({ behaviorProfileId })],
      ["OWL2ELProfile", new OWL2ELProfile({ behaviorProfileId })],
      ["OWL2QLProfile", new OWL2QLProfile({ behaviorProfileId })],
      ["OWL2RLProfile", new OWL2RLProfile({ behaviorProfileId })],
    ];
    for (const [name, profile] of profileInstances) {
      operations.set(`profiles.${name}.checkOntology`, async () => {
        const report = await profile.checkOntology(profileOntology);
        return (
          (report.isInProfile() ? 1000 : 0) +
          report.getViolations().length +
          report.getProfile().getName().length
        );
      });
    }

    const results = [];
    for (const def of BENCHMARK_DEFINITIONS) {
      if (filterSet && !filterSet.has(def.id)) {
        continue;
      }
      const op = operations.get(def.id);
      if (!op) {
        throw new Error(`Missing JS benchmark implementation for ${def.id}`);
      }
      maybeGc();
      const firstUseStarted = performance.now();
      const verificationCount = await op();
      const firstUseWallMs = performance.now() - firstUseStarted;

      for (let w = 0; w < warmupCount; w += 1) {
        await op();
      }

      const measurements = [];
      const wallSamples = [];
      const heapSamples = [];

      for (let r = 0; r < runCount; r += 1) {
        maybeGc();
        const beforeHeap = process.memoryUsage().heapUsed;
        const start = performance.now();
        const count = await op();
        const wallMs = performance.now() - start;
        const afterHeap = process.memoryUsage().heapUsed;
        if (count !== verificationCount) {
          throw new Error(
            `Non-deterministic verification count for ${def.id} (${behaviorProfileId}): ${count} !== ${verificationCount}`,
          );
        }
        const sampledHeapDeltaBytes = afterHeap - beforeHeap;
        wallSamples.push(wallMs);
        heapSamples.push(sampledHeapDeltaBytes);
        measurements.push({
          wallMs,
          sampledHeapDeltaBytes,
        });
      }

      results.push({
        id: def.id,
        category: def.category,
        verificationCount,
        firstUseWallMs,
        measurements,
        median: {
          wallMs: median(wallSamples),
          sampledHeapDeltaBytes: medianInteger(heapSamples),
        },
      });
    }

    return {
      behaviorProfileId,
      nodeVersion: process.version,
      results,
    };
  } finally {
    if (ownsFixtures) {
      fixtures.cleanup();
    }
  }
};

export const resolveDefaultJavaClasspath = () => {
  if (process.env.OWLAPI_JAVA_CLASSPATH) {
    return process.env.OWLAPI_JAVA_CLASSPATH;
  }
  const distJar =
    "C:/Users/maksy/GitHub/owlcs/owlapi/distribution/target/owlapi-distribution-5.5.1.jar";
  const runtimeCpFile =
    "C:/Users/maksy/GitHub/owlcs/owlapi/distribution/target/owlapi-runtime-classpath.txt";
  if (fs.existsSync(distJar) && fs.existsSync(runtimeCpFile)) {
    return [distJar, fs.readFileSync(runtimeCpFile, "utf8").trim()].join(
      path.delimiter,
    );
  }
  throw new Error(
    "Unable to resolve Java OWLAPI 5.5.1 classpath. Set OWLAPI_JAVA_CLASSPATH or build owlapi-distribution-5.5.1.jar.",
  );
};

export const runJavaBenchmarks = ({
  warmupCount = 1,
  runCount = 3,
  filterIds = null,
  sharedFixtures = null,
  classpath = resolveDefaultJavaClasspath(),
  sourcePath = DEFAULT_JAVA_SOURCE_PATH,
} = {}) => {
  const ownsFixtures = !sharedFixtures;
  const fixtures = sharedFixtures ?? prepareSharedFixtureDirectory();
  const outputDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "owlapi-java-surface-bench-"),
  );

  try {
    const specPath = path.join(outputDirectory, "spec.json");
    fs.writeFileSync(
      specPath,
      JSON.stringify({
        warmupCount,
        runCount,
        fixturesDirectory: fixtures.fixturesDir,
        filterIds: filterIds ?? [],
        importClosure: {
          rootIRI: fixtures.importClosure.rootIRI,
          files: fixtures.importClosure.files,
        },
      }),
      "utf8",
    );

    const observation = runJavaObservation({
      outputDirectory,
      classpath,
      sourcePath,
      arguments: [specPath],
    });
    if (observation.status !== 0) {
      throw new Error(
        `Java benchmark execution failed (status ${observation.status}):\n${observation.stderr}`,
      );
    }
    const parsed = JSON.parse(observation.stdout.trim());
    const categoryById = new Map(
      BENCHMARK_DEFINITIONS.map((def) => [def.id, def.category]),
    );
    return {
      javaVersion: parsed.javaVersion,
      javaVmName: parsed.javaVmName,
      owlapiVersion: parsed.owlapiVersion,
      results: parsed.results.map((row) => ({
        ...row,
        category: categoryById.get(row.id) ?? "Other",
      })),
    };
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
    if (ownsFixtures) {
      fixtures.cleanup();
    }
  }
};

export const loadJavaBaseline = (baselinePath = DEFAULT_JAVA_BASELINE_PATH) => {
  if (!fs.existsSync(baselinePath)) {
    throw new Error(
      `Pinned Java OWLAPI baseline file not found at ${baselinePath}. Run with --refresh-java-baseline to create it for this OWLAPI release.`,
    );
  }
  const parsed = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.results)) {
    throw new Error(
      `Invalid Java OWLAPI baseline format in ${baselinePath}: expected a results array.`,
    );
  }
  return {
    schemaVersion: parsed.schemaVersion ?? 1,
    owlapiRelease: parsed.owlapiRelease ?? "5.5.1",
    fixtureGeneratorVersion:
      parsed.fixtureGeneratorVersion ?? GENERATOR_VERSION,
    parameters: parsed.parameters ?? { warmupCount: 2, runCount: 5 },
    javaVersion: parsed.environment?.javaVersion ?? parsed.javaVersion,
    javaVmName: parsed.environment?.javaVmName ?? parsed.javaVmName,
    owlapiVersion: parsed.environment?.owlapiVersion ?? parsed.owlapiVersion,
    platform:
      parsed.environment?.platform ?? `${process.platform}-${process.arch}`,
    results: parsed.results,
  };
};

export const findMissingJavaBaselineIds = (
  javaBaseline,
  targetIds = BENCHMARK_DEFINITIONS.map((def) => def.id),
) => {
  const existingIds = new Set(
    (javaBaseline?.results ?? []).map((row) => row.id),
  );
  return targetIds.filter((id) => !existingIds.has(id));
};

export const mergeJavaBaselineResults = (existingBaseline, newJavaSuite) => {
  const defById = new Map(BENCHMARK_DEFINITIONS.map((def) => [def.id, def]));
  const existingById = new Map(
    (existingBaseline?.results ?? []).map((row) => [row.id, row]),
  );
  for (const newRow of newJavaSuite?.results ?? []) {
    if (!existingById.has(newRow.id)) {
      const def = defById.get(newRow.id);
      existingById.set(newRow.id, {
        id: newRow.id,
        category: def?.category ?? newRow.category ?? "Other",
        apiSymbols: def?.apiSymbols ?? newRow.apiSymbols ?? [],
        description: def?.description ?? newRow.description ?? "",
        verificationCount: newRow.verificationCount,
        firstUseWallMs: newRow.firstUseWallMs,
        median: {
          wallMs: newRow.median.wallMs,
          retainedHeapDeltaBytes: newRow.median.retainedHeapDeltaBytes,
        },
      });
    }
  }

  const orderedIds = [
    ...BENCHMARK_DEFINITIONS.map((def) => def.id).filter((id) =>
      existingById.has(id),
    ),
    ...[...existingById.keys()].filter((id) => !defById.has(id)),
  ];

  return {
    schemaVersion: 1,
    owlapiRelease: existingBaseline?.owlapiRelease ?? "5.5.1",
    fixtureGeneratorVersion:
      existingBaseline?.fixtureGeneratorVersion ?? GENERATOR_VERSION,
    parameters: existingBaseline?.parameters ?? {
      warmupCount: 2,
      runCount: 5,
      syntaxCount: 100,
      importClosureCount: 8,
    },
    environment: {
      platform:
        existingBaseline?.platform ??
        existingBaseline?.environment?.platform ??
        `${process.platform}-${process.arch}`,
      javaVersion:
        existingBaseline?.javaVersion ??
        existingBaseline?.environment?.javaVersion ??
        newJavaSuite?.javaVersion,
      javaVmName:
        existingBaseline?.javaVmName ??
        existingBaseline?.environment?.javaVmName ??
        newJavaSuite?.javaVmName,
      owlapiVersion:
        existingBaseline?.owlapiVersion ??
        existingBaseline?.environment?.owlapiVersion ??
        newJavaSuite?.owlapiVersion,
    },
    results: orderedIds.map((id) => existingById.get(id)),
  };
};

export const writeJavaBaseline = async (
  baselineData,
  baselinePath = DEFAULT_JAVA_BASELINE_PATH,
) => {
  const prettierBase = (await resolveConfig(
    path.join(REPO_ROOT, "package.json"),
  )) ?? { endOfLine: "lf" };
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  const formattedJson = await prettierFormat(JSON.stringify(baselineData), {
    ...prettierBase,
    parser: "json-stringify",
  });
  fs.writeFileSync(
    baselinePath,
    formattedJson.replaceAll("\r\n", "\n"),
    "utf8",
  );
};

export const resolveJavaBaselineSuite = async ({
  javaBaselinePath = DEFAULT_JAVA_BASELINE_PATH,
  filterIds = null,
  updateMissingJavaBaseline = false,
  refreshJavaBaseline = false,
  warmupCount = 2,
  runCount = 5,
  syntaxCount = 100,
  importClosureCount = 8,
  sharedFixtures = null,
  runJava = runJavaBenchmarks,
} = {}) => {
  const targetIds =
    filterIds && filterIds.length > 0
      ? filterIds
      : BENCHMARK_DEFINITIONS.map((def) => def.id);

  if (refreshJavaBaseline) {
    const freshJava = runJava({
      warmupCount,
      runCount,
      filterIds: null,
      sharedFixtures,
    });
    const fullBaseline = mergeJavaBaselineResults(
      {
        owlapiRelease: "5.5.1",
        fixtureGeneratorVersion: GENERATOR_VERSION,
        parameters: {
          warmupCount,
          runCount,
          syntaxCount,
          importClosureCount,
        },
        javaVersion: freshJava.javaVersion,
        javaVmName: freshJava.javaVmName,
        owlapiVersion: freshJava.owlapiVersion,
      },
      freshJava,
    );
    await writeJavaBaseline(fullBaseline, javaBaselinePath);
    return loadJavaBaseline(javaBaselinePath);
  }

  const existingBaseline = loadJavaBaseline(javaBaselinePath);
  const missingIds = findMissingJavaBaselineIds(existingBaseline, targetIds);
  if (missingIds.length === 0) {
    return existingBaseline;
  }

  if (!updateMissingJavaBaseline) {
    throw new Error(
      `Pinned Java OWLAPI baseline (${javaBaselinePath}) is missing ${missingIds.length} benchmark ID(s): ${missingIds.join(", ")}. Re-run with --update-missing-java-baseline to profile only the missing API benchmark(s) in Java and append them to the baseline file.`,
    );
  }

  const incrementalJavaSuite = runJava({
    warmupCount: existingBaseline.parameters?.warmupCount ?? warmupCount,
    runCount: existingBaseline.parameters?.runCount ?? runCount,
    filterIds: missingIds,
    sharedFixtures,
  });
  const mergedBaseline = mergeJavaBaselineResults(
    existingBaseline,
    incrementalJavaSuite,
  );
  await writeJavaBaseline(mergedBaseline, javaBaselinePath);
  return loadJavaBaseline(javaBaselinePath);
};

const safeRatio = (numerator, denominator) => {
  return denominator === 0 ? null : numerator / denominator;
};

/** A comparison must account for every requested case exactly once. */
const selectedDefinitions = (filterIds) => {
  if (filterIds === null) return BENCHMARK_DEFINITIONS;
  if (!Array.isArray(filterIds) || !filterIds.length)
    throw new TypeError("Benchmark filter must contain case IDs");
  const known = new Set(BENCHMARK_DEFINITIONS.map(({ id }) => id));
  const seen = new Set();
  for (const id of filterIds) {
    if (!known.has(id)) throw new TypeError(`Unknown benchmark ID: ${id}`);
    if (seen.has(id)) throw new TypeError(`Duplicate benchmark ID: ${id}`);
    seen.add(id);
  }
  return BENCHMARK_DEFINITIONS.filter(({ id }) => seen.has(id));
};

const admittedRows = (suite, definitions, label, runCount) => {
  const rows = new Map();
  const known = new Set(BENCHMARK_DEFINITIONS.map(({ id }) => id));
  for (const row of suite?.results ?? []) {
    if (!known.has(row.id))
      throw new TypeError(`Unknown ${label} benchmark ID: ${row.id}`);
    if (rows.has(row.id))
      throw new TypeError(`Duplicate ${label} benchmark ID: ${row.id}`);
    rows.set(row.id, row);
  }
  if (runCount !== undefined && rows.size > definitions.length)
    throw new TypeError(`Unexpected ${label} rows outside the requested cases`);
  for (const { id } of definitions) {
    const row = rows.get(id);
    if (!row) throw new TypeError(`Missing ${label} benchmark ID: ${id}`);
    for (const value of [
      row.median?.wallMs,
      row.firstUseWallMs,
      row.verificationCount,
    ])
      if (!Number.isFinite(value) || value < 0)
        throw new TypeError(
          `${label} ${id} requires finite nonnegative measurements`,
        );
    if (
      runCount !== undefined &&
      (!Array.isArray(row.measurements) || row.measurements.length !== runCount)
    )
      throw new TypeError(`${label} ${id} requires ${runCount} raw samples`);
    const heapField =
      runCount === undefined
        ? "retainedHeapDeltaBytes"
        : "sampledHeapDeltaBytes";
    if (!Number.isFinite(row.median[heapField]))
      throw new TypeError(
        `${label} ${id} requires a finite ${heapField} median`,
      );
    for (const sample of row.measurements ?? []) {
      if (
        !Number.isFinite(sample.wallMs) ||
        sample.wallMs < 0 ||
        !Number.isFinite(
          runCount === undefined
            ? sample.retainedHeapDeltaBytes
            : sample.sampledHeapDeltaBytes,
        )
      )
        throw new TypeError(`${label} ${id} requires finite raw samples`);
    }
  }
  return rows;
};

const reportedJsRow = (row, javaMedianMs, comparability) => ({
  comparability,
  verificationCount: row.verificationCount,
  firstUseWallMs: row.firstUseWallMs,
  medianWallMs: row.median.wallMs,
  medianSampledHeapDeltaBytes: row.median.sampledHeapDeltaBytes,
  measurements: row.measurements.map((sample) => ({
    wallMs: sample.wallMs,
    sampledHeapDeltaBytes: sample.sampledHeapDeltaBytes,
  })),
  ratioVsJava: safeRatio(row.median.wallMs, javaMedianMs),
  deltaMsVsJava: roundMs(row.median.wallMs - javaMedianMs),
});

export const compareBenchmarkSuites = ({
  javaSuite,
  jsSuites,
  warmupCount,
  runCount,
  filterIds = null,
  syntaxCount = 100,
  importClosureCount = 8,
  javaBaselinePath = "docs/performance/java-owlapi-5.5.1-baseline.json",
}) => {
  const definitions = selectedDefinitions(filterIds);
  const javaById = admittedRows(javaSuite, definitions, "Java");
  const jsCompatById = admittedRows(
    jsSuites["java-owlapi-5.5.1"],
    definitions,
    "compatible JS",
    runCount,
  );
  const jsNormativeById = admittedRows(
    jsSuites["normative-v1"],
    definitions,
    "normative JS",
    runCount,
  );

  const comparisons = [];
  const fixtureMismatch =
    javaSuite.parameters &&
    (javaSuite.fixtureGeneratorVersion !== GENERATOR_VERSION ||
      javaSuite.parameters.syntaxCount !== syntaxCount ||
      javaSuite.parameters.importClosureCount !== importClosureCount);
  const measurementMismatch =
    javaSuite.parameters &&
    (javaSuite.parameters.warmupCount !== warmupCount ||
      javaSuite.parameters.runCount !== runCount);
  for (const def of definitions) {
    const javaRow = javaById.get(def.id);
    const compatRow = jsCompatById.get(def.id);
    const normativeRow = jsNormativeById.get(def.id);
    const javaMedianMs = javaRow.median.wallMs;
    const compatMedianMs = compatRow.median.wallMs;
    const normativeMedianMs = normativeRow.median.wallMs;
    const compatVsJavaRatio = safeRatio(compatMedianMs, javaMedianMs);
    const normativeVsJavaRatio = safeRatio(normativeMedianMs, javaMedianMs);
    const admission = (row) =>
      fixtureMismatch
        ? "fixture-mismatch"
        : measurementMismatch
          ? "measurement-parameters-mismatch"
          : javaMedianMs === 0
            ? "resolution-limited"
            : javaRow.verificationCount !== row.verificationCount
              ? "checksum-mismatch"
              : def.comparisonLimitation
                ? "workload-mismatch"
                : "checksum-only";
    const compatAdmission = admission(compatRow);
    const normativeAdmission = admission(normativeRow);
    const comparability =
      compatAdmission === normativeAdmission
        ? compatAdmission
        : "checksum-mismatch";
    const admittedRatios = [];
    // A different profile's checksum must neither qualify nor conceal this
    // profile's timing. Rank only ratios admitted for their own profile.
    if (compatAdmission === "checksum-only")
      admittedRatios.push(compatVsJavaRatio);
    if (normativeAdmission === "checksum-only")
      admittedRatios.push(normativeVsJavaRatio);
    const maxJsVsJavaRatio = admittedRatios.length
      ? Math.max(...admittedRatios)
      : null;

    comparisons.push({
      id: def.id,
      category: def.category,
      apiSymbols: def.apiSymbols,
      description: def.description,
      ...(def.comparisonLimitation
        ? { comparisonLimitation: def.comparisonLimitation }
        : {}),
      comparability,
      java551: {
        verificationCount: javaRow.verificationCount,
        firstUseWallMs: javaRow.firstUseWallMs,
        medianWallMs: javaMedianMs,
        medianRetainedHeapDeltaBytes: javaRow.median.retainedHeapDeltaBytes,
      },
      jsJavaOwlapi551: reportedJsRow(compatRow, javaMedianMs, compatAdmission),
      jsNormativeV1: reportedJsRow(
        normativeRow,
        javaMedianMs,
        normativeAdmission,
      ),
      maxJsVsJavaRatio,
      slowerInJs: maxJsVsJavaRatio !== null && maxJsVsJavaRatio > 1.1,
    });
  }

  const slowerApisRanked = [...comparisons]
    .filter((entry) => entry.slowerInJs)
    .sort((left, right) => right.maxJsVsJavaRatio - left.maxJsVsJavaRatio);

  const fasterOrParityApis = [...comparisons]
    .filter(
      (entry) => entry.comparability === "checksum-only" && !entry.slowerInJs,
    )
    .sort((left, right) => left.maxJsVsJavaRatio - right.maxJsVsJavaRatio);

  return {
    schemaVersion: 2,
    fixtureGeneratorVersion: GENERATOR_VERSION,
    javaBaselinePath,
    parameters: {
      warmupCount,
      runCount,
      syntaxCount,
      importClosureCount,
      profiles: [...BEHAVIOR_PROFILES],
    },
    environment: {
      nodeVersion:
        jsSuites["java-owlapi-5.5.1"]?.nodeVersion ?? process.version,
      platform: `${process.platform}-${process.arch}`,
      v8Version: process.versions.v8,
      cpuModel: os.cpus()[0]?.model,
      osRelease: os.release(),
      explicitGc: typeof globalThis.gc === "function",
      javaVersion: javaSuite.javaVersion,
      javaVmName: javaSuite.javaVmName,
      javaOwlapiVersion: javaSuite.owlapiVersion,
    },
    summary: {
      totalBenchmarks: comparisons.length,
      slowerInJsCount: slowerApisRanked.length,
      fasterOrParityInJsCount: fasterOrParityApis.length,
      unqualifiedCount: comparisons.filter(
        (entry) => !entry.slowerInJs && entry.comparability !== "checksum-only",
      ).length,
      incompleteComparabilityCount: comparisons.filter(
        (entry) => entry.comparability !== "checksum-only",
      ).length,
      slowerInCompatProfileCount: comparisons.filter(
        (c) =>
          c.jsJavaOwlapi551.comparability === "checksum-only" &&
          c.jsJavaOwlapi551.medianWallMs > c.java551.medianWallMs &&
          c.jsJavaOwlapi551.ratioVsJava > 1.1,
      ).length,
      slowerInNormativeProfileCount: comparisons.filter(
        (c) =>
          c.jsNormativeV1.comparability === "checksum-only" &&
          c.jsNormativeV1.medianWallMs > c.java551.medianWallMs &&
          c.jsNormativeV1.ratioVsJava > 1.1,
      ).length,
    },
    comparisons,
    slowerApisRanked: slowerApisRanked.map((entry, idx) => ({
      rank: idx + 1,
      id: entry.id,
      category: entry.category,
      javaMedianWallMs: entry.java551.medianWallMs,
      jsCompatMedianWallMs: entry.jsJavaOwlapi551.medianWallMs,
      jsCompatVsJavaRatio: entry.jsJavaOwlapi551.ratioVsJava,
      jsCompatAdmission: entry.jsJavaOwlapi551.comparability,
      jsNormativeMedianWallMs: entry.jsNormativeV1.medianWallMs,
      jsNormativeVsJavaRatio: entry.jsNormativeV1.ratioVsJava,
      jsNormativeAdmission: entry.jsNormativeV1.comparability,
      maxJsVsJavaRatio: entry.maxJsVsJavaRatio,
    })),
  };
};

/** Render current observations; historical P1–P9 prose stays in the schema-1 report. */
export const formatComparisonMarkdown = (report) => {
  const ratio = (row) =>
    row.comparability !== "checksum-only"
      ? "unqualified"
      : row.ratioVsJava.toFixed(2) + "x";
  const lines = [
    "# Public API Performance Comparison: JS OWLAPI vs. Java OWLAPI 5.5.1",
    "",
    "These grouped workloads do not exhaustively cover public methods or overloads.",
    "Counts are checksums, not structural equivalence proofs; checksum-only rows remain provisional.",
    "Unqualified rows retain measured times and raw JSON ratios; known unequal work is excluded from parity ranking.",
    "",
    "- Node: " +
      report.environment.nodeVersion +
      "; V8: " +
      report.environment.v8Version,
    "- Warmup/measured calls: " +
      report.parameters.warmupCount +
      "/" +
      report.parameters.runCount,
    "- First-use timing measures a case call inside an initialized suite, not process startup.",
    "- Heap samples measure before/after heap use without post-call GC; they are neither retained nor peak memory.",
    "- Qualified-by-checksum slower groups: " + report.summary.slowerInJsCount,
    "- Qualified-by-checksum parity/faster groups: " +
      report.summary.fasterOrParityInJsCount,
    "- Unqualified groups: " + report.summary.unqualifiedCount,
    "",
    "| Benchmark ID | Java ms | Compatible JS ms | Ratio | Normative JS ms | Ratio | Admission |",
    "| --- | ---: | ---: | ---: | ---: | ---: | --- |",
  ];
  for (const entry of report.comparisons)
    lines.push(
      "| \x60" +
        entry.id +
        "\x60 | " +
        entry.java551.medianWallMs.toFixed(3) +
        " | " +
        entry.jsJavaOwlapi551.medianWallMs.toFixed(3) +
        " | " +
        ratio(entry.jsJavaOwlapi551) +
        " | " +
        entry.jsNormativeV1.medianWallMs.toFixed(3) +
        " | " +
        ratio(entry.jsNormativeV1) +
        " | " +
        entry.comparability +
        " |",
    );
  const limitations = report.comparisons.filter(
    (entry) => entry.comparisonLimitation,
  );
  if (limitations.length)
    lines.push(
      "",
      "Comparison limits:",
      "",
      ...limitations.map(
        (entry) => "- `" + entry.id + "`: " + entry.comparisonLimitation,
      ),
    );
  return lines.join("\n") + "\n";
};

export const runPublicApiParityBenchmarkSuite = async ({
  warmupCount = 2,
  runCount = 5,
  filterIds = null,
  syntaxCount = 100,
  importClosureCount = 8,
  javaBaselinePath = DEFAULT_JAVA_BASELINE_PATH,
  updateMissingJavaBaseline = false,
  refreshJavaBaseline = false,
  runJava = runJavaBenchmarks,
} = {}) => {
  selectedDefinitions(filterIds);
  for (const [name, value, minimum] of [
    ["warmupCount", warmupCount, 0],
    ["runCount", runCount, 1],
    ["syntaxCount", syntaxCount, 1],
    ["importClosureCount", importClosureCount, 1],
  ])
    if (!Number.isSafeInteger(value) || value < minimum)
      throw new TypeError(name + " is invalid");
  const sharedFixtures = prepareSharedFixtureDirectory({
    syntaxCount,
    importClosureCount,
  });
  try {
    const javaSuite = await resolveJavaBaselineSuite({
      javaBaselinePath,
      filterIds,
      updateMissingJavaBaseline,
      refreshJavaBaseline,
      warmupCount,
      runCount,
      syntaxCount,
      importClosureCount,
      sharedFixtures,
      runJava,
    });
    const jsSuites = {};
    for (const profileId of BEHAVIOR_PROFILES) {
      jsSuites[profileId] = await runJsProfileBenchmarks(profileId, {
        warmupCount,
        runCount,
        filterIds,
        sharedFixtures,
      });
    }
    const relativeBaselinePath = path
      .relative(REPO_ROOT, javaBaselinePath)
      .replaceAll("\\", "/");
    const report = compareBenchmarkSuites({
      javaSuite,
      jsSuites,
      warmupCount,
      runCount,
      javaBaselinePath: relativeBaselinePath,
      filterIds,
      syntaxCount,
      importClosureCount,
    });
    const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
    const baselineBytes = fs.readFileSync(javaBaselinePath);
    const fixtureBytes = JSON.stringify({
      syntaxTexts: sharedFixtures.syntaxTexts,
      closure: Object.entries(sharedFixtures.importClosure.files).map(
        ([iri, filename]) => [iri, fs.readFileSync(filename, "utf8")],
      ),
    });
    const runtimeSources = [];
    const visit = (relative) => {
      const absolute = path.join(REPO_ROOT, relative);
      for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
        const filename = `${relative}/${entry.name}`;
        if (entry.isDirectory()) visit(filename);
        else if (entry.name.endsWith(".js") && !entry.name.endsWith(".test.js"))
          runtimeSources.push([
            filename,
            digest(fs.readFileSync(path.join(REPO_ROOT, filename))),
          ]);
      }
    };
    for (const directory of [
      "apibinding",
      "formats",
      "internal",
      "io",
      "model",
      "search",
      "profiles",
      "util",
      "modularity",
      "manchestersyntax",
    ])
      visit(directory);
    runtimeSources.sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    report.provenance = {
      javaBaselineSha256: digest(baselineBytes),
      javascriptHarnessSha256: digest(
        fs.readFileSync(fileURLToPath(import.meta.url)),
      ),
      javaHarnessSha256: digest(fs.readFileSync(DEFAULT_JAVA_SOURCE_PATH)),
      fixtureGeneratorSha256: digest(
        fs.readFileSync(
          path.join(MODULE_DIR, "generate-owlapi-benchmark-fixtures.cjs"),
        ),
      ),
      fixtureSha256: digest(fixtureBytes),
      runtimeSourcesSha256: digest(JSON.stringify(runtimeSources)),
      recordedAt: new Date().toISOString(),
      semanticQualification:
        "Counts alone cannot qualify structural equivalence; see the coverage and comparability manifest.",
      legacyJavaMemoryMeaning:
        "Historical schema-1 heap delta; no peak or retained-memory claim is admitted.",
      javascriptTimingMeaning:
        "Raw performance.now() differences and medians retain API precision; Markdown display rounding is separate. Earlier recordings may have rounded samples to three decimal milliseconds.",
    };
    return report;
  } finally {
    sharedFixtures.cleanup();
  }
};

/** Strict native argument parsing prevents accidental all-case or invalid runs. */
export const parseCliArgs = (argv) => {
  const types = {
    warmup: "string",
    runs: "string",
    filter: "string",
    "java-baseline": "string",
    "update-missing-java-baseline": "boolean",
    "refresh-java-baseline": "boolean",
    output: "string",
    "markdown-output": "string",
  };
  const { values, tokens } = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: false,
    tokens: true,
    options: Object.fromEntries(
      Object.entries(types).map(([name, type]) => [name, { type }]),
    ),
  });
  const seen = new Set();
  for (const { name } of tokens) {
    if (seen.has(name)) throw new TypeError("Duplicate option: --" + name);
    seen.add(name);
  }
  const integer = (name, fallback, minimum) => {
    const value = values[name];
    if (value === undefined) return fallback;
    if (
      !/^\d+$/.test(value) ||
      !Number.isSafeInteger(Number(value)) ||
      Number(value) < minimum
    )
      throw new TypeError(name + " must be a safe integer >= " + minimum);
    return Number(value);
  };
  const filterIds =
    values.filter === undefined
      ? null
      : values.filter.split(",").map((value) => value.trim());
  selectedDefinitions(filterIds);
  if (values["refresh-java-baseline"] && values["update-missing-java-baseline"])
    throw new TypeError(
      "Java refresh and missing-only update are mutually exclusive",
    );
  const output = (name, fallback = null) => {
    if (values[name] === undefined) return fallback;
    if (!values[name].trim())
      throw new TypeError(name + " requires a nonempty path");
    return path.resolve(REPO_ROOT, values[name]);
  };
  return {
    warmupCount: integer("warmup", 2, 0),
    runCount: integer("runs", 5, 1),
    filterIds,
    javaBaselinePath: output("java-baseline", DEFAULT_JAVA_BASELINE_PATH),
    updateMissingJavaBaseline: values["update-missing-java-baseline"] ?? false,
    refreshJavaBaseline: values["refresh-java-baseline"] ?? false,
    outputPath: output("output"),
    markdownOutputPath: output("markdown-output"),
  };
};

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const cliOptions = parseCliArgs(process.argv.slice(2));
  const report = await runPublicApiParityBenchmarkSuite(cliOptions);
  const prettierBase = (await resolveConfig(
    path.join(REPO_ROOT, "package.json"),
  )) ?? { endOfLine: "lf" };

  if (cliOptions.outputPath) {
    fs.mkdirSync(path.dirname(cliOptions.outputPath), { recursive: true });
    const formattedJson = await prettierFormat(JSON.stringify(report), {
      ...prettierBase,
      parser: "json-stringify",
    });
    fs.writeFileSync(
      cliOptions.outputPath,
      formattedJson.replaceAll("\r\n", "\n"),
      "utf8",
    );
  }

  if (cliOptions.markdownOutputPath) {
    fs.mkdirSync(path.dirname(cliOptions.markdownOutputPath), {
      recursive: true,
    });
    const rawMarkdown = formatComparisonMarkdown(report);
    const formattedMarkdown = await prettierFormat(rawMarkdown, {
      ...prettierBase,
      parser: "markdown",
    });
    fs.writeFileSync(
      cliOptions.markdownOutputPath,
      formattedMarkdown.replaceAll("\r\n", "\n"),
      "utf8",
    );
  }

  if (!cliOptions.outputPath && !cliOptions.markdownOutputPath) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(
      `Completed ${report.summary.totalBenchmarks} public API parity benchmarks (${report.summary.slowerInJsCount} slower in JS, ${report.summary.fasterOrParityInJsCount} at parity or faster in JS).\n`,
    );
  }
}
