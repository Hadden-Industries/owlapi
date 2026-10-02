/** Same-input July parsing and closure qualification; never consumes historical merges. */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { parseArgs } from "node:util";
import { isStrictDescendantPath } from "../../scripts/release-artifacts.mjs";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  compileOntologyReferenceOracles,
  executeImportClosureOracle,
  resolvePinnedReferenceEnvironment,
} from "./run-import-closure-contract.mjs";
import { executeOntologyParsingOracle } from "./run-ontology-parsing-contract.mjs";
import {
  PACKAGE_NAME,
  PACKAGE_VERSION,
  assertPackageIdentity,
} from "../../scripts/package-identity.mjs";
import {
  fetchRegistryMetadata,
  installRegistryConsumer,
} from "../../scripts/public-registry-consumer.mjs";
import {
  reconcileStructuralDifferences,
  reconcileUnparsedRdf,
} from "./reconcile-structural-differences.mjs";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const MANIFEST_URL = new URL(
  "./universal-ontology-july-2026.json",
  import.meta.url,
);
const EXPECTED_DIFFERENCES_URL = new URL(
  "../../docs/compatibility/expected-differences.json",
  import.meta.url,
);
const sourceConfiguration = Object.freeze({
  parsingMode: "compatible",
  collectWarnings: true,
  remoteImports: false,
  remoteJsonLdContexts: false,
});
const verificationConfiguration = Object.freeze({
  ...sourceConfiguration,
  parsingMode: "strict",
});
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const writeJson = (path, value) =>
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });

export const verifyEvidenceDigests = async (entries) => {
  const changed = [];
  for (const { path, sha256: expected } of entries) {
    const actual = sha256(await readFile(path));
    if (actual !== expected) changed.push({ path, expected, actual });
  }
  return changed;
};

/** Bind source-mode evidence to actual bytes, including uncommitted task changes. */
export const captureSourceIdentity = async (repository) => {
  const git = (...args) =>
    execFileSync("git", ["-C", repository, ...args], {
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    });
  const paths = [
    ...new Set(
      git("ls-files", "--cached", "--others", "--exclude-standard", "-z")
        .split("\0")
        .filter(Boolean),
    ),
  ].sort();
  const files = [];
  for (const path of paths) {
    try {
      files.push({
        path,
        sha256: sha256(await readFile(join(repository, path))),
      });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      files.push({ path, sha256: null });
    }
  }
  return {
    mode: "SOURCE",
    head: git("rev-parse", "HEAD").trim(),
    contentSha256: sha256(JSON.stringify(files)),
    files,
  };
};

/** Generated evidence must not become a new input in the source fingerprint. */
export const assertSourceQualificationOutputDirectory = (
  repository,
  outputDirectory,
) => {
  const relativeOutput = relative(
    resolve(repository),
    resolve(outputDirectory),
  );
  if (
    isAbsolute(relativeOutput) ||
    relativeOutput === ".." ||
    relativeOutput.startsWith(`..${sep}`)
  )
    return;
  if (relativeOutput) {
    const ignored = spawnSync(
      "git",
      [
        "-C",
        repository,
        "check-ignore",
        "--quiet",
        "--no-index",
        "--",
        `${relativeOutput}${sep}`,
      ],
      {
        encoding: "utf8",
        windowsHide: true,
      },
    );
    if (ignored.error) throw ignored.error;
    if (ignored.status === 0) return;
    if (ignored.status !== 1)
      throw new Error(
        `Cannot determine output-directory ignore status: ${ignored.stderr}`,
      );
  }
  throw new Error(
    "Source-mode --output must be outside the owlapi checkout or in a Git-ignored directory",
  );
};

export const parseQualificationArguments = (args) => {
  const { values } = parseArgs({
    args,
    options: {
      "ontology-repository": { type: "string" },
      output: { type: "string" },
      candidate: { type: "string" },
      "registry-version": { type: "string" },
    },
  });
  if (!values["ontology-repository"] || !values.output) {
    throw new Error("--ontology-repository and --output are required");
  }
  if (values.candidate && values["registry-version"])
    throw new Error(
      "Candidate and public-registry modes are mutually exclusive",
    );
  if (
    values["registry-version"] &&
    values["registry-version"] !== PACKAGE_VERSION
  )
    throw new Error("Select the exact scoped RC version");
  return {
    ontologyRepository: values["ontology-repository"],
    outputDirectory: values.output,
    ...(values.candidate ? { candidateDirectory: values.candidate } : {}),
    ...(values["registry-version"]
      ? { registryVersion: values["registry-version"] }
      : {}),
  };
};

