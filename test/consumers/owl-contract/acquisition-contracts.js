/** Hand-authored public metadata/configuration/error contracts; no acquisition or UI. */
const requireContract = (condition, field) => {
  if (!condition)
    throw new Error(`Public acquisition boundary differs: ${field}`);
};
export const exerciseFormatConfiguration = (owl) => {
  const expected = {
    functional: "text/owl-functional",
    manchester: "text/owl-manchester",
    owlxml: "application/owl+xml",
    dl: "text/owl-dl",
    krss1: "text/owl-krss",
    krss2: "text/owl-krss2",
    rdfxml: "application/rdf+xml",
    turtle: "text/turtle",
    trig: "application/trig",
    ntriples: "application/n-triples",
    nquads: "application/n-quads",
    jsonld: "application/ld+json",
  };
  const values = Object.values(owl.OWLDocumentFormats);
  requireContract(
    values.length === Object.keys(expected).length &&
      new Set(values.map((format) => format.key)).size === values.length,
    "format registry identity",
  );
  for (const format of values) {
    requireContract(
      format.mediaTypes[0] === expected[format.key] &&
        Object.isFrozen(format.mediaTypes),
      `${format.key}.mediaTypes`,
    );
    requireContract(
      Array.isArray(format.extensions) &&
        format.extensions.length > 0 &&
        format.extensions.every(
          (extension) => typeof extension === "string" && extension.length > 0,
        ),
      `${format.key}.extensions`,
    );
  }
  const defaults = owl.OWLOntologyLoaderConfiguration.defaults();
  for (const key of [
    "maxInputBytes",
    "maxRemoteDocumentBytes",
    "maxImportCount",
    "timeoutMs",
  ])
    requireContract(
      Number.isSafeInteger(defaults[key]) && defaults[key] > 0,
      key,
    );
  requireContract(
    defaults.remoteImports === false &&
      defaults.remoteJsonLdContexts === false &&
      Object.isFrozen(defaults),
    "safe frozen defaults",
  );
  const signal = new AbortController().signal;
  const config = new owl.OWLOntologyLoaderConfiguration({
    signal,
    maxInputBytes: 64,
    maxImportCount: 2,
  });
  requireContract(
    config.signal === signal &&
      config.maxInputBytes === 64 &&
      config.maxImportCount === 2 &&
      Object.isFrozen(config),
    "configuration inputs",
  );
  return values.length;
};
export const exercisePublicErrors = (owl) => {
  const cause = new Error("external document acquisition failed");
  const documentIRI = owl.IRI.create("urn:contract:unavailable");
  const expected = {
    MissingImportError: "MISSING_IMPORT",
    UnloadableImportError: "UNLOADABLE_IMPORT",
    ResourceLimitError: "RESOURCE_LIMIT_EXCEEDED",
    SecurityPolicyError: "SECURITY_POLICY_VIOLATION",
  };
  for (const [name, code] of Object.entries(expected)) {
    const error = new owl[name]("boundary", {
      cause,
      documentIRI,
      resource: "maxInputBytes",
      limit: 64,
      observed: 65,
    });
    requireContract(
      error instanceof Error &&
        error.name === name &&
        error.code === code &&
        error.cause === cause &&
        error.documentIRI === documentIRI &&
        error.resource === "maxInputBytes" &&
        error.limit === 64 &&
        error.observed === 65,
      name,
    );
  }
  return Object.keys(expected).length;
};
