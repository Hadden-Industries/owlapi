import {
  parse as parseLanguageTag,
  stringify as stringifyLanguageTag,
} from "bcp-47";
import { XmlParseError } from "../../io/errors.js";
import { xmlParserAdapter } from "../parsing/xml/xmlParserAdapter.js";
import { isCanonicalXmlContent } from "./xmlLiteral.js";
import {
  OWL_NAMESPACE as OWL,
  RDF_NAMESPACE as RDF,
  RDFS_NAMESPACE as RDFS,
  XSD_NAMESPACE as XSD,
} from "../rdfjs/vocabulary.js";

export const integerBounds = new Map([
  ["integer", []],
  ["nonNegativeInteger", ["0"]],
  ["positiveInteger", ["1"]],
  ["nonPositiveInteger", [undefined, "0"]],
  ["negativeInteger", [undefined, "-1"]],
  ["long", ["-9223372036854775808", "9223372036854775807"]],
  ["int", ["-2147483648", "2147483647"]],
  ["short", ["-32768", "32767"]],
  ["byte", ["-128", "127"]],
  ["unsignedLong", ["0", "18446744073709551615"]],
  ["unsignedInt", ["0", "4294967295"]],
  ["unsignedShort", ["0", "65535"]],
  ["unsignedByte", ["0", "255"]],
]);
export const stringDatatypes = new Set([
  "string",
  "normalizedString",
  "token",
  "language",
  "Name",
  "NCName",
  "NMTOKEN",
]);
export const owlDatatypeMap = new Set([
  ...[
    ...integerBounds.keys(),
    ...stringDatatypes,
    "decimal",
    "double",
    "float",
    "boolean",
    "hexBinary",
    "base64Binary",
    "anyURI",
    "dateTime",
    "dateTimeStamp",
  ].map((name) => XSD + name),
  OWL + "real",
  OWL + "rational",
  RDF + "PlainLiteral",
  RDF + "XMLLiteral",
  // RDF 1.1 representation of the language-tagged branch of rdf:PlainLiteral.
  RDF + "langString",
]);
export const isBuiltinDatatype = (iri) =>
  owlDatatypeMap.has(iri) || iri === RDFS + "Literal";

const result = (valid, rule = "LITERAL_LEXICAL_SPACE") =>
  Object.freeze({ status: valid ? "valid" : "invalid", rule });
const unverified = (rule) => Object.freeze({ status: "unverified", rule });
const xmlCharacters = (value) => {
  if (!value.isWellFormed()) return false;
  for (const character of value) {
    const code = character.codePointAt(0);
    if (
      code !== 9 &&
      code !== 10 &&
      code !== 13 &&
      !(code >= 0x20 && code <= 0xd7ff) &&
      !(code >= 0xe000 && code <= 0xfffd) &&
      !(code >= 0x10000 && code <= 0x10ffff)
    )
      return false;
  }
  return true;
};
const xmlNameStart =
  ":A-Z_a-z\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u02ff\u0370-\u037d\u037f-\u1fff\u200c-\u200d\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd\u{10000}-\u{effff}";
const xmlNameChar = xmlNameStart + "\\-.0-9\u00b7\u0300-\u036f\u203f-\u2040";
// XML NameChar explicitly includes the combining-mark range U+0300–U+036F.
// eslint-disable-next-line no-misleading-character-class -- The XML grammar specifies code-point ranges, including combining marks.
const namePattern = new RegExp(`^[${xmlNameStart}][${xmlNameChar}]*$`, "u");
// eslint-disable-next-line no-misleading-character-class -- The same normative XML NameChar range applies to NMTOKEN.
const nmtokenPattern = new RegExp(`^[${xmlNameChar}]+$`, "u");

export const validLanguageTag = (tag) => {
  let invalid = false;
  const parsed = parseLanguageTag(tag, {
    forgiving: false,
    normalize: false,
    warning() {
      invalid = true;
    },
  });
  return (
    !invalid &&
    Boolean(
      parsed.language ||
      parsed.regular ||
      parsed.irregular ||
      parsed.privateuse?.length,
    ) &&
    stringifyLanguageTag(parsed).toLowerCase() === tag.toLowerCase()
  );
};

const integerParts = (lexical) => {
  if (!/^[+-]?[0-9]+$/u.test(lexical)) return undefined;
  const magnitude = lexical.replace(/^[+-]/u, "").replace(/^0+(?=[0-9])/u, "");
  return { negative: lexical[0] === "-" && magnitude !== "0", magnitude };
};
const compareInteger = (left, right) => {
  if (left.negative !== right.negative) return left.negative ? -1 : 1;
  const unsigned =
    left.magnitude.length === right.magnitude.length
      ? left.magnitude < right.magnitude
        ? -1
        : left.magnitude > right.magnitude
          ? 1
          : 0
      : Math.sign(left.magnitude.length - right.magnitude.length);
  return left.negative ? -unsigned : unsigned;
};
const validInteger = (lexical, [minimum, maximum]) => {
  const value = integerParts(lexical);
  return Boolean(
    value &&
    (minimum === undefined ||
      compareInteger(value, integerParts(minimum)) >= 0) &&
    (maximum === undefined ||
      compareInteger(value, integerParts(maximum)) <= 0),
  );
};

