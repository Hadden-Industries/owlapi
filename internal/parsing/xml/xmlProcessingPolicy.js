import {
  defaultBehaviorProfileDefinition,
  OntologyBehaviorContext,
} from "../../behavior/ontologyBehaviorContext.js";

/** XML provider rules are independent of external-resource authorization.
 * Both selected provider contracts disable external retrieval.
 */
export const xmlProcessingPolicy = (configuration) => {
  const definition = configuration?.getBehaviorProfileId
    ? new OntologyBehaviorContext(configuration.getBehaviorProfileId())
        .behaviorProfileDefinition
    : defaultBehaviorProfileDefinition;
  const policy = definition.xmlProcessingPolicy;
  let maxEntityExpansions = Infinity;
  if (definition.computationResourcePolicy.usesJavaProviderDefaults) {
    const value = configuration.getEntityExpansionLimit();
    if (
      !/^[+-]?\d+$/u.test(value) ||
      Number(value) < -2147483648 ||
      Number(value) > 2147483647
    )
      throw new RangeError(
        "The Java XML entity expansion limit must parse as an int",
      );
    if (Number(value) > 0) maxEntityExpansions = Number(value);
  }
  return { ...policy, maxEntityExpansions };
};
