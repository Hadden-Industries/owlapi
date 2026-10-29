import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { format as formatWithPrettier } from "prettier";
import { publicMembers } from "./public-api-members.mjs";

import * as apibinding from "../apibinding/index.js";
import * as formats from "../formats/index.js";
import * as io from "../io/index.js";
import * as nodeIo from "../io/node/index.js";
import * as model from "../model/index.js";
import * as profiles from "../profiles/index.js";
import * as util from "./index.js";
import * as parameters from "../model/parameters/index.js";
import * as search from "../search/index.js";
import * as renderer from "../manchestersyntax/renderer/index.js";
import * as locality from "../modularity/locality/index.js";

// Planned first-public-release target for additions since published rc.2.
// This is neither a publication claim nor selection/approval of a candidate.
const ROADMAP_PUBLIC_RELEASE_TARGET = "0.1.0-rc.3";
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_JAVA_REVISION = JSON.parse(
  await readFile(
    new URL(
      "../docs/compatibility/profiles/java-owlapi-5.5.1/provenance.json",
      import.meta.url,
    ),
    "utf8",
  ),
).upstream.commit.commitObjectId;
const JAVA_PACKAGE_SOURCE_SUFFIX = join(
  "src",
  "main",
  "java",
  "org",
  "semanticweb",
  "owlapi",
);
const REGISTRY_PATH = join(
  PACKAGE_ROOT,
  "docs",
  "compatibility",
  "java-api-surface.json",
);
const COMPATIBILITY_VIEW_PATH = join(
  PACKAGE_ROOT,
  "docs",
  "compatibility",
  "java-api-surface.md",
);
const API_VIEW_PATH = join(PACKAGE_ROOT, "API.md");

const LIFECYCLE_STORER_CAPABILITY_BY_JAVA_TYPE = Object.freeze({
  "org.semanticweb.owlapi.functional.renderer.FunctionalSyntaxStorer":
    "storer.functional",
  "org.semanticweb.owlapi.rdf.rdfxml.renderer.RDFXMLStorer": "storer.rdfxml",
  "org.semanticweb.owlapi.rdf.turtle.renderer.TurtleStorer": "storer.turtle",
  "org.semanticweb.owlapi.owlxml.renderer.OWLXMLStorer": "storer.owlxml",
});

// The accepted member inventory owns these additions; no name heuristic may
// imply unsupported visitors, streams, reasoners or constructor overloads.
const rc2Binding = (
  javaType,
  sourceModule,
  capabilityId,
  callShapes,
  summary,
  omittedMembers,
  semanticQualifications,
  verification,
) => ({
  javaType,
  sourceModule,
  capabilityIds: [capabilityId],
  relationship: "JS_ADAPTATION",
  firstPublicReleaseTarget: "0.1.0-rc.2",
  callShapes,
  summary,
  omittedMembers,
  semanticQualifications: [
    "Selected members and omissions are governed by docs/plans/0.1.0-rc.2-java-parity-baseline.md. Unlisted Java members are unavailable.",
    ...semanticQualifications,
  ],
  verification: [...verification, "test/package-boundary.test.mjs"],
});
const RC2_BINDING_METADATA = Object.freeze({
  LocalityClass: rc2Binding(
    "org.semanticweb.owlapi.modularity.locality.LocalityClass",
    "modularity/locality/localityClass.js",
    "modularity.syntactic-locality",
    ["LocalityClass.BOTTOM / LocalityClass.TOP / LocalityClass.STAR"],
    "Frozen selected syntactic-locality modes.",
    ["Java enum reflection helpers"],
    [
      "BOTTOM and TOP retain the pinned public Java evaluator semantics. STAR alternates shrinking modules to a fixed point.",
    ],
    ["modularity/locality/locality.test.js"],
  ),
  SyntacticLocalityModuleExtractor: rc2Binding(
    "org.semanticweb.owlapi.modularity.locality.SyntacticLocalityModuleExtractor",
    "modularity/locality/syntacticLocalityModuleExtractor.js",
    "modularity.syntactic-locality",
    [
      "new SyntacticLocalityModuleExtractor(localityClass, axiomIterable)",
      "extractor.axiomBase()",
      "extractor.containsAxiom(axiom)",
      "extractor.getLocalityClass()",
      "await extractor.extract(seedIterable, filter?, options?)",
    ],
    "Captured structural axiom base and asynchronous eager syntactic-locality modules.",
    [
      "extractAsOntology",
      "globals / tautologies / everyModuleContains / noModuleContains",
      "Reasoner-backed and legacy extractors",
    ],
    [
      "Constructor captures immutable axioms; returned arrays are defensive. Filter executes synchronously before propagation. Absent original-base seeds reject with TypeError. STAR retains the original entity index.",
      "Owner decision of 2026-10-09 follows Java's lack of numerical caps. maxWork, maxAxioms, maxDepth, maxAnnotationDepth and timeoutMs default to null and accept optional caller limits; one shared work/deadline budget spans all extraction phases and STAR passes. signal cancellation and limit exhaustion reject without partial output.",
    ],
    ["modularity/locality/locality.test.js"],
  ),
  ...Object.fromEntries(
    [
      "AddAxiom",
      "RemoveAxiom",
      "AddImport",
      "RemoveImport",
      "RemoveOntologyAnnotation",
    ].map((name) => {
      const argument = name.endsWith("Axiom")
        ? "axiom"
        : name.endsWith("Import")
          ? "importsDeclaration"
          : "annotation";
      const file = name[0].toLowerCase() + name.slice(1);
      return [
        name,
        rc2Binding(
          `org.semanticweb.owlapi.model.${name}`,
          `model/${file}.js`,
          "manager.atomic-changes",
          [`new ${name}(ontology, ${argument})`],
          "An immutable nominal change record consumed by the manager's selected behavior profile.",
          ["Change-data serialization, visitors and inverse-change protocols"],
          [
            "Records retain canonical ontology identity and validated immutable structural values. normative-v1 validates and commits a complete batch atomically with a boolean result; java-owlapi-5.5.1 applies changes sequentially and returns ChangeApplied. Mixed behavior profiles reject before application. Import changes reconcile only loaded state and never acquire documents.",
          ],
          ["model/rc2Changes.test.js"],
        ),
      ];
    }),
  ),
  ...Object.fromEntries(
    ["Imports", "AxiomAnnotations"].map((name) => [
      name,
      rc2Binding(
        `org.semanticweb.owlapi.model.parameters.${name}`,
        "model/parameters/index.js",
        "ontology.java-parity-queries",
        [
          name === "Imports"
            ? "Imports.EXCLUDED / Imports.INCLUDED"
            : "AxiomAnnotations.CONSIDER_AXIOM_ANNOTATIONS / AxiomAnnotations.IGNORE_AXIOM_ANNOTATIONS",
        ],
        "Frozen explicit query policy values with Java-shaped names.",
        ["Java enum instance methods"],
        [
          "Omitted imports scope retains direct-only behavior. Only selected scope-bearing overloads accept these values; named axiom index accessors stay direct-only.",
        ],
        ["model/rc2Queries.test.js"],
      ),
    ]),
  ),
  EntitySearcher: rc2Binding(
    "org.semanticweb.owlapi.search.EntitySearcher",
    "search/entitySearcher.js",
    "search.entity-searcher",
    [
      "EntitySearcher.getSuperClasses(entity, ontologyOrIterable)",
      "EntitySearcher.getAnnotations(subject, ontology, property?)",
      "Selected static methods documented in the baseline",
    ],
    "Asserted entity and annotation searches over explicitly supplied ontologies.",
    ["All unselected search methods and Java Stream protocols"],
    [
      "Java Stream results are single-use lazy iterables in both behavior profiles. They read current ontology state on consumption and preserve multiplicity, including repeated ontology inputs and annotated variants. Boolean searches remain eager. Search never expands imports implicitly. Selected ontology iterable overloads retain their native property-filter requirements. getDisjointClasses retains the queried operand; getEquivalentClasses excludes it.",
    ],
    ["search/entitySearcher.test.js", "search/nativeSearch.test.js"],
  ),
  OWLObjectDuplicator: rc2Binding(
    "org.semanticweb.owlapi.util.OWLObjectDuplicator",
    "util/owlObjectDuplicator.js",
    "util.object-transforms",
    [
      "new OWLObjectDuplicator(manager)",
      "new OWLObjectDuplicator(entityIRIMap, manager)",
      "new OWLObjectDuplicator(entityIRIMap, literalMap, manager)",
      "new OWLObjectDuplicator(manager, iriMap)",
      "duplicator.duplicateObject(object)",
    ],
    "Canonical factory reconstruction with captured structural maps and instance-owned anonymous remapping.",
    [
      "Explicit RemappingIndividualProvider constructors",
      "Public visitor methods",
      "Ontology, ID, import-declaration and SWRL duplication",
    ],
    [
      "Map entries are copied and structural values validated before capture. Typed entity replacement differs from IRI-wide replacement. Repeated anonymous inputs share one new identity within a duplicator; different instances have distinct anonymous scopes. Structural limits reject incomplete reconstruction.",
    ],
    ["util/rc2Transforms.test.js"],
  ),
  OWLEntityRenamer: rc2Binding(
    "org.semanticweb.owlapi.util.OWLEntityRenamer",
    "util/owlEntityRenamer.js",
    "util.object-transforms",
    [
      "new OWLEntityRenamer(manager, ontologyIterable)",
      "renamer.changeIRI(entityOrIRI, iri)",
      "renamer.changeIRI(entityIRIMap)",
    ],
    "Proposes changes from captured ontologies and current committed snapshots without applying them.",
    ["Unselected visitor and Stream overloads"],
    [
      "Returns defensive eager arrays. Typed entities preserve punning distinctions; IRI-wide replacement includes all selected typed references and relevant annotation positions. Reconstruction preserves anonymous identity.",
    ],
    ["util/rc2Transforms.test.js"],
  ),
  OWLEntityRemover: rc2Binding(
    "org.semanticweb.owlapi.util.OWLEntityRemover",
    "util/owlEntityRemover.js",
    "util.object-transforms",
    [
      "new OWLEntityRemover(ontologyOrIterable)",
      "remover.visit(entity)",
      "remover.getChanges()",
      "remover.reset()",
    ],
    "Collects direct removal proposals for the six named entity kinds.",
    [
      "Structural accept(visitor) protocol",
      "Implicit application and recursive deletion",
    ],
    [
      "Direct visit is the approved visitor adaptation. Selected ontology identities are captured; repeated visits append proposals and getChanges returns a fresh array. reset clears collected proposals.",
    ],
    ["util/rc2Transforms.test.js"],
  ),
  SimpleShortFormProvider: rc2Binding(
    "org.semanticweb.owlapi.util.SimpleShortFormProvider",
    "util/simpleShortFormProvider.js",
    "util.short-form-providers",
    [
      "new SimpleShortFormProvider()",
      "provider.getShortForm(entity)",
      "provider.dispose()",
    ],
    "A synchronous Java-shaped entity short form provider.",
    ["Java serialization"],
    [
      "Uses the observed NCName suffix, with angle-bracketed full IRI fallback. dispose is a no-op.",
    ],
    ["util/shortFormProviders.test.js"],
  ),
  AnnotationValueShortFormProvider: rc2Binding(
    "org.semanticweb.owlapi.util.AnnotationValueShortFormProvider",
    "util/annotationValueShortFormProvider.js",
    "util.short-form-providers",
    [
      "new AnnotationValueShortFormProvider(properties, preferredLanguageMap, ontologySetProvider, alternateProvider?)",
      "provider.getShortForm(entity)",
    ],
    "Uses captured annotation and language preferences with explicitly supplied live ontology snapshots.",
    [
      "Custom IRIShortFormProvider constructor",
      "setLiteralRenderer(StringAnnotationVisitor)",
    ],
    [
      "The ontology-set provider and short-form callbacks are synchronous. Property and language preferences are copied; getters return defensive copies. Label selection observes the approved native preference order and fallback.",
    ],
    ["util/shortFormProviders.test.js"],
  ),
  ManchesterOWLSyntaxOWLObjectRendererImpl: rc2Binding(
    "org.semanticweb.owlapi.manchestersyntax.renderer.ManchesterOWLSyntaxOWLObjectRendererImpl",
    "manchestersyntax/renderer/manchesterOWLSyntaxOWLObjectRendererImpl.js",
    "renderer.manchester",
    [
      "new ManchesterOWLSyntaxOWLObjectRendererImpl()",
      "renderer.render(object)",
      "renderer.setShortFormProvider(provider)",
    ],
    "Plain Manchester text for the selected complete structural-kind inventory.",
    ["Short aliases", "Ontology storage", "HTML and DOM rendering"],
    [
      "Validates canonical input before invoking a captured synchronous provider. Preserves observed Java precedence, whitespace and annotation behavior; anonymous names are compared through one consistent bijection. The immutable behaviorProfileId selects resource defaults: normative-v1 uses explicit output/depth budgets and java-owlapi-5.5.1 adds no such finite defaults.",
    ],
    ["manchestersyntax/renderer/renderer.test.js"],
  ),
  ...Object.fromEntries(
    ["EL", "QL", "RL"].map((profile) => [
      `OWL2${profile}Profile`,
      rc2Binding(
        `org.semanticweb.owlapi.profiles.OWL2${profile}Profile`,
        `profiles/owl2${profile}Profile.js`,
        `profiles.owl2-${profile.toLowerCase()}`,
        [
          `new OWL2${profile}Profile()`,
          "await profile.checkOntology(ontology, options?)",
        ],
        `An asynchronous bounded OWL 2 ${profile} structural checker over the managed import closure.`,
        [
          "Java visitor classes",
          "getDatatypeIRIs()",
          "Stream and Collection overloads",
        ],
        [
          "Reuses the formal report and separate source-assessment protocol. Complete structural validation, global constraints and profile-specific grammar share one work budget; incomplete validation is unverified. Native discrepancies require separately accepted bounded decisions.",
        ],
        ["profiles/rc2Profiles.test.js"],
      ),
    ]),
  ),
});

