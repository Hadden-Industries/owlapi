import { TextCursor } from "../textCursor.js";
import { OWLSyntaxError, ResourceLimitError } from "../../../io/errors.js";

const WHITESPACE = new Set([" ", "\t", "\n", "\r"]);
const UTF8_ENCODER = new TextEncoder();
const SINGLE_TOKENS = Object.freeze({
  "(": "(",
  ")": ")",
  ",": ",",
  ":": ":",
  "[": "[",
  "]": "]",
  "{": "{",
  "}": "}",
});
const OPERATOR_ALIASES = Object.freeze([
  ["\\sqsubseteq", "SUBCLASS"],
  ["\\exists", "SOME"],
  ["\\forall", "ALL"],
  ["\\not=", "NOT_EQUAL"],
  ["\\equiv", "EQUIVALENT"],
  ["\\sqcap", "AND"],
  ["\\sqcup", "OR"],
  ["\\lnot", "NOT"],
  ["\\geq", "MIN"],
  ["\\leq", "MAX"],
  ["transitive", "TRANSITIVE"],
  ["exists", "SOME"],
  ["forall", "ALL"],
  ["equal", "EXACT"],
  ["trans", "TRANSITIVE"],
  ["and", "AND"],
  ["not", "NOT"],
  ["sub", "SUBCLASS"],
  ["or", "OR"],
  ["in", "IN"],
  ["R⁺", "TRANSITIVE"],
  ["->", "SUBCLASS"],
  ["==", "EQUIVALENT"],
  ["!=", "NOT_EQUAL"],
  ["^-", "INVERSE"],
  ["⊑", "SUBCLASS"],
  ["≡", "EQUIVALENT"],
  ["≠", "NOT_EQUAL"],
  ["∘", "COMPOSE"],
  ["⁻", "INVERSE"],
  ["⊓", "AND"],
  ["⊔", "OR"],
  ["¬", "NOT"],
  ["∃", "SOME"],
  ["∀", "ALL"],
  ["≥", "MIN"],
  ["≤", "MAX"],
  ["∈", "IN"],
  ["o", "COMPOSE"],
  [".", "DOT"],
  [">", "MIN"],
  ["<", "MAX"],
  ["=", "EXACT"],
]);
const LONGEST_MATCH_ALIASES = new Set([
  "\\sqsubseteq",
  "\\exists",
  "\\forall",
  "\\not=",
  "\\equiv",
  "\\sqcap",
  "\\sqcup",
  "\\lnot",
  "\\geq",
  "\\leq",
  "and",
  "equal",
  "exists",
  "forall",
  "in",
  "not",
  "o",
  "or",
  "sub",
  "trans",
  "transitive",
  "R⁺",
  "⊑",
  "≡",
  "≠",
  "∘",
  "⊓",
  "⊔",
  "∃",
  "∀",
  "≥",
  "≤",
]);
const ID_DELIMITERS = new Set([
  " ",
  "\t",
  "\n",
  "\r",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  ",",
  "^",
  "=",
  "<",
  ">",
  ".",
  "⁻",
  "¬",
  "∈",
]);

const monotonicNow = () => globalThis.performance?.now?.() ?? Date.now();
const isAsciiDigit = (character) => character >= "0" && character <= "9";
const isWordContinuation = (character) =>
  character !== undefined && !ID_DELIMITERS.has(character);

export class DLSyntaxLexer {
  #cursor = new TextCursor(() => this.checkExecutionBudget());
  #configuration;
  #deadline;
  #lookahead = [];
  #startedAt;
  #text;
  #tokenCount = 0;

  constructor(text, configuration, executionBudget) {
    if (typeof text !== "string") {
      throw new TypeError("DL Syntax input must be a string");
    }
    this.#text = text;
    this.#configuration = configuration;
    this.#startedAt = executionBudget?.startedAt ?? monotonicNow();
    this.#deadline =
      executionBudget?.deadline ?? this.#startedAt + configuration.timeoutMs;
  }

