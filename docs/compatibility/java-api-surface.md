<!-- registry-sha256: a4d41d1b00634883a46b94e4bd043ae67fd3ee9f33425b7787e5b62dd060ab73 -->

# Java OWLAPI compatibility surface

This generated view compares `@hadden-industries/owlapi` 0.1.0-rc.1 with Java OWLAPI 5.5.1 at `b61ebe2da83daceebb3e7ba7afbd2582c9240c33`. The JSON registry beside this file is authoritative.

This independently maintained JavaScript implementation is not affiliated with, sponsored by, or endorsed by the Java OWLAPI project. Compatibility rows describe a bounded technical relationship and do not claim complete API parity.

A mapped name does not promise every Java overload or method. The relationship, compatibility, supported-member, and omitted-member fields in the registry define the actual contract.

## Inventory summary

- Public package namespaces: 7
- Public JavaScript bindings: 58
- Public Java types inspected: 1013
- Unclassified Java types: 0

| Java disposition                           | Count |
| ------------------------------------------ | ----: |
| PUBLIC_MAPPED                              |    27 |
| STRUCTURALLY_SUPPORTED_NOT_NAMED_EXPORT    |    76 |
| FORMAT_IDENTITY_SUPPORTED_NOT_NAMED_EXPORT |     7 |
| INTERNAL_IMPLEMENTATION_ONLY               |     2 |
| DEFERRED_NOT_EXPOSED                       |   857 |
| UNSUPPORTED_BY_DESIGN                      |    44 |
| UNCLASSIFIED                               |     0 |

## Public bindings