// These approved adaptations must not inherit the OWL-name heuristic: a native
// Error suffix, private atomic target state, and io ownership differ from Java.
const PARITY_BINDING_METADATA = Object.freeze({
  ...RC2_BINDING_METADATA,
  RDFXMLDocumentFormat: {
    javaType: "org.semanticweb.owlapi.formats.RDFXMLDocumentFormat",
    sourceModule: "formats/rdfXMLDocumentFormat.js",
    capabilityIds: ["writer.rdfxml-configuration"],
    relationship: "JAVA_ANALOGUE",
    callShapes: ["new RDFXMLDocumentFormat()"],
    summary:
      "Java-backed RDF/XML format with bounded inherited prefix operations and captured save-time preferences.",
    firstPublicReleaseTarget: "0.1.0-rc.2",
    omittedMembers: [
      "Prefix comparator, prefix IRI conversion and Stream overloads",
      "setPrefixManager and standalone PrefixManager/PrefixDocumentFormat exports",
    ],
    semanticQualifications: [
      "Prefix methods use Java names. getPrefixName2PrefixMap and getPrefixNames return defensive Map/Set copies. copyPrefixesFrom accepts a native RDFXMLDocumentFormat or Map and validates the complete copy before mutation. Missing prefixes return null.",
      "Instances have frozen public identity and mutable private prefixes. Shared OWLDocumentFormats constants remain immutable. Loaded RDF/XML prefixes are retained in immutable source metadata; getOntologyFormat returns a cached independently mutable format without altering historical parse evidence.",
      "Existing withParameter and withOntologyLoaderMetaData adaptations preserve concrete format type and copy prefixes. RDF/XML honors only the Java parameter force xsd:string on literals, accepting booleans with false default. Each save captures private prefix/parameter values before suspension.",
      "Default namespaces determine xml:base following Java's trailing-hash rule. Explicit unused mappings are retained; declarations sort by prefix length then lexical order. No Java runtime renderer class or custom formatting profile is exported.",
    ],
    verification: [
      "formats/rdfXMLDocumentFormat.test.js",
      "test/package-boundary.test.mjs",
    ],
  },
  OWLOntologyWriterConfiguration: {
    javaType: "org.semanticweb.owlapi.model.OWLOntologyWriterConfiguration",
    sourceModule: "model/owlOntologyWriterConfiguration.js",
    capabilityIds: ["writer.rdfxml-configuration"],
    relationship: "JS_ADAPTATION",
    callShapes: ["new OWLOntologyWriterConfiguration()"],
    summary:
      "Immutable native writer settings with profile-specific copy behavior and format-specific consumers.",
    firstPublicReleaseTarget: "0.1.0-rc.2",
    omittedMembers: [
      "shouldRemapAllAnonymousIndividualsIds / withRemapAllAnonymousIndividualsIds",
      "isUseNamespaceEntities / withUseNamespaceEntities",
      "shouldOutputNamedGraphIRI / withNamedGraphIRIEnabled",
    ],
    semanticQualifications: [
      "Defaults: isIndenting true, getIndentSize 4, shouldUseBanners true, isLabelsAsBanner false, shouldSaveIdsForAllAnonymousIndividuals false. normative-v1 copies preserve unrelated fields. Java no-op setters retain identity; changed copies reset indent size and banners while preserving labels-as-banner before applying the requested value.",
      "withIndentSize accepts Java int values in java-owlapi-5.5.1, including negative values, and nonnegative Java int values in normative-v1. The setting is consumed by the selected format at save time.",
      "Java RDF/XML consumes indentation, banners, labels and anonymous ID settings; OWL/XML consumes indentation, Turtle consumes banners and anonymous ID settings, and Functional Syntax ignores the presentation controls. Each selected behavior is tested at the real save boundary.",
      "Labels use lexical ordering of language, label text, then datatype, with IRI fallback. XML comment sanitization affects presentation only; labels remain unchanged RDF literals. No-language labels sort first.",
      "normative-v1 retains the documented 32 MiB UTF-8 output and depth budgets. java-owlapi-5.5.1 adds no finite output or structure-depth defaults. Resource exhaustion is a distinct error rather than malformed ontology output.",
      "Attach to the actual output manager using setOntologyWriterConfiguration, which returns undefined. Each save captures private immutable state before suspension; no live getter or global preferences are read.",
    ],
    verification: [
      "model/owlOntologyWriterConfiguration.test.js",
      "internal/storage/rdfxml/rdfXmlGraphWriter.test.js",
      "test/package-boundary.test.mjs",
    ],
  },
  OWL2DLProfile: {
    javaType: "org.semanticweb.owlapi.profiles.OWL2DLProfile",
    sourceModule: "profiles/owl2DLProfile.js",
    capabilityIds: ["profiles.owl2-dl-source-assessment"],
    relationship: "JS_ADAPTATION",
    callShapes: [
      "new OWL2DLProfile()",
      "await profile.checkOntology(ontology, options?)",
    ],
    summary:
      "An asynchronous OWL 2 DL checker over the managed import closure, with profile-owned defaults and a separate source-qualified assessment.",
    omittedMembers: [
      "Java visitor implementation classes",
      "getDatatypeIRIs()",
      "Stream and Collection overloads",
    ],
    semanticQualifications: [
      "Returns a Promise and supports cooperative cancellation and resource limits; incomplete validation is unverified, never valid.",
      "The formal verdict applies to the structural OWL closure. Optional sourceAssessment also validates retained RDF/RDFS structures and parsed expressions before consumer filtering.",
      "Only trusted original source arity and unambiguous typed use qualify the two documented normalization/declaration differences; mutation invalidates that evidence.",
      "normative-v1 uses the accepted OWL datatype/constraint contracts. java-owlapi-5.5.1 uses the released Java datatype patterns, facets, constraint scope and exclusions. An explicitly selected checker profile must match the ontology; omission binds the ontology's immutable identity.",
    ],
    verification: [
      "profiles/owl2DLProfile.test.js",
      "model/rdfsSourcePreservation.test.js",
      "model/sourcePropertyRoles.test.js",
      "internal/profiles/datatypes.test.js",
      "test/package-boundary.test.mjs",
    ],
  },
  OWLProfileReport: {
    javaType: "org.semanticweb.owlapi.profiles.OWLProfileReport",
    sourceModule: "profiles/owlProfileReport.js",
    capabilityIds: ["profiles.owl2-dl-source-assessment"],
    relationship: "JS_ADAPTATION",
    callShapes: ["await new OWL2DLProfile().checkOntology(ontology, options?)"],
    summary:
      "An immutable checker result separating valid, invalid and unverified outcomes, with stable violation records and optional source assessment.",
    omittedMembers: [
      "Java violation class hierarchy",
      "Java stream/visitor overloads",
      "Java constructor overloads",
    ],
    semanticQualifications: [
      "isInProfile() returns true only for a completed valid formal check and throws ResourceLimitError for incomplete resource-limited validation. Exhaustion is not an invalid-ontology verdict. getSourceAssessment() returns the separately stated source-qualified verdict when requested.",
      "Violations are immutable data records rather than Java visitor objects. getOntology() and getProfile() retain their input identities.",
      "Additional status, closure revisions, unverifiedChecks and sourceAssessment fields expose bounded JavaScript validation evidence; direct construction does not execute validation.",
    ],
    verification: [
      "profiles/owl2DLProfile.test.js",
      "test/package-boundary.test.mjs",
    ],
  },
  StringDocumentTarget: {
    javaType: "org.semanticweb.owlapi.io.StringDocumentTarget",
    sourceModule: "io/stringDocumentTarget.js",
    capabilityIds: ["io.string-document-target"],
    relationship: "JS_ADAPTATION",
    callShapes: ["new StringDocumentTarget()"],
    summary:
      "An in-memory ontology document target with Java's toString() text reader; the manager's behavior profile selects append or complete replacement.",
    omittedMembers: [
      "getWriter() and the Java Writer protocol (PARITY-TARGET-WRITER-OMISSION)",
    ],
    semanticQualifications: [
      "PARITY-TARGET-WRITER-OMISSION: toString() is the only public text reader; no getText(), getWriter(), write(), append(), or constructor-text overload is exposed.",
      "PARITY-TARGET-ATOMIC-COMMIT is the historical normative-v1 contract: complete-text replacement retains prior text after failure. java-owlapi-5.5.1 appends and preserves native partial output at characterized failure boundaries. The target stores text without selecting its own behavior profile.",
    ],
    verification: [
      "io/stringDocumentTarget.test.js",
      "test/package-boundary.test.mjs",
      "test/installed-package-boundary.mjs",
      "test/installed-package-smoke.mjs",
    ],
  },
  OWLOntologyStorageError: {
    javaType: "org.semanticweb.owlapi.model.OWLOntologyStorageException",
    sourceModule: "io/errors.js",
    capabilityIds: ["io.storage-error-contract"],
    relationship: "JS_ADAPTATION",
    callShapes: ["new OWLOntologyStorageError(message?, details?)"],
    summary:
      "The canonical storage error, including lossless-representation failures identified by a safe reason field.",
    omittedMembers: ["Java Throwable-only and serialization constructor forms"],
    semanticQualifications: [
      "PARITY-ERROR-SUFFIX: Java OWLOntologyStorageException uses the established JavaScript Error suffix.",
      "PARITY-ERROR-HIERARCHY: extends the existing OWLAPIError root rather than introducing Java's checked OWLException hierarchy.",
      "PARITY-ERROR-NAMESPACE: the canonical binding is owned by owlapi/io and re-exported only through the existing bare aggregate, not owlapi/model.",
      "PARITY-STORAGE-REASON: code ONTOLOGY_STORAGE_FAILED and safe own reason ONTOLOGY_NOT_REPRESENTABLE classify lossless-storage failures without a new public subclass; native cause and protected identity follow OWLAPIError.",
    ],
    verification: [
      "io/io.test.js",
      "test/package-boundary.test.mjs",
      "test/installed-package-boundary.mjs",
      "test/installed-package-smoke.mjs",
    ],
  },
  OWLStorerNotFoundError: {
    javaType: "org.semanticweb.owlapi.model.OWLStorerNotFoundException",
    sourceModule: "io/errors.js",
    capabilityIds: ["io.storage-error-contract"],
    relationship: "JS_ADAPTATION",
    callShapes: ["new OWLStorerNotFoundError(format)"],
    summary:
      "A storage-error subtype for an OWLDocumentFormat with no matching storer.",
    omittedMembers: ["Java exception serialization"],
    semanticQualifications: [
      "PARITY-ERROR-SUFFIX: Java OWLStorerNotFoundException uses the established JavaScript Error suffix and stable STORER_NOT_FOUND code.",
      "PARITY-ERROR-HIERARCHY: extends OWLOntologyStorageError, retaining Java's storage-exception subtype relation; the constructor takes the requested OWLDocumentFormat and exposes no getFormat() member.",
      "PARITY-ERROR-NAMESPACE: the canonical binding is owned by owlapi/io and re-exported only through the existing bare aggregate, not owlapi/model.",
    ],
    verification: [
      "io/io.test.js",
      "test/package-boundary.test.mjs",
      "test/installed-package-boundary.mjs",
      "test/installed-package-smoke.mjs",
    ],
  },
});