  peek(distance = 0) {
    if (!Number.isSafeInteger(distance) || distance < 0 || distance > 3) {
      throw new RangeError(
        "DL Syntax lookahead must be between zero and three",
      );
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
    this.#cursor.scannedSinceBudgetCheck = 0;
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
    throw new ResourceLimitError("The DL Syntax parse timeout was exceeded", {
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
      `The DL Syntax ${resource} limit was exceeded`,
      this.#details(location, { limit, observed, resource }),
    );
  }

  #advance() {
    return this.#cursor.advance(this.#text);
  }

  #skipWhitespace() {
    while (
      this.#cursor.offset < this.#text.length &&
      WHITESPACE.has(this.#text[this.#cursor.offset])
    ) {
      this.#advance();
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
      endOffset: this.#cursor.offset,
      type,
      value,
    });
  }

  #readToken() {
    this.#skipWhitespace();
    const location = this.#cursor.location();
    if (this.#cursor.offset === this.#text.length) {
      return this.#emit("EOF", "", location, 0);
    }

    const character = this.#text[this.#cursor.offset];
    const single = SINGLE_TOKENS[character];
    if (single) {
      this.#advance();
      return this.#emit(single, character, location, 1);
    }
    if (isAsciiDigit(character)) {
      return this.#readNumberOrId(location);
    }
    for (const [alias, type] of OPERATOR_ALIASES) {
      if (!this.#text.startsWith(alias, this.#cursor.offset)) {
        continue;
      }
      if (
        LONGEST_MATCH_ALIASES.has(alias) &&
        isWordContinuation(this.#text[this.#cursor.offset + alias.length])
      ) {
        continue;
      }
      for (let index = 0; index < alias.length; index += 1) {
        this.#advance();
      }
      return this.#emit(
        type,
        alias,
        location,
        UTF8_ENCODER.encode(alias).byteLength,
      );
    }
    return this.#readId(location);
  }

  #readNumberOrId(location) {
    const start = this.#cursor.offset;
    let cursor = this.#cursor.offset;
    while (isAsciiDigit(this.#text[cursor])) {
      cursor += 1;
      if (cursor - start > this.#configuration.maxTokenLength) {
        this.#resource(
          "maxTokenLength",
          this.#configuration.maxTokenLength,
          cursor - start,
          location,
        );
      }
      if ((cursor - start) % 1024 === 0) {
        this.checkExecutionBudget();
      }
    }
    if (this.#text[cursor] === ".") {
      cursor += 1;
      while (isAsciiDigit(this.#text[cursor])) {
        cursor += 1;
        if (cursor - start > this.#configuration.maxTokenLength) {
          this.#resource(
            "maxTokenLength",
            this.#configuration.maxTokenLength,
            cursor - start,
            location,
          );
        }
        if ((cursor - start) % 1024 === 0) {
          this.checkExecutionBudget();
        }
      }
      const value = this.#text.slice(this.#cursor.offset, cursor);
      while (this.#cursor.offset < cursor) {
        this.#advance();
      }
      return this.#emit("DOUBLE", value, location, value.length);
    }
    if (cursor === this.#text.length || ID_DELIMITERS.has(this.#text[cursor])) {
      const value = this.#text.slice(this.#cursor.offset, cursor);
      while (this.#cursor.offset < cursor) {
        this.#advance();
      }
      return this.#emit("INTEGER", value, location, value.length);
    }
    return this.#readId(location);
  }

  #readId(location) {
    const start = this.#cursor.offset;
    let byteLength = 0;
    while (this.#cursor.offset < this.#text.length) {
      const character = this.#text[this.#cursor.offset];
      if (ID_DELIMITERS.has(character)) {
        break;
      }
      const codePoint = this.#text.codePointAt(this.#cursor.offset);
      const item = String.fromCodePoint(codePoint);
      byteLength += UTF8_ENCODER.encode(item).byteLength;
      if (byteLength > this.#configuration.maxTokenLength) {
        this.#resource(
          "maxTokenLength",
          this.#configuration.maxTokenLength,
          byteLength,
          location,
        );
      }
      this.#advance();
      if (item.length === 2) {
        this.#advance();
      }
    }
    const value = this.#text.slice(start, this.#cursor.offset);
    if (value.length === 0) {
      this.#syntax(
        "The DL Syntax input contains an unexpected token",
        location,
        {
          found: this.#text[this.#cursor.offset],
        },
      );
    }
    return this.#emit("ID", value, location, byteLength);
  }
}
