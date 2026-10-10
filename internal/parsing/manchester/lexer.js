import { TextCursor } from "../textCursor.js";
import {
  isAsciiDigit,
  inRange,
  prefixNameIsValid,
  localNameIsValid,
  nodeIdIsValid,
  utf8CodePointBytes,
} from "../lexicalNames.js";
import { OWLSyntaxError, ResourceLimitError } from "../../../io/errors.js";

const WHITESPACE = new Set([" ", "\t", "\n", "\r"]);
const PUNCTUATION = new Set([",", "(", ")", "{", "}", "[", "]"]);

const KEYWORDS = new Set([
  "AnnotationProperty:",
  "Annotations:",
  "Asymmetric",
  "Characteristics:",
  "Class:",
  "DataProperty:",
  "Datatype:",
  "DifferentFrom:",
  "DifferentIndividuals:",
  "DisjointClasses:",
  "DisjointProperties:",
  "DisjointUnionOf:",
  "DisjointWith:",
  "Domain:",
  "EquivalentClasses:",
  "EquivalentProperties:",
  "EquivalentTo:",
  "Facts:",
  "Functional",
  "HasKey:",
  "Import:",
  "Individual:",
  "InverseFunctional",
  "InverseOf:",
  "Irreflexive",
  "Ontology:",
  "Prefix:",
  "Range:",
  "Reflexive",
  "Rule:",
  "SameAs:",
  "SameIndividual:",
  "Self",
  "SubClassOf:",
  "SubPropertyChain:",
  "SubPropertyOf:",
  "Symmetric",
  "Transitive",
  "Types:",
  "and",
  "decimal",
  "exactly",
  "float",
  "inverse",
  "integer",
  "langRange",
  "length",
  "max",
  "maxLength",
  "min",
  "minLength",
  "not",
  "o",
  "only",
  "or",
  "pattern",
  "some",
  "string",
  "that",
  "value",
]);

export const isManchesterNumericLiteral = (value) =>
  /^[+-]?[0-9]+$/u.test(value) ||
  /^[+-]?[0-9]+\.[0-9]+$/u.test(value) ||
  /^[+-]?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?[fF]$/u.test(
    value,
  );

const monotonicNow = () => globalThis.performance?.now?.() ?? Date.now();

export const isManchesterKeyword = (value) => KEYWORDS.has(value);

export class ManchesterSyntaxLexer {
  #cursor = new TextCursor(() => this.checkExecutionBudget());
  #configuration;
  #countTokens;
  #deadline;
  #lookahead;
  #startedAt;
  #text;
  #tokenCount = 0;

