import { constants as bufferLimits } from "node:buffer";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import { basename, dirname, join } from "node:path";
import { comparisonSyntaxes } from "./comparison-fixtures.mjs";
import {
  comparisonStageFailure as failure,
  publishComparisonChunks,
  publishComparisonFile,
  publishComparisonJson,
  sha256,
  isRetryableStrictRefusal,
} from "./comparison-evidence.mjs";
import { loadPublicApi } from "./qualify-universal-ontology.mjs";
import { observeConfiguration } from "./comparison-configuration.mjs";
import { observeMutation } from "./comparison-mutation.mjs";
import { observeLoadPublication } from "./comparison-load-publication.mjs";
import { observeStorage } from "./comparison-storage.mjs";
import { observeLiteralConstruction } from "./comparison-literal-construction.mjs";
import { observeQueryBehavior } from "./comparison-query.mjs";
import { observeParserBehavior } from "./comparison-parser-behavior.mjs";
import { observeProfileIdentity } from "./comparison-profile-identity.mjs";
import { observeLocalityBehavior } from "./comparison-locality.mjs";
import { observeXmlProvider } from "./comparison-xml-provider.mjs";
import {
  observeJsonLdContextProvider,
  observeJsonLdFirstStructure,
} from "./comparison-jsonld.mjs";
import { observeTransport } from "./comparison-transport.mjs";

const iriValue = (iri) => iri?.value ?? null;
const ontologyIdentity = (ontology) => ({
  ontologyIRI: iriValue(ontology.getOntologyID().ontologyIRI),
  versionIRI: iriValue(ontology.getOntologyID().versionIRI),
});

function cgmesWitnesses(ontology, input) {
  if (input !== "entsoe-cgmes-eq" && input !== "cgmes-range-less") return {};
  const cim = "http://iec.ch/TC57/CIM100#";
  const real = input === "entsoe-cgmes-eq";
  const property = real ? cim + "ACLineSegment.r" : "urn:owlapi:cgmes:property";
  const domain = real ? cim + "ACLineSegment" : "urn:owlapi:cgmes:Class";
  const value = real ? cim + "Resistance" : "urn:owlapi:cgmes:Resistance";
  const annotation = real
    ? "http://iec.ch/TC57/1999/rdf-schema-extensions-19990926#dataType"
    : "urn:owlapi:cgmes:dataType";
  const witnesses = { domain: false, publisherValue: false };
  for (const axiom of ontology.getAxioms()) {
    if (
      axiom.kind === "OWLAnnotationPropertyDomainAxiom" &&
      iriValue(axiom.property.iri) === property &&
      iriValue(axiom.domain) === domain
    ) {
      witnesses.domain = true;
    }
    if (
      axiom.kind === "OWLAnnotationAssertionAxiom" &&
      iriValue(axiom.property.iri) === annotation &&
      iriValue(axiom.subject) === property &&
      iriValue(axiom.value) === value
    ) {
      witnesses.publisherValue = true;
    }
  }
  return witnesses;
}

async function storeModel(
  api,
  manager,
  ontology,
  format,
  name,
  directory,
  streamed = false,
) {
  if (streamed && typeof api.StreamDocumentTarget === "function") {
    let artifact;
    const target = new api.StreamDocumentTarget(async (chunks) => {
      artifact = await publishComparisonChunks(directory, name, chunks);
    });
    try {
      await manager.saveOntology(
        ontology,
        api.OWLDocumentFormats[format],
        target,
      );
      return { status: "completed", artifact };
    } catch (error) {
      return failure("save", error);
    }
  }
  const target = new api.StringDocumentTarget();
  try {
    await manager.saveOntology(
      ontology,
      api.OWLDocumentFormats[format],
      target,
    );
  } catch (error) {
    const prefix = target.toString();
    return {
      ...failure("save", error),
      ...(prefix.length
        ? {
            prefix: await publishComparisonFile(
              directory,
              name + ".failed-prefix",
              prefix,
            ),
          }
        : {}),
    };
  }
  return {
    status: "completed",
    artifact: await publishComparisonFile(directory, name, target.toString()),
  };
}

