import { spawn } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { DOMParser, onWarningStopParsing } from "@xmldom/xmldom";

const OASIS_XML_CATALOG_NAMESPACE =
  "urn:oasis:names:tc:entity:xmlns:xml:catalog";
const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";
const MAXIMUM_PROCESS_OUTPUT_BYTES = 1_048_576;
const REFERENCE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(REFERENCE_DIRECTORY, "../..");
const PINNED_VERSION_PATH = join(REFERENCE_DIRECTORY, "pinned-version.json");
const REQUIRED_ARGUMENTS = new Map([
  ["--catalog", "catalogPath"],
  ["--root", "rootPath"],
  ["--verify-output", "verifyOutputPath"],
]);
const compareUtf16CodeUnits = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

export class ImportClosureOracleLauncherError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    Object.assign(this, details);
    this.name = "ImportClosureOracleLauncherError";
    this.code = code;
  }
}

const launcherError = (message, code, details = {}) =>
  new ImportClosureOracleLauncherError(message, code, details);

export const parseImportClosureContractArguments = (arguments_) => {
  const parsed = {};

  for (let index = 0; index < arguments_.length; index += 2) {
    const option = arguments_[index];
    const property = REQUIRED_ARGUMENTS.get(option);
    if (!property) {
      throw launcherError(
        `Unknown import-closure oracle argument: ${option ?? "<missing>"}`,
        "IMPORT_CLOSURE_ORACLE_ARGUMENT_UNKNOWN",
        { argument: option ?? null },
      );
    }
    if (Object.hasOwn(parsed, property)) {
      throw launcherError(
        `Import-closure oracle argument was supplied more than once: ${option}`,
        "IMPORT_CLOSURE_ORACLE_ARGUMENT_DUPLICATE",
        { argument: option },
      );
    }

    const value = arguments_[index + 1];
    if (!value || REQUIRED_ARGUMENTS.has(value)) {
      throw launcherError(
        `Import-closure oracle argument requires a value: ${option}`,
        "IMPORT_CLOSURE_ORACLE_ARGUMENT_MISSING",
        { argument: option },
      );
    }
    parsed[property] = value;
  }

  const missing = [...REQUIRED_ARGUMENTS].find(
    ([, property]) => !Object.hasOwn(parsed, property),
  );
  if (missing) {
    throw launcherError(
      `Missing required import-closure oracle argument: ${missing[0]}`,
      "IMPORT_CLOSURE_ORACLE_ARGUMENT_MISSING",
      { argument: missing[0] },
    );
  }

  return parsed;
};

const elementChildren = (element) =>
  [...element.childNodes].filter((node) => node.nodeType === node.ELEMENT_NODE);

const validateTextOnlyWhitespace = (element) => {
  for (const node of element.childNodes) {
    if (
      (node.nodeType === node.TEXT_NODE ||
        node.nodeType === node.CDATA_SECTION_NODE) &&
      node.data.trim() !== ""
    ) {
      throw launcherError(
        `OASIS XML Catalog element <${element.localName}> contains unsupported text content`,
        "IMPORT_CLOSURE_CATALOG_CONTENT_UNSUPPORTED",
        { construct: element.localName },
      );
    }
  }
};

const allowedAttributesByElement = Object.freeze({
  catalog: new Set(["id", "prefer"]),
  group: new Set(["id", "prefer"]),
  uri: new Set(["id", "name", "uri"]),
});

const validateCatalogElementAttributes = (element) => {
  const allowed = allowedAttributesByElement[element.localName];
  for (const attribute of element.attributes) {
    const isNamespaceDeclaration = attribute.namespaceURI === XMLNS_NAMESPACE;
    const isXmlBase =
      attribute.namespaceURI === XML_NAMESPACE &&
      attribute.localName === "base";
    const isAllowedUnqualified =
      !attribute.namespaceURI && allowed.has(attribute.localName);
    if (!isNamespaceDeclaration && !isXmlBase && !isAllowedUnqualified) {
      throw launcherError(
        `Unsupported attribute ${attribute.name} on OASIS XML Catalog <${element.localName}>`,
        "IMPORT_CLOSURE_CATALOG_ATTRIBUTE_UNSUPPORTED",
        { attribute: attribute.name, construct: element.localName },
      );
    }
  }

  if (
    (element.localName === "catalog" || element.localName === "group") &&
    element.hasAttribute("prefer") &&
    !new Set(["public", "system"]).has(element.getAttribute("prefer"))
  ) {
    throw launcherError(
      `Invalid OASIS XML Catalog prefer value: ${element.getAttribute("prefer")}`,
      "IMPORT_CLOSURE_CATALOG_ATTRIBUTE_INVALID",
      { attribute: "prefer", construct: element.localName },
    );
  }
};

