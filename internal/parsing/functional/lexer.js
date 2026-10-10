import { TextCursor } from "../textCursor.js";
import {
  inRange,
  prefixNameIsValid,
  localNameIsValid,
  nodeIdIsValid,
  utf8CodePointBytes,
} from "../lexicalNames.js";
import { OWLSyntaxError, ResourceLimitError } from "../../../io/errors.js";

const WHITESPACE = new Set([" ", "\t", "\n", "\r"]);
const DELIMITERS = new Set(["=", "(", ")", "<", ">", "@", "^"]);

const monotonicNow = () => globalThis.performance?.now?.() ?? Date.now();

export class FunctionalSyntaxLexer {
  #cursor = new TextCursor(() => this.checkExecutionBudget());
  #configuration;
  #deadline;
  #lookahead;
  #startedAt;
  #text;
  #tokenCount = 0;

  constructor(text, configuration) {
    if (typeof text !== "string") {
      throw new TypeError("Functional Syntax input must be a string");
    }
    this.#text = text;
    this.#configuration = configuration;
    this.#startedAt = monotonicNow();
    this.#deadline = this.#startedAt + configuration.timeoutMs;
  }

  peek() {
    this.#lookahead ??= this.#readToken();
    return this.#lookahead;
  }

  consume() {
    const token = this.peek();
    this.#lookahead = undefined;
    return token;
  }

  checkExecutionBudget() {
    this.#cursor.scannedSinceBudgetCheck = 0;
    this.#throwIfAborted();
    const current = monotonicNow();
    if (current < this.#deadline) {
      return;
    }
    throw new ResourceLimitError(
      "The Functional Syntax parse timeout was exceeded",
      {
        limit: this.#configuration.timeoutMs,
        observed: Math.max(0, Math.ceil(current - this.#startedAt)),
        resource: "timeoutMs",
      },
    );
  }

  #details(location, extra = {}) {
    return this.#configuration.sourceLocations
      ? { ...extra, ...location }
      : extra;
  }

  #syntax(message, location, extra) {
    throw new OWLSyntaxError(message, this.#details(location, extra));
  }

  #resource(resource, limit, observed, location) {
    throw new ResourceLimitError(
      `The Functional Syntax ${resource} limit was exceeded`,
      this.#details(location, { limit, observed, resource }),
    );
  }

