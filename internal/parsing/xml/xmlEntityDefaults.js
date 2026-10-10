/** Executable XML entity fallbacks; resource-budgets.json is an independent oracle. */
export const XML_ENTITY_DEFAULTS = Object.freeze({
  maxEntityDeclarations: 256,
  maxEntityExpansionDepth: 16,
  maxEntityReplacementLength: 65_536,
  maxExpandedXmlBytes: 33_554_432,
});