const resolveElementBase = (element, inheritedBase) => {
  const xmlBase = element.getAttributeNS(XML_NAMESPACE, "base");
  if (!xmlBase) {
    return inheritedBase;
  }
  try {
    return new URL(xmlBase, inheritedBase);
  } catch (cause) {
    throw launcherError(
      `Invalid xml:base on OASIS XML Catalog <${element.localName}>`,
      "IMPORT_CLOSURE_CATALOG_BASE_INVALID",
      { cause, construct: element.localName, xmlBase },
    );
  }
};

const resolveLocalCatalogTarget = (rawTarget, elementBase, ontologyIRI) => {
  if (
    !rawTarget ||
    rawTarget.includes("\\") ||
    /%(?:2f|5c)/iu.test(rawTarget)
  ) {
    throw launcherError(
      `Ambiguous OASIS XML Catalog target for ${ontologyIRI}`,
      "IMPORT_CLOSURE_CATALOG_TARGET_AMBIGUOUS",
      { ontologyIRI, target: rawTarget },
    );
  }

  let target;
  try {
    target = new URL(rawTarget, elementBase);
  } catch (cause) {
    throw launcherError(
      `Invalid OASIS XML Catalog target for ${ontologyIRI}`,
      "IMPORT_CLOSURE_CATALOG_TARGET_INVALID",
      { cause, ontologyIRI, target: rawTarget },
    );
  }

  if (target.protocol !== "file:") {
    throw launcherError(
      `OASIS XML Catalog target must resolve to a local file for ${ontologyIRI}`,
      "IMPORT_CLOSURE_CATALOG_TARGET_NOT_LOCAL",
      { ontologyIRI, target: rawTarget },
    );
  }
  if (
    target.search ||
    target.hash ||
    (target.hostname && target.hostname !== "localhost")
  ) {
    throw launcherError(
      `Ambiguous OASIS XML Catalog target for ${ontologyIRI}`,
      "IMPORT_CLOSURE_CATALOG_TARGET_AMBIGUOUS",
      { ontologyIRI, target: rawTarget },
    );
  }

  try {
    return fileURLToPath(target);
  } catch (cause) {
    throw launcherError(
      `Invalid local OASIS XML Catalog target for ${ontologyIRI}`,
      "IMPORT_CLOSURE_CATALOG_TARGET_INVALID",
      { cause, ontologyIRI, target: rawTarget },
    );
  }
};

const requireRegularFile = async (path, code, details = {}) => {
  let metadata;
  try {
    metadata = await stat(path);
  } catch (cause) {
    throw launcherError(`Required file does not exist: ${path}`, code, {
      ...details,
      cause,
      path,
    });
  }
  if (!metadata.isFile()) {
    throw launcherError(`Required path is not a file: ${path}`, code, {
      ...details,
      path,
    });
  }
};