const MODULES = Object.freeze([
  {
    id: "root",
    javaPackage: null,
    npmSpecifier: "@hadden-industries/owlapi",
    module: {
      ...apibinding,
      ...formats,
      ...io,
      ...model,
      ...profiles,
      ...util,
      ...parameters,
      ...search,
      ...renderer,
    },
    rationale:
      "Convenience aggregate of established bindings. New writer configuration is owned only by ./model; no second implementation identity is created.",
  },
  {
    id: "apibinding",
    javaPackage: "org.semanticweb.owlapi.apibinding",
    npmSpecifier: "@hadden-industries/owlapi/apibinding",
    module: apibinding,
    rationale:
      "Mirrors the Java OWLAPI apibinding namespace for manager construction entry points.",
  },
  {
    id: "model",
    javaPackage: "org.semanticweb.owlapi.model",
    npmSpecifier: "@hadden-industries/owlapi/model",
    module: model,
    rationale:
      "Mirrors the Java OWLAPI model namespace while documenting JavaScript-specific structural adaptations explicitly.",
  },
  {
    id: "io",
    javaPackage: "org.semanticweb.owlapi.io",
    npmSpecifier: "@hadden-industries/owlapi/io",
    module: io,
    rationale:
      "Mirrors the Java OWLAPI io namespace for document sources, targets, and the package's canonical ontology errors.",
  },
  {
    id: "formats",
    javaPackage: "org.semanticweb.owlapi.formats",
    npmSpecifier: "@hadden-industries/owlapi/formats",
    module: formats,
    rationale:
      "Mirrors the Java OWLAPI formats namespace while exposing stable format identities rather than parser internals.",
  },
  {
    id: "io/node",
    javaPackage: "org.semanticweb.owlapi.io",
    npmSpecifier: "@hadden-industries/owlapi/io/node",
    module: nodeIo,
    firstPublicReleaseTarget: ROADMAP_PUBLIC_RELEASE_TARGET,
    rationale:
      "Explicit Node HTTP, HTTPS and local-file capability. Every access requires caller authorization; this entry is unavailable in browsers and is absent from the bare aggregate.",
  },
  {
    id: "util",
    javaPackage: "org.semanticweb.owlapi.util",
    npmSpecifier: "@hadden-industries/owlapi/util",
    module: util,
    firstPublicReleaseTarget: "0.1.0-rc.1",
    rationale:
      "Mirrors the Java OWLAPI util namespace for the exact approved closure, merger, transform, and short-form provider entry points.",
  },
  {
    id: "profiles",
    javaPackage: "org.semanticweb.owlapi.profiles",
    npmSpecifier: "@hadden-industries/owlapi/profiles",
    module: profiles,
    firstPublicReleaseTarget: "0.1.0-rc.1",
    rationale:
      "Owns the approved asynchronous OWL 2 DL checker and immutable report; source-qualified evidence is separate from the formal Java-shaped verdict.",
  },
  {
    id: "model/parameters",
    javaPackage: "org.semanticweb.owlapi.model.parameters",
    npmSpecifier: "@hadden-industries/owlapi/model/parameters",
    module: parameters,
    firstPublicReleaseTarget: "0.1.0-rc.2",
    rationale: "Owns the approved explicit query enums.",
  },
  {
    id: "search",
    javaPackage: "org.semanticweb.owlapi.search",
    npmSpecifier: "@hadden-industries/owlapi/search",
    module: search,
    firstPublicReleaseTarget: "0.1.0-rc.2",
    rationale: "Owns the selected asserted EntitySearcher operations.",
  },
  {
    id: "manchestersyntax/renderer",
    javaPackage: "org.semanticweb.owlapi.manchestersyntax.renderer",
    npmSpecifier: "@hadden-industries/owlapi/manchestersyntax/renderer",
    module: renderer,
    firstPublicReleaseTarget: "0.1.0-rc.2",
    rationale: "Owns the selected plain-text Manchester object renderer.",
  },
  {
    id: "modularity/locality",
    javaPackage: "org.semanticweb.owlapi.modularity.locality",
    npmSpecifier: "@hadden-industries/owlapi/modularity/locality",
    module: locality,
    firstPublicReleaseTarget: "0.1.0-rc.2",
    rationale:
      "Owns the selected syntactic-locality modes and module extractor.",
  },
]);

const SOURCE_MODULES = Object.freeze({
  NodeDocumentLoader: "io/node/nodeDocumentLoader.js",
  ChangeApplied: "model/parameters/index.js",
  RDFParserMetaData: "io/rdfParserMetaData.js",
  RDFOntologyHeaderStatus: "io/rdfParserMetaData.js",
  AddOntologyAnnotation: "model/addOntologyAnnotation.js",
  OWLManager: "apibinding/owlManager.js",
  OWLDocumentFormats: "formats/owlDocumentFormats.js",
  StringDocumentSource: "io/stringDocumentSource.js",
  IRI: "model/structural.js",
  OWLDataFactory: "model/owlDataFactory.js",
  OWLDocumentFormat: "model/owlDocumentFormat.js",
  OWLOntology: "model/owlOntology.js",
  OWLOntologyLoaderConfiguration: "model/owlOntologyLoaderConfiguration.js",
  OWLOntologyImportsClosureSetProvider:
    "util/owlOntologyImportsClosureSetProvider.js",
  OWLOntologyManager: "model/owlOntologyManager.js",
  OWLOntologyMerger: "util/owlOntologyMerger.js",
  OWLStructuralObject: "model/structural.js",
  SetOntologyID: "model/setOntologyID.js",
  StructuralSet: "model/structural.js",
});