async function recordSourceModels(
  api,
  manager,
  loaded,
  result,
  request,
  directory,
) {
  result.documentModels = [];
  for (const [index, { ontology, context }] of loaded.documents.entries()) {
    const model = await storeModel(
      api,
      manager,
      ontology,
      "FUNCTIONAL",
      `js-direct-${index}.ofn`,
      directory,
    );
    const documentModel = {
      documentIRI: iriValue(context.documentIRI),
      ...model,
    };
    result.documentModels.push(documentModel);
    await publishComparisonJson(directory, `js-direct-${index}.json`, {
      schemaVersion: 1,
      caseId: request.caseId,
      executionId: request.executionId,
      stage: "direct-functional-write",
      ...documentModel,
    });
  }
}

async function roundTripClosure(
  api,
  manager,
  loaded,
  result,
  request,
  directory,
  parameters,
) {
  await recordSourceModels(api, manager, loaded, result, request, directory);
  const mergerManager = api.OWLManager.createOWLOntologyManager(parameters);
  let merged;
  try {
    merged = new api.OWLOntologyMerger(
      new api.OWLOntologyImportsClosureSetProvider(manager, loaded.ontology),
      false,
    ).createMergedOntology(mergerManager);
    mergerManager.applyChange(
      new api.SetOntologyID(merged, loaded.ontology.getOntologyID()),
    );
    for (const annotation of loaded.ontology.getAnnotations()) {
      mergerManager.applyChange(
        new api.AddOntologyAnnotation(merged, annotation),
      );
    }
    result.merge = {
      status: "completed",
      identity: ontologyIdentity(merged),
      axioms: merged.getAxiomCount(),
    };
  } catch (error) {
    result.merge = failure("merge", error);
    return;
  }

  result.functional = await storeModel(
    api,
    mergerManager,
    merged,
    "FUNCTIONAL",
    "js-model.ofn",
    directory,
  );
  result.rdfXmlWrite = await storeModel(
    api,
    mergerManager,
    merged,
    "RDF_XML",
    "js-closure.rdf",
    directory,
  );
  if (result.functional.status === "completed") {
    result.functionalReload = await reloadClosure(
      api,
      directory,
      request,
      parameters,
      "FUNCTIONAL",
      result.functional.artifact.name,
      "js-functional-reloaded.ofn",
    );
  }
  if (result.rdfXmlWrite.status === "completed") {
    result.rdfXmlReload = await reloadClosure(
      api,
      directory,
      request,
      parameters,
      "RDF_XML",
      result.rdfXmlWrite.artifact.name,
      "js-rdfxml-reloaded.ofn",
    );
  }
}

async function reloadClosure(
  api,
  directory,
  request,
  parameters,
  format,
  name,
  output,
) {
  const settings = {
    ...parameters,
    collectWarnings: true,
    parsingMode:
      parameters.behaviorProfileId === "normative-v1"
        ? "strict"
        : parameters.parsingMode,
    remoteImports: false,
    remoteJsonLdContexts: false,
  };
  let importAttempts = 0;
  try {
    const reloader = api.OWLManager.createOWLOntologyManager({
      ...settings,
      documentLoader: {
        load() {
          importAttempts++;
          throw new Error("A merged document cannot load imports");
        },
      },
    });
    const source = new api.StringDocumentSource(
      await readFile(join(directory, name), "utf8"),
      {
        documentIRI: api.IRI.create(request.document.documentIRI),
        format: api.OWLDocumentFormats[format],
      },
    );
    const graph = await reloader.loadOntologyGraphFromOntologyDocument(
      source,
      new api.OWLOntologyLoaderConfiguration(settings),
    );
    const diagnostics = graph.documents.flatMap(
      ({ context }) => context.diagnostics ?? [],
    );
    if (
      importAttempts ||
      graph.ontology.getImportsDeclarations().size ||
      graph.importsClosure.length !== 1
    ) {
      throw new Error(`Merged ${format} reload retained imports`);
    }
    const functional = await storeModel(
      api,
      reloader,
      graph.ontology,
      "FUNCTIONAL",
      output,
      directory,
    );
    return {
      status: functional.status,
      parsingMode: settings.parsingMode,
      importAttempts,
      diagnostics,
      identity: ontologyIdentity(graph.ontology),
      axioms: graph.ontology.getAxiomCount(),
      functional,
    };
  } catch (error) {
    return failure(
      format === "RDF_XML" ? "rdfxml-reload" : "functional-reload",
      error,
    );
  }
}