export const parseOasisXmlCatalog = async (catalogPath) => {
  const absoluteCatalogPath = resolve(catalogPath);
  await requireRegularFile(
    absoluteCatalogPath,
    "IMPORT_CLOSURE_ORACLE_CATALOG_NOT_FOUND",
  );
  const xml = await readFile(absoluteCatalogPath, "utf8");

  let document;
  try {
    document = new DOMParser({ onError: onWarningStopParsing }).parseFromString(
      xml,
      "application/xml",
    );
  } catch (cause) {
    throw launcherError(
      `OASIS XML Catalog is not well-formed XML: ${absoluteCatalogPath}`,
      "IMPORT_CLOSURE_CATALOG_XML_INVALID",
      { catalogPath: absoluteCatalogPath, cause },
    );
  }

  if (document.doctype) {
    throw launcherError(
      `DOCTYPE is forbidden in the offline OASIS XML Catalog: ${absoluteCatalogPath}`,
      "IMPORT_CLOSURE_CATALOG_DOCTYPE_FORBIDDEN",
      { catalogPath: absoluteCatalogPath },
    );
  }

  const root = document.documentElement;
  if (
    !root ||
    root.namespaceURI !== OASIS_XML_CATALOG_NAMESPACE ||
    root.localName !== "catalog"
  ) {
    throw launcherError(
      `Expected an OASIS XML Catalog <catalog> document element: ${absoluteCatalogPath}`,
      "IMPORT_CLOSURE_CATALOG_ROOT_INVALID",
      { catalogPath: absoluteCatalogPath },
    );
  }

  const mappings = new Map();
  const visit = async (element, inheritedBase, parentLocalName) => {
    if (element.namespaceURI !== OASIS_XML_CATALOG_NAMESPACE) {
      throw launcherError(
        `Unsupported foreign XML Catalog construct: ${element.nodeName}`,
        "IMPORT_CLOSURE_CATALOG_CONSTRUCT_UNSUPPORTED",
        { construct: element.localName },
      );
    }
    if (!allowedAttributesByElement[element.localName]) {
      throw launcherError(
        `Unsupported OASIS XML Catalog construct: ${element.localName}`,
        "IMPORT_CLOSURE_CATALOG_CONSTRUCT_UNSUPPORTED",
        { construct: element.localName },
      );
    }
    const isSupportedContainerPosition =
      (element.localName === "catalog" && parentLocalName === null) ||
      (element.localName === "group" && parentLocalName === "catalog") ||
      (element.localName === "uri" &&
        (parentLocalName === "catalog" || parentLocalName === "group"));
    if (!isSupportedContainerPosition) {
      throw launcherError(
        `Unsupported nested OASIS XML Catalog construct: ${element.localName}`,
        "IMPORT_CLOSURE_CATALOG_CONSTRUCT_UNSUPPORTED",
        { construct: element.localName },
      );
    }

    validateCatalogElementAttributes(element);
    validateTextOnlyWhitespace(element);
    const elementBase = resolveElementBase(element, inheritedBase);

    if (element.localName === "uri") {
      if (elementChildren(element).length > 0) {
        throw launcherError(
          "OASIS XML Catalog <uri> entries must be empty",
          "IMPORT_CLOSURE_CATALOG_CONTENT_UNSUPPORTED",
          { construct: "uri" },
        );
      }
      const ontologyIRI = element.getAttribute("name");
      const rawTarget = element.getAttribute("uri");
      if (!ontologyIRI || !rawTarget) {
        throw launcherError(
          "OASIS XML Catalog <uri> entries require non-empty name and uri attributes",
          "IMPORT_CLOSURE_CATALOG_ENTRY_INVALID",
          { ontologyIRI: ontologyIRI || null },
        );
      }
      if (mappings.has(ontologyIRI)) {
        throw launcherError(
          `Duplicate OASIS XML Catalog entry for ${ontologyIRI}`,
          "IMPORT_CLOSURE_CATALOG_ENTRY_DUPLICATE",
          { ontologyIRI },
        );
      }

      const documentPath = resolveLocalCatalogTarget(
        rawTarget,
        elementBase,
        ontologyIRI,
      );
      await requireRegularFile(
        documentPath,
        "IMPORT_CLOSURE_CATALOG_TARGET_NOT_FOUND",
        { ontologyIRI },
      );
      mappings.set(ontologyIRI, { documentPath, ontologyIRI });
      return;
    }

    for (const child of elementChildren(element)) {
      await visit(child, elementBase, element.localName);
    }
  };

  await visit(root, pathToFileURL(absoluteCatalogPath), null);
  return [...mappings.values()].sort((left, right) =>
    compareUtf16CodeUnits(left.ontologyIRI, right.ontologyIRI),
  );
};

