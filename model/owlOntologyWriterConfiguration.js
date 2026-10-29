/* eslint-disable no-bitwise -- Only the five low flag bits use bitwise operators; signed indentation uses exact Number arithmetic. */
import { resolveOntologyBehaviorDefinition } from "../internal/behavior/ontologyBehaviorContext.js";
export let readOntologyWriterConfiguration;
const CLONE_TOKEN = Symbol("OWLOntologyWriterConfiguration.clone");
const DEFINITIONS = Object.freeze([
  resolveOntologyBehaviorDefinition("normative-v1"),
  resolveOntologyBehaviorDefinition("java-owlapi-5.5.1"),
]);
const INDENTING_FLAG = 1;
const BANNERS_FLAG = 2;
const LABELS_FLAG = 4;
const SAVE_IDS_FLAG = 8;
const PROFILE_FLAG = 16;
const PROFILE_SHIFT = 4;
const FLAGS_MASK = 31;
const STATE_STRIDE = 32;
const DEFAULT_INDENT_STATE = 4 * STATE_STRIDE;
// These fixed registry policies preserve all fields or reset indent and banners.
// Keep setters explicit to avoid allocating an intermediate record on each copy.
const nativeReads = new WeakMap();
const definitionForOptions = (options) => {
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

  return resolveOntologyBehaviorDefinition(options?.behaviorProfileId);
};
/** One exact Number stores signed-32-bit indent*32 plus four flags and one profile bit.
 * Common small indents stay small integers; even extreme admitted values are
 * below 2**37 and therefore exact. Bitwise operations touch only the low flags.
 */
