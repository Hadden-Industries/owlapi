/** The same real public save contract runs in Node, browsers and workers. */
export const exerciseWriterConfiguration = async (
  { OWLManager },
  model,
  io,
  formats,
) => {
  const Configuration = model.OWLOntologyWriterConfiguration;
  const manager = OWLManager.createOWLOntologyManager();
  const other = OWLManager.createOWLOntologyManager();
  const defaults = manager.getOntologyWriterConfiguration();
  const configured = defaults
    .withIndentSize(2)
    .withLabelsAsBanner(true)
    .withBannersEnabled(false);
  if (
    !(defaults instanceof Configuration) ||
    !Object.isFrozen(configured) ||
    defaults.getIndentSize() !== 4 ||
    configured.getIndentSize() !== 2 ||
    configured.shouldUseBanners() ||
    !configured.isLabelsAsBanner() ||
    manager.setOntologyWriterConfiguration(configured) !== undefined ||
    other.getOntologyWriterConfiguration().getIndentSize() !== 4
  )
    throw new Error("Writer configuration value contract failed");
  const ontology = await manager.loadOntologyFromOntologyDocument(
    new io.StringDocumentSource(
      'Ontology(<urn:writer:contract> Declaration(Class(<urn:writer:C>)) AnnotationAssertion(rdfs:label <urn:writer:C> "Label -- -"))',
      { format: "functional" },
    ),
  );
  const target = new io.StringDocumentTarget();
  await manager.saveOntology(
    ontology,
    formats.OWLDocumentFormats.RDF_XML,
    target,
  );
  const text = target.toString();
  if (!text.includes("\n  <owl:Class ") || text.includes("<!--"))
    throw new Error("Writer configuration did not reach the public storer");
  const loaded = await other.loadOntologyFromOntologyDocument(
    new io.StringDocumentSource(text, { format: "rdfxml" }),
  );
  if (loaded.getAxioms().size !== ontology.getAxioms().size)
    throw new Error("Configured save changed ontology content");
  manager.setOntologyWriterConfiguration(new Configuration());
  const explicit = new io.StringDocumentTarget();
  await manager.saveOntology(
    ontology,
    formats.OWLDocumentFormats.RDF_XML,
    explicit,
  );
  const defaultManager = OWLManager.createOWLOntologyManager();
  const unchanged = await defaultManager.loadOntologyFromOntologyDocument(
    new io.StringDocumentSource(explicit.toString(), { format: "rdfxml" }),
  );
  const omitted = new io.StringDocumentTarget();
  await defaultManager.saveOntology(
    unchanged,
    formats.OWLDocumentFormats.RDF_XML,
    omitted,
  );
  if (explicit.toString() !== omitted.toString())
    throw new Error("Explicit and omitted defaults differ");
  return {
    modelOnly: true,
    indentSize: 2,
    banners: false,
    defaultEquivalent: true,
    axiomCount: loaded.getAxioms().size,
  };
};
