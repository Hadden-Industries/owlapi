import { decodeStreamText } from "../streamByteReader.js";
import { FunctionalSyntaxLexer } from "./lexer.js";

/** Find a cut where the ordinary lexer can see an entire token. Comments can
 * span windows because the lexer retains its comment and CRLF state. */
function* tokenWindows(text, state) {
  let end = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (state.comment) {
      const newline = /[\r\n]/u.exec(text.slice(i));
      if (!newline) {
        end = text.length;
        break;
      }
      i += newline.index;
      state.comment = false;
      end = i + 1;
      continue;
    }
    if (state.escaped) {
      state.escaped = false;
      continue;
    }
    if (state.quote) {
      if (c === "\\" && state.quote === '"') state.escaped = true;
      if (c === state.quote) {
        state.quote = "";
        end = i + 1;
      }
      continue;
    }
    if (c === "\\") {
      state.escaped = true;
      state.bare = true;
      continue;
    }
    if (c === "#" || c === "<" || (c === '"' && !state.bare)) {
      end = i;
      state.bare = false;
      if (c === "#") {
        state.comment = true;
        end++;
      } else state.quote = c === "<" ? ">" : '"';
      continue;
    }
    if ("()= \t\n\r>".includes(c)) {
      state.bare = false;
      end = i + 1;
    } else if (c === "^") {
      state.bare = false;
      if (state.caret) end = i + 1;
      else end = i;
      state.caret = !state.caret;
      continue;
    } else {
      if (c === "@") end = i;
      state.bare = true;
    }
    state.caret = false;
  }
  if (end) {
    state.pending.push(text.slice(0, end));
    yield state.pending.join("");
    state.pending = [];
    state.length = 0;
  }
  if (end < text.length) {
    state.pending.push(text.slice(end));
    state.length += text.length - end;
  }
}

async function* windows(source, configuration, lexer) {
  const state = { pending: [], length: 0 };
  for await (const text of decodeStreamText(source, configuration)) {
    yield* tokenWindows(text, state);
    // A single unfinished token must obey the same lexical byte limit as a
    // complete one. The lexer supplies the precise error and source position.
    if (state.length > configuration.maxTokenLength + 2) {
      lexer.nextWindow(state.pending.join(""));
      lexer.peek();
    }
  }
  if (state.pending.length) yield state.pending.join("");
}

/** Buffer only the next production for the synchronous recursive-descent grammar. */
export class FunctionalStreamLexer {
  #lexer;
  #input;
  #tokens = [];
  #position = 0;
  #done = false;

  constructor(source, configuration) {
    this.#lexer = new FunctionalSyntaxLexer("", configuration);
    this.#input = windows(source, configuration, this.#lexer);
  }

  async readAhead(count) {
    if (this.#position) {
      this.#tokens = this.#tokens.slice(this.#position);
      this.#position = 0;
    }
    while (this.#tokens.length < count && !this.#done) {
      let token = this.#lexer.consume();
      while (token.type === "EOF") {
        const next = await this.#input.next();
        if (next.done) {
          this.#done = true;
          break;
        }
        this.#lexer.nextWindow(next.value);
        token = this.#lexer.consume();
      }
      this.#tokens.push(token);
    }
  }

  async readForm() {
    await this.readAhead(2);
    if (this.#tokens[1]?.type !== "(") return;
    let depth = 1;
    for (let i = 2; depth; i++) {
      if (i >= this.#tokens.length) await this.readAhead(i + 1);
      const type = this.#tokens[i]?.type;
      if (!type || type === "EOF") break;
      if (type === "(") depth++;
      else if (type === ")") depth--;
    }
  }

  peek() {
    return this.#tokens[this.#position] ?? this.#tokens.at(-1);
  }
  consume() {
    const token = this.peek();
    this.#position++;
    return token;
  }
  checkExecutionBudget() {
    this.#lexer.checkExecutionBudget();
  }
  close() {
    return this.#input.return();
  }
}
