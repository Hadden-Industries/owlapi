import { readFileSync } from "node:fs";
import { comparisonIdentity, sha256 } from "./comparison-evidence.mjs";
import {
  reconcileStructuralDifferences,
  reconcileUnparsedRdf,
} from "./reconcile-structural-differences.mjs";

const rulesBytes = readFileSync(
  new URL(
    "../../docs/compatibility/expected-differences.json",
    import.meta.url,
  ),
);
const { rules } = JSON.parse(rulesBytes);
const ruleDigest = sha256(rulesBytes);

/** Bind the existing Time recovery approvals to the pinned RDF/XML inputs. */
export function julyTimeDifferenceScope(document, referenceRevision) {
  const fixture = `universal-ontology@${document.revision}:${document.path}`;
  const parser = "RDF/XML";
  const capability = "mapping.rdf-to-owl";
  const matches = rules.filter(
    (rule) =>
      rule.fixture === fixture &&
      rule.referenceRevision === referenceRevision &&
      rule.parser === parser &&
      rule.capability === capability,
  );
  if (!matches.length)
    throw new Error("The pinned July Time approvals are missing");
  return {
    fixture,
    parser,
    capability,
    referenceRevision,
    rulesSha256: ruleDigest,
    ruleIds: matches.map(({ id }) => id).sort(),
  };
}

/** Accept only a complete accounting of the observed axioms and native RDF diagnostics. */
export async function reconcileJulyTimeLoad(definition, native) {
  const scope = definition.expectedDifferences;
  const unparsed = native.javaLoad?.ontology?.unparsedRdf;
  if (
    !scope ||
    scope.rulesSha256 !== ruleDigest ||
    native.structure?.status !== "mismatch" ||
    native.structure.detailStatus !== "completed" ||
    !Array.isArray(unparsed) ||
    !unparsed.every((line) => typeof line === "string")
  ) {
    return null;
  }
  const context = {
    ...scope,
    rules: rules.filter((rule) => scope.ruleIds.includes(rule.id)),
  };
  const structure = reconcileStructuralDifferences(
    native.structure.differences,
    context,
  );
  const { reconciliation: diagnostics } = await reconcileUnparsedRdf(
    unparsed.join("\n"),
    context,
  );
  const ruleIds = [
    ...new Set(
      [...structure.matches, ...diagnostics.matches].map(
        ({ ruleId }) => ruleId,
      ),
    ),
  ].sort();
  if (
    structure.status !== "PASS" ||
    diagnostics.status !== "PASS" ||
    comparisonIdentity(ruleIds) !== comparisonIdentity(scope.ruleIds)
  ) {
    return null;
  }
  return ruleIds;
}

/** A closure reuses the exact direct-member verdict and requires native propagation. */
export async function reconcileJulyTimeClosure(definition, js, native) {
  const scope = definition.expectedDifferences;
  const comparisons = native.documentComparisons;
  const observed = js.documentModels;
  if (
    !scope?.memberDocumentIRI ||
    native.closurePropagation?.status !== "match" ||
    !Array.isArray(comparisons) ||
    !Array.isArray(observed) ||
    observed.some(({ status }) => status !== "completed")
  ) {
    return null;
  }
  const documents = comparisons.map(({ documentIRI }) => documentIRI).sort();
  if (
    new Set(documents).size !== documents.length ||
    comparisonIdentity(documents) !==
      comparisonIdentity(
        observed.map(({ documentIRI }) => documentIRI).sort(),
      ) ||
    comparisons.some(
      ({ documentIRI, comparison, unparsedRdf }) =>
        documentIRI !== scope.memberDocumentIRI &&
        (comparison.status !== "match" || unparsedRdf?.length !== 0),
    )
  ) {
    return null;
  }
  const time = comparisons.find(
    ({ documentIRI }) => documentIRI === scope.memberDocumentIRI,
  );
  if (!time) return null;
  return reconcileJulyTimeLoad(definition, {
    structure: time.comparison,
    javaLoad: { ontology: { unparsedRdf: time.unparsedRdf } },
  });
}
