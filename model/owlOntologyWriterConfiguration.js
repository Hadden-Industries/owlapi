// Package-private native reader; the public namespace exports only the type.
export let readOntologyWriterConfiguration;

/** Immutable four-setting Java OWLAPI adaptation for RDF/XML presentation. */
export class OWLOntologyWriterConfiguration {
  #values = Object.freeze({
    indenting: true,
    indentSize: 4,
    banners: true,
    labelsAsBanner: false,
  });

  static {
    readOntologyWriterConfiguration = (configuration) => configuration.#values;
  }

  constructor() {
    if (arguments.length)
      throw new TypeError("Writer configuration takes no arguments");
    Object.freeze(this);
  }

  isIndenting() {
    return this.#values.indenting;
  }
  getIndentSize() {
    return this.#values.indentSize;
  }
  shouldUseBanners() {
    return this.#values.banners;
  }
  isLabelsAsBanner() {
    return this.#values.labelsAsBanner;
  }

  #with(name, value) {
    const copy = new OWLOntologyWriterConfiguration();
    copy.#values = Object.freeze({ ...this.#values, [name]: value });
    return copy;
  }

  #withBoolean(name, value) {
    if (typeof value !== "boolean")
      throw new TypeError(`${name} must be a boolean`);
    return this.#with(name, value);
  }

  withIndenting(value) {
    return this.#withBoolean("indenting", value);
  }
  withBannersEnabled(value) {
    return this.#withBoolean("banners", value);
  }
  withLabelsAsBanner(value) {
    return this.#withBoolean("labelsAsBanner", value);
  }
  withIndentSize(value) {
    if (typeof value !== "number")
      throw new TypeError("indentSize must be a number");
    if (!Number.isInteger(value) || value < 0 || value > 2147483647) {
      throw new RangeError(
        "indentSize must be an integer from 0 through 2147483647",
      );
    }
    return this.#with("indentSize", value + 0);
  }
}