async function loadStrictFirst({
  manager,
  createManager,
  configuration,
  load,
  attempts,
}) {
  try {
    const value = await load(manager, configuration.withParsingMode("strict"));
    attempts.push({ parsingMode: "strict", status: "completed" });
    return { manager, value };
  } catch (error) {
    const refusal = failure("load", error);
    attempts.push({ parsingMode: "strict", ...refusal });
    if (!isRetryableStrictRefusal(refusal)) throw error;
  }

  // A rejected load can have staged bindings. The downstream retry starts
  // with a fresh manager and reuses the exact document source.
  manager = createManager();
  try {
    const value = await load(manager, configuration);
    attempts.push({ parsingMode: "compatible", status: "completed" });
    return { manager, value };
  } catch (error) {
    attempts.push({ parsingMode: "compatible", ...failure("load", error) });
    throw error;
  }
}

async function captureLiveAllocations(directory, sampleId) {
  // The process-exit profile may observe a collected model. Capture this
  // sample at public load completion, before inspecting or copying its data.
  const { Session } = await import("node:inspector/promises");
  const session = new Session();
  session.connect();
  try {
    const { profile } = await session.post("HeapProfiler.getSamplingProfile");
    return await publishComparisonJson(
      directory,
      sampleId + "-load.heapprofile",
      profile,
    );
  } finally {
    session.disconnect();
  }
}