| JavaScript export                      | Package specifier                    | Java authority                                                   | Relationship  | Compatibility  | Status                   |
| -------------------------------------- | ------------------------------------ | ---------------------------------------------------------------- | ------------- | -------------- | ------------------------ |
| `OWLManager`                           | @hadden-industries/owlapi/apibinding | org.semanticweb.owlapi.apibinding.OWLManager                     | JAVA_ANALOGUE | ADAPTED        | COMPLETE / PRERELEASE    |
| `ANNOTATION_VALUE_KINDS`               | @hadden-industries/owlapi/model      | org.semanticweb.owlapi.model.OWLObject                           | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE    |
| `AXIOM_KINDS`                          | @hadden-industries/owlapi/model      | org.semanticweb.owlapi.model.OWLObject                           | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE    |
| `AddOntologyAnnotation`                | @hadden-industries/owlapi/model      | org.semanticweb.owlapi.model.AddOntologyAnnotation               | JAVA_ANALOGUE | ADAPTED        | COMPLETE / PRERELEASE    |
| `CLASS_EXPRESSION_KINDS`               | @hadden-industries/owlapi/model      | org.semanticweb.owlapi.model.OWLObject                           | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE    |
| `DATA_PROPERTY_EXPRESSION_KINDS`       | @hadden-industries/owlapi/model      | org.semanticweb.owlapi.model.OWLObject                           | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE    |
| `DATA_RANGE_KINDS`                     | @hadden-industries/owlapi/model      | org.semanticweb.owlapi.model.OWLObject                           | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE    |
| `ENTITY_KINDS`                         | @hadden-industries/owlapi/model      | org.semanticweb.owlapi.model.OWLObject                           | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE    |
| `INDIVIDUAL_KINDS`                     | @hadden-industries/owlapi/model      | org.semanticweb.owlapi.model.OWLObject                           | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE    |
| `IRI`                                  | @hadden-industries/owlapi/model      | org.semanticweb.owlapi.model.IRI                                 | JAVA_ANALOGUE | ADAPTED        | COMPLETE / PRERELEASE    |
| `OBJECT_PROPERTY_EXPRESSION_KINDS`     | @hadden-industries/owlapi/model      | org.semanticweb.owlapi.model.OWLObject                           | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE    |
| `OWLDataFactory`                       | @hadden-industries/owlapi/model      | org.semanticweb.owlapi.model.OWLDataFactory                      | JAVA_ANALOGUE | ADAPTED        | COMPLETE / PRERELEASE    |
| `OWLDocumentFormat`                    | @hadden-industries/owlapi/model      | org.semanticweb.owlapi.model.OWLDocumentFormat                   | JAVA_ANALOGUE | ADAPTED        | COMPLETE / PRERELEASE    |
| `OWLObjectKind`                        | @hadden-industries/owlapi/model      | org.semanticweb.owlapi.model.OWLObject                           | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE    |
| `OWLOntology`                          | @hadden-industries/owlapi/model      | org.semanticweb.owlapi.model.OWLOntology                         | JAVA_ANALOGUE | ADAPTED        | COMPLETE / PRERELEASE    |
| `OWLOntologyLoaderConfiguration`       | @hadden-industries/owlapi/model      | org.semanticweb.owlapi.model.OWLOntologyLoaderConfiguration      | JAVA_ANALOGUE | ADAPTED        | COMPLETE / PRERELEASE    |
| `OWLOntologyManager`                   | @hadden-industries/owlapi/model      | org.semanticweb.owlapi.model.OWLOntologyManager                  | JAVA_ANALOGUE | ADAPTED        | COMPLETE / PRERELEASE    |
| `OWLOntologyWriterConfiguration`       | @hadden-industries/owlapi/model      | org.semanticweb.owlapi.model.OWLOntologyWriterConfiguration      | JS_ADAPTATION | ADAPTED        | COMPLETE / PRERELEASE    |
| `OWLStructuralObject`                  | @hadden-industries/owlapi/model      | org.semanticweb.owlapi.model.OWLObject                           | JAVA_ANALOGUE | ADAPTED        | COMPLETE / PRERELEASE    |
| `OWL_OBJECT_KINDS`                     | @hadden-industries/owlapi/model      | org.semanticweb.owlapi.model.OWLObject                           | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE    |
| `SetOntologyID`                        | @hadden-industries/owlapi/model      | org.semanticweb.owlapi.model.SetOntologyID                       | JAVA_ANALOGUE | ADAPTED        | COMPLETE / PRERELEASE    |
| `StructuralSet`                        | @hadden-industries/owlapi/model      | org.semanticweb.owlapi.model.OWLObject                           | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE    |
| `dispatchAnnotationValue`              | @hadden-industries/owlapi/model      | org.semanticweb.owlapi.model.OWLObjectVisitorEx                  | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE    |
| `dispatchAxiom`                        | @hadden-industries/owlapi/model      | org.semanticweb.owlapi.model.OWLObjectVisitorEx                  | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE    |
| `dispatchClassExpression`              | @hadden-industries/owlapi/model      | org.semanticweb.owlapi.model.OWLObjectVisitorEx                  | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE    |
| `dispatchDataPropertyExpression`       | @hadden-industries/owlapi/model      | org.semanticweb.owlapi.model.OWLObjectVisitorEx                  | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE    |
| `dispatchDataRange`                    | @hadden-industries/owlapi/model      | org.semanticweb.owlapi.model.OWLObjectVisitorEx                  | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE    |
| `dispatchIndividual`                   | @hadden-industries/owlapi/model      | org.semanticweb.owlapi.model.OWLObjectVisitorEx                  | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE    |
| `dispatchObjectPropertyExpression`     | @hadden-industries/owlapi/model      | org.semanticweb.owlapi.model.OWLObjectVisitorEx                  | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE    |
| `dispatchOwlObject`                    | @hadden-industries/owlapi/model      | org.semanticweb.owlapi.model.OWLObjectVisitorEx                  | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE    |
| `AmbiguousRdfDatasetError`             | @hadden-industries/owlapi/io         | org.semanticweb.owlapi.model.OWLOntologyCreationException        | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE    |
| `DocumentLoadError`                    | @hadden-industries/owlapi/io         | org.semanticweb.owlapi.model.OWLOntologyCreationException        | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE    |
| `GraphSelectionError`                  | @hadden-industries/owlapi/io         | org.semanticweb.owlapi.model.OWLOntologyCreationException        | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE    |
| `MissingImportError`                   | @hadden-industries/owlapi/io         | org.semanticweb.owlapi.model.UnloadableImportException           | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE    |
| `OWLAPIError`                          | @hadden-industries/owlapi/io         | org.semanticweb.owlapi.model.OWLRuntimeException                 | JAVA_ANALOGUE | ADAPTED        | COMPLETE / PRERELEASE    |
| `OWLOntologyCreationError`             | @hadden-industries/owlapi/io         | org.semanticweb.owlapi.model.OWLOntologyCreationException        | JAVA_ANALOGUE | ADAPTED        | COMPLETE / PRERELEASE    |
| `OWLOntologyStateError`                | @hadden-industries/owlapi/io         | org.semanticweb.owlapi.model.OWLRuntimeException                 | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE    |
| `OWLOntologyStorageError`              | @hadden-industries/owlapi/io         | org.semanticweb.owlapi.model.OWLOntologyStorageException         | JS_ADAPTATION | ADAPTED        | COMPLETE / PRERELEASE    |
| `OWLParserError`                       | @hadden-industries/owlapi/io         | org.semanticweb.owlapi.io.OWLParserException                     | JAVA_ANALOGUE | ADAPTED        | COMPLETE / PRERELEASE    |
| `OWLStorerNotFoundError`               | @hadden-industries/owlapi/io         | org.semanticweb.owlapi.model.OWLStorerNotFoundException          | JS_ADAPTATION | ADAPTED        | COMPLETE / PRERELEASE    |
| `OWLSyntaxError`                       | @hadden-industries/owlapi/io         | org.semanticweb.owlapi.io.OWLParserException                     | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE    |
| `ParserMismatchError`                  | @hadden-industries/owlapi/io         | org.semanticweb.owlapi.io.OWLParserException                     | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE    |
| `RDFOntologyHeaderStatus`              | @hadden-industries/owlapi/io         | org.semanticweb.owlapi.io.RDFOntologyHeaderStatus                | JS_ADAPTATION | ADAPTED        | COMPLETE / PRERELEASE    |
| `RDFParserMetaData`                    | @hadden-industries/owlapi/io         | org.semanticweb.owlapi.io.RDFParserMetaData                      | JS_ADAPTATION | ADAPTED        | COMPLETE / PRERELEASE    |
| `ResourceLimitError`                   | @hadden-industries/owlapi/io         | org.semanticweb.owlapi.model.OWLRuntimeException                 | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE    |
| `SecurityPolicyError`                  | @hadden-industries/owlapi/io         | org.semanticweb.owlapi.model.OWLOntologyLoaderConfiguration      | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE    |
| `StringDocumentSource`                 | @hadden-industries/owlapi/io         | org.semanticweb.owlapi.io.StringDocumentSource                   | JS_ADAPTATION | ADAPTED        | COMPLETE / PRERELEASE    |
| `StringDocumentTarget`                 | @hadden-industries/owlapi/io         | org.semanticweb.owlapi.io.StringDocumentTarget                   | JS_ADAPTATION | ADAPTED        | COMPLETE / PRERELEASE    |
| `UnloadableImportError`                | @hadden-industries/owlapi/io         | org.semanticweb.owlapi.model.UnloadableImportException           | JS_ADAPTATION | ADAPTED        | COMPLETE / PRERELEASE    |
| `UnparsableOntologyException`          | @hadden-industries/owlapi/io         | org.semanticweb.owlapi.io.UnparsableOntologyException            | JS_ADAPTATION | ADAPTED        | COMPLETE / PRERELEASE    |
| `UnsupportedConstructError`            | @hadden-industries/owlapi/io         | org.semanticweb.owlapi.io.OWLParserException                     | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE    |
| `XmlParseError`                        | @hadden-industries/owlapi/io         | org.semanticweb.owlapi.io.OWLParserException                     | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE    |
| `OWLDocumentFormats`                   | @hadden-industries/owlapi/formats    | org.semanticweb.owlapi.formats                                   | JS_EXTENSION  | NOT_APPLICABLE | COMPLETE / PRERELEASE    |
| `RDFXMLDocumentFormat`                 | @hadden-industries/owlapi/formats    | org.semanticweb.owlapi.formats.RDFXMLDocumentFormat              | JAVA_ANALOGUE | ADAPTED        | COMPLETE / PRERELEASE    |
| `OWLOntologyImportsClosureSetProvider` | @hadden-industries/owlapi/util       | org.semanticweb.owlapi.util.OWLOntologyImportsClosureSetProvider | JS_ADAPTATION | ADAPTED        | COMPLETE / PRERELEASE    |
| `OWLOntologyMerger`                    | @hadden-industries/owlapi/util       | org.semanticweb.owlapi.util.OWLOntologyMerger                    | JAVA_ANALOGUE | ADAPTED        | COMPLETE / PRERELEASE    |
| `OWL2DLProfile`                        | @hadden-industries/owlapi/profiles   | org.semanticweb.owlapi.profiles.OWL2DLProfile                    | JS_ADAPTATION | ADAPTED        | IN_PROGRESS / PRERELEASE |
| `OWLProfileReport`                     | @hadden-industries/owlapi/profiles   | org.semanticweb.owlapi.profiles.OWLProfileReport                 | JS_ADAPTATION | ADAPTED        | IN_PROGRESS / PRERELEASE |

