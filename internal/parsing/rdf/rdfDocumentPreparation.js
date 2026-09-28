/** Private manager/parser seam; custom parsers retain their public parse contract. */
const preparations = new WeakMap();

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