const JAVA_TYPES_BY_EXPORT = Object.freeze({
  ChangeApplied: "org.semanticweb.owlapi.model.parameters.ChangeApplied",
  RDFParserMetaData: "org.semanticweb.owlapi.io.RDFParserMetaData",
  RDFOntologyHeaderStatus: "org.semanticweb.owlapi.io.RDFOntologyHeaderStatus",
  AddOntologyAnnotation: "org.semanticweb.owlapi.model.AddOntologyAnnotation",
  IRI: "org.semanticweb.owlapi.model.IRI",
  OWLAPIError: "org.semanticweb.owlapi.model.OWLRuntimeException",
  OWLDataFactory: "org.semanticweb.owlapi.model.OWLDataFactory",
  OWLDocumentFormat: "org.semanticweb.owlapi.model.OWLDocumentFormat",
  OWLManager: "org.semanticweb.owlapi.apibinding.OWLManager",
  OWLOntology: "org.semanticweb.owlapi.model.OWLOntology",
  OWLOntologyCreationError:
    "org.semanticweb.owlapi.model.OWLOntologyCreationException",
  OWLOntologyLoaderConfiguration:
    "org.semanticweb.owlapi.model.OWLOntologyLoaderConfiguration",
  OWLOntologyImportsClosureSetProvider:
    "org.semanticweb.owlapi.util.OWLOntologyImportsClosureSetProvider",
  OWLOntologyManager: "org.semanticweb.owlapi.model.OWLOntologyManager",
  OWLOntologyMerger: "org.semanticweb.owlapi.util.OWLOntologyMerger",
  OWLParserError: "org.semanticweb.owlapi.io.OWLParserException",
  OWLStructuralObject: "org.semanticweb.owlapi.model.OWLObject",
  SetOntologyID: "org.semanticweb.owlapi.model.SetOntologyID",
  StringDocumentSource: "org.semanticweb.owlapi.io.StringDocumentSource",
  UnloadableImportError:
    "org.semanticweb.owlapi.model.UnloadableImportException",
  UnparsableOntologyException:
    "org.semanticweb.owlapi.io.UnparsableOntologyException",
});

const FIRST_PUBLIC_RELEASE_TARGET_BY_EXPORT = Object.freeze({
  ChangeApplied: ROADMAP_PUBLIC_RELEASE_TARGET,
  NodeDocumentLoader: ROADMAP_PUBLIC_RELEASE_TARGET,
  RDFParserMetaData: "0.1.0-rc.1",
  RDFOntologyHeaderStatus: "0.1.0-rc.1",
  AddOntologyAnnotation: "0.1.0-rc.1",
  OWLOntologyImportsClosureSetProvider: "0.1.0-rc.1",
  OWLOntologyMerger: "0.1.0-rc.1",
  SetOntologyID: "0.1.0-rc.1",
});

const CLOSEST_JAVA_AUTHORITY = Object.freeze({
  AmbiguousRdfDatasetError:
    "org.semanticweb.owlapi.model.OWLOntologyCreationException",
  DocumentLoadError:
    "org.semanticweb.owlapi.model.OWLOntologyCreationException",
  GraphSelectionError:
    "org.semanticweb.owlapi.model.OWLOntologyCreationException",
  MissingImportError: "org.semanticweb.owlapi.model.UnloadableImportException",
  OWLDocumentFormats: "org.semanticweb.owlapi.formats",
  OWLOntologyStateError: "org.semanticweb.owlapi.model.OWLRuntimeException",
  OWLObjectKind: "org.semanticweb.owlapi.model.OWLObject",
  OWLSyntaxError: "org.semanticweb.owlapi.io.OWLParserException",
  ParserMismatchError: "org.semanticweb.owlapi.io.OWLParserException",
  ResourceLimitError: "org.semanticweb.owlapi.model.OWLRuntimeException",
  SecurityPolicyError:
    "org.semanticweb.owlapi.model.OWLOntologyLoaderConfiguration",
  StructuralSet: "org.semanticweb.owlapi.model.OWLObject",
  UnsupportedConstructError: "org.semanticweb.owlapi.io.OWLParserException",
  XmlParseError: "org.semanticweb.owlapi.io.OWLParserException",
});

const CAPABILITIES_BY_EXPORT = Object.freeze({
  NodeDocumentLoader: [
    "loading.node-authorized-transport",
    "loading.import-closure",
    "loading.abort-signal",
  ],
  ChangeApplied: ["manager.atomic-changes"],
  RDFParserMetaData: ["compatibility.owlapi-5.5.1"],
  RDFOntologyHeaderStatus: ["compatibility.owlapi-5.5.1"],
  AddOntologyAnnotation: ["compatibility.owlapi-5.5.1"],
  OWLOntologyImportsClosureSetProvider: ["compatibility.owlapi-5.5.1"],
  OWLOntologyMerger: ["compatibility.owlapi-5.5.1"],
  OWLManager: ["manager.narrow-v1-surface", "behavior.explicit-profiles"],
  OWLOntologyManager: ["manager.narrow-v1-surface", "loading.import-closure"],
  OWLOntologyLoaderConfiguration: [
    "loading.import-closure",
    "loading.remote-default-deny",
    "loading.abort-signal",
  ],
  OWLDataFactory: ["factory.required-v1-constructors"],
  OWLOntology: ["ontology.direct-query-surface"],
  OWLDocumentFormat: ["compatibility.owlapi-5.5.1"],
  OWLDocumentFormats: ["compatibility.owlapi-5.5.1"],
  IRI: ["model.core-values"],
  OWLStructuralObject: ["model.structural-equality"],
  StructuralSet: ["model.structural-equality"],
  OWLObjectKind: ["model.exhaustive-kind-dispatch"],
  StringDocumentSource: ["loading.import-closure"],
  SetOntologyID: ["compatibility.owlapi-5.5.1"],
});

const VERIFICATION_BY_GROUP = Object.freeze({
  "io/node": ["io/node/nodeDocumentLoader.test.js"],
  apibinding: [
    "apibinding/owlManager.test.js",
    "test/package-boundary.test.mjs",
  ],
  formats: ["model/model.test.js", "test/package-boundary.test.mjs"],
  io: ["io/io.test.js", "test/package-boundary.test.mjs"],
  model: ["model/model.test.js", "test/package-boundary.test.mjs"],
  util: [
    "util/owlOntologyImportsClosureSetProvider.test.js",
    "util/owlOntologyMerger.test.js",
    "test/package-boundary.test.mjs",
  ],
});

const VERIFICATION_BY_EXPORT = Object.freeze({
  ChangeApplied: ["model/behaviorMutation.test.js"],
  RDFParserMetaData: [
    "io/rdfParserMetaData.test.js",
    "model/behaviorParserSelection.test.js",
    "model/rdfConsumerCompatibility.test.js",
    "test/package-boundary.test.mjs",
  ],
  RDFOntologyHeaderStatus: [
    "io/rdfParserMetaData.test.js",
    "model/rdfConsumerCompatibility.test.js",
    "test/package-boundary.test.mjs",
  ],
  OWLDocumentFormat: [
    "model/owlDocumentFormat.test.js",
    "io/rdfParserMetaData.test.js",
  ],
  AddOntologyAnnotation: [
    "model/ontologyChanges.test.js",
    "model/owlOntologyManager.test.js",
    "test/package-boundary.test.mjs",
  ],
  OWLOntologyManager: [
    "internal/loading/managedOntologyIndex.test.js",
    "internal/model/axiomSemantics.test.js",
    "internal/model/ontologyState.test.js",
    "model/model.test.js",
    "model/ontologyChanges.test.js",
    "model/owlOntologyManager.integration.test.js",
    "model/owlOntologyManager.test.js",
    "test/package-boundary.test.mjs",
    "internal/storage/storerRegistry.test.js",
    "model/owlOntologyManager.storage.test.js",
  ],
  OWLOntologyImportsClosureSetProvider: [
    "util/owlOntologyImportsClosureSetProvider.test.js",
    "test/package-boundary.test.mjs",
    "test/installed-package-smoke.mjs",
    "test/consumers/browser/browser-consumers.playwright.js",
  ],
  OWLOntologyMerger: [
    "util/owlOntologyMerger.test.js",
    "util/behaviorMerger.test.js",
    "test/package-boundary.test.mjs",
    "test/installed-package-smoke.mjs",
    "test/consumers/browser/browser-consumers.playwright.js",
  ],
  SetOntologyID: [
    "internal/loading/managedOntologyIndex.test.js",
    "model/ontologyChanges.test.js",
    "model/owlOntologyManager.test.js",
    "test/package-boundary.test.mjs",
  ],
});