const defaultExecuteProcess = (
  command,
  arguments_,
  {
    cwd = REPOSITORY_ROOT,
    maximumOutputBytes = MAXIMUM_PROCESS_OUTPUT_BYTES,
  } = {},
) =>
  new Promise((resolveProcess, reject) => {
    const child = spawn(command, arguments_, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    let exceededOutputLimit = false;

    const append = (streamName, chunk) => {
      outputBytes += Buffer.byteLength(chunk);
      if (outputBytes > maximumOutputBytes) {
        exceededOutputLimit = true;
        child.kill();
        return;
      }
      if (streamName === "stdout") {
        stdout += chunk;
      } else {
        stderr += chunk;
      }
    };

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => append("stdout", chunk));
    child.stderr.on("data", (chunk) => append("stderr", chunk));
    child.once("error", reject);
    child.once("close", (exitCode) => {
      if (exceededOutputLimit) {
        reject(
          launcherError(
            `Process output exceeded ${maximumOutputBytes} bytes: ${command}`,
            "IMPORT_CLOSURE_ORACLE_PROCESS_OUTPUT_LIMIT",
            { command, maximumOutputBytes },
          ),
        );
        return;
      }
      resolveProcess({ exitCode: exitCode ?? 1, stderr, stdout });
    });
  });

export const resolvePinnedReferenceEnvironment = async ({
  executeProcess = defaultExecuteProcess,
  pinnedVersionPath = PINNED_VERSION_PATH,
  sourceCheckoutPath = process.env.OWLAPI_REFERENCE_CHECKOUT,
} = {}) => {
  let pinned;
  try {
    pinned = JSON.parse(await readFile(pinnedVersionPath, "utf8"));
  } catch (cause) {
    throw launcherError(
      `Cannot read the pinned OWLAPI reference identity: ${pinnedVersionPath}`,
      "IMPORT_CLOSURE_ORACLE_PIN_INVALID",
      { cause, pinnedVersionPath },
    );
  }

  const pinnedRevision = pinned.sourceRevision;
  const owlapiVersion = pinned.owlapiVersionLine;
  if (
    !/^[0-9a-f]{40}$/u.test(pinnedRevision ?? "") ||
    typeof owlapiVersion !== "string" ||
    !owlapiVersion
  ) {
    throw launcherError(
      "Pinned OWLAPI reference identity is incomplete",
      "IMPORT_CLOSURE_ORACLE_PIN_INVALID",
      { pinnedVersionPath },
    );
  }

  if (typeof sourceCheckoutPath !== "string" || !sourceCheckoutPath.trim()) {
    throw launcherError(
      "Set OWLAPI_REFERENCE_CHECKOUT to a built checkout of the pinned Java OWLAPI revision",
      "IMPORT_CLOSURE_ORACLE_REFERENCE_ENVIRONMENT_UNAVAILABLE",
    );
  }
  const sourceCheckout = resolve(sourceCheckoutPath);

  const environment = {
    classpathFile: join(
      sourceCheckout,
      "distribution",
      "target",
      "owlapi-runtime-classpath.txt",
    ),
    launcherSource: join(REFERENCE_DIRECTORY, "RunWithClasspath.java"),
    oracleSource: join(REFERENCE_DIRECTORY, "RunImportClosureContract.java"),
    owlapiVersion,
    pinnedRevision,
    sourceCheckout,
  };
  for (const path of [
    environment.classpathFile,
    environment.launcherSource,
    environment.oracleSource,
  ]) {
    await requireRegularFile(
      path,
      "IMPORT_CLOSURE_ORACLE_REFERENCE_ENVIRONMENT_UNAVAILABLE",
    );
  }

  let revisionExecution;
  try {
    revisionExecution = await executeProcess("git", [
      "-c",
      `safe.directory=${sourceCheckout.replaceAll("\\", "/")}`,
      "-C",
      sourceCheckout,
      "rev-parse",
      "HEAD",
    ]);
  } catch (cause) {
    throw launcherError(
      `Cannot inspect the pinned OWLAPI checkout: ${sourceCheckout}`,
      "IMPORT_CLOSURE_ORACLE_REVISION_UNAVAILABLE",
      { cause, sourceCheckout },
    );
  }
  const actualRevision = revisionExecution.stdout.trim();
  if (revisionExecution.exitCode !== 0 || actualRevision !== pinnedRevision) {
    throw launcherError(
      `OWLAPI checkout revision ${actualRevision || "<unavailable>"} does not match ${pinnedRevision}`,
      "IMPORT_CLOSURE_ORACLE_REVISION_MISMATCH",
      {
        actualRevision: actualRevision || null,
        pinnedRevision,
        sourceCheckout,
      },
    );
  }

  return Object.freeze(environment);
};

