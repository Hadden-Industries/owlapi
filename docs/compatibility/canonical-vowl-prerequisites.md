# Canonical VOWL prerequisites

These additions implement the owning-library prerequisites authorized by the Canonical VOWL plan.
They do not extend the accepted Phase 21 or Phase 22 decision sets or assert completion of either phase.
Executable Java parity, installed-package qualification and final independent review remain separate evidence gates.

## Public checker and report

`owlapi/profiles` owns `OWL2DLProfile` and `OWLProfileReport`; the bare package re-exports the same bindings.
`await new OWL2DLProfile().checkOntology(ontology, {sourceAssessment: true})` checks the root-inclusive managed import closure.
It accepts a package ontology; unresolved unmanaged imports remain unverified.
Private manager membership supplies closure authority, so overriding a public manager query cannot hide imported violations.

The formal `status` describes the structural OWL model and is `valid`, `invalid` or `unverified`.
`isInProfile()` is true only for `valid`.
`getViolations()` returns immutable records with stable `code` identifiers and contextual fields.
`getOntology()` and `getProfile()` preserve input identity.
`getSourceAssessment()` returns the optional independent source assessment.
Direct report construction does not perform validation.
Java's synchronous call, visitor classes, exception hierarchy and collection overloads are not promised.

The bounded Java comparison uses the following stable public violation codes.

| Condition                                                                   | Code                          |
| --------------------------------------------------------------------------- | ----------------------------- |
| Non-simple property in a position requiring simplicity                      | `NONSIMPLE_OBJECT_PROPERTY`   |
| Object/data/annotation property category collision                          | `PROPERTY_CATEGORY_COLLISION` |
| OWL class and datatype sharing an IRI                                       | `CLASS_DATATYPE_COLLISION`    |
| Cyclic datatype definitions                                                 | `CYCLIC_DATATYPE_DEFINITION`  |
| Multiple distinct definitions of one datatype                               | `DATATYPE_DEFINITION_COUNT`   |
| Invalid literal lexical form or value bounds, including annotation literals | `LITERAL_LEXICAL_SPACE`       |
| Normalized constructor below its minimum arity                              | `SET_CONSTRUCTOR_ARITY`       |
| Typed entity use without a declaration                                      | `UNDECLARED_ENTITY`           |

The source assessment additionally visits retained RDFS statements, their nested annotations and parsed expressions, including expressions without a retained OWL axiom.
It applies the same datatype, constructor, category and closure-wide global checks before a consumer filters any axiom.
Only package-owned original arity and unambiguous typed use qualify the formal normalized-arity and redundant-declaration differences.
Mutating an ontology makes original source evidence stale.
Caller-supplied document metadata and custom parser output cannot supply these qualifications.
Filtering source annotations during loading also prevents source qualification.
RDF graph selection that omits source quads likewise leaves source evidence unverified; selecting all source content or explicitly merging it does not.

A valid source assessment of RDFS structures does not make them OWL 2 DL structures or authorize an adapter recovery.
The Canonical adapter must separately enforce its strict or compatibility mapping catalogue.
Genuinely generic property assertions are unsupported; no object/data property category is invented to admit or omit them.

## Source-preserving loading

`parsingMode: "preserve"` is opt-in.
The existing strict and compatible policies remain distinct.
The new mode retains all explicit property roles, determines each use only from an unambiguous structural position, and fails on unresolved multi-role uses.
It does not apply the compatible mode's category precedence or legacy constructor repairs.
Well-typed constructor use need not manufacture a declaration axiom.

Each document's immutable `context.sourceStructure` has these fields:

| Field            | Meaning                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `version`        | The number `1`.                                                                                                                                                                |
| `policy`         | The string `preserve`.                                                                                                                                                         |
| `roles`          | Records `{iri, type, origin}` for named roles; an anonymous RDFS class instead has `{subject, type, origin}`, where `subject` is a document-scoped package anonymous identity. |
| `statements`     | Retained records `{subject, predicate, object, annotations}` using package IRIs, literals, anonymous identities or parsed expressions and ordinary RDF/RDFS/OWL vocabulary.    |
| `expressions`    | Parsed class, data-range and inverse-property expressions, including unattached source expressions.                                                                            |
| `arityWitnesses` | Immutable descriptive records of original constructor counts; the checker trusts private per-object evidence, not these public records.                                        |

Role `type` is an ordinary vocabulary IRI; `origin` is `declaration` or `use`.
Generic roles use `rdfs:Class` or `rdf:Property`.
Explicit RDFS subclass, subproperty, domain, range and direct membership statements remain source structures rather than invented OWL axioms.
Anonymous identity stays local to its source ontology.
Named generic roles participate in import discovery without creating synthetic OWL declarations.
Discovery reaches a fixed point across imported named roles before reconstruction; generic domains seed class roles before statement dispatch.
Each prepared document has a private proof identity, so shared base IRIs and blank-node labels cannot suppress another document's independent evidence.
Superseded generic declarations retain their own annotations, and unsupported annotation anchors reject instead of being attached elsewhere.
Only a specific class role supersedes a generic class role; a datatype role cannot hide a class/datatype collision.
Conflicting class/data ranges, invalid endpoint categories and unknown or ambiguous source forms cannot be certified by ignoring them.