const SEMANTIC_QUALIFICATIONS_BY_EXPORT = Object.freeze({
  OWLOntologyLoaderConfiguration: [
    "new OWLOntologyLoaderConfiguration({ behaviorProfileId }) selects an immutable identity, defaulting to normative-v1. with() and native fluent setters preserve that identity; a manager rejects a configuration from another profile.",
    "Native methods get/setConnectionTimeout, get/setRetriesToAttempt, is/setFollowRedirects, get/setEntityExpansionLimit, is/setStrict, is/setLoadAnnotationAxioms, get/setAuthorizationValue and is/setAcceptingHTTPCompression retain Java names, types, values and observed immutable-copy/no-op semantics.",
    "The Java profile adds no JS-only finite acquisition, token, expression, byte or work defaults. The qualified Java XML/provider limits remain explicit. Normative budgets and remote-default-deny behavior remain separately documented. An authorization grant is independent of either profile.",
    "NodeDocumentLoader consumes native transport values at actual resource acquisition; JSON-LD context transport follows its independent native provider. Caller-defined loaders own their transport implementation and are not qualified merely because configuration is passed to load().",
  ],
  OWLDataFactory: [
    "Construct with { behaviorProfileId } or obtain the manager's factory. The immutable identity follows factory-created values and manager ownership. Java-profile literal construction reproduces native boolean, integer, floating-point, language and PlainLiteral normalization; normative-v1 retains its separately accepted lexical contract.",
  ],
  NodeDocumentLoader: [
    "Construct with { authorize(resourceIRI, context) }. The callback must return true for each requested operation; receiving a loader never silently grants access to a new destination.",
    "load(IRI, { config, purpose, signal }) returns a Promise for a StringDocumentSource. The configuration fixes each operation's behavior profile. Native ontology-document settings and the separate Java JSON-LD context provider settings are consumed by their actual transport boundaries.",
    "The Node-only adapter authorizes hostname resolution, the pinned IP address, redirects, credentials, resolved local file paths and file reads. It does not use ambient URL credentials or automatically enable network access in a manager.",
    "The read-file context requiresStablePathAncestors=true means its grant also guarantees trusted, stable parent directories throughout acquisition. Attacker-writable directory trees require a caller-owned loader with platform-specific file-handle authorization; portable Node pathname checks cannot provide that containment.",
    "Java ontology documents retain the requested parsing base; contexts use the final document URL. Gzip, raw DEFLATE, XZ and first-entry ZIP input follow the qualified Java provider. Native dependencies, permission decisions and caller cancellation remain host capabilities.",
    "Browser document parsing remains supported; browser external transport parity is not qualified. See docs/compatibility/profiles/java-owlapi-5.5.1/transport-decision.md and its live qualification status.",
  ],
  ChangeApplied: [
    "Frozen Java-compatible SUCCESSFULLY, NO_OPERATION and UNSUCCESSFULLY values. Java-profile manager changes return this vocabulary; normative-v1 retains the accepted boolean adaptation.",
  ],
  RDFParserMetaData: [
    "Construct with {tripleCount, headerState, unparsedTriples = [], guessedDeclarations = []}; all inputs are defensively copied into immutable parse metadata.",
    "getUnparsedTriples returns a frozen array of {subject, predicate, object} RDF/JS-shaped term records, not Java RDFTriple instances. Each record has termType and value; literals also have language and datatype {termType: NamedNode, value}, and optionally direction. Blank-node labels are local to the containing document metadata.",
    "getGuessedDeclarations returns a frozen array of {iri: IRI, entityType: OWLObjectKind} for entity roles in this document's reconstructed structure without explicit local/imported declarations or built-in status. This replaces Java's IRI-to-Class multimap and does not itself add Declaration axioms; unused imported roles are excluded.",
    "java-owlapi-5.5.1 getTripleCount counts source statement occurrences before deduplication and getHeaderState preserves the released consumer's constant PARSED_ONE_HEADER. normative-v1 counts selected unique triples and distinct explicit owl:Ontology subjects, including ZERO and MULTIPLE.",
    "Metadata remains available when collectWarnings is false. It records the original parse; it neither tracks subsequent ontology edits nor certifies complete source preservation, inferred-axiom provenance or current source assessment.",
  ],
  RDFOntologyHeaderStatus: [
    "A frozen string-valued vocabulary with PARSED_ZERO_HEADERS, PARSED_ONE_HEADER and PARSED_MULTIPLE_HEADERS, replacing Java enum instances.",
  ],
  OWLDocumentFormat: [
    "getOntologyLoaderMetaData returns RDFParserMetaData or undefined. withOntologyLoaderMetaData returns an immutable format copy instead of Java's mutating setter; withParameter retains historical parse metadata. Shared OWLDocumentFormats constants are never modified.",
  ],
  OWLOntologyManager: [
    "getOntologyFormat returns this manager's loaded OWLDocumentFormat or undefined for a programmatically created ontology, and rejects foreign or removed ontologies. RDF metadata belongs to the original completed parse and remains historical after edits.",
    "importsClosure returns a frozen deterministic root-first array snapshot instead of Java's Stream<OWLOntology>; getImportsClosure returns a fresh defensive Set with the same order and membership.",
    "Both closure methods reject unknown ontology identities at the observed manager-query boundary.",
    "normative-v1 mutation operations validate and commit a complete batch atomically and return boolean. java-owlapi-5.5.1 applies sequential changes, retains native partial effects after failure, permits same-profile foreign targets where Java does, and returns ChangeApplied. Behavior-profile mismatches reject before publication.",
    "applyChange/applyChanges accept the exported axiom, import, ontology annotation and ontology ID records. Collection/varargs/stream overloads retain one JavaScript iterable adaptation. Native net-zero sequences can still return ChangeApplied.SUCCESSFULLY.",
    "LIFECYCLE-ASYNC-SAVE-OVERLOAD: saveOntology(ontology, format, target) returns Promise<void>, validates ownership and genuine format/target identities, and selects only the exact format key.",
    "normative-v1 saves one committed snapshot and atomically replaces target text after success. Java saves append to a reused StringDocumentTarget and retain native partial output at observed failure points. Unexpected renderer failures retain a cause and typed storage errors retain identity.",
    "getOntologyWriterConfiguration/setOntologyWriterConfiguration attach genuine immutable values to this manager; saveOntology captures native private settings before its first await, independently of later manager changes.",
  ],
  OWLOntologyImportsClosureSetProvider: [
    "ontologies returns a fresh defensive JavaScript Set instead of Java's Stream<OWLOntology>.",
    "Each ontologies() call reads the manager's current closure and returns that call's defensive snapshot. Construction does not query the manager; unknown-ontology failure occurs at query time.",
  ],
  OWLOntologyMerger: [
    "createMergedOntology copies direct axioms into a new destination-owned ontology without transferring source ownership. The destination profile governs explicit mixed-profile copies. normative-v1 validates the complete snapshot before target creation; Java creates the target before querying the provider and retains copied axioms after later provider failure. A Java target identity collision prevents the provider call.",
    "The optional boolean constructor form selects Java-compatible logical-axiom filtering; the OWLAxiomFilter constructor remains unavailable.",
    "An omitted ontologyIRI creates an anonymous target; a supplied value must be an IRI.",
  ],
  AddOntologyAnnotation: [
    "AddOntologyAnnotation is a frozen immutable record; Java change-data, reverse-change, and visitor APIs remain deliberately unavailable.",
  ],
  SetOntologyID: [
    "SetOntologyID is a frozen immutable record and accepts only OWLOntologyID; Java's IRI constructor overload and change-operation helpers remain deliberately unavailable.",
  ],
});

const OMITTED_MEMBERS = Object.freeze({
  RDFParserMetaData: [
    "Java RDFTriple/RDFNode wrapper hierarchy, Java Stream and Class-valued Multimap APIs, serialization and positional constructor overload",
  ],
  RDFOntologyHeaderStatus: ["Java enum methods"],
  IRI: [
    "Java URI/File overloads and scheme helpers",
    "Java Comparable ordering contract",
  ],
  OWLAPIError: ["Java exception serialization and constructor overloads"],
  OWLManager: [
    "Java service-loader and injector overloads",
    "Ontology-data factory creation overloads",
  ],
  OWLDataFactory: ["SWRL object construction"],
  OWLDocumentFormat: [
    "setOntologyLoaderMetaData (use immutable withOntologyLoaderMetaData)",
    "Java parameter-map and prefix-format mutation APIs",
    "Java document-format factory identity",
  ],
  OWLOntology: [
    "Java stream-returning query overloads",
    "Java visitor overloads",
  ],
  OWLOntologyCreationError: [
    "Java exception constructor and serialization overloads",
  ],
  OWLOntologyLoaderConfiguration: [
    "Java parser-factory and priority-collection settings",
    "Java fluent setter for every Java-only loading option",
  ],
  OWLOntologyManager: [
    "Change and progress listeners",
    "Storer and ontology-factory registration",
    "IRI, stream, implicit-format, and default-document saveOntology overloads",
  ],
  OWLOntologyImportsClosureSetProvider: [],
  OWLOntologyMerger: [
    "OWLAxiomFilter constructor overload and passes(axiom) surface",
  ],
  OWLParserError: ["Java exception constructor and line/column overloads"],
  OWLStructuralObject: [
    "Java concrete OWLObject subtype hierarchy",
    "Java visitor and Comparable contracts",
  ],
  StringDocumentSource: [
    "Java Reader/InputStream accessors",
    "Java constructor overloads using OWLDocumentFormat and MIME metadata",
  ],
  AddOntologyAnnotation: ["Change-data, reverse-change, and visitor APIs"],
  SetOntologyID: [
    "Java IRI constructor overload",
    "Change-data, reverse-change, and visitor APIs",
  ],
  UnloadableImportError: [
    "Java import-declaration and creation-exception accessors",
  ],
  UnparsableOntologyException: [
    "Java parser-to-exception map and document-IRI constructor overloads",
  ],
});

const PUBLIC_ERRORS_BY_EXPORT = Object.freeze({
  NodeDocumentLoader: [
    "DocumentLoadError",
    "ResourceLimitError",
    "SecurityPolicyError",
    "TypeError",
    "RangeError",
  ],
  AddOntologyAnnotation: ["TypeError"],
  OWLManager: ["OWLOntologyCreationError", "UnparsableOntologyException"],
  OWLOntologyManager: [
    "DocumentLoadError",
    "MissingImportError",
    "OWLOntologyCreationError",
    "OWLOntologyStateError",
    "OWLOntologyStorageError",
    "OWLStorerNotFoundError",
    "UnparsableOntologyException",
  ],
  OWLOntologyImportsClosureSetProvider: ["OWLOntologyStateError", "TypeError"],
  OWLOntologyMerger: ["OWLOntologyStateError", "TypeError"],
  StringDocumentSource: ["TypeError"],
  SetOntologyID: ["TypeError"],
});

const FORMAT_CAPABILITY_BY_JAVA_TYPE = Object.freeze({
  DLSyntaxDocumentFormat: "parser.dl",
  FunctionalSyntaxDocumentFormat: "parser.functional",
  KRSS2DocumentFormat: "parser.krss2",
  KRSSDocumentFormat: "parser.krss1",
  ManchesterSyntaxDocumentFormat: "parser.manchester",
  OWLXMLDocumentFormat: "parser.owlxml",
  RDFXMLDocumentFormat: "parser.rdfxml",
  TurtleDocumentFormat: "parser.turtle",
});

const ERROR_EXPORTS = new Set(
  Object.entries(io)
    .filter(
      ([, binding]) =>
        typeof binding === "function" && binding.prototype instanceof Error,
    )
    .map(([name]) => name),
);
const DISPATCH_EXPORTS = new Set(
  Object.keys(model).filter((name) => name.startsWith("dispatch")),
);
const KIND_COLLECTION_EXPORTS = new Set(
  Object.keys(model).filter(
    (name) => name === "OWLObjectKind" || name.endsWith("_KINDS"),
  ),
);

const parseArguments = () => {
  const result = { javaRoot: null, write: false };
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--java-root") {
      result.javaRoot = resolve(args[index + 1] ?? "");
      index += 1;
    } else if (args[index] === "--write") {
      result.write = true;
    } else {
      throw new Error(`Unknown argument: ${args[index]}`);
    }
  }
  if (!result.javaRoot) {
    throw new Error(
      "--java-root must identify the pinned owlcs/owlapi checkout",
    );
  }
  return result;
};

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const toPosix = (path) => path.split(sep).join("/");

const listJavaFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .sort((left, right) => left.name.localeCompare(right.name, "en"))
      .map(async (entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
          return listJavaFiles(path);
        }
        return entry.isFile() && entry.name.endsWith(".java") ? [path] : [];
      }),
  );
  return nested.flat();
};

// Java OWLAPI is a multi-module Maven repository. Restrict discovery to
// production source roots, but include every module that publishes types in the
// org.semanticweb.owlapi namespace; scanning only the `api` module would omit
// recognizable public entry points such as apibinding.OWLManager.
const findJavaPackageSourceRoots = async (javaRoot) => {
  const roots = [];
  const visit = async (directory) => {
    if (directory.endsWith(JAVA_PACKAGE_SOURCE_SUFFIX)) {
      roots.push(directory);
      return;
    }
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) =>
      left.name.localeCompare(right.name, "en"),
    )) {
      if (
        entry.isDirectory() &&
        ![".git", ".idea", "node_modules", "target"].includes(entry.name)
      ) {
        await visit(join(directory, entry.name));
      }
    }
  };
  await visit(javaRoot);
  if (roots.length === 0) {
    throw new Error(
      `No Java OWLAPI production source roots found below ${javaRoot}`,
    );
  }
  return roots.sort((left, right) => left.localeCompare(right, "en"));
};

const readJavaTypes = async (javaRoot) => {
  const sourceRoots = await findJavaPackageSourceRoots(javaRoot);
  const files = (
    await Promise.all(
      sourceRoots.map((sourceRoot) => listJavaFiles(sourceRoot)),
    )
  ).flat();
  const types = [];
  const declarationPattern =
    /^public\s+(?:(?:abstract|final|sealed|non-sealed|static|strictfp)\s+)*(class|interface|enum|@interface|record)\s+([A-Za-z_$][\w$]*)/mu;
  const packagePattern = /^package\s+([\w.]+)\s*;/mu;

  for (const path of files) {
    const source = await readFile(path, "utf8");
    const packageMatch = source.match(packagePattern);
    const declarationMatch = source.match(declarationPattern);
    if (!declarationMatch) {
      continue;
    }
    if (!packageMatch) {
      throw new Error(`Public Java type has no package declaration: ${path}`);
    }
    const [, declarationKind, simpleName] = declarationMatch;
    if (basename(path, ".java") !== simpleName) {
      throw new Error(`Public Java type does not match its file name: ${path}`);
    }
    types.push({
      javaName: `${packageMatch[1]}.${simpleName}`,
      javaPackage: packageMatch[1],
      simpleName,
      kind:
        declarationKind === "@interface"
          ? "ANNOTATION"
          : declarationKind.toUpperCase(),
    });
  }

  types.sort((left, right) =>
    left.javaName.localeCompare(right.javaName, "en"),
  );
  const uniqueNames = new Set(types.map(({ javaName }) => javaName));
  if (types.length === 0 || uniqueNames.size !== types.length) {
    throw new Error(
      "Java public-type inventory is empty or contains duplicates",
    );
  }
  return types;
};

const kindOfBinding = (binding, exportName) => {
  if (typeof binding !== "function") {
    return "CONSTANT";
  }
  return DISPATCH_EXPORTS.has(exportName) ? "FUNCTION" : "CLASS";
};

const callShapesFor = (binding, exportName, publicSpecifier) => {
  if (exportName === "OWLManager") {
    return ["OWLManager.createOWLOntologyManager(options?)"];
  }
  if (exportName === "AddOntologyAnnotation") {
    return ["new AddOntologyAnnotation(ontology, annotation)"];
  }
  if (exportName === "SetOntologyID") {
    return ["new SetOntologyID(ontology, ontologyID)"];
  }
  if (exportName === "OWLOntologyImportsClosureSetProvider") {
    return ["new OWLOntologyImportsClosureSetProvider(manager, rootOntology)"];
  }
  if (exportName === "OWLOntologyMerger") {
    return [
      "new OWLOntologyMerger(provider)",
      "new OWLOntologyMerger(provider, mergeOnlyLogicalAxioms)",
    ];
  }
  if (kindOfBinding(binding, exportName) === "CLASS") {
    return [`new ${exportName}(...arguments)`];
  }
  if (kindOfBinding(binding, exportName) === "FUNCTION") {
    return [`${exportName}(...arguments)`];
  }
  return [`import { ${exportName} } from "${publicSpecifier}"`];
};

const capabilitiesFor = (exportName) => {
  if (CAPABILITIES_BY_EXPORT[exportName]) {
    return CAPABILITIES_BY_EXPORT[exportName];
  }
  if (ERROR_EXPORTS.has(exportName)) {
    return ["errors.canonical-taxonomy", "diagnostics.structured"];
  }
  if (DISPATCH_EXPORTS.has(exportName)) {
    return ["model.exhaustive-kind-dispatch"];
  }
  if (KIND_COLLECTION_EXPORTS.has(exportName)) {
    return ["model.exhaustive-kind-dispatch"];
  }
  return ["compatibility.owlapi-5.5.1"];
};

const sourceModuleFor = (exportName) => {
  if (SOURCE_MODULES[exportName]) {
    return SOURCE_MODULES[exportName];
  }
  if (ERROR_EXPORTS.has(exportName)) {
    return "io/errors.js";
  }
  if (DISPATCH_EXPORTS.has(exportName)) {
    return "model/dispatch.js";
  }
  if (KIND_COLLECTION_EXPORTS.has(exportName)) {
    return "model/kinds.js";
  }
  throw new Error(`No source module recorded for public export ${exportName}`);
};

const closestJavaAuthorityFor = (exportName, javaType, javaPackage) => {
  if (javaType) {
    return javaType;
  }
  if (CLOSEST_JAVA_AUTHORITY[exportName]) {
    return CLOSEST_JAVA_AUTHORITY[exportName];
  }
  if (ERROR_EXPORTS.has(exportName)) {
    return "org.semanticweb.owlapi.io.OWLParserException";
  }
  if (DISPATCH_EXPORTS.has(exportName)) {
    return "org.semanticweb.owlapi.model.OWLObjectVisitorEx";
  }
  if (KIND_COLLECTION_EXPORTS.has(exportName)) {
    return "org.semanticweb.owlapi.model.OWLObject";
  }
  return javaPackage;
};

const summaryFor = (exportName, kind, relationship) => {
  if (exportName === "OWLOntologyImportsClosureSetProvider") {
    return "A provider that queries the current imports closure on each call and returns that call's defensive JavaScript Set snapshot.";
  }
  if (exportName === "OWLOntologyMerger") {
    return "A Java-shaped ontology merger that materializes the structural union of supplied direct axioms.";
  }
  if (exportName === "OWLDocumentFormats") {
    return "Immutable identities for every ontology document format supported by the initial parser set.";
  }
  if (ERROR_EXPORTS.has(exportName)) {
    return "A stable public error category used by ontology loading, parsing, or policy enforcement.";
  }
  if (DISPATCH_EXPORTS.has(exportName)) {
    return "Exhaustive kind-checked dispatch for one Java OWLAPI structural model family.";
  }
  if (KIND_COLLECTION_EXPORTS.has(exportName)) {
    return "An immutable vocabulary used to classify supported OWL structural values.";
  }
  if (relationship === "JAVA_ANALOGUE") {
    return "A JavaScript implementation of the corresponding Java OWLAPI concept, scoped to the documented initial surface.";
  }
  return kind === "CLASS"
    ? "A JavaScript adaptation supporting the initial public OWLAPI workflow."
    : "A JavaScript-specific helper at an approved Java OWLAPI namespace boundary.";
};

const semanticQualificationsFor = (exportName, javaType) => [
  javaType
    ? "Names and concepts follow Java OWLAPI where JavaScript runtime semantics permit; only the listed members are promised."
    : "This helper is public because it makes the supported structural API practical in JavaScript; it is not claimed as a Java type translation.",
  ...(SEMANTIC_QUALIFICATIONS_BY_EXPORT[exportName] ?? []),
];

const buildBindings = (capabilityById) => {
  const bindings = [];
  for (const namespace of MODULES.filter(({ id }) => id !== "root")) {
    for (const exportName of Object.keys(namespace.module).sort()) {
      const binding = namespace.module[exportName];
      const parityMetadata = PARITY_BINDING_METADATA[exportName];
      const javaType =
        parityMetadata?.javaType ?? JAVA_TYPES_BY_EXPORT[exportName] ?? null;
      const relationship =
        parityMetadata?.relationship ??
        (javaType
          ? exportName === "OWLOntologyImportsClosureSetProvider"
            ? "JS_ADAPTATION"
            : exportName === "IRI" ||
                exportName === "AddOntologyAnnotation" ||
                exportName === "SetOntologyID" ||
                exportName.startsWith("OWL")
              ? "JAVA_ANALOGUE"
              : "JS_ADAPTATION"
          : "JS_EXTENSION");
      const kind = kindOfBinding(binding, exportName);
      const capabilityIds =
        parityMetadata?.capabilityIds ?? capabilitiesFor(exportName);
      const progressStates = capabilityIds.map(
        (id) => capabilityById.get(id).progress,
      );
      bindings.push({
        id: `${namespace.id}.${exportName}`,
        jsExport: exportName,
        kind,
        summary:
          parityMetadata?.summary ?? summaryFor(exportName, kind, relationship),
        capabilityIds,
        capabilityStatus: "REQUIRED_V1",
        progress: progressStates.includes("NOT_STARTED")
          ? "NOT_STARTED"
          : progressStates.includes("IN_PROGRESS")
            ? "IN_PROGRESS"
            : "COMPLETE",
        exposure: "PUBLIC",
        stability: "PRERELEASE",
        firstPublicReleaseTarget: parityMetadata
          ? Object.hasOwn(parityMetadata, "firstPublicReleaseTarget")
            ? parityMetadata.firstPublicReleaseTarget
            : "0.1.0-rc.1"
          : Object.hasOwn(FIRST_PUBLIC_RELEASE_TARGET_BY_EXPORT, exportName)
            ? FIRST_PUBLIC_RELEASE_TARGET_BY_EXPORT[exportName]
            : "0.1.0-alpha.0",
        publicSpecifier: namespace.npmSpecifier,
        sourceModule:
          parityMetadata?.sourceModule ?? sourceModuleFor(exportName),
        javaPackage: namespace.javaPackage,
        javaType,
        closestJavaAuthority: closestJavaAuthorityFor(
          exportName,
          javaType,
          namespace.javaPackage,
        ),
        relationship,
        compatibility: javaType ? "ADAPTED" : "NOT_APPLICABLE",
        callShapes:
          parityMetadata?.callShapes ??
          callShapesFor(binding, exportName, namespace.npmSpecifier),
        supportedMembers: publicMembers(binding).filter(
          (member) =>
            // These base implementations serve axiom instances only; their
            // presence on IRI's prototype chain does not make them IRI APIs.
            exportName !== "IRI" ||
            ![
              "prototype.getAnnotatedAxiom",
              "prototype.getAxiomWithoutAnnotations",
            ].includes(member),
        ),
        omittedMembers:
          parityMetadata?.omittedMembers ?? OMITTED_MEMBERS[exportName] ?? [],
        publicErrors: PUBLIC_ERRORS_BY_EXPORT[exportName] ?? [],
        semanticQualifications:
          parityMetadata?.semanticQualifications ??
          semanticQualificationsFor(exportName, javaType),
        verification:
          parityMetadata?.verification ??
          VERIFICATION_BY_EXPORT[exportName] ??
          VERIFICATION_BY_GROUP[namespace.id],
        guidance: javaType
          ? "Use the documented JavaScript call shapes and treat unlisted Java overloads or members as unavailable."
          : "Use this export only through its documented package specifier; do not infer additional Java API compatibility from its namespace.",
      });
    }
  }
  return bindings;
};

