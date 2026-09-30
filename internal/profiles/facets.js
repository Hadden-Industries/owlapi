import { ResourceLimitError } from "../../io/errors.js";
import {
  OWL_NAMESPACE as OWL,
  RDF_NAMESPACE as RDF,
  XSD_NAMESPACE as XSD,
} from "../rdfjs/vocabulary.js";
import { inspectLiteral, integerBounds, stringDatatypes } from "./datatypes.js";
import { isXsdPattern } from "./xsdPattern.js";

const bounds = new Set(
  ["minInclusive", "maxInclusive", "minExclusive", "maxExclusive"].map(
    (name) => XSD + name,
  ),
);
const lengths = new Set(
  ["length", "minLength", "maxLength"].map((name) => XSD + name),
);
const stringValue = (literal) => {
  const iri = literal.datatype.iri.value;
  if (iri.startsWith(XSD) && stringDatatypes.has(iri.slice(XSD.length)))
    return literal.lexicalForm;
  if (iri === RDF + "PlainLiteral" && literal.lexicalForm.endsWith("@"))
    return literal.lexicalForm.slice(0, -1);
  return undefined;
};
const rationalValue = (literal, maxDigits) => {
  const iri = literal.datatype.iri.value;
  const lexical = literal.lexicalForm;
  const numeric =
    iri === OWL + "rational" ||
    iri === XSD + "decimal" ||
    (iri.startsWith(XSD) && integerBounds.has(iri.slice(XSD.length)));
  if (!numeric) return undefined;
  if (lexical.length > maxDigits)
    throw new ResourceLimitError("Facet arithmetic digit limit exceeded", {
      resource: "profileNumericDigits",
      limit: maxDigits,
    });
  let numerator, denominator;
  if (iri === OWL + "rational") {
    const [a, b] = lexical.split("/");
    numerator = BigInt(a);
    denominator = BigInt(b);
  } else {
    const [whole, fraction = ""] = lexical.split(".");
    numerator = BigInt(whole + fraction);
    denominator = 10n ** BigInt(fraction.length);
  }
  let a = numerator < 0n ? -numerator : numerator,
    b = denominator;
  while (b) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return { numerator: numerator / a, denominator: denominator / a };
};
const inNumericSpace = (iri, value) => {
  if (!value) return false;
  if (iri === OWL + "real" || iri === OWL + "rational") return true;
  const local = iri.slice(XSD.length);
  if (local === "decimal") {
    let denominator = value.denominator;
    for (const factor of [2n, 5n])
      while (denominator % factor === 0n) denominator /= factor;
    return denominator === 1n;
  }
  const range = integerBounds.get(local);
  return Boolean(
    range &&
    value.denominator === 1n &&
    (range[0] === undefined || value.numerator >= BigInt(range[0])) &&
    (range[1] === undefined || value.numerator <= BigInt(range[1])),
  );
};
const report = (valid, rule) =>
  Object.freeze({ status: valid ? "valid" : "invalid", rule });

export const inspectFacet = async (
  datatype,
  restriction,
  configuration = {},
  budget,
) => {
  const literalResult = await inspectLiteral(
    restriction.value,
    configuration,
    budget,
  );
  if (literalResult.status !== "valid") return literalResult;
  const base = datatype.iri.value,
    facet = restriction.facet.value;
  const value = restriction.value,
    type = value.datatype.iri.value;
  const local = base.startsWith(XSD) ? base.slice(XSD.length) : "";
  const numeric =
    base === OWL + "real" ||
    base === OWL + "rational" ||
    local === "decimal" ||
    integerBounds.has(local);
  const textual =
    stringDatatypes.has(local) ||
    local === "anyURI" ||
    base === RDF + "PlainLiteral" ||
    base === RDF + "langString";
  const binary = local === "hexBinary" || local === "base64Binary";
  const temporal = local === "dateTime" || local === "dateTimeStamp";
  const floating = local === "float" || local === "double";
  if (bounds.has(facet) && (numeric || temporal || floating)) {
    let valid;
    if (numeric)
      valid = inNumericSpace(
        base,
        rationalValue(value, configuration.maxNumericDigits ?? 4096),
      );
    else if (floating) valid = type === base;
    else
      valid =
        (type === XSD + "dateTime" || type === XSD + "dateTimeStamp") &&
        (local !== "dateTimeStamp" ||
          /(?:Z|[+-][0-9]{2}:[0-9]{2})$/u.test(value.lexicalForm));
    return report(valid, "FACET_VALUE_OUTSIDE_BASE_SPACE");
  }
  if (lengths.has(facet) && (textual || binary)) {
    const rational = rationalValue(
      value,
      configuration.maxNumericDigits ?? 4096,
    );
    return report(
      Boolean(
        rational && rational.denominator === 1n && rational.numerator >= 0n,
      ),
      "FACET_REQUIRES_NONNEGATIVE_INTEGER",
    );
  }
  if (facet === XSD + "pattern" && textual) {
    const pattern = stringValue(value);
    return report(
      pattern !== undefined &&
        isXsdPattern(pattern, configuration.maxDepth ?? 256),
      "FACET_REQUIRES_XSD_PATTERN",
    );
  }
  if (
    facet === RDF + "langRange" &&
    (base === RDF + "PlainLiteral" || base === RDF + "langString")
  ) {
    const range = stringValue(value);
    return report(
      range !== undefined &&
        /^(?:\*|[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*)$/u.test(range),
      "FACET_REQUIRES_BASIC_LANGUAGE_RANGE",
    );
  }
  return report(false, "FACET_NOT_IN_DATATYPE_MAP");
};
