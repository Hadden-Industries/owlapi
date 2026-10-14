/** Java Imports scope: only already managed imports are read; no acquisition. */
export const Imports = Object.freeze({
  EXCLUDED: "EXCLUDED",
  INCLUDED: "INCLUDED",
});

/** Java axiom membership mode; nested annotation content remains structural. */
export const AxiomAnnotations = Object.freeze({
  CONSIDER_AXIOM_ANNOTATIONS: "CONSIDER_AXIOM_ANNOTATIONS",
  IGNORE_AXIOM_ANNOTATIONS: "IGNORE_AXIOM_ANNOTATIONS",
});

/** Native Java classification of an attempted ontology change sequence. */
export const ChangeApplied = Object.freeze({
  SUCCESSFULLY: "SUCCESSFULLY",
  UNSUCCESSFULLY: "UNSUCCESSFULLY",
  NO_OPERATION: "NO_OPERATION",
});
