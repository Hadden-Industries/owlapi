<!-- registry-sha256: 1498a19971870c70891bc3ecb5886968aa43364199d61927c25272cbcc80f8e2 -->

# Java OWLAPI compatibility surface

This generated view compares `owlapi` 0.1.0-alpha.0 with Java OWLAPI 5.5.1 at `d7e997a53b470e32700de89cc610d9daf01ea769`. The JSON registry beside this file is authoritative.

This independently maintained JavaScript implementation is not affiliated with, sponsored by, or endorsed by the Java OWLAPI project. Compatibility rows describe a bounded technical relationship and do not claim complete API parity.

A mapped name does not promise every Java overload or method. The relationship, compatibility, supported-member, and omitted-member fields in the registry define the actual contract.

## Inventory summary

- Public package namespaces: 5
- Public JavaScript bindings: 47
- Public Java types inspected: 1013
- Unclassified Java types: 0

| Java disposition                           | Count |
| ------------------------------------------ | ----: |
| PUBLIC_MAPPED                              |    16 |
| STRUCTURALLY_SUPPORTED_NOT_NAMED_EXPORT    |    73 |
| FORMAT_IDENTITY_SUPPORTED_NOT_NAMED_EXPORT |     8 |
| INTERNAL_IMPLEMENTATION_ONLY               |     2 |
| DEFERRED_NOT_EXPOSED                       |   870 |
| UNSUPPORTED_BY_DESIGN                      |    44 |
| UNCLASSIFIED                               |     0 |

## Public bindings

