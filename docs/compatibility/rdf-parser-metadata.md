# RDF parser metadata and consumer compatibility

This contract implements the [bounded consumer plan](../plans/2026-10-02-rdf-consumer-compatibility.md) within the Java OWLAPI surface.
It adds no VOWL model, second OWL interpreter or `compatible-view` parsing mode.
Existing `strict`, `compatible` and `preserve` modes remain distinct.

## Public access

```js
const graph = await manager.loadOntologyGraphFromOntologyDocument(source, {
  parsingMode: "compatible",
  collectWarnings: true,
});
for (const { ontology, context } of graph.documents) {
  const format = manager.getOntologyFormat(ontology);
  const metadata = format.getOntologyLoaderMetaData();
  if (metadata) {
    console.log(context.documentIRI, metadata.getHeaderState());
    console.log(metadata.getUnparsedTriples());
    console.log(metadata.getGuessedDeclarations());
  }
}
```

`RDFParserMetaData` and `RDFOntologyHeaderStatus` are exported through the package root and `/io`.
`getOntologyFormat` accepts only an ontology owned by that manager, returning its loaded format or `undefined` for a programmatically created ontology.
Non-RDF formats normally have no loader metadata.
Loaded RDF formats are immutable per-document copies.
Compare `format.key` to a registry format's key; reference equality with the shared `OWLDocumentFormats` constants is no longer a format-selection test.
Selected format parameters remain available.
`withOntologyLoaderMetaData(metadata)` is the copying counterpart to Java's mutating setter; `withParameter` retains historical loader metadata.
A real RDF parse replaces caller-supplied loader metadata with its own result.

| Accessor                   | JavaScript result and meaning                                                                                                                                                                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `getTripleCount()`         | Number of unique triples in the selected or explicitly merged reconstruction graph. It does not count duplicate source occurrences or quads excluded by graph selection.                                                                                                                                                                   |
| `getHeaderState()`         | One of `PARSED_ZERO_HEADERS`, `PARSED_ONE_HEADER`, `PARSED_MULTIPLE_HEADERS`, counting distinct explicit `rdf:type owl:Ontology` subjects in that graph.                                                                                                                                                                                   |
| `getUnparsedTriples()`     | Frozen array of frozen `{subject, predicate, object}` records. Each term has `termType` and `value`; a literal also has `language` and `datatype: {termType: "NamedNode", value}`, and optionally `direction`. Exact lexical strings survive. These are RDF/JS-shaped data records, not Java RDFTriple wrappers or live RDF datasets.      |
| `getGuessedDeclarations()` | Frozen array of `{iri: IRI, entityType: OWLObjectKind}` records for entity roles used in the reconstructed document without explicit local/imported declarations or built-in status. Unused imported roles are excluded. This is the JavaScript counterpart to Java's Class-valued multimap and does not itself create declaration axioms. |

Blank-node identifiers belong to the containing document metadata.
Keep that association when copying records into a consumer model; matching labels from separate documents are not an identity guarantee.
Metadata survives `collectWarnings: false`; optional explanatory diagnostics do not.

## Interpretation and imports

Compatible mode retains the existing deterministic header selection and its `RDF_MULTIPLE_ONTOLOGY_HEADERS` diagnostic: `candidateOntologyIRIs`, `selectedOntologyIRI`, `observed` and `severity`.
All IRI-valued `owl:imports` statements participate in ordinary manager discovery and recursive loading, including secondary headers and headerless import statements, as in Java's imports handler.
The same resolver authorization, graph selection, import limits, cancellation and atomic publication apply.
Selected-header annotations belong to the ontology; declared secondary-header annotations remain annotation assertions with their subject.
This preserves the existing JavaScript association policy.
The pinned Java parser can instead combine annotations from multiple headers; this change does not copy that behavior.
Non-IRI imports outside the selected header remain unparsed, preserving existing compatible behavior; malformed selected-header imports still fail.
The Java oracle treats a secondary-header literal import as an annotation, not an import declaration; that annotation recovery is outside this change.

Compatible property-category selection retains its existing diagnostics, including `declaredCategories`, `resolvedCategory` and `evidence` for `RDF_PROPERTY_CATEGORY_PUNNING`.
Explicit declarations remain structural axioms even when interpretation selects a role for a use.
Preserve mode still rejects unresolved multi-role uses.
Inverse links and object-only characteristics now seed otherwise untyped compatible properties before connected-property propagation and axiom reconstruction.
This repairs missed ordinary inverse, functional, domain and range axioms without inventing a neutral axiom kind or manufacturing declarations for those uses.
Existing recovery of explicit `rdf:Property` remains unchanged.
Range-only predicates retain existing annotation recovery or remain unparsed; a range alone does not trigger new property inference.

## Lifetime and limits

Metadata describes a completed parse.
Ontology mutation does not rewrite it or make it evidence that the new revision is source-preserving.
Use the existing private-authority-backed `OWL2DLProfile.checkOntology(ontology, {sourceAssessment: true})` for its separately documented assessment and stale/unverified outcomes.
Caller-constructed metadata confers no source-evidence authority.

An empty unparsed-triple array does not prove losslessness: consumed statements may have undergone a documented compatibility interpretation, annotations may have been disabled, graph selection may exclude content, and RDF dataset parsing deduplicates identical statements.
There is no assertion-to-axiom provenance ledger, duplicate-occurrence record, raw byte archive or automatic edit qualification in this API.
VOWL owns acquired source retention, source-to-view accounting, projection, edit/admission policy and canonical artifacts.
It must qualify or withhold stronger claims where its evidence is incomplete.
A strict OWL 2 DL violation is not a universal visualization failure: `xsd:time` and custom datatype literals can parse while the profile or lexical-space assessment remains invalid or unverified.
Known ill-typed supported literals remain distinguishable from unsupported lexical validation.

## Java characterization and maintained evidence

The project-owned `util/owlapi-reference/RunRdfConsumerContract.java` runs offline against the pinned Java 5.5.1 oracle.
For its minimized inverse/functional case, Java emits exactly the inverse, functional, domain and range object-property axioms tested through the JavaScript public manager.
For its two-header case, Java records both imports.
These expectations are independently specified in `model/rdfConsumerCompatibility.test.js`.
The oracle also reports `PARSED_ONE_HEADER` for zero- and multiple-header documents.
This implementation deliberately reports the observed explicit-header state.
Java's handling of an unknown blank-node predicate and multi-header annotations differs from the existing JavaScript policy; those observations do not authorize a broad parser reinterpretation.
`io/rdfParserMetaData.test.js` covers exact literal terms, immutable defensive copies, disabled warnings, per-document metadata, selected graphs, foreign-manager rejection and historical lifetime.
Existing parser and profile suites continue to define strict/preserve, datatype and resource boundaries.
These library results do not replace the consumer's full-closure application qualification or authorize an npm release.
