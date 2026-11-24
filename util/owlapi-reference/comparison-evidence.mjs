import { createHash, randomUUID } from "node:crypto";
import { link, open, readFile, rm, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { canonicalJson } from "../../scripts/canonical-json.mjs";

export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");

export const comparisonIdentity = (value) => sha256(canonicalJson(value));

/** Match the full logical import mapping reported by each worker. */
export function comparisonImportRequests(imports, js, native) {
  const asMapping = (entries) =>
    Object.fromEntries(
      entries.map(({ ontologyIRI, documentIRI }) => [ontologyIRI, documentIRI]),
    );
  const expected = comparisonIdentity(asMapping(imports));
  return {
    javascript:
      Array.isArray(js.importRequests) &&
      js.importRequests.length === imports.length &&
      comparisonIdentity(asMapping(js.importRequests)) === expected,
    java: comparisonIdentity(native.importRequests ?? {}) === expected,
  };
}

export function matchesOntologyClosure(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    comparisonIdentity(actual.map(comparisonIdentity).sort()) ===
      comparisonIdentity(expected.map(comparisonIdentity).sort())
  );
}

/** Mapper calls and membership in the resulting ontology are separate observations. */
export function matchesComparisonImportClosure(definition, js, native) {
  const { imports, requiredImportClosure } = definition;
  const requests = comparisonImportRequests(imports, js, native);
  return (
    requests.javascript &&
    requests.java &&
    matchesOntologyClosure(js.load?.closure, requiredImportClosure) &&
    matchesOntologyClosure(
      native.javaLoad?.ontology?.closure,
      requiredImportClosure,
    )
  );
}

const diagnosticFields = [
  "reason",
  "iri",
  "resource",
  "limit",
  "observed",
  "termType",
  "graph",
  "subject",
  "predicate",
  "object",
  "line",
  "column",
];

function observedFailure(error) {
  const boundedText = (value) =>
    value.length <= 4096
      ? value
      : {
          prefix: value.slice(0, 4096),
          byteLength: Buffer.byteLength(value),
          sha256: sha256(value),
        };
  const message = String(error?.message ?? error);
  return {
    category: error?.code ?? error?.name ?? "Error",
    message: message.slice(0, 4096),
    ...(message.length > 4096 ? { messageSha256: sha256(message) } : {}),
    details: Object.fromEntries(
      diagnosticFields.flatMap((name) => {
        const value = error?.[name];
        if (typeof value === "string") return [[name, boundedText(value)]];
        return Number.isFinite(value) || typeof value === "boolean"
          ? [[name, value]]
          : [];
      }),
    ),
  };
}

/** Retain the typed error and the source of a wrapped stage failure. */
export function comparisonStageFailure(phase, error) {
  const causes = [];
  const visited = new Set([error]);
  let cause = error?.cause ?? undefined;
  while (cause !== undefined && causes.length < 8 && !visited.has(cause)) {
    visited.add(cause);
    causes.push(observedFailure(cause));
    cause = cause.cause ?? undefined;
  }
  return {
    status: "failed",
    phase,
    ...observedFailure(error),
    ...(causes.length ? { causes } : {}),
    ...(cause !== undefined ? { causesTruncated: true } : {}),
  };
}

/** Require a completed model and one native comparison for each loaded document. */
export function exactComparedDocuments(models, comparisons) {
  if (
    !Array.isArray(models) ||
    !Array.isArray(comparisons) ||
    models.length === 0 ||
    models.length !== comparisons.length ||
    models.some(
      ({ documentIRI, status, artifact }) =>
        typeof documentIRI !== "string" ||
        !documentIRI ||
        status !== "completed" ||
        !/^[0-9a-f]{64}$/u.test(artifact?.sha256),
    )
  ) {
    return false;
  }
  const identifiers = models.map(({ documentIRI }) => documentIRI).sort();
  const compared = comparisons.map(({ documentIRI }) => documentIRI).sort();
  return (
    new Set(identifiers).size === identifiers.length &&
    comparisonIdentity(identifiers) === comparisonIdentity(compared)
  );
}

