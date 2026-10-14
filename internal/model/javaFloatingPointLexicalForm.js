/** JDK 25 floating-point parsing and decimal spelling used by the released
 * OWLAPI factory. ECMAScript formatting uses different exponent thresholds and
 * binary32 parsing needs one rounding step, rather than binary64 then binary32.
 * Contract: https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Float.html
 * Native expected results are retained independently in the Java oracle.
 */

/* eslint-disable no-bitwise -- IEEE 754 fields and exact BigInt rounding require bit operations. */
import { trimJavaStringWhitespace } from "./javaStringTrim.js";

/** Decompose a finite positive binary64 value without decimal approximation. */
function binaryComponents(value) {
  const bytes = new DataView(new ArrayBuffer(8));
  bytes.setFloat64(0, value);
  const bits = bytes.getBigUint64(0);
  const encodedExponent = Number((bits >> 52n) & 2047n);
  const fraction = bits & ((1n << 52n) - 1n);
  return encodedExponent === 0
    ? { coefficient: fraction, exponent: -1074 }
    : { coefficient: (1n << 52n) + fraction, exponent: encodedExponent - 1075 };
}

/** Round a nonnegative rational to an integer, resolving exact ties to even. */
function roundEven(numerator, denominator) {
  const integral = numerator / denominator;
  const remainder = numerator % denominator;
  return (
    integral +
    (2n * remainder > denominator ||
    (2n * remainder === denominator && integral % 2n === 1n)
      ? 1n
      : 0n)
  );
}

/** Parse the JDK hexadecimal form directly to the requested binary precision. */
function parseHexadecimal(coefficientText, exponentText, precision) {
  const [integral, fractional = ""] = coefficientText.split(".");
  const coefficient = BigInt(
    "0x" + ((integral + fractional).replace(/^0+/u, "") || "0"),
  );
  if (coefficient === 0n) return 0;
  const exponent = Number(exponentText) - 4 * fractional.length;
  const magnitude = coefficient.toString(2).length - 1 + exponent;
  const minimumSubnormalExponent = precision === 24 ? -149 : -1074;
  const maximumExponent = precision === 24 ? 127 : 1023;
  if (magnitude > maximumExponent) return Infinity;
  if (magnitude < minimumSubnormalExponent - 1) return 0;
  const resultExponent = Math.max(
    minimumSubnormalExponent,
    magnitude - precision + 1,
  );
  const shift = resultExponent - exponent;
  const rounded =
    shift > 0
      ? roundEven(coefficient, 1n << BigInt(shift))
      : coefficient << BigInt(-shift);
  const result = Number(rounded) * 2 ** resultExponent;
  return precision === 24 ? Math.fround(result) : result;
}

function floatFromBits(bits) {
  const bytes = new DataView(new ArrayBuffer(4));
  bytes.setUint32(0, bits);
  return bytes.getFloat32(0);
}

/** Compare a positive decimal input with an exactly represented binary value.
 * Comparing decimal digits avoids constructing huge powers for long input.
 */