export class OWLOntologyWriterConfiguration {
  #state;
  static {
    readOntologyWriterConfiguration = (configuration) => {
      const state = configuration.#state;
      let values = nativeReads.get(configuration);
      if (!values) {
        values = Object.freeze({
          indenting: !!(state & INDENTING_FLAG),
          indentSize: Math.floor(state / STATE_STRIDE),
          banners: !!(state & BANNERS_FLAG),
          labelsAsBanner: !!(state & LABELS_FLAG),
          saveIds: !!(state & SAVE_IDS_FLAG),
        });
        nativeReads.set(configuration, values);
      }
      return values;
    };
  }
  constructor(options, cloneState = undefined) {
    if (options === CLONE_TOKEN) {
      this.#state = cloneState;
      Object.freeze(this);
      return;
    }
    const definition = definitionForOptions(options);
    this.#state =
      DEFAULT_INDENT_STATE +
      INDENTING_FLAG +
      BANNERS_FLAG +
      (definition === DEFINITIONS[1] ? PROFILE_FLAG : 0);
    Object.freeze(this);
  }
  getBehaviorProfileId() {
    return DEFINITIONS[(this.#state & PROFILE_FLAG) >>> PROFILE_SHIFT]
      .behaviorProfileId;
  }
  isIndenting() {
    return !!(this.#state & INDENTING_FLAG);
  }
  getIndentSize() {
    return Math.floor(this.#state / STATE_STRIDE);
  }
  shouldUseBanners() {
    return !!(this.#state & BANNERS_FLAG);
  }
  isLabelsAsBanner() {
    return !!(this.#state & LABELS_FLAG);
  }
  shouldSaveIdsForAllAnonymousIndividuals() {
    return !!(this.#state & SAVE_IDS_FLAG);
  }
  withIndenting(value) {
    const state = this.#state;
    if (typeof value !== "boolean")
      throw new TypeError("indenting must be a boolean");
    const policy =
      DEFINITIONS[(state & PROFILE_FLAG) >>> PROFILE_SHIFT].configurationPolicy;
    if (
      policy.preservesNoOpWriterIdentity &&
      !!(state & INDENTING_FLAG) === value
    )
      return this;
    const resets = policy.writerCopyResetFields.length > 0;
    const flags = resets
      ? (state & FLAGS_MASK) | BANNERS_FLAG
      : state & FLAGS_MASK;
    const body = resets ? DEFAULT_INDENT_STATE : state - (state & FLAGS_MASK);
    return new OWLOntologyWriterConfiguration(
      CLONE_TOKEN,
      body + (value ? flags | INDENTING_FLAG : flags & ~INDENTING_FLAG),
    );
  }
  withBannersEnabled(value) {
    const state = this.#state;
    if (typeof value !== "boolean")
      throw new TypeError("banners must be a boolean");
    const policy =
      DEFINITIONS[(state & PROFILE_FLAG) >>> PROFILE_SHIFT].configurationPolicy;
    if (
      policy.preservesNoOpWriterIdentity &&
      !!(state & BANNERS_FLAG) === value
    )
      return this;
    const resets = policy.writerCopyResetFields.length > 0;
    const flags = resets
      ? (state & FLAGS_MASK) | BANNERS_FLAG
      : state & FLAGS_MASK;
    const body = resets ? DEFAULT_INDENT_STATE : state - (state & FLAGS_MASK);
    return new OWLOntologyWriterConfiguration(
      CLONE_TOKEN,
      body + (value ? flags | BANNERS_FLAG : flags & ~BANNERS_FLAG),
    );
  }
  withLabelsAsBanner(value) {
    const state = this.#state;
    if (typeof value !== "boolean")
      throw new TypeError("labelsAsBanner must be a boolean");
    const policy =
      DEFINITIONS[(state & PROFILE_FLAG) >>> PROFILE_SHIFT].configurationPolicy;
    if (policy.preservesNoOpWriterIdentity && !!(state & LABELS_FLAG) === value)
      return this;
    const resets = policy.writerCopyResetFields.length > 0;
    const flags = resets
      ? (state & FLAGS_MASK) | BANNERS_FLAG
      : state & FLAGS_MASK;
    const body = resets ? DEFAULT_INDENT_STATE : state - (state & FLAGS_MASK);
    return new OWLOntologyWriterConfiguration(
      CLONE_TOKEN,
      body + (value ? flags | LABELS_FLAG : flags & ~LABELS_FLAG),
    );
  }
  withSaveIdsForAllAnonymousIndividuals(value) {
    const state = this.#state;
    if (typeof value !== "boolean")
      throw new TypeError("saveIds must be a boolean");
    const policy =
      DEFINITIONS[(state & PROFILE_FLAG) >>> PROFILE_SHIFT].configurationPolicy;
    if (
      policy.preservesNoOpWriterIdentity &&
      !!(state & SAVE_IDS_FLAG) === value
    )
      return this;
    const resets = policy.writerCopyResetFields.length > 0;
    const flags = resets
      ? (state & FLAGS_MASK) | BANNERS_FLAG
      : state & FLAGS_MASK;
    const body = resets ? DEFAULT_INDENT_STATE : state - (state & FLAGS_MASK);
    return new OWLOntologyWriterConfiguration(
      CLONE_TOKEN,
      body + (value ? flags | SAVE_IDS_FLAG : flags & ~SAVE_IDS_FLAG),
    );
  }
  withIndentSize(value) {
    if (typeof value !== "number")
      throw new TypeError("indentSize must be a number");
    const state = this.#state;
    const policy =
      DEFINITIONS[(state & PROFILE_FLAG) >>> PROFILE_SHIFT].configurationPolicy;
    const minimum = policy.acceptsNegativeIndentSize ? -2147483648 : 0;
    if (!Number.isInteger(value) || value < minimum || value > 2147483647)
      throw new RangeError(
        `indentSize must be an integer from ${minimum} through 2147483647`,
      );
    if (
      policy.preservesNoOpWriterIdentity &&
      Math.floor(state / STATE_STRIDE) === value
    )
      return this;
    const flags =
      policy.writerCopyResetFields.length > 0
        ? (state & FLAGS_MASK) | BANNERS_FLAG
        : state & FLAGS_MASK;
    return new OWLOntologyWriterConfiguration(
      CLONE_TOKEN,
      (value + 0) * STATE_STRIDE + flags,
    );
  }
}
