/** Frame one JSON object/array without replacing the native JSON validator.
 * Hasmac's JsonDocument consumes one Jakarta JSON-P value and does not require
 * end of input. Keep framing incremental so an unused transport tail cannot
 * turn that native return into an unbounded wait.
 */
export class JavaJsonStructureReader {
  #chunks = [];
  #depth = 0;
  #started = false;
  #quoted = false;
  #escaped = false;

  /** Return the parsed structure at its closing delimiter, or undefined. */
  append(text) {
    for (let index = 0; index < text.length; index++) {
      const character = text[index];
      if (!this.#started) {
        if (" \t\r\n".includes(character)) continue;
        if (character !== "{" && character !== "[")
          throw new SyntaxError(
            "The Java JSON document must start with an object or array",
          );
        this.#started = true;
      }
      if (this.#quoted) {
        if (this.#escaped) this.#escaped = false;
        else if (character === "\\") this.#escaped = true;
        else if (character === '"') this.#quoted = false;
      } else if (character === '"') this.#quoted = true;
      else if (character === "{" || character === "[") this.#depth++;
      else if (character === "}" || character === "]") {
        this.#depth--;
        if (this.#depth === 0) {
          this.#chunks.push(text.substring(0, index + 1));
          return JSON.parse(this.#chunks.join(""));
        }
      }
    }
    this.#chunks.push(text);
    return undefined;
  }

  /** Native validation reports incomplete or malformed input at EOF. */
  finish() {
    return JSON.parse(this.#chunks.join(""));
  }
}

/** Java's first-value consumption for existing character document sources. */
export const parseJavaJsonStructure = (text) => {
  const reader = new JavaJsonStructureReader();
  return reader.append(text) ?? reader.finish();
};