  constructor(text, configuration, options = {}) {
    if (typeof text !== "string") {
      throw new TypeError("Manchester Syntax input must be a string");
    }
    this.#text = text;
    this.#configuration = configuration;
    this.#countTokens = options.countTokens !== false;
    this.#startedAt = options.executionBudget?.startedAt ?? monotonicNow();
    this.#deadline =
      options.executionBudget?.deadline ??
      this.#startedAt + configuration.timeoutMs;
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
      "The Manchester Syntax parse timeout was exceeded",
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
      `The Manchester Syntax ${resource} limit was exceeded`,
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
    if (type !== "EOF" && this.#countTokens) {
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
    return Object.freeze({
      ...location,
      endOffset: this.#cursor.offset,
      type,
      value,
    });
  }

  #readToken() {
    this.#skipTrivia();
    const location = this.#cursor.location();
    if (this.#cursor.offset === this.#text.length) {
      return this.#emit("EOF", "", location, 0);
    }

    const character = this.#text[this.#cursor.offset];
    if (character === "<") {
      const next = this.#text[this.#cursor.offset + 1];
      if (
        next === "=" ||
        next === '"' ||
        next === "+" ||
        next === "-" ||
        next === "." ||
        isAsciiDigit(next) ||
        WHITESPACE.has(next)
      ) {
        this.#advance();
        const value = next === "=" ? `<${this.#advance()}` : "<";
        return this.#emit("FACET", value, location, value.length);
      }
      return this.#readFullIri(location);
    }
    if (character === ">") {
      this.#advance();
      const value =
        this.#text[this.#cursor.offset] === "=" ? `>${this.#advance()}` : ">";
      return this.#emit("FACET", value, location, value.length);
    }
    if (character === '"') {
      return this.#readString(location);
    }
    if (character === "@") {
      return this.#readLanguage(location);
    }
    if (character === "^") {
      this.#advance();
      if (this.#text[this.#cursor.offset] !== "^") {
        this.#syntax(
          "A Manchester datatype marker must contain two carets",
          location,
        );
      }
      this.#advance();
      return this.#emit("^^", "^^", location, 2);
    }
    if (PUNCTUATION.has(character)) {
      const value = this.#advance();
      return this.#emit(value, value, location, 1);
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
        '<"{}|^`\\'.includes(character) ||
        codePoint < 0x20 ||
        inRange(codePoint, 0xd800, 0xdfff)
      ) {
        this.#syntax(
          "The Manchester full IRI contains a forbidden character",
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
      this.#syntax("The Manchester full IRI is not terminated", location);
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
            "Manchester strings allow only quote and slash escapes",
            location,
          );
        }
        value += escaped;
        this.#advance();
        byteLength += 2;
      } else {
        const codePoint = this.#text.codePointAt(this.#cursor.offset);
        if (
          codePoint === 0 ||
          inRange(codePoint, 0xd800, 0xdfff) ||
          (codePoint < 0x20 &&
            codePoint !== 0x9 &&
            codePoint !== 0xa &&
            codePoint !== 0xd)
        ) {
          this.#syntax(
            "The Manchester string contains an invalid character",
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
    this.#syntax("The Manchester string is not terminated", location);
  }

  #readLanguage(location) {
    this.#advance();
    let value = "";
    while (this.#cursor.offset < this.#text.length) {
      const character = this.#text[this.#cursor.offset];
      if (
        WHITESPACE.has(character) ||
        PUNCTUATION.has(character) ||
        character === "#" ||
        character === '"' ||
        character === "@" ||
        character === "^" ||
        character === "<" ||
        character === ">"
      ) {
        break;
      }
      value += this.#advance();
    }
    if (!/^[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*$/u.test(value)) {
      this.#syntax("The Manchester literal language tag is invalid", location);
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
        PUNCTUATION.has(character) ||
        character === "#" ||
        character === '"' ||
        character === "@" ||
        character === "^" ||
        character === "<" ||
        character === ">"
      ) {
        break;
      }
      if (character === "\\") {
        value += this.#advance();
        byteLength += 1;
        if (this.#cursor.offset === this.#text.length) {
          this.#syntax(
            "The Manchester prefixed-name escape is not terminated",
            location,
          );
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
      this.#syntax(
        "The Manchester input contains an unexpected token",
        location,
      );
    }
    if (value.startsWith("_:")) {
      if (!nodeIdIsValid(value)) {
        this.#syntax(
          "The Manchester anonymous individual node ID is invalid",
          location,
        );
      }
      return this.#emit("NODE_ID", value, location, byteLength);
    }
    if (KEYWORDS.has(value) || isManchesterNumericLiteral(value)) {
      return this.#emit("BARE", value, location, byteLength);
    }
    const colon = value.indexOf(":");
    if (colon >= 0) {
      const prefix = value.slice(0, colon + 1);
      const local = value.slice(colon + 1);
      if (!prefixNameIsValid(prefix)) {
        this.#syntax(
          "The Manchester prefixed IRI has an invalid prefix name",
          location,
        );
      }
      if (local.length === 0) {
        return this.#emit("BARE", value, location, byteLength);
      }
      if (!localNameIsValid(local)) {
        this.#syntax(
          "The Manchester prefixed IRI has an invalid local name",
          location,
        );
      }
      return this.#emit("BARE", value, location, byteLength);
    }
    if (!localNameIsValid(value)) {
      this.#syntax(
        "The Manchester input contains an invalid lexical token",
        location,
      );
    }
    return this.#emit("BARE", value, location, byteLength);
  }
}
