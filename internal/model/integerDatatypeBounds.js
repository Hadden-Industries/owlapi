/** XSD integer value spaces as exact decimal bounds; null denotes an unbounded side. */
export const INTEGER_DATATYPE_BOUNDS = Object.freeze(
  [
    ["integer", null, null],
    ["nonNegativeInteger", "0", null],
    ["positiveInteger", "1", null],
    ["nonPositiveInteger", null, "0"],
    ["negativeInteger", null, "-1"],
    ["long", "-9223372036854775808", "9223372036854775807"],
    ["int", "-2147483648", "2147483647"],
    ["short", "-32768", "32767"],
    ["byte", "-128", "127"],
    ["unsignedLong", "0", "18446744073709551615"],
    ["unsignedInt", "0", "4294967295"],
    ["unsignedShort", "0", "65535"],
    ["unsignedByte", "0", "255"],
  ].map(Object.freeze),
);
