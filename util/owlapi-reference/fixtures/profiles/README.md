# Bounded profile comparison

`canonical-vowl-inputs.json` contains 20 Functional Syntax cases. The last document
is the root; earlier documents preload its managed imports. `valid-empty` contains
declarations but no logical axioms. The input file is preserved byte for byte.

`canonical-vowl-expectations.json` records independently derived JavaScript formal
and source verdicts with per-case rules and rationale. Its Java observations are
separate compatibility evidence and cannot override the normative expectations.
The source policy can qualify original constructor arity and unambiguous typed
use only; it cannot waive datatype, category, simplicity or imported failures.

The runner compiles only the project-owned Java probe in a temporary directory.
It executes existing OWLAPI 5.5.1 JARs at the pinned source revision, captures both
version-output streams, hashes every classpath JAR, records JVM class-load origins,
and rechecks the candidate, tools, inputs and reference artifacts afterward.
It does not rebuild the Java reference or establish the provenance of that build.

Run from the repository root in PowerShell (no receipt is written by default):

```powershell
node util/owlapi-reference/run-profile-contract.mjs --java-root 'C:/Users/maksy/GitHub/owlcs/owlapi-worktrees/import-closure-reference-d7e997a5' --java 'C:/Program Files/Eclipse Adoptium/jdk-25.0.4.101-hotspot/bin/java.exe' --javac 'C:/Program Files/Eclipse Adoptium/jdk-25.0.4.101-hotspot/bin/javac.exe'
```

`--java-only` observes Java without loading the JavaScript public API.
`--output NEW_JSON_PATH` writes one immutable comparison receipt exclusively after
all comparisons and end-state checks pass; existing files are never overwritten.
The receipt is bounded to verdicts, unique violation codes/classes and closure
sizes for these 20 cases. It does not prove exhaustive conformance, installed
package behavior, browser behavior, performance or release readiness.

Normative references and interpretations are pinned in the expectation manifest:
[OWL 2 Structural Specification](https://www.w3.org/TR/2012/REC-owl2-syntax-20121211/),
[XSD 1.1 Datatypes](https://www.w3.org/TR/2012/REC-xmlschema11-2-20120405/) and the
[project source-preservation contract](../../../../docs/compatibility/canonical-vowl-prerequisites.md).

The Java-only probe observed seven formal-verdict differences: both multiple
datatype-definition cases, byte overflow, the two ill-typed annotation cases,
inverse-top simplicity and the reverse-direction import simplicity case. These
are recorded individually with explanations; they are not silently called parity.
In particular, Java accepts imported functionality combined with root transitivity
but rejects the converse distribution. The expected JavaScript verdict rejects
both by applying the restrictions across the full closure.

Two additional cases intentionally distinguish formal from source validity:
the original duplicate-operand intersection and undeclared typed class use.
Source qualification is expected only where the package retains trusted evidence.
The reverse-pattern case's Java acceptance alone does not demonstrate complete
pattern validation. No checker internals were read to select these expectations.

The first public comparison matched all 20 independently selected JavaScript
formal/source verdicts and all 20 separately recorded Java observations. The JVM
loaded classes from 22 of the 63 hashed classpath JARs. This is a bounded contract
comparison with documented deviations, not a claim of identical Java/JavaScript
profile verdicts. Immutable receipts retain their own candidate and artifact pins;
later candidate changes require a new receipt and must preserve earlier ones.
