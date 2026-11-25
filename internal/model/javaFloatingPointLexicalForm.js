/** JDK 25 floating-point parsing and decimal spelling used by the released
 * OWLAPI factory. ECMAScript formatting uses different exponent thresholds and
 * binary32 parsing needs one rounding step, rather than binary64 then binary32.
 * Contract: https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Float.html
 * Native expected results are retained independently in the Java oracle.
 */

/* eslint-disable no-bitwise -- IEEE 754 fields and exact BigInt rounding require bit operations. */
import { trimJavaStringWhitespace } from "./javaStringTrim.js";

// Numeric conversion is synchronous and calls no user code. These private
// scratch views retain no input and replace per-number backing-store allocation.
const binary64Bytes = new DataView(new ArrayBuffer(8));
const binary32Bytes = new DataView(new ArrayBuffer(4));
const LOG10_TWO = Math.log10(2);

/** Decompose a finite positive value at its actual binary precision. */
function binaryComponents(value, precision = 53) {
  if (precision === 24) {
    binary32Bytes.setFloat32(0, value);
    const bits = binary32Bytes.getUint32(0);
    const encodedExponent = (bits >>> 23) & 255;
    const fraction = bits & 0x7fffff;
    return encodedExponent === 0
      ? { coefficient: fraction, exponent: -149 }
      : {
          coefficient: 0x800000 + fraction,
          exponent: encodedExponent - 150,
        };
  }
  const bytes = binary64Bytes;
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
  const bytes = binary32Bytes;
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
  // A value already represented exactly in binary32 cannot be a midpoint
  // between two distinct binary32 values. Keep exact correction for all others.
  if (!Number.isFinite(magnitude) || magnitude === rounded) return rounded;
  const bytes = binary32Bytes;
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

/** Select adjacent decimal coefficients inside an exact binary rounding
 * interval. If both fit, choose nearest, with an even decimal significand on
 * a tie. Boundary inclusion instead follows the binary significand's parity.
 */
function intervalCoefficient(
  lower,
  center,
  upper,
  denominator,
  inclusive,
  below = center / denominator,
) {
  const above = below + 1n;
  const scaledBelow = below * denominator;
  const scaledAbove = scaledBelow + denominator;
  const belowFits = inclusive
    ? lower <= scaledBelow && scaledBelow <= upper
    : lower < scaledBelow && scaledBelow < upper;
  const aboveFits = inclusive
    ? lower <= scaledAbove && scaledAbove <= upper
    : lower < scaledAbove && scaledAbove < upper;
  if (belowFits && aboveFits) {
    const remainderTwice = 2n * (center - scaledBelow);
    return remainderTwice < denominator ||
      (remainderTwice === denominator && below % 2n === 0n)
      ? below
      : above;
  }
  return belowFits ? below : aboveFits ? above : undefined;
}

// All products, differences and the rounding remainder in this path are exact
// integers. Check the quotient against those exact products before using it.
function safeIntervalCoefficient(
  lower,
  center,
  upper,
  denominator,
  inclusive,
  below = Math.floor(center / denominator),
) {
  let scaledBelow = below * denominator;
  if (scaledBelow > center) {
    below -= 1;
    scaledBelow -= denominator;
  } else if (scaledBelow + denominator <= center) {
    below += 1;
    scaledBelow += denominator;
  }
  const scaledAbove = scaledBelow + denominator;
  const belowFits = inclusive
    ? lower <= scaledBelow && scaledBelow <= upper
    : lower < scaledBelow && scaledBelow < upper;
  const aboveFits = inclusive
    ? lower <= scaledAbove && scaledAbove <= upper
    : lower < scaledAbove && scaledAbove < upper;
  if (belowFits && aboveFits) {
    const remainderTwice = 2 * (center - scaledBelow);
    return remainderTwice < denominator ||
      (remainderTwice === denominator && below % 2 === 0)
      ? below
      : below + 1;
  }
  return belowFits ? below : aboveFits ? below + 1 : undefined;
}

const safeFits = (numerator, denominator, upper) =>
  Number.isSafeInteger(numerator) &&
  Number.isSafeInteger(denominator) &&
  Number.isSafeInteger(upper * numerator + 20 * denominator);

const isAsciiDigit = (code) => code >= 48 && code <= 57;

function formatDecimalDigits(sign, digits, exponent) {
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

function matchesDecimalInput(input, sign, result, exponent) {
  let digitsCount = 1;
  for (let threshold = 10; threshold <= result; threshold *= 10)
    digitsCount += 1;
  const magnitude = digitsCount + exponent - 1;
  if (magnitude < -3 || magnitude >= 7) return false;
  const neg = sign === "-" ? 1 : 0;
  if (neg && input.charCodeAt(0) !== 45) return false;
  if (exponent >= 0) {
    const expectedLen = neg + digitsCount + exponent + 2;
    if (input.length !== expectedLen) return false;
    if (
      input.charCodeAt(expectedLen - 2) !== 46 ||
      input.charCodeAt(expectedLen - 1) !== 48
    )
      return false;
    for (let k = 0; k < exponent; k += 1) {
      if (input.charCodeAt(neg + digitsCount + k) !== 48) return false;
    }
    let n = result;
    for (let i = neg + digitsCount - 1; i >= neg; i -= 1) {
      const digit = n % 10;
      if (input.charCodeAt(i) !== 48 + digit) return false;
      n = (n - digit) / 10;
    }
    return true;
  }
  const point = digitsCount + exponent;
  if (point > 0) {
    const expectedLen = neg + digitsCount + 1;
    if (input.length !== expectedLen) return false;
    const dotIdx = neg + point;
    if (input.charCodeAt(dotIdx) !== 46) return false;
    let n = result;
    for (let i = expectedLen - 1; i >= neg; i -= 1) {
      if (i === dotIdx) continue;
      const digit = n % 10;
      if (input.charCodeAt(i) !== 48 + digit) return false;
      n = (n - digit) / 10;
    }
    return true;
  }
  const zeros = -point;
  const expectedLen = neg + 2 + zeros + digitsCount;
  if (input.length !== expectedLen) return false;
  if (input.charCodeAt(neg) !== 48 || input.charCodeAt(neg + 1) !== 46)
    return false;
  for (let k = 0; k < zeros; k += 1) {
    if (input.charCodeAt(neg + 2 + k) !== 48) return false;
  }
  let n = result;
  const digitsStart = neg + 2 + zeros;
  for (let i = expectedLen - 1; i >= digitsStart; i -= 1) {
    const digit = n % 10;
    if (input.charCodeAt(i) !== 48 + digit) return false;
    n = (n - digit) / 10;
  }
  return true;
}

/** Use native integer arithmetic only when the complete interval, next decimal
 * candidate and tie comparison fit exactly. Failed admission does no rounding;
 * the general BigInt interval below remains authoritative for wider values.
 */
function safeFloatDecimal(value, sign, originalInput) {
  binary32Bytes.setFloat32(0, value);
  const bits = binary32Bytes.getUint32(0);
  const encodedExponent = (bits >>> 23) & 255;
  const fraction = bits & 0x7fffff;
  const coefficient = encodedExponent === 0 ? fraction : 0x800000 + fraction;
  const binExp = encodedExponent === 0 ? -149 : encodedExponent - 150;
  const asymmetric = binExp > -149 && coefficient === 0x800000;
  const center = 4 * coefficient;
  const lower = center - (asymmetric ? 1 : 2);
  const upper = center + 2;
  const binaryExponent = binExp - 2;
  let numerator = binaryExponent < 0 ? 1 : 2 ** binaryExponent;
  let denominator = binaryExponent < 0 ? 2 ** -binaryExponent : 1;
  let exponent = Math.floor(
    binExp * LOG10_TWO + (asymmetric ? Math.log10(0.75) : 0),
  );
  if (exponent < 0) numerator *= 10 ** -exponent;
  else denominator *= 10 ** exponent;
  if (!safeFits(numerator, denominator, upper)) return undefined;
  while ((upper - lower) * numerator < denominator) {
    exponent -= 1;
    numerator *= 10;
    if (!safeFits(numerator, denominator, upper)) return undefined;
  }
  while ((upper - lower) * numerator >= 10 * denominator) {
    exponent += 1;
    denominator *= 10;
    if (!safeFits(numerator, denominator, upper)) return undefined;
  }
  let scaledCenter = center * numerator;
  let below = Math.floor(scaledCenter / denominator);
  if (below * denominator > scaledCenter) below -= 1;
  else if ((below + 1) * denominator <= scaledCenter) below += 1;
  let belowDigits = 1;
  for (let threshold = 10; threshold <= below; threshold *= 10)
    belowDigits += 1;
  const maximumExponent = exponent + belowDigits - 2;
  while (exponent > maximumExponent) {
    exponent -= 1;
    numerator *= 10;
    if (!safeFits(numerator, denominator, upper)) return undefined;
    scaledCenter = center * numerator;
    below = Math.floor(scaledCenter / denominator);
  }
  const inclusive = coefficient % 2 === 0;
  const scaledLower = lower * numerator;
  const scaledUpper = upper * numerator;
  let result =
    exponent < maximumExponent
      ? safeIntervalCoefficient(
          scaledLower,
          scaledCenter,
          scaledUpper,
          10 * denominator,
          inclusive,
          Math.floor(below / 10),
        )
      : undefined;
  if (result !== undefined) exponent += 1;
  else
    result = safeIntervalCoefficient(
      scaledLower,
      scaledCenter,
      scaledUpper,
      denominator,
      inclusive,
      below,
    );
  if (result === undefined) return undefined;
  while (result >= 10 && result % 10 === 0) {
    result /= 10;
    exponent += 1;
  }
  if (
    originalInput !== undefined &&
    matchesDecimalInput(originalInput, sign, result, exponent)
  )
    return originalInput;
  return formatDecimalDigits(sign, String(result), exponent);
}

/** Exact interval selection, following the mathematical scale argument in
 * Giulietti's Schubfach paper, sections 5 and 8 (https://fmt.dev/papers/Schubfach4.pdf).
 * A decimal quantum no wider than the interval always admits a candidate; the
 * next coarser quantum admits at most one. This replaces digit-by-digit
 * quantization and reparsing, without approximation or precomputed tables.
 * Java also considers two-digit decimals when the shortest has one digit.
 */
function shortestJavaDecimal(value, precision) {
  const binary = binaryComponents(value, precision);
  // Binary32 decomposition is already exact as a Number. Allocate a BigInt
  // only when the safe-integer interval path cannot admit the complete work.
  const binaryCoefficient = BigInt(binary.coefficient);
  const minimumExponent = precision === 24 ? -149 : -1074;
  const asymmetric =
    binary.exponent > minimumExponent &&
    binaryCoefficient === 1n << BigInt(precision - 1);
  const center = 4n * binaryCoefficient;
  const lower = center - (asymmetric ? 1n : 2n);
  const upper = center + 2n;
  const binaryExponent = binary.exponent - 2;
  let numerator = binaryExponent < 0 ? 1n : 1n << BigInt(binaryExponent);
  let denominator = binaryExponent < 0 ? 1n << BigInt(-binaryExponent) : 1n;
  let exponent = Math.floor(
    binary.exponent * LOG10_TWO + (asymmetric ? Math.log10(0.75) : 0),
  );
  if (exponent < 0) numerator *= 10n ** BigInt(-exponent);
  else denominator *= 10n ** BigInt(exponent);
  // The logarithm only proposes a scale. Exact width comparisons own it.
  while ((upper - lower) * numerator < denominator) {
    exponent -= 1;
    numerator *= 10n;
  }
  while ((upper - lower) * numerator >= 10n * denominator) {
    exponent += 1;
    denominator *= 10n;
  }
  let scaledCenter = center * numerator;
  let below = scaledCenter / denominator;
  // This quantum is no wider than the rounding interval, which is no wider
  // than the positive value. Thus below >= 1; its decimal digit count gives
  // the exact magnitude without a rounded binary64-to-decimal estimate.
  const maximumExponent = exponent + below.toString().length - 2;
  while (exponent > maximumExponent) {
    exponent -= 1;
    numerator *= 10n;
    scaledCenter *= 10n;
    below = scaledCenter / denominator;
  }
  const inclusive = binaryCoefficient % 2n === 0n;
  const scaledLower = lower * numerator;
  const scaledUpper = upper * numerator;
  let coefficient =
    exponent < maximumExponent
      ? intervalCoefficient(
          scaledLower,
          scaledCenter,
          scaledUpper,
          10n * denominator,
          inclusive,
          below / 10n,
        )
      : undefined;
  if (coefficient !== undefined) exponent += 1;
  else
    coefficient = intervalCoefficient(
      scaledLower,
      scaledCenter,
      scaledUpper,
      denominator,
      inclusive,
      below,
    );
  if (coefficient === undefined)
    throw new Error("No decimal inside a finite binary rounding interval");
  const fullDigits = coefficient.toString();
  const digits = fullDigits.replace(/0+$/u, "");
  return { digits, exponent: exponent + fullDigits.length - digits.length };
}

function formatJavaFloatingPoint(value, precision, originalInput) {
  if (Number.isNaN(value)) return "NaN";
  if (!Number.isFinite(value)) return String(value);
  const sign = value < 0 || Object.is(value, -0) ? "-" : "";
  if (value === 0) return sign + "0.0";
  const absValue = value < 0 ? -value : value;
  if (precision === 24) {
    const fast = safeFloatDecimal(absValue, sign, originalInput);
    if (fast !== undefined) return fast;
  }
  const { digits, exponent } = shortestJavaDecimal(absValue, precision);
  return formatDecimalDigits(sign, digits, exponent);
}

/** Return the JDK Float/Double lexical spelling, preserving malformed input as
 * the Java OWLAPI factory does. precision is the IEEE significand size (24/53).
 */
export function normalizeJavaFloatingPointLiteral(input, precision) {
  const text = trimJavaStringWhitespace(input);
  if (text.length === 0) return input;
  const firstCode = text.charCodeAt(0);
  const sign = firstCode === 45 ? -1 : 1;
  const unsigned = firstCode === 43 || firstCode === 45 ? text.slice(1) : text;
  if (unsigned.length === 0) return input;
  if (unsigned === "NaN") return "NaN";
  if (unsigned === "Infinity") return sign < 0 ? "-Infinity" : "Infinity";
  const u0 = unsigned.charCodeAt(0);
  const u1 = unsigned.charCodeAt(1);
  if (u0 === 48 && (u1 === 120 || u1 === 88)) {
    const hexadecimal =
      /^0[xX]([\da-fA-F]+(?:\.[\da-fA-F]*)?|\.[\da-fA-F]+)[pP]([+-]?\d+)[fFdD]?$/u.exec(
        unsigned,
      );
    if (hexadecimal)
      return formatJavaFloatingPoint(
        sign * parseHexadecimal(hexadecimal[1], hexadecimal[2], precision),
        precision,
      );
  }
  let end = unsigned.length;
  const lastCode = unsigned.charCodeAt(end - 1);
  const hasSuffix =
    lastCode === 102 || lastCode === 70 || lastCode === 100 || lastCode === 68;
  if (hasSuffix) end -= 1;
  let i = 0;
  let intDigits = 0;
  while (i < end && isAsciiDigit(unsigned.charCodeAt(i))) {
    i += 1;
    intDigits += 1;
  }
  let fracDigits = 0;
  if (i < end && unsigned.charCodeAt(i) === 46) {
    i += 1;
    while (i < end && isAsciiDigit(unsigned.charCodeAt(i))) {
      i += 1;
      fracDigits += 1;
    }
  }
  if (intDigits === 0 && fracDigits === 0) return input;
  const coeffEnd = i;
  let expStart = -1;
  if (i < end) {
    const ec = unsigned.charCodeAt(i);
    if (ec !== 101 && ec !== 69) return input;
    i += 1;
    expStart = i;
    if (i < end) {
      const sc = unsigned.charCodeAt(i);
      if (sc === 43 || sc === 45) i += 1;
    }
    let expDigits = 0;
    while (i < end && isAsciiDigit(unsigned.charCodeAt(i))) {
      i += 1;
      expDigits += 1;
    }
    if (expDigits === 0 || i !== end) return input;
  }
  const numericText = hasSuffix ? unsigned.slice(0, end) : unsigned;
  let value = Number(numericText);
  if (precision === 24) {
    const rounded = Math.fround(value);
    if (Number.isFinite(value) && value !== rounded) {
      value = parseFloatDecimal(
        numericText,
        unsigned.slice(0, coeffEnd),
        expStart >= 0 ? unsigned.slice(expStart, end) : undefined,
      );
    } else {
      value = rounded;
    }
  }
  return formatJavaFloatingPoint(sign * value, precision, input);
}