const validDateTime = (lexical, timezoneRequired) => {
  const match =
    /^(-?)([1-9][0-9]{3,}|0[0-9]{3})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-4]):([0-5][0-9]):([0-5][0-9])(\.[0-9]+)?(Z|[+-](?:0[0-9]|1[0-3]):[0-5][0-9]|[+-]14:00)?$/u.exec(
      lexical,
    );
  if (!match || (timezoneRequired && !match[9])) return false;
  const yearModulo400 = Number(match[2].slice(-4)) % 400;
  const leap =
    yearModulo400 % 4 === 0 &&
    (yearModulo400 % 100 !== 0 || yearModulo400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return (
    Number(match[4]) <= days[Number(match[3]) - 1] &&
    (match[5] !== "24" ||
      (match[6] === "00" &&
        match[7] === "00" &&
        !/[1-9]/u.test(match[8] ?? "")))
  );
};

/** Validate value-space membership without changing a parsed lexical form. */
export const inspectLiteral = async (literal, configuration = {}, budget) => {
  const { lexicalForm: lexical, language, datatype } = literal;
  if (
    typeof lexical !== "string" ||
    typeof language !== "string" ||
    !lexical.isWellFormed()
  )
    return result(false, "LITERAL_UNICODE");
  const iri = datatype.iri.value;
  if (iri === RDF + "langString")
    return result(
      language.length > 0 && validLanguageTag(language),
      "LITERAL_LANGUAGE",
    );
  if (language) return result(false, "LITERAL_LANGUAGE_DATATYPE");
  if (iri === RDF + "PlainLiteral") {
    const separator = lexical.lastIndexOf("@");
    return result(
      separator >= 0 &&
        (separator === lexical.length - 1 ||
          validLanguageTag(lexical.slice(separator + 1))),
      "PLAIN_LITERAL_LEXICAL_SPACE",
    );
  }
  if (iri === OWL + "real" || iri === RDFS + "Literal")
    return result(false, "DATATYPE_HAS_NO_LEXICAL_SPACE");
  if (iri === OWL + "rational") {
    const match = /^([+-]?[0-9]+)\/([0-9]+)$/u.exec(lexical);
    return result(Boolean(match && /[1-9]/u.test(match[2])));
  }
  if (iri === RDF + "XMLLiteral") {
    budget?.check(Math.ceil(lexical.length / 256));
    if (!xmlCharacters(lexical)) return result(false);
    try {
      const document = await xmlParserAdapter.parseXml(
        `<owlapi-fragment>${lexical}</owlapi-fragment>`,
        configuration,
      );
      return result(
        await isCanonicalXmlContent(document.documentElement, lexical, budget),
        "XML_LITERAL_NOT_CANONICAL",
      );
    } catch (error) {
      if (!(error instanceof XmlParseError)) throw error;
      if (error.message.startsWith("No XML parser implementation"))
        return unverified("XML_VALIDATOR_UNAVAILABLE");
      return result(false, "XML_LITERAL_NOT_WELL_FORMED");
    }
  }
  if (!owlDatatypeMap.has(iri))
    return unverified("DATATYPE_NOT_IN_SUPPORTED_MAP");
  if (!xmlCharacters(lexical)) return result(false, "LITERAL_XML_CHARACTER");
  const local = iri.slice(XSD.length);
  if (integerBounds.has(local))
    return result(validInteger(lexical, integerBounds.get(local)));
  switch (local) {
    case "decimal":
      return result(/^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/u.test(lexical));
    case "float":
    case "double":
      return result(
        /^(?:[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[Ee][+-]?[0-9]+)?|[+-]?INF|NaN)$/u.test(
          lexical,
        ),
      );
    case "boolean":
      return result(/^(?:true|false|1|0)$/u.test(lexical));
    case "string":
    case "anyURI":
      return result(true);
    case "normalizedString":
      return result(!/[\r\n\t]/u.test(lexical));
    case "token":
      return result(!/[\r\n\t]|^ | $| {2}/u.test(lexical));
    case "language":
      return result(/^[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*$/u.test(lexical));
    case "Name":
      return result(namePattern.test(lexical));
    case "NCName":
      return result(!lexical.includes(":") && namePattern.test(lexical));
    case "NMTOKEN":
      return result(nmtokenPattern.test(lexical));
    case "hexBinary":
      return result(/^(?:[0-9A-Fa-f]{2})*$/u.test(lexical));
    case "base64Binary":
      return result(
        /^(?:(?:[A-Za-z0-9+/] ?){4})*(?:(?:[A-Za-z0-9+/] ?){3}[A-Za-z0-9+/]|(?:[A-Za-z0-9+/] ?){2}[AEIMQUYcgkosw048] ?=|[A-Za-z0-9+/] ?[AQgw] ?= ?=)?$/u.test(
          lexical,
        ) && !lexical.endsWith(" "),
      );
    case "dateTime":
      return result(validDateTime(lexical, false));
    case "dateTimeStamp":
      return result(validDateTime(lexical, true));
    default:
      return unverified("DATATYPE_RULE_UNIMPLEMENTED");
  }
};
