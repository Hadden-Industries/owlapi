const targetText = new WeakMap();

/**
 * In-memory ontology document target with Java's toString() text reader.
 * Starts empty; only the package-private complete-text storage seam can mutate
 * content. Java's incremental Writer accessor is deliberately not exposed.
 */
export class StringDocumentTarget {
  constructor() {
    targetText.set(this, "");
    Object.freeze(this);
  }

  /** Return the complete stored text without normalizing its code units. */
  toString() {
    if (!targetText.has(this)) {
      throw new TypeError("The receiver must be a StringDocumentTarget");
    }
    return targetText.get(this);
  }
}

/**
 * Package-private commit of a fully rendered document; never a public writer.
 * Validation precedes the single replacement so any rejection preserves text.
 * @param {StringDocumentTarget} target Genuine target created by this module.
 * @param {string} completeText Complete document, retained without normalization.
 * @throws {TypeError} If the target is forged or the replacement is not a string.
 */
export const replaceStringDocumentTargetText = (target, completeText) => {
  if (!targetText.has(target)) {
    throw new TypeError("target must be a StringDocumentTarget");
  }
  if (typeof completeText !== "string") {
    throw new TypeError("completeText must be a string");
  }
  targetText.set(target, completeText);
};
