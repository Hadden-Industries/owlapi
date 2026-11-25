# Scoped SWRL reference fixtures

These project-authored inputs exercise the public Java OWLAPI 5.5.1 reader. `cases.mjs` supplies the exact source text, parser and switches for each case. The capture records a SHA-256 of each input. `simple.rdf` and `simple.ofn` express the same rule independently. `declarations.rdf` contains only the three declarations. The supported rule in `simple.rdf` is the positive control for the two mixed documents.

The native compatible RDF reader produced one logical axiom for the simple rule. Strict RDF produced zero rules. The native Functional reader accepted empty explicit groups, deduplicated repeated atoms, preserved encounter order and accepted a variable used only in the head. Omitting the head was a syntax error. The declared simple rule passed the public Java DL profile checker and failed EL.

The annotated input retained its label, comment and typed false value even with annotation-axiom loading disabled. The IRI-valued variant was handled differently by Java and lies outside the JS subset. Java consumed a crossed tail while reading its head and returned an empty body for that probe. The two distinct variable IRIs survive intact in the ordinary cases.

To regenerate, obtain the repository's locked 64-JAR Java 5.5.1 classpath and use the JDK selected by `.java-version`. From the repository root, write `await scopedSwrlCases()` from `util/owlapi-reference/fixtures/swrl/cases.mjs` as JSON to a scratch file. Run `java -cp <released-classpath> util/owlapi-reference/ObserveScopedSwrl.java <cases.json> <capture.json>`. Each fixture runs in a fresh manager with its declared parser. Compare the result as JSON with `java-5.5.1.json`.

The pre-change public JS load of the simple RDF/XML exposed zero rules. Its Functional counterpart raised `UNSUPPORTED_CONSTRUCT`. The declarations-only control loaded all three entities.