`StringDocumentSource` accepts an optional exact `format`, exposed by `getFormat()`.
Its choice applies to that document only and prohibits sniffing fallback on mismatch.
The import loader's second argument is frozen `{config, importIRI, importingDocumentIRI, signal}`.
Authored import identity, mapped retrieval identity and actual importing document remain distinct.

## Exact values and storage

Cardinalities use a safe nonnegative JavaScript integer or canonical unsigned decimal string when larger than the safe integer range.
Unsafe numeric factory inputs reject; callers must supply exact decimal strings.
Every supported reader and storer uses the shared normalizer.
RDF reverse mapping accepts literals whose values inhabit the nonnegative integer value space, including integral decimals and rationals.
Raw lexical forms are checked without whitespace repair; float/double values are disjoint from integers and do not qualify merely because their display is integral.

Original minimum arity is checked before operand deduplication.
The preservation factory retains a normalized singleton constructor.
Functional Syntax and RDF/XML storage repeat its operand to meet concrete syntax minimum arity, preserving annotations once.
Both storers fail before changing the target if retained RDFS statements or unattached expressions cannot be represented.
They reuse `ONTOLOGY_STORAGE_FAILED` with `reason: "ONTOLOGY_NOT_REPRESENTABLE"` and a descriptive `sourceKind`.

## Normative choices and bounded deviations

The checker follows the [published OWL 2 Structural Specification](https://www.w3.org/TR/2012/REC-owl2-syntax-20121211/), its mandatory datatype map and the [reverse RDF mapping](https://www.w3.org/TR/2012/REC-owl2-mapping-to-rdf-20121211/).
It does not claim logical consistency, reasoning completeness or validity from Java's verdict alone.
Java 5.5.1 remains the pinned common-domain comparison authority at `d7e997a53b470e32700de89cc610d9daf01ea769`.

- Annotated datatype definitions count as distinct axioms; identical annotated duplicates across imports count once.
- Property hierarchy inclusion and strict regularity order are separate relations.
  The published rule's named-target inversion equivalence is iterated to a fixed point; a cycle in the union of the two relations is not itself the specified failure.
- Only named top/bottom object properties are initially composite under the literal section 11.1 rule.
  Their inverse expressions require explicit hierarchy, transitivity or chain evidence; semantic builtin consequences are not fabricated axioms.
- Anonymous-individual roots follow the formal section 11.2 bullet rather than the conflicting informative example.
- The selected [XSD 1.1 pattern grammar](https://www.w3.org/TR/2012/REC-xmlschema11-2-20120405/#regexs) admits `[z-a]` as an empty range.
  This differs from XSD 1.0's explicit ascending-endpoint constraint and from JavaScript regex syntax.
  Patterns are parsed, never executed as JavaScript regular expressions.
- XML literals follow the OWL-referenced [RDF Concepts 2004 lexical space](https://www.w3.org/TR/2004/REC-rdf-concepts-20040210/#section-XMLLiteral): Exclusive C14N with comments and an empty inclusive-prefix list.
  Namespace names must satisfy [Namespaces 1.0 section 3](https://www.w3.org/TR/2006/REC-xml-names-20060816/#ns-decl), in addition to the canonicalization ban on relative namespace names.
- Literal bounds, facet value-space membership and nested annotations are checked even where a Java lexical-pattern check is weaker.
  Unknown datatype validation returns unverified; a known ill-typed value returns invalid.
  Facets outside the selected mandatory OWL datatype map are not silently treated as supported.

The XSD errata landing page has no integrated datatype errata and its linked approved-issues query was unavailable during review.
The interpretation above states the published 2012 text; it does not assert an exhaustive subsequent errata audit.

## Resources and verification

Default limits are `maxWork: 1000000`, `maxDepth: 256`, `maxNumericDigits: 4096`, `maxLiteralLength: 1048576` and `timeoutMs: null`.
Omitted or explicit `null` disables only the profile elapsed deadline; cancellation and other limits remain enforced.
An explicit nonnegative safe integer retains its elapsed deadline, including `0`; zero is not an unlimited sentinel.
Pass `{ timeoutMs: 30000 }` to retain the previous profile deadline.
The loader's separate 30,000 ms default remains unchanged; see the [default-policy inventory](default-behavior-inventory.md).
The depth ceiling is 512 and numeric-digit ceiling is 65536.
XML traversal consumes the same work/depth budget; literal input size bounds the parser allocation.
The XML parser fallback remains a lazy, bundler-visible import for workers without a native `DOMParser`.
The formal and source passes share one budget and one captured closure.
Cooperative work yields periodically; cancellation uses the intrinsic AbortSignal state and rejects with `AbortError`.
Resource exhaustion produces an unverified result and cannot certify unfinished work.

Public regression suites cover source mutation, closure overrides, annotated datatype definitions, malformed XML namespaces, imported exclusions, original arity, exact cardinalities, ambiguous multiple roles and RDFS storage atomicity.
These checks are targeted evidence, not exhaustive conformance, Java execution parity or release qualification.
