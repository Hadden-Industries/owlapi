import { RDF_NAMESPACE, XSD_NAMESPACE } from "../rdfjs/vocabulary.js";
import { normalizeJavaFloatingPointLiteral } from "./javaFloatingPointLexicalForm.js";
import { trimJavaStringWhitespace } from "./javaStringTrim.js";

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
  const value = BigInt(asciiDigits);
  const boundary = 2n ** BigInt(bits - 1);
  return value < -boundary || value >= boundary ? input : String(value);
}

/** Normalize the typed-literal overload only. The language-argument overload
 * has a different trim/lowercase contract and must not parse an '@' suffix.
 * These are factory semantics, not RDF datatype lexical validity checks.
 */
export function normalizeJavaTypedLiteral(lexicalForm, datatypeIRI) {
  if (
    datatypeIRI === RDF_NAMESPACE + "PlainLiteral" ||
    datatypeIRI === RDF_NAMESPACE + "langString"
  ) {
    const separator = lexicalForm.lastIndexOf("@");
    return separator < 0
      ? { lexicalForm, datatypeIRI: XSD_NAMESPACE + "string", language: "" }
      : {
          lexicalForm: lexicalForm.slice(0, separator),
          datatypeIRI: RDF_NAMESPACE + "langString",
          language: lexicalForm.slice(separator + 1),
        };
  }
  switch (datatypeIRI) {
    case XSD_NAMESPACE + "boolean": {
      const value = trimJavaStringWhitespace(lexicalForm);
      lexicalForm =
        value.toLowerCase() === "true" || value === "1" ? "true" : "false";
      break;
    }
    case XSD_NAMESPACE + "integer":
      lexicalForm = normalizeJavaIntegerLiteral(lexicalForm, 32);
      break;
    case XSD_NAMESPACE + "long":
      lexicalForm = normalizeJavaIntegerLiteral(lexicalForm, 64);
      break;
    case XSD_NAMESPACE + "float":
      lexicalForm = normalizeJavaFloatingPointLiteral(lexicalForm, 24);
      break;
    case XSD_NAMESPACE + "double":
      lexicalForm = normalizeJavaFloatingPointLiteral(lexicalForm, 53);
      break;
  }
  return { lexicalForm, datatypeIRI, language: "" };
}
