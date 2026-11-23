import { readFileSync } from "node:fs";
import { comparisonIdentity } from "./comparison-evidence.mjs";

const classIRI = "http://www.w3.org/2002/07/owl#Class";
const classDocument = JSON.stringify({
  "@id": "urn:jsonld:A",
  "@type": classIRI,
});
const classContext = JSON.stringify({ "@context": { Class: classIRI } });

const returned = { status: "return", axioms: 1 };
const refused = { status: "refused" };
const syntaxRefusal = { ...refused, category: "OWL_SYNTAX_ERROR" };
const policyRefusal = { ...refused, category: "SECURITY_POLICY_VIOLATION" };
export const jsonLdFirstStructureDocuments = [
  { id: "object", text: classDocument },
  { id: "array", text: `[${classDocument}]` },
  { id: "trailing-text", text: `${classDocument} trailing-content` },
  { id: "trailing-document", text: `[${classDocument}] {}` },
  { id: "invalid-first-object", text: '{"@id":"urn:jsonld:A",} {}' },
];

const capture = new URL(
  "../../docs/compatibility/profiles/java-owlapi-5.5.1/central-observations.json",
  import.meta.url,
);

export function recordedJsonLdContexts() {
  const { observations } = JSON.parse(readFileSync(capture, "utf8"));
  const provider = observations.find(
    ({ probeId }) => probeId === "ObserveJsonLdProvider",
  );
  const rows = provider.stdout.trimEnd().split("\n");
  const prefix = "allowed-context\t";
  const contexts = rows.map((row) => row.slice(prefix.length));
  if (
    rows.some((row) => !row.startsWith(prefix)) ||
    new Set(contexts).size !== 25 ||
    contexts.length !== 25
  ) {
    throw new Error("The recorded RDF4J context whitelist is incomplete");
  }
  return contexts;
}

export function jsonLdComparisonCases() {
  const firstStructure = {
    decisionId: "BEHAVIOR-JSONLD-FIRST-STRUCTURE",
    documents: jsonLdFirstStructureDocuments,
    javaRows: [returned, returned, returned, returned, refused],
    normative: [
      returned,
      returned,
      syntaxRefusal,
      syntaxRefusal,
      syntaxRefusal,
    ],
  };
  const contextProvider = {
    decisionId: "BEHAVIOR-JSONLD-CONTEXT-PROVIDER",
    javaRows: recordedJsonLdContexts(),
    normative: {
      disabled: policyRefusal,
      allowedDepth: returned,
      repeated: returned,
      refusedDepth: syntaxRefusal,
      calls: [0, 11, 11, 11],
    },
    adapterControls: {
      chain: returned,
      disallowed: policyRefusal,
      cacheFirst: returned,
      cacheReuse: returned,
      separateAuthority: returned,
      revoked: policyRefusal,
      firstFailure: { ...refused, category: "DOCUMENT_LOAD_FAILED" },
      retry: returned,
      loads: [0, 1, 1, 2, 2, 2],
      authorizations: 3,
    },
  };
  return [
    ["first-structure", "jsonLdFirstStructure", firstStructure],
    ["context-provider", "jsonLdContextProvider", contextProvider],
  ].map(([name, field, recipe]) => {
    const input = { id: `jsonld/${name}` };
    const definition = {
      schemaVersion: 1,
      scenario: "public-api-behavior",
      scenarioVersion: 1,
      observationPoint: name,
      behaviorProfileId: "java-owlapi-5.5.1",
      measurements: ["behavior"],
      input,
      [field]: recipe,
    };
    return {
      input,
      definition,
      caseId: comparisonIdentity(definition),
      imports: [],
    };
  });
}

async function loadDocument(api, manager, text, configuration) {
  try {
    const ontology = await manager.loadOntologyFromOntologyDocument(
      new api.StringDocumentSource(text, {
        documentIRI: "urn:owlapi:comparison:jsonld",
        format: api.OWLDocumentFormats.JSON_LD,
      }),
      configuration,
    );
    return { status: "return", axioms: ontology.getAxiomCount() };
  } catch (failure) {
    return failure instanceof api.UnparsableOntologyException
      ? { status: "refused" }
      : { status: "refused", category: failure.code ?? failure.name };
  }
}

function observation(request, compatible, normative) {
  return {
    schemaVersion: 1,
    caseId: request.caseId,
    operation: request.scenario,
    effectiveSettings: {
      behaviorProfileId: compatible.getBehaviorProfileId(),
      defaultBehaviorProfileId: normative.getBehaviorProfileId(),
    },
    load: { status: "completed" },
  };
}

