# OWLAPI parser and format surface

Reference source: local OWLAPI checkout `d7e997a53b470e32700de89cc610d9daf01ea769`
(`owlapi-parent-5.5.1-7-gd7e997a53`). This inventory records public identities;
the Java implementation is not a JavaScript implementation template.

| OWLAPI identity                                                               | owlapi-js capability         | v1 status                                    |
| ----------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------- |
| `OWLFunctionalSyntaxOWLParser` / `FunctionalSyntaxDocumentFormatFactory`      | `parser.functional`          | `REQUIRED_V1`; Phase 2 `COMPLETE`            |
| `ManchesterOWLSyntaxOntologyParser` / `ManchesterSyntaxDocumentFormatFactory` | `parser.manchester`          | `REQUIRED_V1`; Phase 3 `COMPLETE`            |
| `OWLXMLParser` / `OWLXMLDocumentFormatFactory`                                | `parser.owlxml`              | `REQUIRED_V1`; Phase 4 `COMPLETE`            |
| `DLSyntaxOWLParser` / `DLSyntaxDocumentFormatFactory`                         | `parser.dl`                  | `REQUIRED_V1`                                |
| `KRSS2OWLParser` / `KRSS2DocumentFormatFactory`                               | `parser.krss2`               | `REQUIRED_V1`                                |
| `KRSSOWLParser` / `KRSSDocumentFormatFactory`                                 | `parser.krss1`               | `DEFERRED` implementation; identity required |
| RDF/XML parser/factories                                                      | `parser.rdfxml`              | `DELEGATED`; Phase 6 `COMPLETE`              |
| Turtle/Rio Turtle factories                                                   | `parser.turtle`              | `DELEGATED`; Phase 9 `COMPLETE` via N3.js    |
| Rio TriG                                                                      | `parser.trig`                | `DELEGATED` to N3.js                         |
| Rio N-Triples                                                                 | `parser.ntriples`            | `DELEGATED` to N3.js                         |
| Rio N-Quads                                                                   | `parser.nquads`              | `DELEGATED` to N3.js                         |
| Rio JSON-LD                                                                   | `parser.jsonld`              | `DELEGATED` to jsonld.js                     |
| Rio N3                                                                        | `parser.n3-language`         | `DEFERRED`                                   |
| OBO/OBO 1.2                                                                   | `parser.obo`                 | `UNSUPPORTED_BY_DESIGN` for v1               |
| RDFa, RDF/JSON, TriX, Binary RDF, HDT                                         | corresponding matrix entries | deferred or unsupported as classified        |

Distinct format descriptors are retained even when one dependency implements
several formats. Phase 9 registers only exact `text/turtle`; N-Triples,
N-Quads, TriG, and the broader N3 language remain unsupported until their
separate governed scopes say otherwise. `.owl` is only a filename hint and
never decides OWL/XML vs RDF/XML.
