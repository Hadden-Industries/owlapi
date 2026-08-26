const stringList = (values, name) => {
  if (
    !Array.isArray(values) ||
    values.some((value) => typeof value !== "string" || value.length === 0)
  ) {
    throw new TypeError(`${name} must be an array of non-empty strings`);
  }
  return Object.freeze([...values]);
};

const snapshotParameterValue = (value, ancestors = new Set()) => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "object") {
    throw new TypeError(
      "format parameter values must be finite JSON-compatible data",
    );
  }
  if (ancestors.has(value)) {
    throw new TypeError("format parameter values must not contain cycles");
  }

  const prototype = Object.getPrototypeOf(value);
  if (
    !Array.isArray(value) &&
    prototype !== Object.prototype &&
    prototype !== null
  ) {
    throw new TypeError(
      "format parameter objects must be plain JSON-compatible objects",
    );
  }

  ancestors.add(value);
  const snapshot = Array.isArray(value)
    ? value.map((entry) => snapshotParameterValue(entry, ancestors))
    : Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [
          key,
          snapshotParameterValue(entry, ancestors),
        ]),
      );
  ancestors.delete(value);
  return Object.freeze(snapshot);
};

const snapshotParameters = (parameters) => {
  if (
    parameters === null ||
    typeof parameters !== "object" ||
    Array.isArray(parameters)
  ) {
    throw new TypeError("format parameters must be an object");
  }
  // A null-prototype record keeps JSON keys such as "__proto__" as ordinary
  // data and prevents format metadata from invoking Object.prototype setters.
  const snapshot = Object.create(null);
  for (const [key, value] of Object.entries(parameters)) {
    if (key.length === 0) {
      throw new TypeError("format parameter keys must be non-empty strings");
    }
    snapshot[key] = snapshotParameterValue(value);
  }
  return Object.freeze(snapshot);
};

export class OWLDocumentFormat {
  #parameters;

  constructor({
    extensions = [],
    isDataset = false,
    isRdf = false,
    key,
    mediaTypes = [],
    parameters = {},
    supportsPrefixes = false,
  }) {
    if (typeof key !== "string" || key.length === 0) {
      throw new TypeError("format key must be a non-empty string");
    }
    if (
      typeof isDataset !== "boolean" ||
      typeof isRdf !== "boolean" ||
      typeof supportsPrefixes !== "boolean"
    ) {
      throw new TypeError("format capability flags must be booleans");
    }
    this.key = key;
    this.mediaTypes = stringList(mediaTypes, "mediaTypes");
    this.extensions = stringList(extensions, "extensions");
    this.supportsPrefixes = supportsPrefixes;
    this.isRdf = isRdf;
    this.isDataset = isDataset;
    this.#parameters = snapshotParameters(parameters);
    Object.freeze(this);
  }

  getParameter(key, defaultValue) {
    if (typeof key !== "string" || key.length === 0) {
      throw new TypeError("format parameter keys must be non-empty strings");
    }
    return Object.hasOwn(this.#parameters, key)
      ? this.#parameters[key]
      : defaultValue;
  }

  withParameter(key, value) {
    if (typeof key !== "string" || key.length === 0) {
      throw new TypeError("format parameter keys must be non-empty strings");
    }
    // Java OWLAPI carries parser-specific settings on OWLDocumentFormat. The
    // copying form preserves that compatibility seam without exposing caller
    // mutation to an active asynchronous load.
    return new OWLDocumentFormat({
      extensions: this.extensions,
      isDataset: this.isDataset,
      isRdf: this.isRdf,
      key: this.key,
      mediaTypes: this.mediaTypes,
      parameters: { ...this.#parameters, [key]: value },
      supportsPrefixes: this.supportsPrefixes,
    });
  }
}