/** Read only allowlisted original blobs at one immutable commit, preserving dirty work. */
export const materializePinnedOntologySources = async (
  repository,
  outputDirectory,
  manifest,
) => {
  if (!/^[a-f0-9]{40}$/u.test(manifest.revision))
    throw new Error("An exact source revision is required");
  const paths = [
    ...new Set(
      [...manifest.roots, ...manifest.mappings].map(({ path }) => path),
    ),
  ];
  for (const path of paths) {
    if (
      !path.startsWith("src/") ||
      path.includes("\\") ||
      path
        .split("/")
        .some(
          (part) =>
            !part || part === ".." || part === "." || part.includes(":"),
        ) ||
      /-full(?:\.|$)/u.test(basename(path))
    ) {
      throw new Error(
        `Only original ontology source paths are permitted: ${path}`,
      );
    }
  }
  await mkdir(outputDirectory);
  const documents = [];
  for (const path of paths) {
    const bytes = execFileSync(
      "git",
      ["-C", resolve(repository), "show", `${manifest.revision}:${path}`],
      {
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const documentPath = join(outputDirectory, ...path.split("/"));
    await mkdir(dirname(documentPath), { recursive: true });
    await writeFile(documentPath, bytes, { flag: "wx" });
    documents.push({ path, sha256: sha256(bytes), bytes: bytes.length });
  }
  const locate = (entry) => ({
    ...entry,
    documentPath: join(outputDirectory, ...entry.path.split("/")),
  });
  return {
    revision: manifest.revision,
    documents,
    roots: manifest.roots.map(locate),
    catalogMappings: manifest.mappings.map(locate),
  };
};

/** Resolve only the approved package exports, for source and installed candidates alike. */
const loadPublicApi = async ({ packageDirectory, consumerDirectory }) => {
  const require = createRequire(
    join(consumerDirectory ?? packageDirectory, "package.json"),
  );
  const dependencyName = consumerDirectory ? "owlapi" : PACKAGE_NAME;
  const modules = await Promise.all(
    ["apibinding", "formats", "io", "model", "util"].map((subpath) => {
      const path = require.resolve(`${dependencyName}/${subpath}`);
      if (
        !isStrictDescendantPath(
          realpathSync(packageDirectory),
          realpathSync(path),
        )
      )
        throw new Error(
          "Ontology qualification resolved outside the selected package.",
        );
      return import(pathToFileURL(path).href);
    }),
  );
  return Object.assign({}, ...modules);
};

/** Public consumer composition: root metadata plus the structural union of direct axioms. */
export const generateOntologyEvidence = async ({
  rootPath,
  catalogMappings,
  outputDirectory,
  packageDirectory = REPOSITORY_ROOT,
  consumerDirectory,
}) => {
  const {
    OWLManager,
    OWLDocumentFormats,
    StringDocumentSource,
    StringDocumentTarget,
    IRI,
    SetOntologyID,
    AddOntologyAnnotation,
    OWLOntologyImportsClosureSetProvider,
    OWLOntologyMerger,
  } = await loadPublicApi({ packageDirectory, consumerDirectory });
  const mappings = new Map(
    catalogMappings.map(({ ontologyIRI, documentPath }) => [
      ontologyIRI,
      pathToFileURL(documentPath).href,
    ]),
  );
  if (mappings.size !== catalogMappings.length)
    throw new Error("Duplicate exact import mapping");
  const allowedDocumentIRIs = new Set(mappings.values());
  const importRequests = [];
  const sourceManager = OWLManager.createOWLOntologyManager({
    iriMappers: [
      {
        getDocumentIRI(iri) {
          const mapped = mappings.get(iri.value);
          if (!mapped)
            throw new Error(`Missing exact import mapping: ${iri.value}`);
          return IRI.create(mapped);
        },
      },
    ],
    documentLoader: {
      async load(iri) {
        if (!allowedDocumentIRIs.has(iri.value))
          throw new Error(`Unmapped document: ${iri.value}`);
        importRequests.push(iri.value);
        return new StringDocumentSource(
          await readFile(fileURLToPath(iri.value), "utf8"),
          { documentIRI: iri },
        );
      },
    },
  });
  const loaded = await sourceManager.loadOntologyGraphFromOntologyDocument(
    new StringDocumentSource(await readFile(rootPath, "utf8"), {
      documentIRI: IRI.create(pathToFileURL(rootPath).href),
    }),
    sourceConfiguration,
  );
  // Retain failed evidence as well as passing evidence. Recording a source model
  // with unconsumed triples does not qualify it as lossless.
  const diagnostics = loaded.documents.map(({ ontology, context }) => ({
    documentIRI: context.documentIRI?.value,
    ontologyIRI: ontology.getOntologyID().ontologyIRI?.value,
    diagnostics: context.diagnostics,
  }));
  const rejectedDiagnostics = diagnostics.flatMap(({ diagnostics: entries }) =>
    entries.filter(
      ({ code }) =>
        !new Set([
          "RDF_UNDECLARED_ANNOTATION_PROPERTY",
          "RDF_NAMED_DATATYPE_RESTRICTION",
        ]).has(code),
    ),
  );
  await mkdir(outputDirectory);
  const documents = [];
  for (const { ontology, context } of loaded.documents) {
    const target = new StringDocumentTarget();
    await sourceManager.saveOntology(
      ontology,
      OWLDocumentFormats.FUNCTIONAL,
      target,
    );
    const text = target.toString();
    const path = join(outputDirectory, `document-${documents.length}.ofn`);
    await writeFile(path, text, { flag: "wx" });
    documents.push({
      sourceDocumentPath: fileURLToPath(context.documentIRI.value),
      path,
      sha256: sha256(text),
      ontologyID: {
        ontologyIRI: ontology.getOntologyID().ontologyIRI?.value ?? null,
        versionIRI: ontology.getOntologyID().versionIRI?.value ?? null,
      },
    });
  }
  const targetManager = OWLManager.createOWLOntologyManager();
  const merged = new OWLOntologyMerger(
    new OWLOntologyImportsClosureSetProvider(sourceManager, loaded.ontology),
    false,
  ).createMergedOntology(targetManager);
  targetManager.applyChange(
    new SetOntologyID(merged, loaded.ontology.getOntologyID()),
  );
  for (const annotation of loaded.ontology.getAnnotations())
    targetManager.applyChange(new AddOntologyAnnotation(merged, annotation));
  const candidates = [];
  for (const [format, extension] of [
    ["FUNCTIONAL", "ofn"],
    ["RDF_XML", "rdf"],
  ]) {
    const target = new StringDocumentTarget();
    await targetManager.saveOntology(
      merged,
      OWLDocumentFormats[format],
      target,
    );
    const text = target.toString();
    const path = join(outputDirectory, `closure.${extension}`);
    await writeFile(path, text, { flag: "wx" });
    const reloader = OWLManager.createOWLOntologyManager({
      documentLoader: {
        load() {
          throw new Error("A collapsed document must not request imports");
        },
      },
    });
    const standalone = await reloader.loadOntologyGraphFromOntologyDocument(
      new StringDocumentSource(text, {
        documentIRI: IRI.create(pathToFileURL(path).href),
      }),
      verificationConfiguration,
    );
    const standaloneImports = standalone.ontology.getImportsDeclarations().size;
    if (standaloneImports !== 0 || standalone.importsClosure.length !== 1)
      throw new Error("Collapsed output is not standalone");
    candidates.push({
      format,
      path,
      sha256: sha256(text),
      standaloneImports,
      diagnostics: standalone.documents.flatMap(
        ({ context }) => context.diagnostics,
      ),
    });
  }
  return {
    candidates,
    documents,
    sourceLosslessness: rejectedDiagnostics.length === 0 ? "PASS" : "FAIL",
    importRequests,
    sourceConfiguration,
    verificationConfiguration,
    closureMembers: loaded.importsClosure.map((ontology) => ({
      ontologyIRI: ontology.getOntologyID().ontologyIRI?.value ?? null,
      versionIRI: ontology.getOntologyID().versionIRI?.value ?? null,
    })),
    diagnostics,
  };
};

/** Native npm installs only the verified retained tarball; Java never enters runtime deps. */
const installCandidate = async (candidateDirectory, outputDirectory) => {
  const candidate = JSON.parse(
    await readFile(join(candidateDirectory, "candidate-manifest.json"), "utf8"),
  );
  assertPackageIdentity(candidate.package);
  if (basename(candidate.tarball.fileName) !== candidate.tarball.fileName)
    throw new Error("Candidate tarball must be a basename");
  const tarballPath = resolve(candidateDirectory, candidate.tarball.fileName);
  if (sha256(await readFile(tarballPath)) !== candidate.tarball.sha256)
    throw new Error("Candidate tarball digest mismatch");
  if (!process.env.npm_execpath)
    throw new Error("Run candidate qualification through npm");
  const consumerDirectory = join(outputDirectory, "consumer");
  await mkdir(consumerDirectory);
  await writeJson(join(consumerDirectory, "package.json"), {
    name: "owlapi-july-ontology-qualification",
    private: true,
    type: "module",
    dependencies: { owlapi: pathToFileURL(tarballPath).href },
  });
  const log = execFileSync(
    process.execPath,
    [
      process.env.npm_execpath,
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
    ],
    {
      cwd: consumerDirectory,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  await writeFile(join(outputDirectory, "candidate-install.log"), log);
  assertPackageIdentity(
    JSON.parse(
      await readFile(
        join(consumerDirectory, "node_modules", "owlapi", "package.json"),
        "utf8",
      ),
    ),
  );
  return {
    packageDirectory: join(consumerDirectory, "node_modules", "owlapi"),
    consumerDirectory,
    identity: candidate,
  };
};

const identityKey = ({ ontologyIRI, versionIRI }) =>
  JSON.stringify([ontologyIRI, versionIRI]);
const sameIdentities = (left, right) =>
  left.length === right.length &&
  new Set(left.map(identityKey)).size === left.length &&
  new Set(right.map(identityKey)).size === right.length &&
  left.every((id) =>
    right.some((other) => identityKey(id) === identityKey(other)),
  );

/** Approve a closure only through fully reconciled documents and native merge propagation. */
export const reconcileFamilyEvidence = async (
  { source, documents, closures },
  context,
) => {
  const documentsById = new Map(
    documents.map((document) => [identityKey(document.ontologyID), document]),
  );
  const reconcileOracleDiagnostics = async (oracle) => {
    const sourceDiagnostics = [];
    for (const diagnostic of oracle.sourceDiagnostics ?? []) {
      const document = documentsById.get(identityKey(diagnostic.ontologyID));
      if (!document)
        return {
          status: "FAIL",
          sourceDiagnostics,
          reason: "UNKNOWN_SOURCE_ONTOLOGY",
        };
      sourceDiagnostics.push({
        ontologyID: diagnostic.ontologyID,
        ...(await reconcileUnparsedRdf(diagnostic.unparsedNQuads, {
          ...context,
          fixture: context.fixtureFor(document.sourceDocumentPath),
        })),
      });
    }
    const allowedOutcome =
      ["MATCH", "MISMATCH"].includes(oracle.comparisonOutcome) ||
      (oracle.comparisonOutcome === "ERROR" &&
        oracle.mismatchCategory === "SOURCE_UNPARSED_RDF");
    const success =
      allowedOutcome &&
      oracle.pinnedRevision === context.referenceRevision &&
      ["MATCH", "MISMATCH"].includes(oracle.structuralComparisonOutcome) &&
      Array.isArray(oracle.outputUnparsedTriples) &&
      oracle.outputUnparsedTriples.length === 0 &&
      oracle.networkEvidence?.networkAccessAttemptCount === 0 &&
      sameIdentities(oracle.closureMemberIds ?? [], source.closureMembers) &&
      sameIdentities(
        sourceDiagnostics.map(({ ontologyID }) => ontologyID),
        source.closureMembers,
      ) &&
      sourceDiagnostics.every(
        ({ reconciliation }) => reconciliation.status === "PASS",
      );
    return { status: success ? "PASS" : "FAIL", sourceDiagnostics };
  };
  const parsingDocuments = [];
  for (const document of documents) {
    const diagnostics = await reconcileOracleDiagnostics(document.oracle);
    const structural = reconcileStructuralDifferences(
      document.oracle.structuralDifferences,
      {
        ...context,
        fixture: context.fixtureFor(document.sourceDocumentPath),
      },
    );
    parsingDocuments.push({
      ontologyID: document.ontologyID,
      structural,
      diagnostics,
      status:
        structural.status === "PASS" && diagnostics.status === "PASS"
          ? "PASS"
          : "FAIL",
    });
  }
  const parsingStatus =
    source.sourceLosslessness === "PASS" &&
    sameIdentities(
      documents.map(({ ontologyID }) => ontologyID),
      source.closureMembers,
    ) &&
    parsingDocuments.every(({ status }) => status === "PASS")
      ? "PASS"
      : "FAIL";
  const closureResults = [];
  for (const closure of closures) {
    const diagnostics = await reconcileOracleDiagnostics(closure.oracle);
    const propagation = closure.oracle.propagationEvidence;
    const exactPropagation =
      propagation?.comparisonOutcome === "MATCH" &&
      reconcileStructuralDifferences(propagation.structuralDifferences, {
        ...context,
        rules: [],
      }).status === "PASS";
    closureResults.push({
      format: closure.format,
      diagnostics,
      status:
        parsingStatus === "PASS" &&
        diagnostics.status === "PASS" &&
        exactPropagation &&
        closure.diagnostics.length === 0
          ? "PASS"
          : "FAIL",
    });
  }
  const completeClosures =
    closures.length === 2 &&
    ["FUNCTIONAL", "RDF_XML"].every((format) =>
      closures.some((closure) => closure.format === format),
    );
  return {
    status:
      parsingStatus === "PASS" &&
      completeClosures &&
      closureResults.every(({ status }) => status === "PASS")
        ? "PASS"
        : "FAIL",
    parsingStatus,
    parsingDocuments,
    closures: closureResults,
  };
};

/** Enforced gate: missing prerequisites or any missing/mismatching family fail the run. */
export const qualifyUniversalOntology = async ({
  ontologyRepository,
  outputDirectory,
  candidateDirectory,
  registryVersion,
}) => {
  if (candidateDirectory && registryVersion)
    throw new Error(
      "Candidate and public-registry modes are mutually exclusive",
    );
  if (registryVersion && registryVersion !== PACKAGE_VERSION)
    throw new Error("Select the exact scoped RC version");
  const output = resolve(outputDirectory);
  if (registryVersion) {
    const resolvedOutput = join(
      realpathSync(dirname(output)),
      basename(output),
    );
    const resolvedRepository = realpathSync(REPOSITORY_ROOT);
    if (
      resolvedOutput === resolvedRepository ||
      isStrictDescendantPath(resolvedRepository, resolvedOutput)
    )
      throw new Error(
        "Public-registry qualification requires output outside the owlapi checkout.",
      );
  } else if (!candidateDirectory)
    assertSourceQualificationOutputDirectory(REPOSITORY_ROOT, output);
  const reference = await resolvePinnedReferenceEnvironment();
  const manifest = JSON.parse(await readFile(MANIFEST_URL, "utf8"));
  const registry = JSON.parse(await readFile(EXPECTED_DIFFERENCES_URL, "utf8"));
  await mkdir(output);
  const sources = await materializePinnedOntologySources(
    ontologyRepository,
    join(output, "sources"),
    manifest,
  );
  const installed = registryVersion
    ? {
        packageDirectory: join(output, "consumer", "node_modules", "owlapi"),
        consumerDirectory: join(output, "consumer"),
        identity: installRegistryConsumer({
          directory: join(output, "consumer"),
          metadata: await fetchRegistryMetadata(registryVersion),
        }).identity,
      }
    : candidateDirectory
      ? await installCandidate(resolve(candidateDirectory), output)
      : {
          packageDirectory: REPOSITORY_ROOT,
          identity: await captureSourceIdentity(REPOSITORY_ROOT),
        };
  const compilation = await compileOntologyReferenceOracles(
    reference,
    join(output, "java"),
  );
  const parsingResults = [];
  const closureResults = [];
  const familyReconciliations = [];
  const fixtureFor = (documentPath) => {
    const entry = sources.catalogMappings.find(
      (mapping) => resolve(mapping.documentPath) === resolve(documentPath),
    );
    if (!entry)
      throw new Error(`No pinned source identity for ${documentPath}`);
    return `universal-ontology@${manifest.revision}:${entry.path}`;
  };
  for (const root of sources.roots) {
    try {
      const generated = await generateOntologyEvidence({
        rootPath: root.documentPath,
        catalogMappings: sources.catalogMappings,
        outputDirectory: join(output, root.name),
        packageDirectory: installed.packageDirectory,
        consumerDirectory: installed.consumerDirectory,
      });
      const documents = [];
      for (const document of generated.documents) {
        const execution = await executeOntologyParsingOracle(
          {
            catalogMappings: sources.catalogMappings,
            compiledOracleDirectory: compilation.compiledOracleDirectory,
            rootPath: root.documentPath,
            sourceDocumentPath: document.sourceDocumentPath,
            verifyOutputPath: document.path,
          },
          reference,
        );
        await writeFile(`${document.path}.java.log`, execution.stderr);
        await writeJson(`${document.path}.java.json`, execution.result);
        documents.push({ ...document, oracle: execution.result });
      }
      const source = {
        ...generated,
        candidates: undefined,
        documents: undefined,
      };
      parsingResults.push({ family: root.name, source, documents });
      const closures = [];
      for (const candidate of generated.candidates) {
        const execution = await executeImportClosureOracle(
          {
            catalogMappings: sources.catalogMappings,
            compiledOracleDirectory: compilation.compiledOracleDirectory,
            rootPath: root.documentPath,
            verifyOutputPath: candidate.path,
            parsedSourceModels: generated.documents.map(
              ({ sourceDocumentPath, path }) => ({
                sourceDocumentPath,
                modelPath: path,
              }),
            ),
          },
          reference,
        );
        await writeFile(
          join(output, root.name, `${candidate.format}.java.log`),
          execution.stderr,
        );
        await writeJson(
          join(output, root.name, `${candidate.format}.java.json`),
          execution.result,
        );
        const closure = {
          family: root.name,
          ...candidate,
          sourceLosslessness: generated.sourceLosslessness,
          oracle: execution.result,
        };
        closures.push(closure);
        closureResults.push(closure);
      }
      familyReconciliations.push({
        family: root.name,
        ...(await reconcileFamilyEvidence(
          { source, documents, closures },
          {
            fixtureFor,
            rules: registry.rules,
            referenceRevision: reference.pinnedRevision,
          },
        )),
      });
    } catch (error) {
      const failure = {
        family: root.name,
        error: {
          name: error.name,
          message: error.message,
          code: error.code,
          reason: error.reason,
          details: error.details,
          subject: error.subject,
          predicate: error.predicate,
          object: error.object,
        },
      };
      parsingResults.push(failure);
      closureResults.push(failure);
      process.stderr.write(`${root.name}: ${error.stack}\n`);
    }
  }
  const finalSourceIdentity =
    candidateDirectory || registryVersion
      ? undefined
      : await captureSourceIdentity(REPOSITORY_ROOT);
  const candidateUnchanged =
    candidateDirectory ||
    registryVersion ||
    installed.identity.contentSha256 === finalSourceIdentity.contentSha256;
  const changedArtifacts = await verifyEvidenceDigests([
    ...sources.documents.map((entry) => ({
      path: join(output, "sources", entry.path),
      sha256: entry.sha256,
    })),
    ...parsingResults.flatMap(({ documents }) => documents ?? []),
    ...closureResults.filter(({ path }) => path),
  ]);
  const success =
    candidateUnchanged &&
    changedArtifacts.length === 0 &&
    parsingResults.length === manifest.roots.length &&
    closureResults.length === manifest.roots.length * 2 &&
    familyReconciliations.length === manifest.roots.length &&
    familyReconciliations.every(({ status }) => status === "PASS");
  const result = {
    schemaVersion: 1,
    status: success ? "PASS" : "FAIL",
    stage: "PRE_INTEGRATION",
    sources,
    candidate: installed.identity,
    candidateUnchanged: Boolean(candidateUnchanged),
    changedArtifacts,
    ...(candidateUnchanged ? {} : { finalSourceIdentity }),
    java: {
      revision: reference.pinnedRevision,
      version: reference.owlapiVersion,
    },
    parsingResults,
    closureResults,
    familyReconciliations,
  };
  await writeJson(join(output, "qualification.json"), result);
  return result;
};

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    const arguments_ = parseQualificationArguments(process.argv.slice(2));
    const result = await qualifyUniversalOntology(arguments_);
    process.stdout.write(
      `${JSON.stringify({
        status: result.status,
        report: join(resolve(arguments_.outputDirectory), "qualification.json"),
        families: result.familyReconciliations.map(
          ({ family, status, parsingStatus, closures }) => ({
            family,
            status,
            parsingStatus,
            closures: closures.map(({ format, status }) => ({
              format,
              status,
            })),
          }),
        ),
      })}\n`,
    );
    process.exitCode = result.status === "PASS" ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error.stack}\n`);
    process.exitCode = 1;
  }
}
