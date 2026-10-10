/** Per-lexer UTF-16 positions and scan cadence; syntax and budget policy stay local. */
export class TextCursor {
  column = 1;
  line = 1;
  offset = 0;
  previousWasCarriageReturn = false;
  scannedSinceBudgetCheck = 0;
  #checkBudget;

  constructor(checkBudget) {
    this.#checkBudget = checkBudget;
  }

  /** Capture a token start independently of subsequent cursor advances. */
  location() {
    return { column: this.column, line: this.line, offset: this.offset };
  }

  /** Consume one UTF-16 unit; CRLF advances the line exactly once. */
  advance(text) {
    const character = text[this.offset];
    this.offset += 1;
    if (character === "\r") {
      this.line += 1;
      this.column = 1;
      this.previousWasCarriageReturn = true;
    } else if (character === "\n") {
      if (!this.previousWasCarriageReturn) this.line += 1;
      this.column = 1;
      this.previousWasCarriageReturn = false;
    } else {
      this.column += 1;
      this.previousWasCarriageReturn = false;
    }
    this.scannedSinceBudgetCheck += 1;
    if (this.scannedSinceBudgetCheck >= 1024) this.#checkBudget();
    return character;
  }
}
