# July Universal Ontology reconciliation

This development contract covers the four original July 2026 variants only: ISO11179-3 edition 4, reference-data, core and extended.
Inputs are original source blobs at Universal Ontology commit `e2c667f3584b8fb705671cada0fe205b1000b617`.
Historical `-full` documents and VOWL outputs are not evidence for either owlapi check.

## Two checks, one difference policy

Run `npm run test:universal-ontology -- --ontology-repository <checkout> --output <new-directory>` with `OWLAPI_REFERENCE_CHECKOUT` pointing to the built Java pin.
The optional `--candidate <directory>` selects a retained package candidate; otherwise the report binds the current source bytes, including uncommitted changes.
Source-mode output must be outside the owlapi checkout or in a Git-ignored directory (for example, `.release/july-qualification`); other locations are rejected before writing because generated evidence must not change its own source fingerprint.

Each root has a parsing result covering every reachable document in its original import context, including that document's own ontology annotations and direct import declarations.
Four root results contain 18 document comparisons.
Each root also has two independently generated closure results: Functional Syntax and RDF/XML.
Only root ontology identity and root ontology annotations enter a closure; all direct axioms enter its structural set union.

Java OWLAPI owns parsing, object equality and merging.
Complete native structural differences are retained, including connected anonymous-individual graphs; native display strings describe differences but never determine OWL equality.
The RFC 9535 library evaluates the ledger's selectors, AJV validates evidence shapes, and the existing JSON-LD implementation performs RDFC-1.0 on unparsed RDF diagnostics.
Repository policy code enforces exact values, scope, cardinality, zero unknown/ambiguous differences and zero stale required rules.

Closure exceptions are not independently guessed or copied from parsing counts.
The oracle loads the exact compared JavaScript document models and merges them with Java's `OWLOntologyMerger`, restoring only root metadata.
This result must equal the JavaScript closure output.
Thus deduplication, sharing and root-only annotations determine propagation through native operations.
Every direct model must already pass its parsing reconciliation; an unknown parsing difference cannot be hidden by a merge that happens to remove it.
The July rules are evaluated on direct documents only.
Applying them directly to a closure's raw difference object is not the closure reconciliation protocol; that protocol requires exact `propagationEvidence` with no difference allowance.

## Named OWL-Time restrictions

The immutable imported `src/external/time.rdf` attaches `owl:onDatatype` and `owl:withRestrictions` directly to the IRIs `generalDay`, `generalMonth` and `generalYear`.
This is not the blank-node restriction expression prescribed by the [OWL 2 DL RDF mapping](https://www.w3.org/TR/owl2-mapping-to-rdf/#Analyzing_Expressions).
The [OWL-Time datatype definitions](https://www.w3.org/TR/owl-time/#datatypes) describe their intended string-pattern constraints.

[OWL 2 RDF-Based Semantics table 5.7](https://www.w3.org/TR/owl2-rdf-based-semantics/#Semantic_Conditions_for_Datatypes) defines the named restriction's datatype extension as the base datatype's extension intersected with its facets.
Table 5.9 defines datatype equivalence by equal extensions.
Compatible parsing therefore reconstructs a `DatatypeDefinition` containing that restriction, retaining the datatype IRI, exact facet values, annotations and references.
The implementation applies to this RDF shape generally; it does not recognize OWL-Time names or patch corpus bytes.
Strict mode is unchanged and rejects this noncanonical source form.
Malformed lists, multiple base datatypes and malformed facets still fail.

This is a datatype-extension-preserving compatibility recovery, not an assertion of RDF graph isomorphism, arbitrary OWL Full support, or a normative Java bug for input outside the OWL 2 DL mapping.
Canonical serialized outputs must reload strictly.
Shared parser omissions are never accepted as proof of correctness.

The pinned Java revision retains three disconnected facet annotations and leaves six restriction-link triples unparsed.
The single [expected-difference ledger](expected-differences.json) contains three exact JS datatype-definition rules, three exact Java orphan-facet rules and one exact RDFC-normalized diagnostic rule, all bound to that immutable source and Java revision.
The existing Manchester and OWL/XML reconciliation rules are unrelated and unchanged.
No other source, facet, anonymous graph or discarded JavaScript statement is covered.

Raw Java outcomes remain in the report alongside reconciliation outcomes.
A reconciled pass is not an assertion of byte equality or unconditional Java equality.
Missing inputs, source loss, unmatched differences, output loss, network access or failed native propagation fail the overall qualification.
The standalone Java oracle deliberately exits with code 1 when it reports `SOURCE_UNPARSED_RDF`.
The qualification command, not the Java process, applies the exact ledger and returns the reconciled result.

These are pre-integration development checks.
They do not qualify a release or replace fresh source/package/consumer evidence after accepted 0.1.0 and Phase 21 baseline reconciliation.
