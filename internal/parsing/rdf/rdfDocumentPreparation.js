/** Private manager/parser seam; custom parsers retain their public parse contract. */
const preparations = new WeakMap();
const buildReceivers = new WeakMap();

/** Only the manager's own parser transaction may receive an admitted axiom table. */
export const registerOntologyBuildReceiver = (transaction, receive) => {
  buildReceivers.set(transaction, receive);
};

export const acceptsOntologyBuild = (transaction) =>
  buildReceivers.has(transaction);

/** Apply the published RDF header, imports, axioms and diagnostics in their observable order. */
export async function publishRdfTranslation(
  { context, ontology, buildBuffer },
  transaction,
) {
  const candidates = context.javaRdfOntologyIdCandidates;
  if (!candidates) transaction.setOntologyID(ontology.getOntologyID());
  transaction.addAnnotations(ontology.getAnnotations());
  await transaction.addImportsDeclarations(ontology.getImportsDeclarations());
  const receive = buildReceivers.get(transaction);
  if (receive && buildBuffer) receive(buildBuffer);
  else transaction.addAxioms(ontology.getAxioms());
  if (candidates)
    transaction.setOntologyID(ontology.getOntologyID(), candidates);
  if (context.sourceStructure)
    transaction.setSourceStructure(context.sourceStructure);
  for (const diagnostic of context.diagnostics)
    transaction.addDiagnostic(diagnostic);
}

export const registerRdfDocumentPreparation = (parser, prepare) => {
  preparations.set(parser, prepare);
};

/** Return undefined for non-RDF parsers, whose syntax already identifies entities. */
export const prepareRdfDocument = (
  parser,
  source,
  transaction,
  configuration,
) => preparations.get(parser)?.(source, transaction, configuration);