const requireSuccessfulCompilation = (execution, stage) => {
  const compilerDiagnosticPresent = [execution.stderr, execution.stdout].some(
    (value) => typeof value === "string" && value.trim() !== "",
  );
  if (execution.exitCode !== 0 || compilerDiagnosticPresent) {
    throw launcherError(
      `Pinned Java import-closure oracle compilation failed at ${stage}`,
      "IMPORT_CLOSURE_ORACLE_COMPILE_FAILED",
      {
        compilerDiagnosticPresent,
        exitCode: execution.exitCode,
        stage,
        stderr: execution.stderr,
        stdout: execution.stdout,
      },
    );
  }
};

export const compileImportClosureOracle = async (
  referenceEnvironment,
  outputDirectory,
  { executeProcess = defaultExecuteProcess } = {},
) => {
  const absoluteOutputDirectory = resolve(outputDirectory);
  await mkdir(absoluteOutputDirectory, { recursive: true });

  let launcherCompilation;
  try {
    launcherCompilation = await executeProcess("javac", [
      "-encoding",
      "UTF-8",
      "-d",
      absoluteOutputDirectory,
      referenceEnvironment.launcherSource,
    ]);
  } catch (cause) {
    throw launcherError(
      "Could not start javac for the classpath launcher",
      "IMPORT_CLOSURE_ORACLE_COMPILE_FAILED",
      { cause, stage: "classpath-launcher" },
    );
  }
  requireSuccessfulCompilation(launcherCompilation, "classpath-launcher");

  let oracleCompilation;
  try {
    oracleCompilation = await executeProcess("java", [
      "-cp",
      absoluteOutputDirectory,
      "RunWithClasspath",
      referenceEnvironment.classpathFile,
      absoluteOutputDirectory,
      "com.sun.tools.javac.Main",
      "-encoding",
      "UTF-8",
      "-d",
      absoluteOutputDirectory,
      referenceEnvironment.oracleSource,
    ]);
  } catch (cause) {
    throw launcherError(
      "Could not start the pinned OWLAPI oracle compilation",
      "IMPORT_CLOSURE_ORACLE_COMPILE_FAILED",
      { cause, stage: "oracle-source" },
    );
  }
  requireSuccessfulCompilation(oracleCompilation, "oracle-source");

  return {
    compiledOracleDirectory: absoluteOutputDirectory,
    stderr: [
      launcherCompilation.stderr,
      launcherCompilation.stdout,
      oracleCompilation.stderr,
      oracleCompilation.stdout,
    ]
      .filter(Boolean)
      .join("\n"),
  };
};

const parseJavaResult = (execution) => {
  let result;
  try {
    result = JSON.parse(execution.stdout.trim());
  } catch (cause) {
    throw launcherError(
      "Pinned Java import-closure oracle did not emit exactly one JSON result",
      execution.exitCode === 0
        ? "IMPORT_CLOSURE_ORACLE_RESULT_INVALID"
        : "IMPORT_CLOSURE_ORACLE_JAVA_FAILED",
      {
        cause,
        exitCode: execution.exitCode,
        stderr: execution.stderr,
        stdout: execution.stdout,
      },
    );
  }
  if (
    !result ||
    typeof result !== "object" ||
    Array.isArray(result) ||
    result.schemaVersion !== 1 ||
    !new Set(["MATCH", "MISMATCH", "ERROR"]).has(result.comparisonOutcome)
  ) {
    throw launcherError(
      "Pinned Java import-closure oracle emitted an invalid result contract",
      "IMPORT_CLOSURE_ORACLE_RESULT_INVALID",
      { exitCode: execution.exitCode, result },
    );
  }
  if ((execution.exitCode === 0) !== (result.comparisonOutcome === "MATCH")) {
    throw launcherError(
      "Pinned Java import-closure oracle exit status contradicts its result",
      "IMPORT_CLOSURE_ORACLE_RESULT_INVALID",
      { exitCode: execution.exitCode, result },
    );
  }
  return result;
};