function compareDecimalWithBinary(coefficientText, exponentText, binaryValue) {
  const [integral, fractional = ""] = coefficientText.split(".");
  const digits = (integral + fractional).replace(/^0+/u, "") || "0";
  const exponent = Number(exponentText || "0") - fractional.length;
  const binary = binaryComponents(binaryValue);
  const exactDigits = (
    binary.exponent < 0
      ? binary.coefficient * 5n ** BigInt(-binary.exponent)
      : binary.coefficient << BigInt(binary.exponent)
  ).toString();
  const exactExponent = Math.min(binary.exponent, 0);
  const magnitudeDifference =
    digits.length + exponent - exactDigits.length - exactExponent;
  if (magnitudeDifference !== 0) return Math.sign(magnitudeDifference);
  const length = Math.max(digits.length, exactDigits.length);
  const left = digits.padEnd(length, "0");
  const right = exactDigits.padEnd(length, "0");
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Resolve decimal inputs that binary64 rounds exactly onto a binary32
 * midpoint. Only these inputs can differ from Math.fround(Number(input)).
 */
function parseFloatDecimal(numericText, coefficientText, exponentText) {
  const magnitude = Number(numericText);
  const rounded = Math.fround(magnitude);
  if (!Number.isFinite(magnitude) || magnitude === 0) return rounded;
  const bytes = new DataView(new ArrayBuffer(4));
  bytes.setFloat32(0, rounded);
  const bits = bytes.getUint32(0);
  for (const lowerBits of [bits - 1, bits]) {
    if (lowerBits < 0 || lowerBits >= 0x7f800000) continue;
    const lower = floatFromBits(lowerBits);
    const upperBits = lowerBits + 1;
    // The overflow boundary is halfway to 2^128, not halfway to infinity.
    const upper =
      upperBits === 0x7f800000 ? 2 ** 128 : floatFromBits(upperBits);
    const midpoint = (lower + upper) / 2;
    if (magnitude !== midpoint) continue;
    const comparison = compareDecimalWithBinary(
      coefficientText,
      exponentText,
      midpoint,
    );
    return floatFromBits(
      comparison < 0 || (comparison === 0 && lowerBits % 2 === 0)
        ? lowerBits
        : upperBits,
    );
  }
  return rounded;
}

/** Choose the closest shortest decimal, with JDK's one-or-two-digit rule.
 * Quantization uses exact binary components so decimal halfway cases use even
 * significands rather than Number.toPrecision()'s different tie rule.
 */
function shortestJavaDecimal(value, precision) {
  const binary = binaryComponents(value);
  const numerator =
    binary.exponent < 0
      ? binary.coefficient
      : binary.coefficient << BigInt(binary.exponent);
  const denominator = binary.exponent < 0 ? 1n << BigInt(-binary.exponent) : 1n;
  const magnitude = Number(value.toExponential().split("e")[1]);
  const maximumDigits = precision === 24 ? 9 : 17;
  for (let length = 2; length <= maximumDigits; length++) {
    const exponent = magnitude - length + 1;
    const coefficient =
      exponent < 0
        ? roundEven(numerator * 10n ** BigInt(-exponent), denominator)
        : roundEven(numerator, denominator * 10n ** BigInt(exponent));
    const decimal = Number(`${coefficient}e${exponent}`);
    if ((precision === 24 ? Math.fround(decimal) : decimal) !== value) continue;
    const fullDigits = coefficient.toString();
    const digits = fullDigits.replace(/0+$/u, "");
    return { digits, exponent: exponent + fullDigits.length - digits.length };
  }
  throw new Error(
    "No round-tripping decimal for a finite floating-point value",
  );
}

function formatJavaFloatingPoint(value, precision) {
  if (Number.isNaN(value)) return "NaN";
  if (!Number.isFinite(value)) return String(value);
  const sign = value < 0 || Object.is(value, -0) ? "-" : "";
  if (value === 0) return sign + "0.0";
  const { digits, exponent } = shortestJavaDecimal(Math.abs(value), precision);
  const magnitude = digits.length + exponent - 1;
  if (magnitude < -3 || magnitude >= 7)
    return `${sign}${digits[0]}.${digits.slice(1) || "0"}E${magnitude}`;
  if (exponent >= 0) return sign + digits + "0".repeat(exponent) + ".0";
  const point = digits.length + exponent;
  return (
    sign +
    (point > 0
      ? digits.slice(0, point) + "." + digits.slice(point)
      : "0." + "0".repeat(-point) + digits)
  );
}

/** Return the JDK Float/Double lexical spelling, preserving malformed input as
 * the Java OWLAPI factory does. precision is the IEEE significand size (24/53).
 */
export function normalizeJavaFloatingPointLiteral(input, precision) {
  const text = trimJavaStringWhitespace(input);
  const sign = text.startsWith("-") ? -1 : 1;
  const unsigned = text.replace(/^[+-]/u, "");
  if (unsigned === "NaN") return "NaN";
  if (unsigned === "Infinity") return sign < 0 ? "-Infinity" : "Infinity";
  const hexadecimal =
    /^0[xX]([\da-fA-F]+(?:\.[\da-fA-F]*)?|\.[\da-fA-F]+)[pP]([+-]?\d+)[fFdD]?$/u.exec(
      unsigned,
    );
  if (hexadecimal)
    return formatJavaFloatingPoint(
      sign * parseHexadecimal(hexadecimal[1], hexadecimal[2], precision),
      precision,
    );
  const decimal = /^(\d+(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d+))?[fFdD]?$/u.exec(
    unsigned,
  );
  if (!decimal) return input;
  const numericText = decimal[1] + "e" + (decimal[2] || "0");
  const value =
    precision === 24
      ? parseFloatDecimal(numericText, decimal[1], decimal[2])
      : Number(numericText);
  return formatJavaFloatingPoint(sign * value, precision);
}
