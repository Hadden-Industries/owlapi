const MAX_SAFE_DECIMAL = String(Number.MAX_SAFE_INTEGER);

// Preserve the existing number representation where it is exact. Larger values
// remain canonical decimal strings so structural tuples are JSON serializable.
export const normalizeCardinality = (value) => {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value === 0 ? 0 : value;
  }
  if (typeof value === "string" && /^[0-9]+$/u.test(value)) {
    const decimal = value.replace(/^0+(?=[0-9])/u, "");
    return decimal.length < MAX_SAFE_DECIMAL.length ||
      (decimal.length === MAX_SAFE_DECIMAL.length &&
        decimal <= MAX_SAFE_DECIMAL)
      ? Number(decimal)
      : decimal;
  }
  throw new RangeError(
    "cardinality must be a non-negative safe integer or an unsigned decimal string",
  );
};