const structuralCapabilityFor = (simpleName) => {
  if (simpleName.endsWith("Axiom")) {
    return "model.axioms";
  }
  if (model.CLASS_EXPRESSION_KINDS.includes(simpleName)) {
    return "model.class-expressions";
  }
  if (model.DATA_RANGE_KINDS.includes(simpleName)) {
    return "model.data-ranges";
  }
  if (
    model.ENTITY_KINDS.includes(simpleName) ||
    model.INDIVIDUAL_KINDS.includes(simpleName)
  ) {
    return "model.entities";
  }
  if (
    model.OBJECT_PROPERTY_EXPRESSION_KINDS.includes(simpleName) ||
    model.DATA_PROPERTY_EXPRESSION_KINDS.includes(simpleName)
  ) {
    return "model.object-property-expressions";
  }
  return "model.core-values";
};

const classifyJavaType = (type, bindingByJavaType) => {
  const publicBinding = bindingByJavaType.get(type.javaName);
  if (publicBinding) {
    return {
      ...type,
      capabilityIds: publicBinding.capabilityIds,
      progress: publicBinding.progress,
      exposure: "PUBLIC",
      stability: "PRERELEASE",
      jsExport: publicBinding.jsExport,
      publicSpecifier: publicBinding.publicSpecifier,
      sourceModule: publicBinding.sourceModule,
      relationship:
        publicBinding.relationship === "JAVA_ANALOGUE"
          ? "JAVA_ANALOGUE"
          : "JS_ADAPTATION",
      compatibility: publicBinding.compatibility,
      disposition: "PUBLIC_MAPPED",
      supportedMembers: publicBinding.supportedMembers,
      omittedMembers: publicBinding.omittedMembers,
      verification: publicBinding.verification,
      guidance: publicBinding.guidance,
    };
  }

  if (["PrefixDocumentFormat", "PrefixManager"].includes(type.simpleName)) {
    return {
      ...type,
      capabilityIds: ["writer.rdfxml-configuration"],
      progress: "COMPLETE",
      exposure: "INTERNAL_ONLY",
      stability: null,
      jsExport: null,
      publicSpecifier: null,
      sourceModule: "formats/rdfXMLDocumentFormat.js",
      relationship: "JS_ADAPTATION",
      compatibility: "ADAPTED",
      disposition: "STRUCTURALLY_SUPPORTED_NOT_NAMED_EXPORT",
      supportedMembers: [
        "RDFXMLDocumentFormat inherited bounded prefix operations",
      ],
      omittedMembers: [
        "Standalone interface export",
        "Prefix comparator, prefix IRI conversion, Stream and setPrefixManager operations",
      ],
      verification: ["formats/rdfXMLDocumentFormat.test.js"],
      guidance:
        "Use the documented RDFXMLDocumentFormat subset; unlisted Java members remain unavailable.",
    };
  }
  if (type.simpleName === "HasOntologyWriterConfiguration") {
    return {
      ...type,
      capabilityIds: ["writer.rdfxml-configuration"],
      progress: "COMPLETE",
      exposure: "INTERNAL_ONLY",
      stability: null,
      jsExport: null,
      publicSpecifier: null,
      sourceModule: "model/owlOntologyManager.js",
      relationship: "JS_ADAPTATION",
      compatibility: "ADAPTED",
      disposition: "STRUCTURALLY_SUPPORTED_NOT_NAMED_EXPORT",
      supportedMembers: [
        "OWLOntologyManager.getOntologyWriterConfiguration()",
        "OWLOntologyManager.setOntologyWriterConfiguration(config)",
      ],
      omittedMembers: ["Standalone interface constructor/export"],
      verification: [
        "model/owlOntologyWriterConfiguration.test.js",
        "test/package-boundary.test.mjs",
      ],
      guidance:
        "Use the manager's native accessors; this Java interface is implemented structurally and has no JavaScript runtime constructor.",
    };
  }

  if (model.OWL_OBJECT_KINDS.includes(type.simpleName)) {
    return {
      ...type,
      capabilityIds: [
        structuralCapabilityFor(type.simpleName),
        "model.structural-equality",
      ],
      progress: "COMPLETE",
      exposure: "INTERNAL_ONLY",
      stability: null,
      jsExport: null,
      publicSpecifier: null,
      sourceModule: "model/structural.js",
      relationship: "JS_ADAPTATION",
      compatibility: "ADAPTED",
      disposition: "STRUCTURALLY_SUPPORTED_NOT_NAMED_EXPORT",
      supportedMembers: [
        "Structural value construction through OWLDataFactory",
        "Kind-safe dispatch through the public model helpers",
      ],
      omittedMembers: ["Standalone named Java-style export"],
      verification: ["model/factory.test.js", "model/model.test.js"],
      guidance:
        "Construct this value through OWLDataFactory and inspect it through structural kind dispatch; no named class export is promised yet.",
    };
  }

  if (FORMAT_CAPABILITY_BY_JAVA_TYPE[type.simpleName]) {
    return {
      ...type,
      capabilityIds: [
        FORMAT_CAPABILITY_BY_JAVA_TYPE[type.simpleName],
        "compatibility.owlapi-5.5.1",
      ],
      progress: "COMPLETE",
      exposure: "INTERNAL_ONLY",
      stability: null,
      jsExport: null,
      publicSpecifier: null,
      sourceModule: "formats/owlDocumentFormats.js",
      relationship: "JS_ADAPTATION",
      compatibility: "ADAPTED",
      disposition: "FORMAT_IDENTITY_SUPPORTED_NOT_NAMED_EXPORT",
      supportedMembers: ["Format identity metadata through OWLDocumentFormats"],
      omittedMembers: ["Named Java-style document-format class export"],
      verification: ["model/model.test.js", "test/package-boundary.test.mjs"],
      guidance:
        "Select the corresponding OWLDocumentFormats value; concrete Java document-format classes are not public JavaScript constructors.",
    };
  }

  if (
    ["OWLParser", "OWLParserFactory", "OWLParserFactoryRegistry"].includes(
      type.simpleName,
    )
  ) {
    return {
      ...type,
      capabilityIds: ["compatibility.owlapi-5.5.1"],
      progress: "COMPLETE",
      exposure: "INTERNAL_ONLY",
      stability: null,
      jsExport: null,
      publicSpecifier: null,
      sourceModule: "internal/parsing/parserRegistry.js",
      relationship: "INTERNAL",
      compatibility: "ADAPTED",
      disposition: "INTERNAL_IMPLEMENTATION_ONLY",
      supportedMembers: ["Private parser selection and invocation"],
      omittedMembers: ["Public Java-style parser registry API"],
      verification: ["internal/parsing/parserRegistry.test.js"],
      guidance:
        "Parser orchestration is intentionally package-private; use OWLOntologyManager for document loading.",
    };
  }

  const isReasoner = type.javaPackage.includes(".reasoner");
  const isSwrl = type.simpleName.startsWith("SWRL");
  const lifecycleStorerCapabilityId =
    LIFECYCLE_STORER_CAPABILITY_BY_JAVA_TYPE[type.javaName];
  const capabilityId = isReasoner
    ? "reasoner"
    : isSwrl
      ? "swrl"
      : (lifecycleStorerCapabilityId ?? "compatibility.java-api-gaps");
  const unsupported = isReasoner;
  return {
    ...type,
    capabilityIds: [capabilityId],
    progress: "NOT_STARTED",
    exposure: "NOT_EXPOSED",
    stability: null,
    jsExport: null,
    publicSpecifier: null,
    sourceModule: null,
    relationship: "INTERNAL",
    compatibility: "NOT_APPLICABLE",
    disposition: unsupported ? "UNSUPPORTED_BY_DESIGN" : "DEFERRED_NOT_EXPOSED",
    supportedMembers: [],
    omittedMembers: [],
    verification: [],
    guidance: unsupported
      ? "Reasoning is outside the package scope; integrate a reasoner through a separate package boundary."
      : "This Java API type is not exposed in the initial package; request or contribute it against the recorded capability before relying on it.",
  };
};

