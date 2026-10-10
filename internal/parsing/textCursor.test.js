import { TextCursor } from "./textCursor.js";

describe("UTF-16 scan positions", () => {
  it("counts CRLF once, lone CR/LF separately and astral text as two units", () => {
    const cursor = new TextCursor(() => {
      throw new Error("Unexpected budget check");
    });
    const text = "a\r\n😀\rb\n";
    const positions = [];
    for (let i = 0; i < text.length; i++) {
      cursor.advance(text);
      positions.push([cursor.offset, cursor.line, cursor.column]);
    }
    expect(positions).toEqual([
      [1, 1, 2],
      [2, 2, 1],
      [3, 2, 1],
      [4, 2, 2],
      [5, 2, 3],
      [6, 3, 1],
      [7, 3, 2],
      [8, 4, 1],
    ]);
  });

  it("checks at each 1024 scanned units and keeps independent cursor state", () => {
    const offsets = [];
    const cursor = new TextCursor(() => {
      offsets.push(cursor.offset);
      cursor.scannedSinceBudgetCheck = 0;
    });
    const other = new TextCursor(() => {});
    const text = "a".repeat(2049);
    for (let i = 0; i < text.length; i++) cursor.advance(text);
    expect(offsets).toEqual([1024, 2048]);
    expect([other.offset, other.line, other.column]).toEqual([0, 1, 1]);
  });
});
