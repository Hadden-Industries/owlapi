import { readFile } from "node:fs/promises";
import { once } from "node:events";
import { basename, dirname, join } from "node:path";
import { comparisonSyntaxes } from "./comparison-fixtures.mjs";
import {
  publishComparisonFile,
  publishComparisonJson,
  sha256,
  strictRetryCategories,
} from "./comparison-evidence.mjs";
import { loadPublicApi } from "./qualify-universal-ontology.mjs";
import { observeConfiguration } from "./comparison-configuration.mjs";
import { observeMutation } from "./comparison-mutation.mjs";
import { observeLoadPublication } from "./comparison-load-publication.mjs";

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

const failure = (phase, error) => ({
  status: "failed",
  phase,
  category: error.code ?? error.name,
  message: String(error.message),
  details: Object.fromEntries(
    ["reason", "iri", "resource", "limit", "observed", "termType"]
      .filter((name) =>
        ["string", "number", "boolean"].includes(typeof error[name]),
      )
      .map((name) => [name, error[name]]),
  ),
});

async function storeModel(api, manager, ontology, format, name, directory) {
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

async function roundTripClosure(
  api,
  manager,
  loaded,
  result,
  request,
  directory,
  parameters,
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
      stage: "direct-functional-write",
      ...documentModel,
    });
  }
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
  if (result.rdfXmlWrite.status !== "completed") return;
  try {
    const reloader = api.OWLManager.createOWLOntologyManager({
      ...parameters,
      documentLoader: {
        load() {
          throw new Error("A merged document cannot load imports");
        },
      },
    });
    const source = new api.StringDocumentSource(
      await readFile(join(directory, "js-closure.rdf"), "utf8"),
      {
        documentIRI: api.IRI.create(request.document.documentIRI),
        format: api.OWLDocumentFormats.RDF_XML,
      },
    );
    const graph = await reloader.loadOntologyGraphFromOntologyDocument(
      source,
      new api.OWLOntologyLoaderConfiguration(parameters),
    );
    if (
      graph.ontology.getImportsDeclarations().size ||
      graph.importsClosure.length !== 1
    ) {
      throw new Error("Merged RDF/XML reload retained imports");
    }
    const functional = await storeModel(
      api,
      reloader,
      graph.ontology,
      "FUNCTIONAL",
      "js-rdfxml-reloaded.ofn",
      directory,
    );
    result.rdfXmlReload = {
      status: functional.status,
      identity: ontologyIdentity(graph.ontology),
      axioms: graph.ontology.getAxiomCount(),
      functional,
    };
  } catch (error) {
    result.rdfXmlReload = failure("rdfxml-reload", error);
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
    if (!strictRetryCategories.includes(refusal.category)) throw error;
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

async function sampleLoad(
  request,
  openDocument,
  createManager,
  configuration,
  networkRequests,
) {
  const { caseId, performance: protocol } = request;
  const emit = (message) =>
    process.stdout.write(JSON.stringify({ caseId, ...message }) + "\n");
  const checkpoint = async (phase) => {
    const waiting = once(process.stdin, "data");
    emit({
      kind: "checkpoint",
      phase,
      pid: process.pid,
      heapUsedBytes: process.memoryUsage().heapUsed,
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
  try {
    for (let index = 0; index < warmups + repetitions; index++) {
      ontology = null;
      let manager = createManager();
      const document = await openDocument(request.document);
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
      if (index >= warmups) wallNanos.push(nanos);
    }
    emit({
      kind: "sample",
      status: "completed",
      wallNanos,
      axioms: ontology.getAxiomCount(),
      networkAttempts: networkRequests.length,
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
  const api = await loadPublicApi({ ...request, includeManchesterRenderer });
  if (request.configuration || request.mutation || request.loadPublication) {
    const networkRequests = [];
    globalThis.fetch = async (input) => {
      networkRequests.push(String(input));
      throw new Error("Comparison workers run offline");
    };
    const observe = request.configuration
      ? observeConfiguration
      : request.mutation
        ? observeMutation
        : observeLoadPublication;
    return { ...(await observe(api, request)), networkRequests };
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
  const openDocument = async (document) => {
    const { format, mime } = comparisonSyntaxes[document.syntax];
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
  try {
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
    result.load = failure("load", error);
    await publishComparisonJson(directory, "js-source-load.json", result);
    return result;
  }
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
    result.functional = await storeModel(
      api,
      manager,
      ontology,
      "FUNCTIONAL",
      "js-model.ofn",
      directory,
    );
  }
  return result;
}

const [requestPath, resultPath] = process.argv.slice(2);
const request = JSON.parse(await readFile(requestPath, "utf8"));
const result = await observe(request, dirname(resultPath));
if (result !== null) {
  const artifact = await publishComparisonJson(
    dirname(resultPath),
    basename(resultPath),
    result,
  );
  process.stdout.write(
    JSON.stringify({
      schemaVersion: 1,
      caseId: request.caseId,
      stage: "js-load",
      byteLength: artifact.byteLength,
      sha256: artifact.sha256,
    }) + "\n",
  );
}
