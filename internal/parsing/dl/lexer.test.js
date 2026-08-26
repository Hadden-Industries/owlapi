import { OWLOntologyLoaderConfiguration } from "../../../index.js";

import { DLSyntaxLexer } from "./lexer.js";

const tokenize = (text, values = {}) => {
  const lexer = new DLSyntaxLexer(
    text,
    new OWLOntologyLoaderConfiguration(values),
  );
  const tokens = [];
  while (lexer.peek().type !== "EOF") {
    tokens.push(lexer.consume());
  }
  return tokens;
};

describe("DLSyntaxLexer", () => {
  it.each([
    ["SUBCLASS", ["⊑", "->", "sub", "\\sqsubseteq"]],
    ["EQUIVALENT", ["≡", "==", "\\equiv"]],
    ["NOT_EQUAL", ["≠", "!=", "\\not="]],
    ["COMPOSE", ["o", "∘"]],
    ["INVERSE", ["⁻", "^-"]],
    ["AND", ["⊓", "and", "\\sqcap"]],
    ["OR", ["⊔", "or", "\\sqcup"]],
    ["NOT", ["¬", "not", "\\lnot"]],
    ["SOME", ["∃", "exists", "\\exists"]],
    ["ALL", ["∀", "forall", "\\forall"]],
    ["MIN", ["≥", ">", "\\geq"]],
    ["MAX", ["≤", "<", "\\leq"]],
    ["EXACT", ["=", "equal"]],
    ["IN", ["in", "∈"]],
    ["TRANSITIVE", ["trans", "transitive", "R⁺"]],
  ])("maps every %s spelling to one token", (type, aliases) => {
    for (const alias of aliases) {
      expect(tokenize(alias)).toEqual([
        expect.objectContaining({ type, value: alias }),
      ]);
    }
  });

  it("distinguishes integer, double, and identifier longest matches", () => {
    expect(tokenize("123 1. 1.25 123abc")).toEqual([
      expect.objectContaining({ type: "INTEGER", value: "123" }),
      expect.objectContaining({ type: "DOUBLE", value: "1." }),
      expect.objectContaining({ type: "DOUBLE", value: "1.25" }),
      expect.objectContaining({ type: "ID", value: "123abc" }),
    ]);
  });

  it("tracks CRLF locations without counting one line break twice", () => {
    expect(tokenize("A\r\nÉ")).toEqual([
      expect.objectContaining({ column: 1, line: 1, offset: 0, value: "A" }),
      expect.objectContaining({ column: 1, line: 2, offset: 3, value: "É" }),
    ]);
  });

  it("bounds parser lookahead to four retained tokens", () => {
    const lexer = new DLSyntaxLexer(
      "A ⊑ B",
      new OWLOntologyLoaderConfiguration(),
    );

    expect(lexer.peek(3)).toMatchObject({ type: "EOF" });
    expect(() => lexer.peek(4)).toThrow(
      /lookahead must be between zero and three/,
    );
  });
});
