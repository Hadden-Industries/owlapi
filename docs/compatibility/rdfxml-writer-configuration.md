# RDF/XML writer configuration

`OWLOntologyWriterConfiguration` is an immutable value exported only from `owlapi/model`.
Managers own independent configuration values.
Every save captures both the ontology and the settings before its first asynchronous operation, so changing the manager affects subsequent saves without changing one already in progress.

```js
import { OWLManager } from "owlapi/apibinding";
import { OWLOntologyWriterConfiguration } from "owlapi/model";
import { StringDocumentTarget } from "owlapi/io";
import { OWLDocumentFormats } from "owlapi/formats";

const manager = OWLManager.createOWLOntologyManager();
manager.setOntologyWriterConfiguration(
  new OWLOntologyWriterConfiguration()
    .withIndentSize(2)
    .withBannersEnabled(false),
);
const target = new StringDocumentTarget();
// ontology must be managed by this manager.
await manager.saveOntology(ontology, OWLDocumentFormats.RDF_XML, target);
```

| Getter               | Builder                       | Default |
| -------------------- | ----------------------------- | ------- |
| `isIndenting()`      | `withIndenting(boolean)`      | `true`  |
| `getIndentSize()`    | `withIndentSize(number)`      | `4`     |
| `shouldUseBanners()` | `withBannersEnabled(boolean)` | `true`  |
| `isLabelsAsBanner()` | `withLabelsAsBanner(boolean)` | `false` |

All builders return fresh frozen values and retain every unrelated setting, including no-op calls.
Boolean arguments must be actual booleans.
Indentation must be a finite integer from zero through `2147483647`: other numeric values raise `RangeError` and other types raise `TypeError`.
Negative zero is normalized to ordinary zero.
The constructor takes no arguments.
The manager setter returns `undefined` and accepts genuine configurations, rejecting null, lookalikes and proxies.
The getter returns the current immutable value.

Indentation counts spaces per structural level.
Zero spaces and disabled indentation retain structural newlines; literal whitespace is never reformatted.
Banners are group and named-entity XML comments.
Disabling banners also disables label banners.
Label mode selects an `rdfs:label` by language, lexical value and datatype in code-unit order, with the empty language first, then falls back to the entity IRI.
Comment-only sanitization separates repeated hyphens and pads a terminal hyphen.
Original RDF labels are unchanged.

The canonical default renderer uses readable namespace boundaries and stable prefixes, typed OWL nodes with deterministic type priority, safe owned blank-node nesting and exclusive pure resource collections.
Additional types, shared nodes, cyclic lists, annotated or typed cells and literal list members retain explicit graph representation.
There is one renderer; passing explicit defaults yields the same bytes as omitted settings.

The four settings affect RDF/XML only.
Functional Syntax output is unchanged.
Arbitrary format parameters remain unsupported.
Namespace entities, authored prefix-map mutation, anonymous-individual remapping and named-graph writing remain outside this subset.

Rendering admits at most 32 MiB of UTF-8 output and 128 nested resource levels, aligned with the existing storer's reparse budget.
Owned chains and literal lists exceeding the abbreviation depth retain flat `rdf:nodeID` references; graph depth alone does not cause rejection.
Terms and DOM construction are checked before unbounded serialization, and indentation is charged before allocating padding.
Native QName candidate validation admits at most 32 MiB of total UTF-16 candidate characters per render, including namespace and local-name work, and repeated predicates reuse their validated names.
Construction accounting is conservative because independently serialized elements can repeat namespace declarations.
Excessive output or QName work raises a storage error caused by `ResourceLimitError`; the target retains its previous complete text.
A legal integer setting is not a promise that any ontology can be rendered within the budget.

## Compatibility decisions and observations

The owner accepted the implementation plan and its proposed adaptations on 2026-10-08, then selected npm 12.2.0 and the current upstream default-branch Java pin.
The actual Java checkout and upstream `version5` tip were both `b61ebe2da83daceebb3e7ba7afbd2582c9240c33` (`owlapi-parent-5.5.1-9-gb61ebe2da`).
The Java tree was `b8dad5241dae6ff3bd3b755b9a1c605623eeb2c2`.
The native Maven reactor was built at that exact revision and the public-call harness `util/owlapi-reference/RunWriterConfigurationContract.java` ran against its built module jars and resolved runtime dependencies.
Java is development-only.

| Decision                    | Observed Java behavior                                                                                                                                                    | Accepted JavaScript rule                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| DEC-004 preserving builders | Size 2 then banners false resets size to 4; banners false then size 2 resets banners to true. Size 2 then indenting true retains 2, while indenting false resets it to 4. | Preserve unrelated fields for all calls.                                                                          |
| DEC-005 numeric validation  | Java accepts -1, 0, 2 and `Integer.MAX_VALUE` in the configuration.                                                                                                       | Reject negative sizes and values outside the nonnegative Java-int range; enforce a separate finite render budget. |
| DEC-006 label choice        | For `Zulu@en`, `Alpha -- -@fr` and plain `Plain`, Java chooses the French label.                                                                                          | Use the documented deterministic language-first order; plain `Plain` is selected.                                 |
| Functional Syntax           | Defaults, disabled banners, label banners and disabled indentation produced identical Functional Syntax bytes.                                                            | Keep these RDF/XML settings inapplicable to Functional Syntax.                                                    |