async function sampleLoad(
  request,
  openDocument,
  createManager,
  configuration,
  networkRequests,
  directory,
) {
  const { caseId, performance: protocol } = request;
  const emit = (message) =>
    process.stdout.write(
      JSON.stringify({
        caseId,
        executionId: request.executionId,
        sampleId: protocol.sampleId,
        ...message,
      }) + "\n",
    );
  const checkpoint = async (phase) => {
    const waiting = once(process.stdin, "data");
    const { heapUsed, heapTotal, external, arrayBuffers } =
      process.memoryUsage();
    emit({
      kind: "checkpoint",
      phase,
      pid: process.pid,
      heapUsedBytes: heapUsed,
      heapTotalBytes: heapTotal,
      externalBytes: external,
      arrayBufferBytes: arrayBuffers,
    });
    process.stdin.resume();
    await waiting;
    process.stdin.pause();
  };
  const cold = protocol.mode === "cold";
  const warmups = cold ? 0 : protocol.warmups;
  const repetitions = cold ? 1 : protocol.repetitions;
  const wallNanos = [];
  const loadSequences = request.scenario === "strict-first" ? [] : undefined;
  let ontology;
  let sourceTransport;
  let allocationProfile;
  try {
    for (let index = 0; index < warmups + repetitions; index++) {
      ontology = null;
      let manager = createManager();
      const document = await openDocument(request.document);
      sourceTransport =
        typeof document.openBytes === "function" ? "stream" : "string";
      if (
        request.sourceTransport &&
        request.sourceTransport !== "auto" &&
        request.sourceTransport !== sourceTransport
      )
        throw new Error(
          "Installed candidate cannot provide the selected input transport",
        );
      if (cold) await checkpoint("before");
      const start = performance.now();
      if (loadSequences) {
        const attempts = [];
        if (index >= warmups) loadSequences.push(attempts);
        const retry = loadStrictFirst({
          manager,
          createManager,
          configuration,
          load: (active, config) =>
            active.loadOntologyFromOntologyDocument(document, config),
          attempts,
        });
        // The attempt sequence owns the strict manager.
        manager = undefined;
        ({ value: ontology } = await retry);
      } else {
        ontology = await manager.loadOntologyFromOntologyDocument(
          document,
          configuration,
        );
      }
      const nanos = Math.round((performance.now() - start) * 1e6);
      if (cold) await checkpoint("after");
      if (protocol.allocationProfile)
        allocationProfile = await captureLiveAllocations(
          directory,
          protocol.sampleId,
        );
      if (index >= warmups) wallNanos.push(nanos);
    }
    const witness = protocol.loadOnly && {
      identity: ontologyIdentity(ontology),
      axioms: ontology.getAxiomCount(),
      ontologyAnnotations: ontology.getAnnotations().size,
      imports: [...ontology.getImportsDeclarations()]
        .map(({ iri }) => iriValue(iri))
        .sort(),
    };
    if (protocol.materializeAxioms) {
      const materialized = ontology.getAxioms();
      await checkpoint("materialized");
      if (materialized.size !== witness.axioms)
        throw new Error("Materialized axiom set differs from the direct count");
    }
    emit({
      kind: "sample",
      status: "completed",
      wallNanos,
      axioms: ontology.getAxiomCount(),
      networkAttempts: networkRequests.length,
      ...(witness ? { witness, sourceTransport } : {}),
      ...(allocationProfile ? { allocationProfile } : {}),
      ...(loadSequences ? { loadSequences } : {}),
    });
  } catch (error) {
    emit({
      kind: "sample",
      ...failure("public-load", error),
      wallNanos,
      ...(loadSequences ? { loadSequences } : {}),
    });
  }
}

async function observeLargeLiteral(api, request) {
  const options = { behaviorProfileId: request.behaviorProfileId };
  const manager = api.OWLManager.createOWLOntologyManager(options);
  const normative = api.OWLManager.createOWLOntologyManager();
  const recipe = request.literal;
  const id = manager
    .getOWLDataFactory()
    .getOWLOntologyID(api.IRI.create(recipe.ontologyIRI));
  const present = () => Boolean(normative.getOntology(id));
  const before = present();
  const format =
    api.OWLDocumentFormats[comparisonSyntaxes[recipe.syntax].format];
  const observation = {
    caseId: request.caseId,
    schemaVersion: 1,
    operation: request.scenario,
    effectiveSettings: {
      ...options,
      parsingMode: request.parsingMode,
      defaultBehaviorProfileId: normative.getBehaviorProfileId(),
    },
    networkRequests: [],
  };
  globalThis.fetch = async (input) => {
    observation.networkRequests.push(String(input));
    throw new Error("Comparison workers run offline");
  };
  let phase = "construct";
  try {
    const factory = manager.getOWLDataFactory();
    const subject = api.IRI.create(recipe.subjectIRI);
    const ontology = manager.createOntology(id);
    manager.addAxiom(
      ontology,
      factory.getOWLAnnotationAssertionAxiom(
        factory.getRDFSLabel(),
        subject,
        factory.getOWLLiteral(recipe.character.repeat(recipe.length)),
      ),
    );
    phase = "save";
    const target = new api.StringDocumentTarget();
    await manager.saveOntology(ontology, format, target);
    const saved = target.toString();
    const source = new api.StringDocumentSource(saved, { format });
    phase = "compatible-reload";
    const reloaded =
      await api.OWLManager.createOWLOntologyManager(
        options,
      ).loadOntologyFromOntologyDocument(source);
    const literal = [...reloaded.getAxioms()][0]?.value?.lexicalForm;
    if (typeof literal !== "string")
      throw new Error("Reload did not preserve the assertion literal");
    phase = "normative-reload";
    let refusal;
    try {
      await normative.loadOntologyFromOntologyDocument(source);
      refusal = { status: "completed" };
    } catch (error) {
      refusal = failure(phase, error);
    }
    observation.literal = {
      documentBytes: Buffer.byteLength(saved),
      documentSha256: sha256(saved),
      reloadedLength: literal.length,
      literalSha256: sha256(literal),
      normative: {
        ...refusal,
        ontologyPresentBefore: before,
        ontologyPresentAfter: present(),
      },
    };
    observation.load = { status: "completed" };
  } catch (error) {
    observation.load = failure(phase, error);
  }
  return observation;
}