  #throwIfAborted() {
    const { signal } = this.#configuration;
    if (!signal?.aborted) {
      return;
    }
    if (typeof signal.throwIfAborted === "function") {
      signal.throwIfAborted();
    }
    const error = new Error("The ontology load was aborted");
    error.name = "AbortError";
    throw error;
  }

  #advance() {
    return this.#cursor.advance(this.#text);
  }

  #skipTrivia() {
    while (this.#cursor.offset < this.#text.length) {
      if (WHITESPACE.has(this.#text[this.#cursor.offset])) {
        this.#advance();
        continue;
      }
      if (this.#text[this.#cursor.offset] !== "#") {
        return;
      }
      while (
        this.#cursor.offset < this.#text.length &&
        this.#text[this.#cursor.offset] !== "\n" &&
        this.#text[this.#cursor.offset] !== "\r"
      ) {
        this.#advance();
      }
    }
  }

  #emit(type, value, location, byteLength) {
    this.checkExecutionBudget();
    if (type !== "EOF") {
      this.#tokenCount += 1;
      if (this.#tokenCount > this.#configuration.maxTokenCount) {
        this.#resource(
          "maxTokenCount",
          this.#configuration.maxTokenCount,
          this.#tokenCount,
          location,
        );
      }
    }
    if (byteLength > this.#configuration.maxTokenLength) {
      this.#resource(
        "maxTokenLength",
        this.#configuration.maxTokenLength,
        byteLength,
        location,
      );
    }
    return Object.freeze({ ...location, type, value });
  }

  #readToken() {
    this.#skipTrivia();
    const location = this.#cursor.location();
    if (this.#cursor.offset === this.#text.length) {
      return this.#emit("EOF", "", location, 0);
    }

    const character = this.#text[this.#cursor.offset];
    if (["(", ")", "="].includes(character)) {
      this.#advance();
      return this.#emit(character, character, location, 1);
    }
    if (character === "^") {
      this.#advance();
      if (this.#text[this.#cursor.offset] !== "^") {
        this.#syntax("A datatype marker must contain two carets", location);
      }
      this.#advance();
      return this.#emit("^^", "^^", location, 2);
    }
    if (character === "<") {
      return this.#readFullIri(location);
    }
    if (character === '"') {
      return this.#readString(location);
    }
    if (character === "@") {
      return this.#readLanguage(location);
    }
    return this.#readBare(location);
  }

  #readFullIri(location) {
    this.#advance();
    let byteLength = 2;
    let value = "";
    while (
      this.#cursor.offset < this.#text.length &&
      this.#text[this.#cursor.offset] !== ">"
    ) {
      const character = this.#text[this.#cursor.offset];
      const codePoint = this.#text.codePointAt(this.#cursor.offset);
      if (
        WHITESPACE.has(character) ||
        character === "<" ||
        character === '"' ||
        character === "{" ||
        character === "}" ||
        character === "|" ||
        character === "^" ||
        character === "`" ||
        character === "\\" ||
        codePoint < 0x20 ||
        inRange(codePoint, 0xd800, 0xdfff)
      ) {
        this.#syntax("The full IRI contains a forbidden character", location);
      }
      const item = String.fromCodePoint(codePoint);
      value += item;
      byteLength += utf8CodePointBytes(codePoint);
      this.#advance();
      if (item.length === 2) {
        this.#advance();
      }
      if (byteLength > this.#configuration.maxTokenLength) {
        this.#resource(
          "maxTokenLength",
          this.#configuration.maxTokenLength,
          byteLength,
          location,
        );
      }
    }
    if (this.#text[this.#cursor.offset] !== ">") {
      this.#syntax("The full IRI is not terminated", location);
    }
    this.#advance();
    return this.#emit("FULL_IRI", value, location, byteLength);
  }

  #readString(location) {
    this.#advance();
    let byteLength = 2;
    let value = "";
    while (this.#cursor.offset < this.#text.length) {
      const character = this.#text[this.#cursor.offset];
      if (character === '"') {
        this.#advance();
        return this.#emit("STRING", value, location, byteLength);
      }
      if (character === "\\") {
        this.#advance();
        const escaped = this.#text[this.#cursor.offset];
        if (escaped !== '"' && escaped !== "\\") {
          this.#syntax(
            "Quoted strings allow only quote and slash escapes",
            location,
          );
        }
        value += escaped;
        this.#advance();
        byteLength += 2;
      } else {
        const codePoint = this.#text.codePointAt(this.#cursor.offset);
        // OWL quotedString permits Unicode characters, including controls;
        // XML's character restrictions do not apply to Functional Syntax.
        if (inRange(codePoint, 0xd800, 0xdfff)) {
          this.#syntax(
            "The quoted string contains an invalid character",
            location,
          );
        }
        const item = String.fromCodePoint(codePoint);
        value += item;
        byteLength += utf8CodePointBytes(codePoint);
        this.#advance();
        if (item.length === 2) {
          this.#advance();
        }
      }
      if (byteLength > this.#configuration.maxTokenLength) {
        this.#resource(
          "maxTokenLength",
          this.#configuration.maxTokenLength,
          byteLength,
          location,
        );
      }
    }
    this.#syntax("The quoted string is not terminated", location);
  }

  #readLanguage(location) {
    this.#advance();
    let value = "";
    while (this.#cursor.offset < this.#text.length) {
      const character = this.#text[this.#cursor.offset];
      if (
        WHITESPACE.has(character) ||
        DELIMITERS.has(character) ||
        character === "#"
      ) {
        break;
      }
      value += this.#advance();
    }
    if (!/^[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*$/u.test(value)) {
      this.#syntax("The literal language tag is invalid", location);
    }
    return this.#emit("LANGUAGE", value, location, value.length + 1);
  }

  #readBare(location) {
    let byteLength = 0;
    let value = "";
    while (this.#cursor.offset < this.#text.length) {
      const character = this.#text[this.#cursor.offset];
      if (
        WHITESPACE.has(character) ||
        DELIMITERS.has(character) ||
        character === "#"
      ) {
        break;
      }
      if (character === "\\") {
        value += this.#advance();
        byteLength += 1;
        if (this.#cursor.offset === this.#text.length) {
          this.#syntax("The prefixed-name escape is not terminated", location);
        }
        const escaped = this.#advance();
        value += escaped;
        byteLength += new TextEncoder().encode(escaped).byteLength;
      } else {
        const codePoint = this.#text.codePointAt(this.#cursor.offset);
        const item = String.fromCodePoint(codePoint);
        value += item;
        byteLength += utf8CodePointBytes(codePoint);
        this.#advance();
        if (item.length === 2) {
          this.#advance();
        }
      }
      if (byteLength > this.#configuration.maxTokenLength) {
        this.#resource(
          "maxTokenLength",
          this.#configuration.maxTokenLength,
          byteLength,
          location,
        );
      }
    }
    if (value.length === 0) {
      this.#syntax("The input contains an unexpected delimiter", location);
    }
    if (/^[0-9]+$/u.test(value)) {
      return this.#emit("INTEGER", value, location, byteLength);
    }
    if (value.startsWith("_:")) {
      if (!nodeIdIsValid(value)) {
        this.#syntax("The anonymous individual node ID is invalid", location);
      }
      return this.#emit("NODE_ID", value, location, byteLength);
    }
    const colon = value.indexOf(":");
    if (colon >= 0) {
      const prefix = value.slice(0, colon + 1);
      const local = value.slice(colon + 1);
      if (!prefixNameIsValid(prefix)) {
        this.#syntax("The prefixed IRI has an invalid prefix name", location);
      }
      if (local.length === 0) {
        return this.#emit("PREFIX_NAME", value, location, byteLength);
      }
      if (!localNameIsValid(local)) {
        this.#syntax("The prefixed IRI has an invalid local name", location);
      }
      return this.#emit("ABBREVIATED_IRI", value, location, byteLength);
    }
    if (!/^[A-Za-z][A-Za-z0-9]*$/u.test(value)) {
      this.#syntax("The input contains an invalid lexical token", location);
    }
    return this.#emit("WORD", value, location, byteLength);
  }
}
