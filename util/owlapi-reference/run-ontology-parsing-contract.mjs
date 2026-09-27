import { executeOntologyReferenceOracle } from "./run-import-closure-contract.mjs";

/** Compare a direct ontology document within the original root's import context. */
export const executeOntologyParsingOracle = (
  options,
  referenceEnvironment,
  dependencies,
) =>
  executeOntologyReferenceOracle(
    { ...options, comparisonKind: "ONTOLOGY_PARSING" },
    referenceEnvironment,
    dependencies,
  );
