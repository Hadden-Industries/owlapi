import { OWLSyntaxError, ResourceLimitError } from "../../io/index.js";

const WHITESPACE = new Set([" ", "\t", "\n", "\r"]);
const DELIMITERS = new Set(["=", "(", ")", "<", ">", "@", "^"]);
const LOCAL_ESCAPES = new Set([
  "_",
  "~",
  ".",
  "-",
  "!",
  "$",
  "&",
  "'",
  "(",
  ")",
  "*",
  "+",
  ",",
  ";",
  "=",
  "/",
  "?",
  "#",
  "@",
  "%",
]);

const isAsciiDigit = (character) => character >= "0" && character <= "9";
const isHex = (character) =>
  isAsciiDigit(character) ||
  (character >= "A" && character <= "F") ||
  (character >= "a" && character <= "f");

const inRange = (codePoint, start, end) =>
  codePoint >= start && codePoint <= end;

const isPnCharsBase = (character) => {
  const codePoint = character.codePointAt(0);
  return (
    inRange(codePoint, 0x41, 0x5a) ||
    inRange(codePoint, 0x61, 0x7a) ||
    inRange(codePoint, 0xc0, 0xd6) ||
    inRange(codePoint, 0xd8, 0xf6) ||
    inRange(codePoint, 0xf8, 0x2ff) ||
    inRange(codePoint, 0x370, 0x37d) ||
    inRange(codePoint, 0x37f, 0x1fff) ||
    inRange(codePoint, 0x200c, 0x200d) ||
    inRange(codePoint, 0x2070, 0x218f) ||
    inRange(codePoint, 0x2c00, 0x2fef) ||
    inRange(codePoint, 0x3001, 0xd7ff) ||
    inRange(codePoint, 0xf900, 0xfdcf) ||
    inRange(codePoint, 0xfdf0, 0xfffd) ||
    inRange(codePoint, 0x10000, 0xeffff)
  );
};

const isPnCharsU = (character) => character === "_" || isPnCharsBase(character);

const isPnChars = (character) => {
  const codePoint = character.codePointAt(0);
  return (
    isPnCharsU(character) ||
    character === "-" ||
    isAsciiDigit(character) ||
    codePoint === 0xb7 ||
    inRange(codePoint, 0x300, 0x36f) ||
    inRange(codePoint, 0x203f, 0x2040)
  );
};

const prefixNameIsValid = (value) => {
  const local = value.slice(0, -1);
  if (local.length === 0) {
    return true;
  }
  const characters = [...local];
  return (
    isPnCharsBase(characters[0]) &&
    characters.slice(1, -1).every((item) => isPnChars(item) || item === ".") &&
    (characters.length === 1 || isPnChars(characters.at(-1)))
  );
};

const localUnits = (value) => {
  const units = [];
  for (let offset = 0; offset < value.length;) {
    const character = value[offset];
    if (character === "\\") {
      const escaped = value[offset + 1];
      if (!LOCAL_ESCAPES.has(escaped)) {
        return undefined;
      }
      units.push({ escaped: true, value: escaped });
      offset += 2;
      continue;
    }
    if (
      character === "%" &&
      isHex(value[offset + 1]) &&
      isHex(value[offset + 2])
    ) {
      units.push({ escaped: true, value: value.slice(offset, offset + 3) });
      offset += 3;
      continue;
    }
    const codePoint = value.codePointAt(offset);
    const item = String.fromCodePoint(codePoint);
    units.push({ escaped: false, value: item });
    offset += item.length;
  }
  return units;
};

const localNameIsValid = (value) => {
  const units = localUnits(value);
  if (!units || units.length === 0) {
    return false;
  }
  const first = units[0];
  if (
    !first.escaped &&
    !isPnCharsU(first.value) &&
    first.value !== ":" &&
    !isAsciiDigit(first.value)
  ) {
    return false;
  }
  return units.slice(1).every(({ escaped, value }, index) => {
    if (escaped) {
      return true;
    }
    if (index === units.length - 2 && value === ".") {
      return false;
    }
    return isPnChars(value) || value === "." || value === ":";
  });
};

const nodeIdIsValid = (value) => {
  if (!value.startsWith("_:") || value.length === 2) {
    return false;
  }
  const label = [...value.slice(2)];
  const first = label[0];
  if (!isPnCharsU(first) && !isAsciiDigit(first)) {
    return false;
  }
  return label.slice(1).every((item, index) => {
    if (index === label.length - 2 && item === ".") {
      return false;
    }
    return isPnChars(item) || item === ".";
  });
};

const utf8CodePointBytes = (codePoint) => {
  if (codePoint <= 0x7f) {
    return 1;
  }
  if (codePoint <= 0x7ff) {
    return 2;
  }
  return codePoint <= 0xffff ? 3 : 4;
};

const monotonicNow = () => globalThis.performance?.now?.() ?? Date.now();

export const decodePrefixedLocalName = (value) =>
  value.replace(/\\([_~.\-!$&'()*+,;=/?#@%])/gu, "$1");

export class FunctionalSyntaxLexer {
  #column = 1;
  #configuration;
  #deadline;
  #line = 1;
  #lookahead;
  #offset = 0;
  #previousWasCarriageReturn = false;
  #scannedSinceBudgetCheck = 0;
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
    this.#scannedSinceBudgetCheck = 0;
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
      if (this.#text[this.#offset] !== "#") {
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
    return Object.freeze({ ...location, type, value });
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
    if (["(", ")", "="].includes(character)) {
      this.#advance();
      return this.#emit(character, character, location, 1);
    }
    if (character === "^") {
      this.#advance();
      if (this.#text[this.#offset] !== "^") {
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
      this.#offset < this.#text.length &&
      this.#text[this.#offset] !== ">"
    ) {
      const character = this.#text[this.#offset];
      const codePoint = this.#text.codePointAt(this.#offset);
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
    if (this.#text[this.#offset] !== ">") {
      this.#syntax("The full IRI is not terminated", location);
    }
    this.#advance();
    return this.#emit("FULL_IRI", value, location, byteLength);
  }

  #readString(location) {
    this.#advance();
    let byteLength = 2;
    let value = "";
    while (this.#offset < this.#text.length) {
      const character = this.#text[this.#offset];
      if (character === '"') {
        this.#advance();
        return this.#emit("STRING", value, location, byteLength);
      }
      if (character === "\\") {
        this.#advance();
        const escaped = this.#text[this.#offset];
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
        const codePoint = this.#text.codePointAt(this.#offset);
        if (
          codePoint === 0 ||
          inRange(codePoint, 0xd800, 0xdfff) ||
          (codePoint < 0x20 &&
            codePoint !== 0x9 &&
            codePoint !== 0xa &&
            codePoint !== 0xd)
        ) {
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
    while (this.#offset < this.#text.length) {
      const character = this.#text[this.#offset];
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
    while (this.#offset < this.#text.length) {
      const character = this.#text[this.#offset];
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
        if (this.#offset === this.#text.length) {
          this.#syntax("The prefixed-name escape is not terminated", location);
        }
        const escaped = this.#advance();
        value += escaped;
        byteLength += new TextEncoder().encode(escaped).byteLength;
      } else {
        const codePoint = this.#text.codePointAt(this.#offset);
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