export async function observeJsonLdFirstStructure(api, request) {
  const observe = async (options) => {
    const rows = [];
    let manager;
    for (const { text } of request.jsonLdFirstStructure.documents) {
      manager = api.OWLManager.createOWLOntologyManager(options);
      rows.push(await loadDocument(api, manager, text));
    }
    return { manager, rows };
  };
  const compatible = await observe({
    behaviorProfileId: request.behaviorProfileId,
  });
  const normative = await observe();
  return {
    ...observation(request, compatible.manager, normative.manager),
    jsonLdFirstStructure: compatible.rows,
    normativeJsonLdFirstStructure: normative.rows,
  };
}

const remoteDocument = (iri) =>
  JSON.stringify({ "@context": iri, "@id": "urn:jsonld:A", "@type": "Class" });

async function observeNormativeContexts(api) {
  const first = "https://example.com/contexts/0";
  let count = 0;
  let calls = 0;
  const documentLoader = {
    load(iri) {
      calls++;
      const index = Number(iri.value.split("/").at(-1)) + 1;
      if (!Number.isSafeInteger(index) || index < 1 || index > count) {
        throw new Error("Unexpected fixture context depth");
      }
      return index === count
        ? classContext
        : JSON.stringify({
            "@context": `https://example.com/contexts/${index}`,
          });
    },
  };
  const makeManager = () =>
    api.OWLManager.createOWLOntologyManager({ documentLoader });
  const manager = makeManager();
  const load = (enabled) => {
    const currentManager = makeManager();
    const configuration = enabled
      ? currentManager
          .getOntologyLoaderConfiguration()
          .with({ remoteJsonLdContexts: true })
      : undefined;
    return loadDocument(
      api,
      currentManager,
      remoteDocument(first),
      configuration,
    );
  };
  const disabled = await load(false);
  const requestCounts = [calls];
  count = 11;
  const allowedDepth = await load(true);
  requestCounts.push(calls);
  calls = 0;
  const repeated = await load(true);
  requestCounts.push(calls);
  calls = 0;
  count++;
  const refusedDepth = await load(true);
  requestCounts.push(calls);
  return {
    manager,
    rows: {
      disabled,
      allowedDepth,
      repeated,
      refusedDepth,
      calls: requestCounts,
    },
  };
}

export async function observeJsonLdContextProvider(api, request) {
  const { javaRows: whitelist } = request.jsonLdContextProvider;
  const makeManager = (documentLoader) =>
    api.OWLManager.createOWLOntologyManager({
      behaviorProfileId: request.behaviorProfileId,
      documentLoader,
    });
  const calls = [];
  const compatible = makeManager({
    load(iri) {
      calls.push(iri.value);
      const next = whitelist.indexOf(iri.value) + 1;
      if (next === 0 || calls.length > whitelist.length) {
        throw new Error("Unexpected fixture context");
      }
      return next === whitelist.length
        ? classContext
        : JSON.stringify({ "@context": whitelist[next] });
    },
  });
  const load = (manager, iri = whitelist[0]) =>
    loadDocument(api, manager, remoteDocument(iri));
  const chain = await load(compatible);
  const loads = [];
  let acquisitions = 0;
  let authorizations = 0;
  let permitted = true;
  const loader = {
    authorize() {
      authorizations++;
      return permitted;
    },
    load() {
      acquisitions++;
      return classContext;
    },
  };
  const disallowed = await load(
    makeManager(loader),
    "https://example.com/unlisted",
  );
  loads.push(acquisitions);
  const cacheFirst = await load(makeManager(loader));
  loads.push(acquisitions);
  const cacheReuse = await load(makeManager(loader));
  loads.push(acquisitions);
  const separateAuthority = await load(makeManager({ load: loader.load }));
  loads.push(acquisitions);
  permitted = false;
  const revoked = await load(makeManager(loader));
  loads.push(acquisitions);
  let attempts = 0;
  const retriedLoader = {
    load() {
      return ++attempts === 1 ? "invalid-json" : classContext;
    },
  };
  const firstFailure = await load(makeManager(retriedLoader));
  const retry = await load(makeManager(retriedLoader));
  loads.push(attempts);
  const normative = await observeNormativeContexts(api);
  return {
    ...observation(request, compatible, normative.manager),
    jsonLdContextProvider: calls,
    jsonLdContextProviderControls: {
      chain,
      disallowed,
      cacheFirst,
      cacheReuse,
      separateAuthority,
      revoked,
      firstFailure,
      retry,
      loads,
      authorizations,
    },
    normativeJsonLdContextProvider: normative.rows,
  };
}
