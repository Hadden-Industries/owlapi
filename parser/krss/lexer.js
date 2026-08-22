import { OWLSyntaxError, ResourceLimitError } from "../../io/index.js";

const WHITESPACE = new Set([" ", "\t", "\n", "\r"]);
const SYMBOL_DELIMITERS = new Set([" ", "\t", "\n", "\r", "(", ")", ";"]);
const monotonicNow = () => globalThis.performance?.now?.() ?? Date.now();

const utf8CodePointBytes = (codePoint) => {
  if (codePoint <= 0x7f) {
    return 1;
  }
  if (codePoint <= 0x7ff) {
    return 2;
  }
  return codePoint <= 0xffff ? 3 : 4;
};

/**
 * Lazy lexer shared by the KRSS family. It deliberately emits neutral symbols:
 * dialect legality belongs to the KRSS1/KRSS2 policy and parser layers, so
 * sharing tokenization cannot silently turn the deferred KRSS1 identity into
 * an alias for the active KRSS2 parser.
 */
export class KRSSLexer {
  #column = 1;
  #configuration;
  #deadline;
  #line = 1;
  #lookahead = [];
  #offset = 0;
  #previousWasCarriageReturn = false;
  #scannedSinceBudgetCheck = 0;
  #startedAt;
  #text;
  #tokenCount = 0;

  constructor(text, configuration, executionBudget) {
    if (typeof text !== "string") {
      throw new TypeError("KRSS input must be a string");
    }
    this.#text = text;
    this.#configuration = configuration;
    this.#startedAt = executionBudget?.startedAt ?? monotonicNow();
    this.#deadline =
      executionBudget?.deadline ?? this.#startedAt + configuration.timeoutMs;
  }

  peek(distance = 0) {
    // Four tokens cover every current KRSS2 decision while keeping retained
    // attacker-controlled token data independent of document size.
    if (!Number.isSafeInteger(distance) || distance < 0 || distance > 3) {
      throw new RangeError("KRSS lookahead must be between zero and three");
    }
    while (this.#lookahead.length <= distance) {
      this.#lookahead.push(this.#readToken());
    }
    return this.#lookahead[distance];
  }

  consume() {
    const token = this.peek();
    this.#lookahead.shift();
    return token;
  }

  checkExecutionBudget() {
    this.#scannedSinceBudgetCheck = 0;
    const { signal } = this.#configuration;
    if (signal?.aborted) {
      if (typeof signal.throwIfAborted === "function") {
        signal.throwIfAborted();
      }
      const error = new Error("The ontology load was aborted");
      error.name = "AbortError";
      throw error;
    }
    const current = monotonicNow();
    if (current < this.#deadline) {
      return;
    }
    throw new ResourceLimitError("The KRSS parse timeout was exceeded", {
      limit: this.#configuration.timeoutMs,
      observed: Math.max(0, Math.ceil(current - this.#startedAt)),
      resource: "timeoutMs",
    });
  }

  #details(location, extra = {}) {
    return this.#configuration.sourceLocations
      ? { ...extra, ...location }
      : extra;
  }

  #syntax(message, location, extra = {}) {
    throw new OWLSyntaxError(message, this.#details(location, extra));
  }

  #resource(resource, limit, observed, location) {
    throw new ResourceLimitError(
      `The KRSS ${resource} limit was exceeded`,
      this.#details(location, { limit, observed, resource }),
    );
  }

  #advance() {
    const character = this.#text[this.#offset];
    this.#offset += 1;
    if (character === "\r") {
      this.#line += 1;
      this.#column = 1;
      this.#previousWasCarriageReturn = true;
    } else if (character === "\n") {
      if (!this.#previousWasCarriageReturn) {
        this.#line += 1;
      }
      this.#column = 1;
      this.#previousWasCarriageReturn = false;
    } else {
      this.#column += 1;
      this.#previousWasCarriageReturn = false;
    }
    this.#scannedSinceBudgetCheck += 1;
    if (this.#scannedSinceBudgetCheck >= 1024) {
      this.checkExecutionBudget();
    }
    return character;
  }

  #skipTrivia() {
    while (this.#offset < this.#text.length) {
      if (WHITESPACE.has(this.#text[this.#offset])) {
        this.#advance();
        continue;
      }
      if (this.#text[this.#offset] !== ";") {
        return;
      }
      while (
        this.#offset < this.#text.length &&
        this.#text[this.#offset] !== "\n" &&
        this.#text[this.#offset] !== "\r"
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
    return Object.freeze({
      ...location,
      endOffset: this.#offset,
      type,
      value,
    });
  }

  #readToken() {
    this.#skipTrivia();
    const location = {
      column: this.#column,
      line: this.#line,
      offset: this.#offset,
    };
    if (this.#offset === this.#text.length) {
      return this.#emit("EOF", "", location, 0);
    }

    const character = this.#text[this.#offset];
    if (character === "(" || character === ")") {
      this.#advance();
      return this.#emit(character, character, location, 1);
    }
    if (character === "<") {
      return this.#readFullIri(location);
    }
    if (character === ":") {
      this.#advance();
      const token = this.#readSymbol(location, 1);
      if (token.value.length === 0) {
        this.#syntax("A KRSS attribute requires a name", location);
      }
      return Object.freeze({ ...token, type: "ATTRIBUTE" });
    }
    return this.#readSymbol(location);
  }

  #readFullIri(location) {
    this.#advance();
    let byteLength = 2;
    let value = "";
    while (
      this.#offset < this.#text.length &&
      this.#text[this.#offset] !== ">"
    ) {
      const character = this.#text[this.#offset];
      const codePoint = this.#text.codePointAt(this.#offset);
      if (
        WHITESPACE.has(character) ||
        character === "<" ||
        character === '"' ||
        character === "\\" ||
        codePoint < 0x20 ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)
      ) {
        this.#syntax(
          "The KRSS full IRI contains a forbidden character",
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
    if (this.#text[this.#offset] !== ">") {
      this.#syntax("The KRSS full IRI is not terminated", location);
    }
    this.#advance();
    return this.#emit("FULL_IRI", value, location, byteLength);
  }

  #readSymbol(location, initialByteLength = 0) {
    let byteLength = initialByteLength;
    let value = "";
    while (this.#offset < this.#text.length) {
      const character = this.#text[this.#offset];
      if (SYMBOL_DELIMITERS.has(character)) {
        break;
      }
      const codePoint = this.#text.codePointAt(this.#offset);
      if (codePoint === 0 || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
        this.#syntax("The KRSS symbol contains an invalid character", location);
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
    if (value.length === 0 && initialByteLength === 0) {
      this.#syntax("The KRSS input contains an unexpected token", location, {
        found: this.#text[this.#offset],
      });
    }
    const type = /^[0-9]+$/u.test(value) ? "INTEGER" : "SYMBOL";
    return this.#emit(type, value, location, byteLength);
  }
}