The earlier development pin `d7e997a53b470e32700de89cc610d9daf01ea769` reproduced the same selected observations.
A locally cached Maven 5.5.1 runtime also agreed; that cached runtime is not presented as an independently authenticated published artifact.
Historical provenance and Java source-notice acceptance remain attached to their original observations.
Shared Java bundle reuse and publication are disabled because their approved catalogue describes the earlier pin; qualification uses fresh native inputs.

This is a supported partial JavaScript adaptation.
The generated Java inventory lists implemented and omitted members separately.
The first immutable package release is not selected by this change; source delivery does not assert npm publication or Universal Ontology adoption.
Publication preflight rejects public bindings with an unassigned first release; source-only qualification remains available.
The companion default-output plan's producer renderer prerequisite is implemented here; its consumer upgrade and deployment retain their own qualification.

## Resource observations

On Node 24.21.0, three renders per mode of the latest retained local full distribution in each UO family gave the following medians.
Graph identity was checked using native RDF/XML parsing and independent URDNA2015 canonicalization for defaults, two spaces without banners, and disabled indentation.
These are retained-graph producer observations, not current-input UO generation acceptance.
The compact baseline was OwlAPI commit `ffbb3f3910ce945e315ed624e46c961ef332eea4`.

| Family         | Triples | Compact bytes / median ms | Readable bytes / median ms |
| -------------- | ------- | ------------------------- | -------------------------- |
| Core           | 19647   | 1918822 / 122             | 2305579 / 385              |
| Extended       | 25996   | 2509825 / 184             | 3033505 / 507              |
| Reference data | 14926   | 1467207 / 80              | 1765527 / 324              |

Readability adds roughly 20% output size and measured renderer work.
Default heap deltas after rendering were 92–157 MiB, versus 66–72 MiB for the compact baseline; these deltas are not peak-memory measurements.
The finite byte, nesting and pre-allocation guards bound publication, while full save validation retains its existing independent reparse and OWL structural comparison.
Excessive indentation fixtures verify typed failure, long-chain and literal-enumeration fixtures verify bounded flat fallback, and public-save tests verify unchanged targets after failed rendering.

## October RDF/XML refinement amendment

It takes precedence over the historical four-setting and unsupported-prefix statements above; retain those statements as historical evidence.

The supported writer subset now has five settings.
Java's `shouldSaveIdsForAllAnonymousIndividuals()` and `withSaveIdsForAllAnonymousIndividuals(boolean)` use a false default and retain the same immutable-value and preserving-builder rules.
Unnecessary anonymous IDs are omitted by default; shared, cyclic, collection-reference and depth-limited nodes retain the IDs needed to preserve their graph.
Enabling this setting retains IDs for anonymous individuals and axiom nodes, without forcing IDs on every restriction.

`RDFXMLDocumentFormat`, exported from `owlapi/formats`, supports the bounded Java prefix subset recorded in the generated API inventory.
`PrefixDocumentFormat` and `PrefixManager` are structurally supported through this class, without standalone JavaScript exports.
Its prefix map is mutable through the supported Java setters; map and set getters return defensive copies.
The existing immutable `withParameter` adaptation preserves the concrete RDF/XML format and its prefixes. Loaded RDF/XML root declarations are preserved as format preferences without making the ontology's immutable loader metadata mutable.
A save captures these preferences before its first asynchronous operation.

Only the exact Java format parameter `force xsd:string on literals` is supported, with a boolean value.
Ordinary xsd:string literals omit the datatype attribute by default.
Other output parameters remain unsupported.
Root attributes wrap using the existing indentation setting; namespace declarations, sections, predicates, comments and adjacent annotated axioms use the refined deterministic renderer.
Label-banner mode falls back to the IRI's short name when there is no label; the existing accepted deterministic choice among multiple labels is unchanged.

The footer identifies the JavaScript producer truthfully and is independent of entity/group banners. Absolute resource IRIs, the explicit UTF-8 declaration, typed `owl:AllDifferent` and W3C `owl:members` remain deliberate representation choices. Disabling banners suppresses all entity/group banners, including Java 5.5.1's observed residual General axioms banner.

The existing `RunWriterConfigurationContract.java` now also accepts an input fixture and output directory, preserving its original one-argument characterization.
`run-writer-configuration-contract.mjs` reuses the pinned reference-environment resolver, classpath launcher, compilation controls and native structural comparator.
Both implementations read identical fixture bytes for defaults, disabled banners, two-space indentation, disabled indentation, label banners, retained anonymous IDs and forced string datatypes.
The comparison checks the remaining serialized layout byte for byte after only the listed bounded distinctions and anonymous-ID renaming; native Java independently verifies complete ontology structure.
Unknown formatting differences fail.
Fresh outputs and reports remain external evidence, rather than committed expectations.

With `OWLAPI_REFERENCE_CHECKOUT` set to the exact built pin, run `node util/owlapi-reference/run-writer-configuration-contract.mjs <new-external-output-directory>`.
The ordinary Jest suite runs the same comparison when the reference environment is configured and reports a skip otherwise; a skipped run is not Java qualification.
