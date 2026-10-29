import { RDF_NAMESPACE, XSD_NAMESPACE } from "../rdfjs/vocabulary.js";
import { normalizeJavaFloatingPointLiteral } from "./javaFloatingPointLexicalForm.js";
import { trimJavaStringWhitespace } from "./javaStringTrim.js";

// Reuse complete datatype names during overload dispatch rather than building
// concatenated namespace strings for every literal and every switch candidate.
const PLAIN_LITERAL = RDF_NAMESPACE + "PlainLiteral";
const LANG_STRING = RDF_NAMESPACE + "langString";
const XSD_STRING = XSD_NAMESPACE + "string";
const XSD_BOOLEAN = XSD_NAMESPACE + "boolean";
const XSD_INTEGER = XSD_NAMESPACE + "integer";
const XSD_LONG = XSD_NAMESPACE + "long";
const XSD_FLOAT = XSD_NAMESPACE + "float";
const XSD_DOUBLE = XSD_NAMESPACE + "double";

/** OWLAPI's special integer constructors preserve padded ASCII-zero inputs and
 * malformed/out-of-range strings. Java parseInt/parseLong admit BMP Nd digits.
 */
function normalizeJavaIntegerLiteral(input, bits) {
  if (trimJavaStringWhitespace(input).startsWith("0")) return input;
  // Match the non-ASCII code points before Java's BMP decimal-digit conversion.
  // eslint-disable-next-line no-control-regex
  const asciiDigits = input.replace(/[^\x00-\x7f]/gu, (character) => {
    const code = character.codePointAt(0);
    if (code > 0xffff || !/\p{Decimal_Number}/u.test(character))
      return character;
    let firstDigit = code;
    while (
      firstDigit > 0 &&
      /\p{Decimal_Number}/u.test(String.fromCodePoint(firstDigit - 1))
    )
      firstDigit--;
    return String((code - firstDigit) % 10);
  });
  if (!/^[+-]?\d+$/u.test(asciiDigits)) return input;
  // Every admitted 32-bit integer is exact as a Number. Longs need BigInt only
  // outside the safe Number range; parsing/zero-padding rules above still apply.
  const numeric = Number(asciiDigits);
  if (bits === 32)
    return numeric < -2147483648 || numeric > 2147483647
      ? input
      : String(numeric);
  if (Number.isSafeInteger(numeric)) return String(numeric);
  const value = BigInt(asciiDigits);
  const boundary = 2n ** BigInt(bits - 1);
  return value < -boundary || value >= boundary ? input : String(value);
}

/** Normalize the typed-literal overload only. The language-argument overload
 * has a different trim/lowercase contract and must not parse an '@' suffix.
 * These are factory semantics, not RDF datatype lexical validity checks.
 */
export function normalizeJavaTypedLiteral(lexicalForm, datatypeIRI) {
  if (datatypeIRI === PLAIN_LITERAL || datatypeIRI === LANG_STRING) {
    const separator = lexicalForm.lastIndexOf("@");
    return separator < 0
      ? { lexicalForm, datatypeIRI: XSD_STRING, language: "" }
      : {
          lexicalForm: lexicalForm.slice(0, separator),
          datatypeIRI: LANG_STRING,
          language: lexicalForm.slice(separator + 1),
        };
  }
  switch (datatypeIRI) {
    case XSD_BOOLEAN: {
      const value = trimJavaStringWhitespace(lexicalForm);
      lexicalForm =
        value.toLowerCase() === "true" || value === "1" ? "true" : "false";
      break;
    }
    case XSD_INTEGER:
      lexicalForm = normalizeJavaIntegerLiteral(lexicalForm, 32);
      break;
    case XSD_LONG:
      lexicalForm = normalizeJavaIntegerLiteral(lexicalForm, 64);
      break;
    case XSD_FLOAT:
      lexicalForm = normalizeJavaFloatingPointLiteral(lexicalForm, 24);
      break;
    case XSD_DOUBLE:
      lexicalForm = normalizeJavaFloatingPointLiteral(lexicalForm, 53);
      break;
  }
  return { lexicalForm, datatypeIRI, language: "" };
}
