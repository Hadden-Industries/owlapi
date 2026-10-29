# Public API Performance Comparison: JS OWLAPI vs. Java OWLAPI 5.5.1

This is the retained earlier 70-case candidate screen.
Later source changes and filtered family observations are recorded in the [focused follow-ups](java-api-performance-focused-followups.json) and [implementation results](remaining-java-performance-implementation-results.md).
These observations do not establish full performance acceptance for the current working tree.

These grouped workloads do not exhaustively cover public methods or overloads.
Counts are checksums, not structural equivalence proofs; checksum-only rows remain provisional.

- Node: v24.22.1; V8: 13.6.233.17-node.58
- Warmup/measured calls: 2/5
- First-use timing measures a case call inside an initialized suite, not process startup.
- Heap samples measure before/after heap use without post-call GC; they are neither retained nor peak memory.
- Qualified-by-checksum slower groups: 17
- Qualified-by-checksum parity/faster groups: 50
- Unqualified groups: 3

| Benchmark ID                                        | Java ms | Compatible JS ms |       Ratio | Normative JS ms |       Ratio | Admission         |
| --------------------------------------------------- | ------: | ---------------: | ----------: | --------------: | ----------: | ----------------- |
| `manager.createOWLOntologyManager`                  |  10.780 |            0.369 |       0.03x |           0.370 |       0.03x | checksum-only     |
| `config.OWLOntologyLoaderConfiguration`             |   1.130 |            0.894 |       0.79x |           0.746 |       0.66x | checksum-only     |
| `config.OWLOntologyWriterConfiguration`             |   0.155 |            0.233 |       1.50x |           0.164 | unqualified | checksum-mismatch |
| `formats.RDFXMLDocumentFormat.prefixes`             |   0.690 |            0.860 |       1.25x |           0.887 |       1.29x | checksum-only     |
| `model.IRI.create`                                  |   0.709 |            0.449 |       0.63x |           0.260 |       0.37x | checksum-only     |
| `factory.entities`                                  |   2.912 |            1.514 |       0.52x |           1.535 |       0.53x | checksum-only     |
| `factory.literals`                                  |   1.426 |            2.465 |       1.73x |           0.949 | unqualified | checksum-mismatch |
| `factory.classExpressions`                          |   1.287 |            1.650 |       1.28x |           1.453 |       1.13x | checksum-only     |
| `factory.dataRanges`                                |   0.565 |            0.776 |       1.37x |           0.614 |       1.09x | checksum-only     |
| `factory.axioms`                                    |   2.211 |            1.803 |       0.82x |           1.731 |       0.78x | checksum-only     |
| `model.structuralEqualityAndSet`                    |   0.914 |            0.272 |       0.30x |           0.227 |       0.25x | checksum-only     |
| `model.axiomAnnotationsTransform`                   |   1.310 |            1.605 |       1.23x |           1.498 |       1.14x | checksum-only     |
| `model.dispatch`                                    |   0.198 |            0.185 |       0.93x |           0.201 |       1.02x | checksum-only     |
| `load.functional`                                   |   2.355 |            2.172 |       0.92x |           1.782 |       0.76x | checksum-only     |
| `load.manchester`                                   |   2.607 |            2.179 |       0.84x |           1.727 |       0.66x | checksum-only     |
| `load.owlxml`                                       |   4.947 |            2.918 |       0.59x |           2.409 |       0.49x | checksum-only     |
| `load.rdfxml`                                       |   6.253 |            5.402 |       0.86x |           4.970 |       0.79x | checksum-only     |
| `load.turtle`                                       |   4.039 |            4.651 |       1.15x |           4.292 |       1.06x | checksum-only     |
| `load.ntriples`                                     |   3.915 |            4.480 |       1.14x |           4.305 |       1.10x | checksum-only     |
| `load.nquads`                                       |   3.114 |            4.552 |       1.46x |           4.388 |       1.41x | checksum-only     |
| `load.trig`                                         |   3.391 |            4.523 |       1.33x |           4.488 |       1.32x | checksum-only     |
| `load.jsonld`                                       |   7.632 |            4.852 |       0.64x |           4.459 |       0.58x | checksum-only     |
| `load.dl`                                           |   3.505 |            2.618 |       0.75x |           2.507 |       0.72x | checksum-only     |
| `load.krss2`                                        |   2.998 |            1.797 |       0.60x |           1.599 |       0.53x | checksum-only     |
| `load.krss1`                                        |   2.819 |            2.219 |       0.79x |           1.957 |       0.69x | checksum-only     |
| `load.importsClosure`                               |  48.077 |           14.830 |       0.31x |          14.634 |       0.30x | checksum-only     |
| `load.rdfParserMetaData`                            |   0.218 |            0.022 | unqualified |           0.021 | unqualified | checksum-mismatch |
| `manager.createAndGetOntology`                      |   2.952 |            1.548 |       0.52x |           1.577 |       0.53x | checksum-only     |
| `manager.addAxioms.bulk`                            |   2.534 |            0.632 |       0.25x |           0.229 |       0.09x | checksum-only     |
| `manager.addAxiom.singleLoop`                       |   1.995 |            1.276 |       0.64x |           1.339 |       0.67x | checksum-only     |
| `manager.removeAxioms.bulk`                         |   5.363 |            1.178 |       0.22x |           1.102 |       0.21x | checksum-only     |
| `manager.removeAxiom.singleLoop`                    |   2.758 |            1.423 |       0.52x |           1.651 |       0.60x | checksum-only     |
| `manager.applyChanges.mixed`                        |   1.910 |            0.523 |       0.27x |           0.420 |       0.22x | checksum-only     |
| `manager.getImportsClosure`                         |   0.748 |            0.564 |       0.75x |           0.342 |       0.46x | checksum-only     |
| `ontology.getAxioms.excluded`                       |  28.297 |           16.960 |       0.60x |          17.332 |       0.61x | checksum-only     |
| `ontology.getAxioms.included`                       |  44.337 |           20.863 |       0.47x |          21.726 |       0.49x | checksum-only     |
| `ontology.getLogicalAxioms`                         |  20.477 |           11.163 |       0.55x |          11.257 |       0.55x | checksum-only     |
| `ontology.getAxiomsByType`                          |   9.883 |            4.406 |       0.45x |           4.190 |       0.42x | checksum-only     |
| `ontology.containsAxiom`                            |  18.172 |            0.767 |       0.04x |           0.525 |       0.03x | checksum-only     |
| `ontology.getSignature`                             |  36.986 |            7.981 |       0.22x |           8.299 |       0.22x | checksum-only     |
| `ontology.entitySignatureLookups`                   |  28.095 |            0.862 | unqualified |           0.819 | unqualified | checksum-mismatch |
| `ontology.getReferencingAxioms`                     |   0.326 |            0.151 |       0.46x |           0.164 |       0.50x | checksum-only     |
| `ontology.classAxiomIndexes`                        |   2.125 |            0.464 |       0.22x |           0.528 |       0.25x | checksum-only     |
| `ontology.objectPropertyAxiomIndexes`               |   4.907 |            1.130 |       0.23x |           1.253 |       0.26x | checksum-only     |
| `ontology.dataPropertyAxiomIndexes`                 |   2.133 |            0.493 |       0.23x |           0.577 |       0.27x | checksum-only     |
| `ontology.annotationAndDeclarationIndexes`          |   9.869 |            1.077 |       0.11x |           1.029 |       0.10x | checksum-only     |
| `ontology.individualAssertionIndexes`               |   4.025 |            0.994 |       0.25x |           1.023 |       0.25x | checksum-only     |
| `save.functional`                                   |   1.784 |            0.177 |       0.10x |           0.150 |       0.08x | checksum-only     |
| `save.owlxml`                                       |   1.428 |            1.804 |       1.26x |           1.237 |       0.87x | checksum-only     |
| `save.rdfxml`                                       |   5.507 |            4.124 |       0.75x |           9.582 |       1.74x | checksum-only     |
| `save.turtle`                                       |   2.725 |            0.827 |       0.30x |           4.461 |       1.64x | checksum-only     |
| `search.classHierarchyAndRelations`                 |   2.743 |            2.400 |       0.87x |           2.400 |       0.87x | checksum-only     |
| `search.propertyHierarchyAndDomainsRanges`          |   6.470 |            3.423 |       0.53x |           3.364 |       0.52x | checksum-only     |
| `search.annotations`                                |   3.313 |            2.351 |       0.71x |           2.443 |       0.74x | checksum-only     |
| `search.propertyCharacteristics`                    |   6.576 |            1.096 |       0.17x |           1.155 |       0.18x | checksum-only     |
| `util.SimpleShortFormProvider`                      |   0.434 |            0.464 |       1.07x |           0.390 |       0.90x | checksum-only     |
| `util.AnnotationValueShortFormProvider`             |   1.264 |            0.656 |       0.52x |           0.581 |       0.46x | checksum-only     |
| `util.OWLOntologyImportsClosureSetProvider`         |   0.099 |            0.727 |       7.34x |           0.371 |       3.75x | checksum-only     |
| `util.OWLOntologyMerger`                            |   1.631 |            0.812 |       0.50x |           0.348 |       0.21x | checksum-only     |
| `util.OWLObjectDuplicator`                          |   2.371 |            0.753 |       0.32x |           0.783 |       0.33x | checksum-only     |
| `util.OWLEntityRenamer`                             |   3.383 |            3.350 |       0.99x |           3.244 |       0.96x | checksum-only     |
| `util.OWLEntityRemover`                             |   0.413 |            0.492 |       1.19x |           0.469 |       1.14x | checksum-only     |
| `renderer.ManchesterOWLSyntaxOWLObjectRendererImpl` |   0.904 |            0.510 | unqualified |           0.527 | unqualified | checksum-mismatch |
| `locality.extract.BOTTOM`                           |   2.319 |            1.511 |       0.65x |           1.455 |       0.63x | checksum-only     |
| `locality.extract.TOP`                              |   2.238 |            1.413 |       0.63x |           1.508 |       0.67x | checksum-only     |
| `locality.extract.STAR`                             |   3.287 |            1.822 |       0.55x |           2.063 |       0.63x | checksum-only     |
| `profiles.OWL2DLProfile.checkOntology`              |   4.017 |            2.524 |       0.63x |           2.591 |       0.65x | checksum-only     |
| `profiles.OWL2ELProfile.checkOntology`              |   2.226 |            1.670 |       0.75x |           2.161 |       0.97x | checksum-only     |
| `profiles.OWL2QLProfile.checkOntology`              |   2.147 |            2.565 |       1.19x |           1.640 |       0.76x | checksum-only     |
| `profiles.OWL2RLProfile.checkOntology`              |   1.607 |            2.936 |       1.83x |           1.650 |       1.03x | checksum-only     |