function observeManchesterLiteral(api, request) {
  const { ManchesterOWLSyntaxOWLObjectRendererImpl: Renderer } = api;
  const options = { behaviorProfileId: request.behaviorProfileId };
  const observation = {
    caseId: request.caseId,
    schemaVersion: 1,
    operation: request.scenario,
    effectiveSettings: {},
    networkRequests: [],
  };
  globalThis.fetch = async (input) => {
    observation.networkRequests.push(String(input));
    throw new Error("Comparison workers run offline");
  };
  let phase = "construct";
  try {
    const factory =
      api.OWLManager.createOWLOntologyManager(options).getOWLDataFactory();
    const { character, length } = request.literal;
    const literal = factory.getOWLLiteral(character.repeat(length));
    const renderer = new Renderer(options);
    const normative = new Renderer();
    observation.effectiveSettings = {
      behaviorProfileId: renderer.getBehaviorProfileId(),
      defaultBehaviorProfileId: normative.getBehaviorProfileId(),
    };
    phase = "render";
    const rendered = renderer.render(literal);
    let refusal;
    try {
      normative.render(literal);
      refusal = { status: "completed" };
    } catch (error) {
      refusal = failure("normative-render", error);
    }
    observation.literal = {
      lexicalLength: literal.lexicalForm.length,
      literalSha256: sha256(literal.lexicalForm),
      renderedBytes: Buffer.byteLength(rendered),
      renderedSha256: sha256(rendered),
      normative: refusal,
    };
    observation.load = { status: "completed" };
  } catch (error) {
    observation.load = failure(phase, error);
  }
  return observation;
}