## Java package gap summary

Every public Java type is classified in the machine-readable registry. This compact view groups those classifications by Java package.

| Java package                                         | Disposition counts                                                                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| org.semanticweb.owlapi.annotations                   | DEFERRED_NOT_EXPOSED: 1                                                                                                               |
| org.semanticweb.owlapi.apibinding                    | DEFERRED_NOT_EXPOSED: 1; PUBLIC_MAPPED: 1                                                                                             |
| org.semanticweb.owlapi.atomicdecomposition           | DEFERRED_NOT_EXPOSED: 1                                                                                                               |
| org.semanticweb.owlapi.benchmarks                    | DEFERRED_NOT_EXPOSED: 5                                                                                                               |
| org.semanticweb.owlapi.change                        | DEFERRED_NOT_EXPOSED: 27                                                                                                              |
| org.semanticweb.owlapi.debugging                     | DEFERRED_NOT_EXPOSED: 5                                                                                                               |
| org.semanticweb.owlapi.dlsyntax.parser               | DEFERRED_NOT_EXPOSED: 3                                                                                                               |
| org.semanticweb.owlapi.dlsyntax.renderer             | DEFERRED_NOT_EXPOSED: 7                                                                                                               |
| org.semanticweb.owlapi.expression                    | DEFERRED_NOT_EXPOSED: 6                                                                                                               |
| org.semanticweb.owlapi.formats                       | DEFERRED_NOT_EXPOSED: 52; FORMAT_IDENTITY_SUPPORTED_NOT_NAMED_EXPORT: 7; PUBLIC_MAPPED: 1; STRUCTURALLY_SUPPORTED_NOT_NAMED_EXPORT: 1 |
| org.semanticweb.owlapi.functional.parser             | DEFERRED_NOT_EXPOSED: 4                                                                                                               |
| org.semanticweb.owlapi.functional.renderer           | DEFERRED_NOT_EXPOSED: 4                                                                                                               |
| org.semanticweb.owlapi.io                            | DEFERRED_NOT_EXPOSED: 46; INTERNAL_IMPLEMENTATION_ONLY: 2; PUBLIC_MAPPED: 6                                                           |
| org.semanticweb.owlapi.krss1.parser                  | DEFERRED_NOT_EXPOSED: 4                                                                                                               |
| org.semanticweb.owlapi.krss2.parser                  | DEFERRED_NOT_EXPOSED: 3                                                                                                               |
| org.semanticweb.owlapi.krss2.renderer                | DEFERRED_NOT_EXPOSED: 13                                                                                                              |
| org.semanticweb.owlapi.latex.renderer                | DEFERRED_NOT_EXPOSED: 9                                                                                                               |
| org.semanticweb.owlapi.manchestersyntax.parser       | DEFERRED_NOT_EXPOSED: 11                                                                                                              |
| org.semanticweb.owlapi.manchestersyntax.renderer     | DEFERRED_NOT_EXPOSED: 13                                                                                                              |
| org.semanticweb.owlapi.metrics                       | DEFERRED_NOT_EXPOSED: 23                                                                                                              |
| org.semanticweb.owlapi.model                         | DEFERRED_NOT_EXPOSED: 255; PUBLIC_MAPPED: 15; STRUCTURALLY_SUPPORTED_NOT_NAMED_EXPORT: 75                                             |
| org.semanticweb.owlapi.model.axiomproviders          | DEFERRED_NOT_EXPOSED: 11                                                                                                              |
| org.semanticweb.owlapi.model.parameters              | DEFERRED_NOT_EXPOSED: 6                                                                                                               |
| org.semanticweb.owlapi.model.providers               | DEFERRED_NOT_EXPOSED: 30                                                                                                              |
| org.semanticweb.owlapi.modularity                    | DEFERRED_NOT_EXPOSED: 4                                                                                                               |
| org.semanticweb.owlapi.modularity.locality           | DEFERRED_NOT_EXPOSED: 7                                                                                                               |
| org.semanticweb.owlapi.normalform                    | DEFERRED_NOT_EXPOSED: 3                                                                                                               |
| org.semanticweb.owlapi.oboformat                     | DEFERRED_NOT_EXPOSED: 5                                                                                                               |
| org.semanticweb.owlapi.owlxml.parser                 | DEFERRED_NOT_EXPOSED: 2                                                                                                               |
| org.semanticweb.owlapi.owlxml.renderer               | DEFERRED_NOT_EXPOSED: 6                                                                                                               |
| org.semanticweb.owlapi.profiles                      | DEFERRED_NOT_EXPOSED: 13; PUBLIC_MAPPED: 2                                                                                            |
| org.semanticweb.owlapi.profiles.violations           | DEFERRED_NOT_EXPOSED: 50                                                                                                              |
| org.semanticweb.owlapi.rdf                           | DEFERRED_NOT_EXPOSED: 2                                                                                                               |
| org.semanticweb.owlapi.rdf.model                     | DEFERRED_NOT_EXPOSED: 3                                                                                                               |
| org.semanticweb.owlapi.rdf.rdfxml.parser             | DEFERRED_NOT_EXPOSED: 18                                                                                                              |
| org.semanticweb.owlapi.rdf.rdfxml.renderer           | DEFERRED_NOT_EXPOSED: 10                                                                                                              |
| org.semanticweb.owlapi.rdf.turtle.parser             | DEFERRED_NOT_EXPOSED: 7                                                                                                               |
| org.semanticweb.owlapi.rdf.turtle.renderer           | DEFERRED_NOT_EXPOSED: 3                                                                                                               |
| org.semanticweb.owlapi.reasoner                      | UNSUPPORTED_BY_DESIGN: 26                                                                                                             |
| org.semanticweb.owlapi.reasoner.impl                 | UNSUPPORTED_BY_DESIGN: 15                                                                                                             |
| org.semanticweb.owlapi.reasoner.knowledgeexploration | UNSUPPORTED_BY_DESIGN: 1                                                                                                              |
| org.semanticweb.owlapi.reasoner.structural           | UNSUPPORTED_BY_DESIGN: 2                                                                                                              |
| org.semanticweb.owlapi.rio                           | DEFERRED_NOT_EXPOSED: 37                                                                                                              |
| org.semanticweb.owlapi.rio.utils                     | DEFERRED_NOT_EXPOSED: 1                                                                                                               |
| org.semanticweb.owlapi.search                        | DEFERRED_NOT_EXPOSED: 3                                                                                                               |
| org.semanticweb.owlapi.test                          | DEFERRED_NOT_EXPOSED: 1                                                                                                               |
| org.semanticweb.owlapi.util                          | DEFERRED_NOT_EXPOSED: 125; PUBLIC_MAPPED: 2                                                                                           |
| org.semanticweb.owlapi.util.mansyntax                | DEFERRED_NOT_EXPOSED: 1                                                                                                               |
| org.semanticweb.owlapi.utilities                     | DEFERRED_NOT_EXPOSED: 1                                                                                                               |
| org.semanticweb.owlapi.vocab                         | DEFERRED_NOT_EXPOSED: 15                                                                                                              |