export const executeImportClosureOracle = async (
  { catalogMappings, compiledOracleDirectory, rootPath, verifyOutputPath },
  referenceEnvironment,
  { executeProcess = defaultExecuteProcess } = {},
) => {
  const manifestDirectory = await mkdtemp(
    join(tmpdir(), "owlapi-import-closure-manifest-"),
  );
  try {
    const manifestPath = join(manifestDirectory, "catalog-mappings.json");
    const deterministicMappings = [...catalogMappings]
      .map(({ documentPath, ontologyIRI }) => ({
        documentPath: resolve(documentPath),
        ontologyIRI,
      }))
      .sort((left, right) =>
        compareUtf16CodeUnits(left.ontologyIRI, right.ontologyIRI),
      );
    await writeFile(
      manifestPath,
      `${JSON.stringify({ mappings: deterministicMappings, schemaVersion: 1 })}\n`,
      "utf8",
    );

    let execution;
    try {
      execution = await executeProcess("java", [
        "-cp",
        resolve(compiledOracleDirectory),
        "RunWithClasspath",
        referenceEnvironment.classpathFile,
        resolve(compiledOracleDirectory),
        "RunImportClosureContract",
        "--catalog-mappings",
        manifestPath,
        "--root",
        resolve(rootPath),
        "--verify-output",
        resolve(verifyOutputPath),
        "--pinned-revision",
        referenceEnvironment.pinnedRevision,
        "--owlapi-version",
        referenceEnvironment.owlapiVersion,
      ]);
    } catch (cause) {
      throw launcherError(
        "Could not start the pinned Java import-closure oracle",
        "IMPORT_CLOSURE_ORACLE_JAVA_FAILED",
        { cause },
      );
    }

    return {
      exitCode: execution.exitCode,
      result: parseJavaResult(execution),
      stderr: execution.stderr,
    };
  } finally {
    await rm(manifestDirectory, { force: true, recursive: true });
  }
};

export const runImportClosureContract = async (
  { catalogPath, rootPath, verifyOutputPath },
  { executeProcess = defaultExecuteProcess } = {},
) => {
  const resolvedPaths = {
    catalogPath: resolve(catalogPath),
    rootPath: resolve(rootPath),
    verifyOutputPath: resolve(verifyOutputPath),
  };
  await requireRegularFile(
    resolvedPaths.catalogPath,
    "IMPORT_CLOSURE_ORACLE_CATALOG_NOT_FOUND",
  );
  await requireRegularFile(
    resolvedPaths.rootPath,
    "IMPORT_CLOSURE_ORACLE_ROOT_NOT_FOUND",
  );
  await requireRegularFile(
    resolvedPaths.verifyOutputPath,
    "IMPORT_CLOSURE_ORACLE_VERIFY_OUTPUT_NOT_FOUND",
  );

  const catalogMappings = await parseOasisXmlCatalog(resolvedPaths.catalogPath);
  const referenceEnvironment = await resolvePinnedReferenceEnvironment({
    executeProcess,
  });
  const compiledOracleDirectory = await mkdtemp(
    join(tmpdir(), "owlapi-import-closure-oracle-"),
  );
  try {
    const compilation = await compileImportClosureOracle(
      referenceEnvironment,
      compiledOracleDirectory,
      { executeProcess },
    );
    const execution = await executeImportClosureOracle(
      {
        catalogMappings,
        compiledOracleDirectory,
        rootPath: resolvedPaths.rootPath,
        verifyOutputPath: resolvedPaths.verifyOutputPath,
      },
      referenceEnvironment,
      { executeProcess },
    );
    return {
      ...execution,
      stderr: [compilation.stderr, execution.stderr].filter(Boolean).join("\n"),
    };
  } finally {
    await rm(compiledOracleDirectory, { force: true, recursive: true });
  }
};

const runCommandLine = async () => {
  try {
    const execution = await runImportClosureContract(
      parseImportClosureContractArguments(process.argv.slice(2)),
    );
    if (execution.stderr) {
      process.stderr.write(execution.stderr);
    }
    process.stdout.write(`${JSON.stringify(execution.result)}\n`);
    process.exitCode = execution.exitCode;
  } catch (error) {
    const code =
      error instanceof ImportClosureOracleLauncherError
        ? error.code
        : "IMPORT_CLOSURE_ORACLE_LAUNCHER_UNEXPECTED";
    process.stderr.write(`${code}: ${error.message}\n`);
    const diagnostics = [error.stderr, error.stdout]
      .filter((value) => typeof value === "string" && value)
      .join("\n");
    if (diagnostics) {
      process.stderr.write(
        diagnostics.endsWith("\n") ? diagnostics : `${diagnostics}\n`,
      );
    }
    process.exitCode = 1;
  }
};

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  await runCommandLine();
}