async function observe(request, directory) {
  const includeManchesterRenderer =
    request.scenario === "large-literal-rendering";
  const api = await loadPublicApi({
    ...request,
    includeManchesterRenderer,
    includeSearch: Boolean(request.queryBehavior),
    includeLocality: Boolean(request.localityBehavior),
    includeNodeTransport: Boolean(request.transport),
  });
  const publicObservers = {
    configuration: observeConfiguration,
    mutation: observeMutation,
    loadPublication: observeLoadPublication,
    storage: observeStorage,
    literalConstruction: observeLiteralConstruction,
    queryBehavior: observeQueryBehavior,
    parserBehavior: observeParserBehavior,
    profileIdentity: observeProfileIdentity,
    localityBehavior: observeLocalityBehavior,
    xmlProvider: observeXmlProvider,
    jsonLdFirstStructure: observeJsonLdFirstStructure,
    jsonLdContextProvider: observeJsonLdContextProvider,
    transport: observeTransport,
  };
  const publicOperation = Object.keys(publicObservers).find(
    (key) => request[key],
  );
  if (publicOperation) {
    const networkRequests = [];
    globalThis.fetch = async (input) => {
      networkRequests.push(String(input));
      throw new Error("Comparison workers run offline");
    };
    return {
      ...(await publicObservers[publicOperation](api, request, directory)),
      networkRequests,
    };
  }
  if (includeManchesterRenderer) return observeManchesterLiteral(api, request);
  if (request.literal) return observeLargeLiteral(api, request);
  const importRequests = [];
  const networkRequests = [];
  const parameters = {
    behaviorProfileId: request.behaviorProfileId,
    parsingMode: request.parsingMode,
  };
  const definitionByIri = new Map();
  const documentByIri = new Map();
  for (const entry of request.imports) {
    definitionByIri.set(entry.ontologyIRI, entry.documentIRI);
    documentByIri.set(entry.documentIRI, entry);
  }
  const usesByteStream = (document) =>
    (request.sourceTransport === "stream" ||
      (request.sourceTransport !== "string" &&
        document.byteLength > bufferLimits.MAX_STRING_LENGTH)) &&
    typeof api.StreamDocumentSource === "function";
  const loadMemory = usesByteStream(request.document) ? [] : null;
  let ingressRecorded = false;
  const measureLoadPhase = (phase) => {
    if (loadMemory) {
      const { rss, heapUsed } = process.memoryUsage();
      loadMemory.push({
        phase,
        rss,
        heapUsed,
        peakRssKiB: process.resourceUsage().maxRSS,
      });
    }
  };
  const openDocument = async (document) => {
    const { format, mime } = comparisonSyntaxes[document.syntax];
    if (usesByteStream(document)) {
      return new api.StreamDocumentSource(
        async function* (signal) {
          // Preparation and readback verify the pin outside the timed load.
          const digest = request.performance ? null : createHash("sha256");
          let inputBytes = 0;
          for await (const bytes of createReadStream(document.path, {
            signal,
          })) {
            inputBytes += bytes.byteLength;
            digest?.update(bytes);
            yield bytes;
          }
          const sha256 = digest?.digest("hex");
          if (
            inputBytes !== document.byteLength ||
            (digest && sha256 !== document.sha256)
          )
            throw new Error(
              "Streamed ontology input no longer matches its pin",
            );
          if (document === request.document && !request.performance) {
            measureLoadPhase("input-consumed");
            if (!ingressRecorded) {
              await publishComparisonJson(directory, "js-stream-ingress.json", {
                caseId: request.caseId,
                executionId: request.executionId,
                inputBytes,
                sha256,
                loadMemory,
              });
              ingressRecorded = true;
            }
          }
        },
        {
          documentIRI: api.IRI.create(document.documentIRI),
          contentType: mime,
          format: api.OWLDocumentFormats[format],
        },
      );
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      await readFile(document.path),
    );
    return new api.StringDocumentSource(text, {
      documentIRI: api.IRI.create(document.documentIRI),
      format: api.OWLDocumentFormats[format],
      contentType: mime,
    });
  };
  globalThis.fetch = async (input) => {
    networkRequests.push(String(input));
    throw new Error("Comparison workers run offline");
  };
  const createManager = () =>
    api.OWLManager.createOWLOntologyManager({
      behaviorProfileId: request.behaviorProfileId,
      iriMappers: [
        {
          getDocumentIRI(iri) {
            const documentIRI = definitionByIri.get(iri.value) ?? null;
            importRequests.push({ ontologyIRI: iri.value, documentIRI });
            if (!documentIRI)
              throw new Error(
                `No exact comparison import mapping for ${iri.value}`,
              );
            return api.IRI.create(documentIRI);
          },
        },
      ],
      documentLoader: {
        async load(iri) {
          const document = documentByIri.get(iri.value);
          if (!document)
            throw new Error(`Unmapped comparison document: ${iri.value}`);
          return openDocument(document);
        },
      },
    });
  const configuration = new api.OWLOntologyLoaderConfiguration({
    ...parameters,
    ...request.loaderOptions,
  });
  if (request.performance) {
    await sampleLoad(
      request,
      openDocument,
      createManager,
      configuration,
      networkRequests,
      directory,
    );
    return null;
  }
  let manager = createManager();
  const result = {
    caseId: request.caseId,
    schemaVersion: 1,
    operation: "loadOntologyGraphFromOntologyDocument",
    effectiveSettings: {
      ...parameters,
      behaviorProfileId: manager.getBehaviorProfileId(),
      defaultBehaviorProfileId:
        api.OWLManager.createOWLOntologyManager().getBehaviorProfileId(),
      remoteImports: configuration.remoteImports,
      remoteJsonLdContexts: configuration.remoteJsonLdContexts,
      documentIRI: request.document.documentIRI,
      syntax: request.document.syntax,
    },
    importRequests,
    networkRequests,
  };
  let loaded;
  if (loadMemory) result.loadMemory = loadMemory;
  try {
    measureLoadPhase("before-load");
    const source = await openDocument(request.document);
    if (request.scenario === "strict-first") {
      result.loadAttempts = [];
      const retry = loadStrictFirst({
        manager,
        createManager,
        configuration,
        load: (active, config) =>
          active.loadOntologyGraphFromOntologyDocument(source, config),
        attempts: result.loadAttempts,
      });
      // The attempt sequence can release the rejected manager before retrying.
      manager = undefined;
      ({ manager, value: loaded } = await retry);
    } else {
      loaded = await manager.loadOntologyGraphFromOntologyDocument(
        source,
        configuration,
      );
    }
  } catch (error) {
    measureLoadPhase("load-failed");
    result.load = failure("load", error);
    if (
      error?.code === "ONTOLOGY_STATE_INVALID" &&
      error.reason === "RDF_HEADER_ID_COLLISION" &&
      Array.isArray(error.ontologyIDs)
    ) {
      result.load.collisionIdentities = error.ontologyIDs.map((id) => ({
        ontologyIRI: iriValue(id.ontologyIRI),
        versionIRI: iriValue(id.versionIRI),
      }));
    }
    await publishComparisonJson(directory, "js-source-load.json", result);
    return result;
  }
  measureLoadPhase("load-completed");
  const { ontology, documents, importsClosure } = loaded;
  result.load = {
    status: "completed",
    identity: ontologyIdentity(ontology),
    axioms: ontology.getAxiomCount(),
    ontologyAnnotations: ontology.getAnnotations().size,
    imports: [...ontology.getImportsDeclarations()]
      .map(({ iri }) => iriValue(iri))
      .sort(),
    closure: [...importsClosure].map(ontologyIdentity),
    diagnostics: documents.map(({ context }) => ({
      documentIRI: iriValue(context.documentIRI),
      diagnostics: JSON.parse(JSON.stringify(context.diagnostics ?? [])),
    })),
    witnesses: cgmesWitnesses(ontology, request.input),
  };
  await publishComparisonJson(directory, "js-source-load.json", result);
  if (request.compareStructure && request.scenario === "closure-roundtrip") {
    await roundTripClosure(
      api,
      manager,
      loaded,
      result,
      request,
      directory,
      parameters,
    );
  } else if (request.compareStructure) {
    if (request.compareLoadedDocuments && result.load.imports.length) {
      await recordSourceModels(
        api,
        manager,
        loaded,
        result,
        request,
        directory,
      );
    }
    result.functional = await storeModel(
      api,
      manager,
      ontology,
      "FUNCTIONAL",
      "js-model.ofn",
      directory,
      usesByteStream(request.document),
    );
  }
  return result;
}

const [requestPath, resultPath] = process.argv.slice(2);
const request = JSON.parse(await readFile(requestPath, "utf8"));
const { executionId, caseId } = request;
if (![executionId, caseId].every((value) => /^[0-9a-f]{64}$/u.test(value)))
  throw new Error("Invalid comparison execution or case identity");
const result = await observe(request, dirname(resultPath));
if (result !== null) {
  const artifact = await publishComparisonJson(
    dirname(resultPath),
    basename(resultPath),
    { ...result, executionId },
  );
  process.stdout.write(
    JSON.stringify({
      schemaVersion: 1,
      caseId,
      executionId,
      stage: "js-load",
      byteLength: artifact.byteLength,
      sha256: artifact.sha256,
    }) + "\n",
  );
}
