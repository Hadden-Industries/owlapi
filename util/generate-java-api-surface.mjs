import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { format as formatWithPrettier } from "prettier";

import * as apibinding from "../apibinding/index.js";
import * as formats from "../formats/index.js";
import * as io from "../io/index.js";
import * as model from "../model/index.js";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_JAVA_REVISION = "d7e997a53b470e32700de89cc610d9daf01ea769";
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
});

const MODULES = Object.freeze([
  {
    id: "root",
    javaPackage: null,
    npmSpecifier: "owlapi",
    module: { ...apibinding, ...formats, ...io, ...model },
    rationale:
      "Convenience aggregate that re-exports every approved binding without creating a second implementation identity.",
  },
  {
    id: "apibinding",
    javaPackage: "org.semanticweb.owlapi.apibinding",
    npmSpecifier: "owlapi/apibinding",
    module: apibinding,
    rationale:
      "Mirrors the Java OWLAPI apibinding namespace for manager construction entry points.",
  },
  {
    id: "model",
    javaPackage: "org.semanticweb.owlapi.model",
    npmSpecifier: "owlapi/model",
    module: model,
    rationale:
      "Mirrors the Java OWLAPI model namespace while documenting JavaScript-specific structural adaptations explicitly.",
  },
  {
    id: "io",
    javaPackage: "org.semanticweb.owlapi.io",
    npmSpecifier: "owlapi/io",
    module: io,
    rationale:
      "Mirrors the Java OWLAPI io namespace for document sources and loading or parsing errors.",
  },
  {
    id: "formats",
    javaPackage: "org.semanticweb.owlapi.formats",
    npmSpecifier: "owlapi/formats",
    module: formats,
    rationale:
      "Mirrors the Java OWLAPI formats namespace while exposing stable format identities rather than parser internals.",
  },
]);

const SOURCE_MODULES = Object.freeze({
  OWLManager: "apibinding/owlManager.js",
  OWLDocumentFormats: "formats/owlDocumentFormats.js",
  StringDocumentSource: "io/stringDocumentSource.js",
  IRI: "model/structural.js",
  OWLDataFactory: "model/owlDataFactory.js",
  OWLDocumentFormat: "model/owlDocumentFormat.js",
  OWLOntology: "model/owlOntology.js",
  OWLOntologyLoaderConfiguration: "model/owlOntologyLoaderConfiguration.js",
  OWLOntologyManager: "model/owlOntologyManager.js",
  OWLStructuralObject: "model/structural.js",
  StructuralSet: "model/structural.js",
});

const JAVA_TYPES_BY_EXPORT = Object.freeze({
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
  OWLOntologyManager: "org.semanticweb.owlapi.model.OWLOntologyManager",
  OWLParserError: "org.semanticweb.owlapi.io.OWLParserException",
  OWLStructuralObject: "org.semanticweb.owlapi.model.OWLObject",
  StringDocumentSource: "org.semanticweb.owlapi.io.StringDocumentSource",
  UnloadableImportError:
    "org.semanticweb.owlapi.model.UnloadableImportException",
  UnparsableOntologyException:
    "org.semanticweb.owlapi.io.UnparsableOntologyException",
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
  OWLManager: ["manager.narrow-v1-surface"],
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
});

const VERIFICATION_BY_GROUP = Object.freeze({
  apibinding: [
    "apibinding/owlManager.test.js",
    "test/package-boundary.test.mjs",
  ],
  formats: ["model/model.test.js", "test/package-boundary.test.mjs"],
  io: ["io/io.test.js", "test/package-boundary.test.mjs"],
  model: ["model/model.test.js", "test/package-boundary.test.mjs"],
});

const VERIFICATION_BY_EXPORT = Object.freeze({
  OWLOntologyManager: [
    "model/model.test.js",
    "model/owlOntologyManager.integration.test.js",
    "model/owlOntologyManager.test.js",
    "test/package-boundary.test.mjs",
  ],
});

const SEMANTIC_QUALIFICATIONS_BY_EXPORT = Object.freeze({
  OWLOntologyManager: [
    "importsClosure returns a frozen deterministic root-first array snapshot instead of Java's Stream<OWLOntology>; getImportsClosure returns a fresh defensive Set with the same order and membership.",
    "Both closure methods reject an ontology not owned by this manager with OWLOntologyStateError instead of returning Java's empty closure.",
  ],
});

