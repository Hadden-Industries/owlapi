# Scoped SWRL reference fixtures

These project-authored inputs exercise the public Java OWLAPI 5.5.1 reader. The [fixture generator](../../scoped-swrl-fixtures.mjs) supplies the exact source text, parser and switches for each case. The capture records a SHA-256 of each input. `simple.rdf` and `simple.ofn` express the same rule independently. `declarations.rdf` contains only the three declarations. The supported rule in `simple.rdf` is the positive control for the two mixed documents.

The native compatible RDF reader produced one logical axiom for the simple rule. Strict RDF produced zero rules. The native Functional reader accepted empty explicit groups, deduplicated repeated atoms, preserved encounter order and accepted a variable used only in the head. Omitting the head was a syntax error. The declared simple rule passed the public Java DL profile checker and failed EL.

The annotated input retained its label, comment and typed false value even with annotation-axiom loading disabled. The IRI-valued variant was handled differently by Java and lies outside the JS subset. Java consumed a crossed tail while reading its head and returned an empty body for that probe. The two distinct variable IRIs survive intact in the ordinary cases.

Run `node util/owlapi-reference/capture-scoped-swrl.mjs <classpath-file> <jdk-home> <output-json>` from the repository root. The launcher verifies every ordered JAR against the release lock and verifies the JDK against `.java-version` before running the probe. The capture binds the probe bytes, lock and runtime. Each fixture runs in a fresh manager with its declared parser.

The installed pre-change JS tarball `a5ed444d3ae8262df985053ec65a824b811b56f2f0a86907f0c28604df6b5c55` published each RDF result under its ontology ID. All five exposed three declarations and zero rules. The table gives the additional ordinary axioms that callers received.

| Input | Class assertions | Annotation assertions |
| --- | ---: | ---: |
| Declarations | 0 | 0 |
| Simple | 6 | 10 |
| Annotated | 7 | 15 |
| Unsupported first | 9 | 16 |
| Unsupported last | 9 | 16 |

The pre-change Functional simple control raised `UNSUPPORTED_CONSTRUCT`.

After an installed-candidate comparison, run `node util/owlapi-reference/verify-scoped-swrl-controls.mjs <run-directory> <candidate-directory> <classpath-file> <jdk-home> <new-output-directory>`. The released Java comparator checks both formats from the installed package. The positive controls cover the original simple rule and an annotated rule after an independently expressed declaration edit. Changing only the simple rule's head predicate preserves the counts and must produce a native `AXIOMS` mismatch. Each control binds the verified installed package and pins the expected RDF, both serializations and the native result by byte length and SHA-256.