| JavaScript export                  | Package specifier | Java authority                                              | Relationship  | Compatibility  | Status                |
| ---------------------------------- | ----------------- | ----------------------------------------------------------- | ------------- | -------------- | --------------------- |
| `OWLManager`                       | owlapi/apibinding | org.semanticweb.owlapi.apibinding.OWLManager                | JAVA_ANALOGUE | ADAPTED        | COMPLETE / PRERELEASE |
| `ANNOTATION_VALUE_KINDS`           | owlapi/model      | org.semanticweb.owlapi.model.OWLObject                      | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE |
| `AXIOM_KINDS`                      | owlapi/model      | org.semanticweb.owlapi.model.OWLObject                      | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE |
| `AddOntologyAnnotation`            | owlapi/model      | org.semanticweb.owlapi.model.AddOntologyAnnotation          | JAVA_ANALOGUE | ADAPTED        | COMPLETE / PRERELEASE |
| `CLASS_EXPRESSION_KINDS`           | owlapi/model      | org.semanticweb.owlapi.model.OWLObject                      | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE |
| `DATA_PROPERTY_EXPRESSION_KINDS`   | owlapi/model      | org.semanticweb.owlapi.model.OWLObject                      | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE |
| `DATA_RANGE_KINDS`                 | owlapi/model      | org.semanticweb.owlapi.model.OWLObject                      | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE |
| `ENTITY_KINDS`                     | owlapi/model      | org.semanticweb.owlapi.model.OWLObject                      | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE |
| `INDIVIDUAL_KINDS`                 | owlapi/model      | org.semanticweb.owlapi.model.OWLObject                      | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE |
| `IRI`                              | owlapi/model      | org.semanticweb.owlapi.model.IRI                            | JAVA_ANALOGUE | ADAPTED        | COMPLETE / PRERELEASE |
| `OBJECT_PROPERTY_EXPRESSION_KINDS` | owlapi/model      | org.semanticweb.owlapi.model.OWLObject                      | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE |
| `OWLDataFactory`                   | owlapi/model      | org.semanticweb.owlapi.model.OWLDataFactory                 | JAVA_ANALOGUE | ADAPTED        | COMPLETE / PRERELEASE |
| `OWLDocumentFormat`                | owlapi/model      | org.semanticweb.owlapi.model.OWLDocumentFormat              | JAVA_ANALOGUE | ADAPTED        | COMPLETE / PRERELEASE |
| `OWLObjectKind`                    | owlapi/model      | org.semanticweb.owlapi.model.OWLObject                      | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE |
| `OWLOntology`                      | owlapi/model      | org.semanticweb.owlapi.model.OWLOntology                    | JAVA_ANALOGUE | ADAPTED        | COMPLETE / PRERELEASE |
| `OWLOntologyLoaderConfiguration`   | owlapi/model      | org.semanticweb.owlapi.model.OWLOntologyLoaderConfiguration | JAVA_ANALOGUE | ADAPTED        | COMPLETE / PRERELEASE |
| `OWLOntologyManager`               | owlapi/model      | org.semanticweb.owlapi.model.OWLOntologyManager             | JAVA_ANALOGUE | ADAPTED        | COMPLETE / PRERELEASE |
| `OWLStructuralObject`              | owlapi/model      | org.semanticweb.owlapi.model.OWLObject                      | JAVA_ANALOGUE | ADAPTED        | COMPLETE / PRERELEASE |
| `OWL_OBJECT_KINDS`                 | owlapi/model      | org.semanticweb.owlapi.model.OWLObject                      | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE |
| `SetOntologyID`                    | owlapi/model      | org.semanticweb.owlapi.model.SetOntologyID                  | JAVA_ANALOGUE | ADAPTED        | COMPLETE / PRERELEASE |
| `StructuralSet`                    | owlapi/model      | org.semanticweb.owlapi.model.OWLObject                      | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE |
| `dispatchAnnotationValue`          | owlapi/model      | org.semanticweb.owlapi.model.OWLObjectVisitorEx             | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE |
| `dispatchAxiom`                    | owlapi/model      | org.semanticweb.owlapi.model.OWLObjectVisitorEx             | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE |
| `dispatchClassExpression`          | owlapi/model      | org.semanticweb.owlapi.model.OWLObjectVisitorEx             | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE |
| `dispatchDataPropertyExpression`   | owlapi/model      | org.semanticweb.owlapi.model.OWLObjectVisitorEx             | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE |
| `dispatchDataRange`                | owlapi/model      | org.semanticweb.owlapi.model.OWLObjectVisitorEx             | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE |
| `dispatchIndividual`               | owlapi/model      | org.semanticweb.owlapi.model.OWLObjectVisitorEx             | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE |
| `dispatchObjectPropertyExpression` | owlapi/model      | org.semanticweb.owlapi.model.OWLObjectVisitorEx             | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE |
| `dispatchOwlObject`                | owlapi/model      | org.semanticweb.owlapi.model.OWLObjectVisitorEx             | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE |
| `AmbiguousRdfDatasetError`         | owlapi/io         | org.semanticweb.owlapi.model.OWLOntologyCreationException   | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE |
| `DocumentLoadError`                | owlapi/io         | org.semanticweb.owlapi.model.OWLOntologyCreationException   | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE |
| `GraphSelectionError`              | owlapi/io         | org.semanticweb.owlapi.model.OWLOntologyCreationException   | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE |
| `MissingImportError`               | owlapi/io         | org.semanticweb.owlapi.model.UnloadableImportException      | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE |
| `OWLAPIError`                      | owlapi/io         | org.semanticweb.owlapi.model.OWLRuntimeException            | JAVA_ANALOGUE | ADAPTED        | COMPLETE / PRERELEASE |
| `OWLOntologyCreationError`         | owlapi/io         | org.semanticweb.owlapi.model.OWLOntologyCreationException   | JAVA_ANALOGUE | ADAPTED        | COMPLETE / PRERELEASE |
| `OWLOntologyStateError`            | owlapi/io         | org.semanticweb.owlapi.model.OWLRuntimeException            | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE |
| `OWLParserError`                   | owlapi/io         | org.semanticweb.owlapi.io.OWLParserException                | JAVA_ANALOGUE | ADAPTED        | COMPLETE / PRERELEASE |
| `OWLSyntaxError`                   | owlapi/io         | org.semanticweb.owlapi.io.OWLParserException                | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE |
| `ParserMismatchError`              | owlapi/io         | org.semanticweb.owlapi.io.OWLParserException                | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE |
| `ResourceLimitError`               | owlapi/io         | org.semanticweb.owlapi.model.OWLRuntimeException            | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE |
| `SecurityPolicyError`              | owlapi/io         | org.semanticweb.owlapi.model.OWLOntologyLoaderConfiguration | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE |
| `StringDocumentSource`             | owlapi/io         | org.semanticweb.owlapi.io.StringDocumentSource              | JS_ADAPTATION | ADAPTED        | COMPLETE / PRERELEASE |
| `UnloadableImportError`            | owlapi/io         | org.semanticweb.owlapi.model.UnloadableImportException      | JS_ADAPTATION | ADAPTED        | COMPLETE / PRERELEASE |
| `UnparsableOntologyException`      | owlapi/io         | org.semanticweb.owlapi.io.UnparsableOntologyException       | JS_ADAPTATION | ADAPTED        | COMPLETE / PRERELEASE |
| `UnsupportedConstructError`        | owlapi/io         | org.semanticweb.owlapi.io.OWLParserException                | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE |
| `XmlParseError`                    | owlapi/io         | org.semanticweb.owlapi.io.OWLParserException                | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE |
| `OWLDocumentFormats`               | owlapi/formats    | org.semanticweb.owlapi.formats                              | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE |

## Java package gap summary

Every public Java type is classified in the machine-readable registry. This compact view groups those classifications by Java package.

| Java package                                         | Disposition counts                                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| org.semanticweb.owlapi.annotations                   | DEFERRED_NOT_EXPOSED: 1                                                                   |
| org.semanticweb.owlapi.apibinding                    | DEFERRED_NOT_EXPOSED: 1; PUBLIC_MAPPED: 1                                                 |
| org.semanticweb.owlapi.atomicdecomposition           | DEFERRED_NOT_EXPOSED: 1                                                                   |
| org.semanticweb.owlapi.benchmarks                    | DEFERRED_NOT_EXPOSED: 5                                                                   |
| org.semanticweb.owlapi.change                        | DEFERRED_NOT_EXPOSED: 27                                                                  |
| org.semanticweb.owlapi.debugging                     | DEFERRED_NOT_EXPOSED: 5                                                                   |
| org.semanticweb.owlapi.dlsyntax.parser               | DEFERRED_NOT_EXPOSED: 3                                                                   |
| org.semanticweb.owlapi.dlsyntax.renderer             | DEFERRED_NOT_EXPOSED: 7                                                                   |
| org.semanticweb.owlapi.expression                    | DEFERRED_NOT_EXPOSED: 6                                                                   |
| org.semanticweb.owlapi.formats                       | DEFERRED_NOT_EXPOSED: 53; FORMAT_IDENTITY_SUPPORTED_NOT_NAMED_EXPORT: 8                   |
| org.semanticweb.owlapi.functional.parser             | DEFERRED_NOT_EXPOSED: 4                                                                   |
| org.semanticweb.owlapi.functional.renderer           | DEFERRED_NOT_EXPOSED: 4                                                                   |
| org.semanticweb.owlapi.io                            | DEFERRED_NOT_EXPOSED: 49; INTERNAL_IMPLEMENTATION_ONLY: 2; PUBLIC_MAPPED: 3               |
| org.semanticweb.owlapi.krss1.parser                  | DEFERRED_NOT_EXPOSED: 4                                                                   |
| org.semanticweb.owlapi.krss2.parser                  | DEFERRED_NOT_EXPOSED: 3                                                                   |
| org.semanticweb.owlapi.krss2.renderer                | DEFERRED_NOT_EXPOSED: 13                                                                  |
| org.semanticweb.owlapi.latex.renderer                | DEFERRED_NOT_EXPOSED: 9                                                                   |
| org.semanticweb.owlapi.manchestersyntax.parser       | DEFERRED_NOT_EXPOSED: 11                                                                  |
| org.semanticweb.owlapi.manchestersyntax.renderer     | DEFERRED_NOT_EXPOSED: 13                                                                  |
| org.semanticweb.owlapi.metrics                       | DEFERRED_NOT_EXPOSED: 23                                                                  |
| org.semanticweb.owlapi.model                         | DEFERRED_NOT_EXPOSED: 260; PUBLIC_MAPPED: 12; STRUCTURALLY_SUPPORTED_NOT_NAMED_EXPORT: 73 |
| org.semanticweb.owlapi.model.axiomproviders          | DEFERRED_NOT_EXPOSED: 11                                                                  |
| org.semanticweb.owlapi.model.parameters              | DEFERRED_NOT_EXPOSED: 6                                                                   |
| org.semanticweb.owlapi.model.providers               | DEFERRED_NOT_EXPOSED: 30                                                                  |
| org.semanticweb.owlapi.modularity                    | DEFERRED_NOT_EXPOSED: 4                                                                   |
| org.semanticweb.owlapi.modularity.locality           | DEFERRED_NOT_EXPOSED: 7                                                                   |
| org.semanticweb.owlapi.normalform                    | DEFERRED_NOT_EXPOSED: 3                                                                   |
| org.semanticweb.owlapi.oboformat                     | DEFERRED_NOT_EXPOSED: 5                                                                   |
| org.semanticweb.owlapi.owlxml.parser                 | DEFERRED_NOT_EXPOSED: 2                                                                   |
| org.semanticweb.owlapi.owlxml.renderer               | DEFERRED_NOT_EXPOSED: 6                                                                   |
| org.semanticweb.owlapi.profiles                      | DEFERRED_NOT_EXPOSED: 15                                                                  |
| org.semanticweb.owlapi.profiles.violations           | DEFERRED_NOT_EXPOSED: 50                                                                  |
| org.semanticweb.owlapi.rdf                           | DEFERRED_NOT_EXPOSED: 2                                                                   |
| org.semanticweb.owlapi.rdf.model                     | DEFERRED_NOT_EXPOSED: 3                                                                   |
| org.semanticweb.owlapi.rdf.rdfxml.parser             | DEFERRED_NOT_EXPOSED: 18                                                                  |
| org.semanticweb.owlapi.rdf.rdfxml.renderer           | DEFERRED_NOT_EXPOSED: 10                                                                  |
| org.semanticweb.owlapi.rdf.turtle.parser             | DEFERRED_NOT_EXPOSED: 7                                                                   |
| org.semanticweb.owlapi.rdf.turtle.renderer           | DEFERRED_NOT_EXPOSED: 3                                                                   |
| org.semanticweb.owlapi.reasoner                      | UNSUPPORTED_BY_DESIGN: 26                                                                 |
| org.semanticweb.owlapi.reasoner.impl                 | UNSUPPORTED_BY_DESIGN: 15                                                                 |
| org.semanticweb.owlapi.reasoner.knowledgeexploration | UNSUPPORTED_BY_DESIGN: 1                                                                  |
| org.semanticweb.owlapi.reasoner.structural           | UNSUPPORTED_BY_DESIGN: 2                                                                  |
| org.semanticweb.owlapi.rio                           | DEFERRED_NOT_EXPOSED: 37                                                                  |
| org.semanticweb.owlapi.rio.utils                     | DEFERRED_NOT_EXPOSED: 1                                                                   |
| org.semanticweb.owlapi.search                        | DEFERRED_NOT_EXPOSED: 3                                                                   |
| org.semanticweb.owlapi.test                          | DEFERRED_NOT_EXPOSED: 1                                                                   |
| org.semanticweb.owlapi.util                          | DEFERRED_NOT_EXPOSED: 127                                                                 |
| org.semanticweb.owlapi.util.mansyntax                | DEFERRED_NOT_EXPOSED: 1                                                                   |
| org.semanticweb.owlapi.utilities                     | DEFERRED_NOT_EXPOSED: 1                                                                   |
| org.semanticweb.owlapi.vocab                         | DEFERRED_NOT_EXPOSED: 15                                                                  |