const buildRegistry = async (javaRoot) => {
  const packageJson = await readJson(join(PACKAGE_ROOT, "package.json"));
  const capabilities = await readJson(
    join(PACKAGE_ROOT, "docs/compatibility/capabilities.json"),
  );
  const bindings = buildBindings(
    new Map(capabilities.capabilities.map((row) => [row.id, row])),
  );
  const bindingByJavaType = new Map(
    bindings
      .filter(({ javaType }) => javaType !== null)
      .map((binding) => [binding.javaType, binding]),
  );
  if (
    bindingByJavaType.size !==
    bindings.filter(({ javaType }) => javaType).length
  ) {
    throw new Error("More than one public binding maps to the same Java type");
  }

  const revision = execFileSync(
    "git",
    [
      "-c",
      `safe.directory=${toPosix(javaRoot)}`,
      "-C",
      javaRoot,
      "rev-parse",
      "HEAD",
    ],
    { encoding: "utf8" },
  ).trim();
  if (revision !== EXPECTED_JAVA_REVISION) {
    throw new Error(
      `Java OWLAPI revision mismatch: expected ${EXPECTED_JAVA_REVISION}, received ${revision}`,
    );
  }

  const javaTypes = (await readJavaTypes(javaRoot)).map((type) =>
    classifyJavaType(type, bindingByJavaType),
  );
  for (const javaType of bindingByJavaType.keys()) {
    if (!javaTypes.some(({ javaName }) => javaName === javaType)) {
      throw new Error(
        `Mapped Java type is absent from the pinned inventory: ${javaType}`,
      );
    }
  }

  const allBindingIds = bindings.map(({ id }) => id);
  const namespaces = MODULES.map((namespace) => ({
    id: namespace.id,
    javaPackage: namespace.javaPackage,
    npmSpecifier: namespace.npmSpecifier,
    exposure: "PUBLIC",
    firstPublicReleaseTarget: Object.hasOwn(
      namespace,
      "firstPublicReleaseTarget",
    )
      ? namespace.firstPublicReleaseTarget
      : "0.1.0-alpha.0",
    rationale: namespace.rationale,
    ownedBindingIds:
      namespace.id === "root"
        ? allBindingIds.filter(
            (id) =>
              ![
                "model.OWLOntologyWriterConfiguration",
                "formats.RDFXMLDocumentFormat",
              ].includes(id),
          )
        : bindings
            .filter(
              ({ publicSpecifier }) =>
                publicSpecifier === namespace.npmSpecifier,
            )
            .map(({ id }) => id),
  }));
  const javaDispositionCounts = Object.fromEntries(
    [
      "PUBLIC_MAPPED",
      "STRUCTURALLY_SUPPORTED_NOT_NAMED_EXPORT",
      "FORMAT_IDENTITY_SUPPORTED_NOT_NAMED_EXPORT",
      "INTERNAL_IMPLEMENTATION_ONLY",
      "DEFERRED_NOT_EXPOSED",
      "UNSUPPORTED_BY_DESIGN",
      "UNCLASSIFIED",
    ].map((disposition) => [
      disposition,
      javaTypes.filter((type) => type.disposition === disposition).length,
    ]),
  );

  return {
    $schema: "./java-api-surface.schema.json",
    schemaVersion: 2,
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    javaReference: {
      version: "5.5.1",
      revision,
      source: `https://github.com/owlcs/owlapi/tree/${revision}`,
      inventoryRule:
        "Every top-level public class, interface, enum, annotation, or record declared below any production src/main/java/org/semanticweb/owlapi source root at the pinned multi-module revision.",
    },
    vocabularies: {
      capabilityStatus: [
        "REQUIRED_V1",
        "DEFERRED",
        "UNSUPPORTED_BY_DESIGN",
        "DELEGATED",
      ],
      progress: ["NOT_STARTED", "IN_PROGRESS", "COMPLETE"],
      exposure: ["PUBLIC", "INTERNAL_ONLY", "NOT_EXPOSED"],
      relationship: [
        "JAVA_ANALOGUE",
        "JS_ADAPTATION",
        "JS_EXTENSION",
        "INTERNAL",
      ],
      compatibility: [
        "COMPATIBLE",
        "ADAPTED",
        "CONTROLLED_DEVIATION",
        "NOT_APPLICABLE",
      ],
      stability: [
        "PRERELEASE",
        "INITIAL_DEVELOPMENT",
        "DEPRECATED_INITIAL_DEVELOPMENT",
      ],
      javaDisposition: Object.keys(javaDispositionCounts),
    },
    namespaces,
    bindings,
    javaTypes,
    summary: {
      namespaceCount: namespaces.length,
      publicBindingCount: bindings.length,
      javaTypeCount: javaTypes.length,
      javaDispositionCounts,
      unclassifiedJavaTypeCount: javaDispositionCounts.UNCLASSIFIED,
    },
  };
};

const renderApiView = (registry, digest) => {
  const sections = registry.bindings.map((binding) => {
    const javaAuthority = binding.javaType ?? binding.closestJavaAuthority;
    return [
      `## \`${binding.jsExport}\``,
      "",
      binding.summary,
      "",
      `- Import: \`${binding.publicSpecifier}\``,
      `- Kind: ${binding.kind}`,
      `- Java authority: ${javaAuthority}`,
      `- Relationship: ${binding.relationship}; compatibility: ${binding.compatibility}`,
      `- Release status: ${binding.stability}; ${binding.firstPublicReleaseTarget === null ? "first public release target unassigned" : `first public release target ${binding.firstPublicReleaseTarget}`}`,
      `- Call shape: ${binding.callShapes.join("; ")}`,
      `- Supported members: ${binding.supportedMembers.join("; ")}`,
      `- Omitted Java members: ${binding.omittedMembers.join("; ") || "none recorded"}`,
      `- Public errors: ${binding.publicErrors.join("; ") || "none specific"}`,
      `- Qualification: ${binding.semanticQualifications.join(" ")}`,
      `- Evidence: ${binding.verification.join(", ")}`,
      "",
      binding.guidance,
    ].join("\n");
  });
  return [
    `<!-- registry-sha256: ${digest} -->`,
    "",
    "# owlapi API reference",
    "",
    `This reference is generated from the authoritative compatibility registry for \`${registry.packageName}\` ${registry.packageVersion}. Edit the generator or registry inputs, not this file.`,
    "",
    "This is an independently maintained JavaScript implementation. It is not affiliated with, sponsored by, or endorsed by the Java OWLAPI project; Java names identify compatibility authorities, not organizational continuity or complete parity.",
    "",
    `The package exposes one convenience aggregate and ${registry.namespaces.length - 1} Java-recognizable namespace entry points. Import from declared package specifiers only; paths below \`internal/\` are intentionally outside the public contract.`,
    "",
    "First public release targets are planning metadata, not evidence of availability. Public includes versioned npm and GitHub releases, including prereleases; a moving source branch alone is not a release. Existing targets remain unchanged when publication succeeds; null means no target has been assigned.",
    "",
    ...sections,
    "",
  ].join("\n");
};

const renderCompatibilityView = (registry, digest) => {
  const bindingRows = registry.bindings.map((binding) =>
    [
      `| \`${binding.jsExport}\``,
      binding.publicSpecifier,
      binding.javaType ?? binding.closestJavaAuthority,
      binding.relationship,
      binding.compatibility,
      `${binding.progress} / ${binding.stability} |`,
    ].join(" | "),
  );
  const dispositionRows = Object.entries(
    registry.summary.javaDispositionCounts,
  ).map(([disposition, count]) => `| ${disposition} | ${count} |`);
  const packageCounts = new Map();
  for (const javaType of registry.javaTypes) {
    const counts = packageCounts.get(javaType.javaPackage) ?? {};
    counts[javaType.disposition] = (counts[javaType.disposition] ?? 0) + 1;
    packageCounts.set(javaType.javaPackage, counts);
  }
  const packageRows = [...packageCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([javaPackage, counts]) => {
      const classifications = Object.entries(counts)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([disposition, count]) => `${disposition}: ${count}`)
        .join("; ");
      return `| ${javaPackage} | ${classifications} |`;
    });

  return [
    `<!-- registry-sha256: ${digest} -->`,
    "",
    "# Java OWLAPI compatibility surface",
    "",
    `This generated view compares \`${registry.packageName}\` ${registry.packageVersion} with Java OWLAPI ${registry.javaReference.version} at \`${registry.javaReference.revision}\`. The JSON registry beside this file is authoritative.`,
    "",
    "This independently maintained JavaScript implementation is not affiliated with, sponsored by, or endorsed by the Java OWLAPI project. Compatibility rows describe a bounded technical relationship and do not claim complete API parity.",
    "",
    "A mapped name does not promise every Java overload or method. The relationship, compatibility, supported-member, and omitted-member fields in the registry define the actual contract.",
    "",
    "## Inventory summary",
    "",
    `- Public package namespaces: ${registry.summary.namespaceCount}`,
    `- Public JavaScript bindings: ${registry.summary.publicBindingCount}`,
    `- Public Java types inspected: ${registry.summary.javaTypeCount}`,
    `- Unclassified Java types: ${registry.summary.unclassifiedJavaTypeCount}`,
    "",
    "| Java disposition | Count |",
    "| --- | ---: |",
    ...dispositionRows,
    "",
    "## Public bindings",
    "",
    "| JavaScript export | Package specifier | Java authority | Relationship | Compatibility | Status |",
    "| --- | --- | --- | --- | --- | --- |",
    ...bindingRows,
    "",
    "## Java package gap summary",
    "",
    "Every public Java type is classified in the machine-readable registry. This compact view groups those classifications by Java package.",
    "",
    "| Java package | Disposition counts |",
    "| --- | --- |",
    ...packageRows,
    "",
  ].join("\n");
};

const writeOrCheck = async (path, expected, write) => {
  if (write) {
    await writeFile(path, expected, "utf8");
    return;
  }
  const actual = await readFile(path, "utf8");
  if (actual !== expected) {
    throw new Error(
      `Generated artifact is stale: ${relative(PACKAGE_ROOT, path)}`,
    );
  }
};

const main = async () => {
  const { javaRoot, write } = parseArguments();
  const registry = await buildRegistry(javaRoot);
  // Generated files use the repository formatter before hashing so the digest,
  // checked-in bytes, and ordinary format gate all describe one canonical form.
  const registryText = await formatWithPrettier(JSON.stringify(registry), {
    endOfLine: "lf",
    parser: "json-stringify",
  });
  const digest = createHash("sha256").update(registryText).digest("hex");
  const apiView = await formatWithPrettier(renderApiView(registry, digest), {
    endOfLine: "lf",
    parser: "markdown",
  });
  const compatibilityView = await formatWithPrettier(
    renderCompatibilityView(registry, digest),
    {
      endOfLine: "lf",
      parser: "markdown",
    },
  );
  await writeOrCheck(REGISTRY_PATH, registryText, write);
  await writeOrCheck(API_VIEW_PATH, apiView, write);
  await writeOrCheck(COMPATIBILITY_VIEW_PATH, compatibilityView, write);
  process.stdout.write(
    `${write ? "Wrote" : "Verified"} Java API registry: ${registry.summary.javaTypeCount} Java types, ${registry.summary.publicBindingCount} public bindings, digest ${digest}\n`,
  );
};

await main();