const OMITTED_MEMBERS = Object.freeze({
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
    "Ontology mutation and transactional change application",
    "Storer and ontology-factory registration",
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
  UnloadableImportError: [
    "Java import-declaration and creation-exception accessors",
  ],
  UnparsableOntologyException: [
    "Java parser-to-exception map and document-IRI constructor overloads",
  ],
});

const PUBLIC_ERRORS_BY_EXPORT = Object.freeze({
  OWLManager: ["OWLOntologyCreationError", "UnparsableOntologyException"],
  OWLOntologyManager: [
    "DocumentLoadError",
    "MissingImportError",
    "OWLOntologyCreationError",
    "OWLOntologyStateError",
    "UnparsableOntologyException",
  ],
  StringDocumentSource: ["TypeError"],
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
  Object.keys(io).filter((name) => name !== "StringDocumentSource"),
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

const ownMembers = (binding) => {
  if (typeof binding === "function") {
    const staticMembers = Object.getOwnPropertyNames(binding).filter(
      (name) => !["length", "name", "prototype"].includes(name),
    );
    const prototypeMembers = binding.prototype
      ? Object.getOwnPropertyNames(binding.prototype).filter(
          (name) => name !== "constructor",
        )
      : [];
    const members = [
      ...staticMembers.map((name) => `static ${name}`),
      ...prototypeMembers.map((name) => `prototype.${name}`),
    ];
    return members.length > 0 ? members.sort() : ["constructor"];
  }
  if (Array.isArray(binding)) {
    return binding.map(String);
  }
  if (binding !== null && typeof binding === "object") {
    return Object.keys(binding).sort();
  }
  return [typeof binding];
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

const buildBindings = () => {
  const bindings = [];
  for (const namespace of MODULES.filter(({ id }) => id !== "root")) {
    for (const exportName of Object.keys(namespace.module).sort()) {
      const binding = namespace.module[exportName];
      const javaType = JAVA_TYPES_BY_EXPORT[exportName] ?? null;
      const relationship = javaType
        ? exportName === "IRI" || exportName.startsWith("OWL")
          ? "JAVA_ANALOGUE"
          : "JS_ADAPTATION"
        : "JS_EXTENSION";
      const kind = kindOfBinding(binding, exportName);
      bindings.push({
        id: `${namespace.id}.${exportName}`,
        jsExport: exportName,
        kind,
        summary: summaryFor(exportName, kind, relationship),
        capabilityIds: capabilitiesFor(exportName),
        capabilityStatus: "REQUIRED_V1",
        progress: "COMPLETE",
        exposure: "PUBLIC",
        stability: "PRERELEASE",
        firstPublicRelease: "0.1.0-alpha.0",
        publicSpecifier: namespace.npmSpecifier,
        sourceModule: sourceModuleFor(exportName),
        javaPackage: namespace.javaPackage,
        javaType,
        closestJavaAuthority: closestJavaAuthorityFor(
          exportName,
          javaType,
          namespace.javaPackage,
        ),
        relationship,
        compatibility: javaType ? "ADAPTED" : "NOT_APPLICABLE",
        callShapes: callShapesFor(binding, exportName, namespace.npmSpecifier),
        supportedMembers: ownMembers(binding),
        omittedMembers: OMITTED_MEMBERS[exportName] ?? [],
        publicErrors: PUBLIC_ERRORS_BY_EXPORT[exportName] ?? [],
        semanticQualifications: semanticQualificationsFor(exportName, javaType),
        verification:
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
      progress: "COMPLETE",
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
  const bindings = buildBindings();
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
    firstPublicRelease: "0.1.0-alpha.0",
    rationale: namespace.rationale,
    ownedBindingIds:
      namespace.id === "root"
        ? allBindingIds
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
    schemaVersion: 1,
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
      `- Release status: ${binding.stability} from ${binding.firstPublicRelease}`,
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
    "The package exposes one convenience aggregate and four Java-recognizable namespace entry points. Import from declared package specifiers only; paths below `internal/` are intentionally outside the public contract.",
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
    parser: "json",
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
