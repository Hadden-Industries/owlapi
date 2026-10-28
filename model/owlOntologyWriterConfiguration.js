import { OntologyBehaviorContext } from "../internal/behavior/ontologyBehaviorContext.js";

// Package-private native reader; the public namespace exports only the type.
export let readOntologyWriterConfiguration;

const DEFAULTS = Object.freeze({
  indenting: true,
  indentSize: 4,
  banners: true,
  labelsAsBanner: false,
  saveIds: false,
});
const CLONE_TOKEN = Symbol("OWLOntologyWriterConfiguration.clone");
const JAVA_RESET_DEFAULTS = Object.freeze({
  indentSize: DEFAULTS.indentSize,
  banners: DEFAULTS.banners,
  labelsAsBanner: DEFAULTS.labelsAsBanner,
});

/** Immutable bounded Java OWLAPI adaptation for RDF/XML presentation. */
export class OWLOntologyWriterConfiguration {
  #behaviorContext;
  #values = DEFAULTS;

  static {
    readOntologyWriterConfiguration = (configuration) => configuration.#values;
  }

  constructor(options, cloneValues = undefined) {
    if (options === CLONE_TOKEN) {
      this.#behaviorContext = cloneValues.behaviorContext;
      this.#values = cloneValues.values;
      Object.freeze(this);
      return;
    }
    if (
      options !== undefined &&
      (!options ||
        typeof options !== "object" ||
        Array.isArray(options) ||
        Object.keys(options).length !== 1 ||
        !Object.hasOwn(options, "behaviorProfileId"))
    )
      throw new TypeError(
        "Writer configuration accepts only an explicit behaviorProfileId",
      );
    this.#behaviorContext = new OntologyBehaviorContext(
      options?.behaviorProfileId,
    );
    Object.freeze(this);
  }

  getBehaviorProfileId() {
    return this.#behaviorContext.behaviorProfileDefinition.behaviorProfileId;
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
  shouldSaveIdsForAllAnonymousIndividuals() {
    return this.#values.saveIds;
  }
  withSaveIdsForAllAnonymousIndividuals(value) {
    return this.#withBoolean("saveIds", value);
  }

  #with(name, value) {
    const policy =
      this.#behaviorContext.behaviorProfileDefinition.configurationPolicy;
    if (policy.preservesNoOpWriterIdentity && this.#values[name] === value)
      return this;
    const nextValues = Object.freeze(
      policy.writerCopyResetFields.length > 0
        ? {
            ...this.#values,
            ...JAVA_RESET_DEFAULTS,
            [name]: value,
          }
        : {
            ...this.#values,
            [name]: value,
          },
    );
    return new OWLOntologyWriterConfiguration(CLONE_TOKEN, {
      behaviorContext: this.#behaviorContext,
      values: nextValues,
    });
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
    const minimum = this.#behaviorContext.behaviorProfileDefinition
      .configurationPolicy.acceptsNegativeIndentSize
      ? -2147483648
      : 0;
    if (!Number.isInteger(value) || value < minimum || value > 2147483647) {
      throw new RangeError(
        `indentSize must be an integer from ${minimum} through 2147483647`,
      );
    }
    return this.#with("indentSize", value + 0);
  }
}
