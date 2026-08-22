import { OWLOntologyLoaderConfiguration } from "../../io/index.js";

import { KRSSLexer } from "./lexer.js";

const tokenize = (text, values = {}) => {
  const lexer = new KRSSLexer(text, new OWLOntologyLoaderConfiguration(values));
  const tokens = [];
  while (lexer.peek().type !== "EOF") {
    tokens.push(lexer.consume());
  }
  return tokens;
};

describe("KRSSLexer", () => {
  it("tokenizes common KRSS-family forms without assigning a dialect", () => {
    expect(
      tokenize(
        "; declaration\r\n(define-primitive-concept Person (some <urn:test#hasParent> Parent))",
      ),
    ).toEqual([
      expect.objectContaining({ type: "(", value: "(" }),
      expect.objectContaining({
        type: "SYMBOL",
        value: "define-primitive-concept",
      }),
      expect.objectContaining({ type: "SYMBOL", value: "Person" }),
      expect.objectContaining({ type: "(", value: "(" }),
      expect.objectContaining({ type: "SYMBOL", value: "some" }),
      expect.objectContaining({
        type: "FULL_IRI",
        value: "urn:test#hasParent",
      }),
      expect.objectContaining({ type: "SYMBOL", value: "Parent" }),
      expect.objectContaining({ type: ")", value: ")" }),
      expect.objectContaining({ type: ")", value: ")" }),
    ]);
  });

  it("recognizes attributes and non-negative cardinalities", () => {
    expect(tokenize("(:parents (parent) (at-least 12 child))")).toEqual([
      expect.objectContaining({ type: "(", value: "(" }),
      expect.objectContaining({ type: "ATTRIBUTE", value: "parents" }),
      expect.objectContaining({ type: "(", value: "(" }),
      expect.objectContaining({ type: "SYMBOL", value: "parent" }),
      expect.objectContaining({ type: ")", value: ")" }),
      expect.objectContaining({ type: "(", value: "(" }),
      expect.objectContaining({ type: "SYMBOL", value: "at-least" }),
      expect.objectContaining({ type: "INTEGER", value: "12" }),
      expect.objectContaining({ type: "SYMBOL", value: "child" }),
      expect.objectContaining({ type: ")", value: ")" }),
      expect.objectContaining({ type: ")", value: ")" }),
    ]);
  });

  it("tracks CRLF locations without counting one line break twice", () => {
    expect(tokenize("A\r\nÉ")).toEqual([
      expect.objectContaining({ column: 1, line: 1, offset: 0, value: "A" }),
      expect.objectContaining({ column: 1, line: 2, offset: 3, value: "É" }),
    ]);
  });

  it("bounds parser lookahead to four retained tokens", () => {
    const lexer = new KRSSLexer(
      "(and Person Parent)",
      new OWLOntologyLoaderConfiguration(),
    );

    expect(lexer.peek(3)).toMatchObject({ type: "SYMBOL", value: "Parent" });
    expect(() => lexer.peek(4)).toThrow(
      /lookahead must be between zero and three/,
    );
  });

  it("enforces token length in UTF-8 bytes", () => {
    expect(() => tokenize("éé", { maxTokenLength: 3 })).toThrow(
      expect.objectContaining({ resource: "maxTokenLength" }),
    );
  });
});