/** A writer observation includes its reload disposition or the phase that failed. */
export function recordedNativeRdfXmlRoundTrip(stages) {
  const { write, reload, comparison } = stages ?? {};
  const failedAt = (stage, phase) =>
    stage?.status === "failed" &&
    stage.phase === phase &&
    typeof stage.category === "string";
  if (failedAt(write, "rdfxml-write"))
    return reload === undefined && comparison === undefined;
  if (write?.status !== "completed" || !write.artifact) return false;
  if (failedAt(reload, "rdfxml-reload")) return comparison === undefined;
  return (
    reload?.status === "completed" &&
    ["match", "mismatch"].includes(comparison?.status)
  );
}

export const strictRetryCategories = Object.freeze([
  "OWL_SYNTAX_ERROR",
  "UNSUPPORTED_CONSTRUCT",
  "RESOURCE_LIMIT_EXCEEDED",
]);

/** Publish one complete result without replacing an earlier observation. */
export const publishComparisonFile = (directory, name, bytes) =>
  publishComparisonChunks(directory, name, [bytes]);

export async function publishComparisonChunks(directory, name, chunks) {
  if (basename(name) !== name || name === "." || name === "..") {
    throw new Error("Comparison artifact requires a single filename");
  }
  const path = join(directory, name);
  const pending = join(directory, `.${name}.${randomUUID()}.pending`);
  const handle = await open(pending, "wx");
  const digest = createHash("sha256");
  let byteLength = 0;
  try {
    try {
      for await (const bytes of chunks) {
        await handle.writeFile(bytes);
        digest.update(bytes);
        byteLength += Buffer.byteLength(bytes);
      }
      await handle.sync();
    } finally {
      await handle.close();
    }
    await link(pending, path);
  } finally {
    await rm(pending, { force: true });
  }
  return { name, sha256: digest.digest("hex"), byteLength };
}

export const publishComparisonJson = (directory, name, value) =>
  publishComparisonFile(directory, name, `${canonicalJson(value)}\n`);

/** Read a completed worker artifact under the consumer's own byte limit. */
export async function readCompletedComparisonFile({
  caseId,
  executionId,
  stage,
  resultPath,
  stdout,
  maxResultBytes,
}) {
  let header;
  try {
    header = JSON.parse(stdout.trim());
  } catch (cause) {
    throw new Error("Native comparison did not emit a completion header", {
      cause,
    });
  }
  if (
    header?.schemaVersion !== 1 ||
    !/^[0-9a-f]{64}$/u.test(executionId) ||
    header.caseId !== caseId ||
    header.executionId !== executionId ||
    header.stage !== stage ||
    !Number.isSafeInteger(header.byteLength) ||
    header.byteLength < 1 ||
    !/^[0-9a-f]{64}$/u.test(header.sha256)
  ) {
    throw new Error(
      "Native comparison completion header has the wrong identity",
    );
  }
  if (header.byteLength > maxResultBytes) {
    throw new Error(
      "Native comparison result exceeds the configured byte limit",
    );
  }
  const observation = await stat(resultPath);
  if (!observation.isFile() || observation.size !== header.byteLength) {
    throw new Error("Native comparison result length differs from its header");
  }
  const bytes = await readFile(resultPath);
  if (bytes.length !== header.byteLength || sha256(bytes) !== header.sha256) {
    throw new Error("Native comparison result digest differs from its header");
  }
  const result = JSON.parse(bytes.toString("utf8"));
  if (
    result.schemaVersion !== 1 ||
    result.caseId !== caseId ||
    result.executionId !== executionId
  ) {
    throw new Error(
      "Comparison artifact belongs to a different case or execution",
    );
  }
  return { result, bytes };
}

/** A native result requires both producer completion and admission of its bytes. */
export async function readNativeComparisonResult({ exitCode, ...file }) {
  const { result, bytes } = await readCompletedComparisonFile({
    ...file,
    stage: "native-comparison",
  });
  const verdict = result.structure?.status;
  if (
    !["match", "mismatch", "inconclusive", "blocked", "not-requested"].includes(
      verdict,
    ) ||
    (exitCode !== 0 && exitCode !== 1) ||
    (exitCode === 0) !==
      (verdict === "match" ||
        (verdict === "not-requested" &&
          result.javaLoad?.status === "completed"))
  ) {
    throw new Error(
      "Native comparison result contradicts the completed invocation",
    );
  }
  return { result, bytes };
}
