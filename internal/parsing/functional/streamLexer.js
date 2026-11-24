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

/** Expose immediate tokens and refill only when the active grammar asks for one. */
export class FunctionalStreamLexer {
  #lexer;
  #input;
  #done = false;

  constructor(source, configuration) {
    this.#lexer = new FunctionalSyntaxLexer("", configuration);
    this.#input = windows(source, configuration, this.#lexer);
  }

  currentToken() {
    return this.#lexer.peek();
  }
  peek() {
    const token = this.currentToken();
    return token.type === "EOF" && !this.#done ? undefined : token;
  }
  consume() {
    if (this.peek()) return this.#lexer.consume();
    return undefined;
  }
  async consumeNext() {
    await this.refill();
    return this.#lexer.consume();
  }
  async refill() {
    let token;
    while (!(token = this.peek())) {
      const next = await this.#input.next();
      this.#done = next.done;
      if (!next.done) this.#lexer.nextWindow(next.value);
    }
    return token;
  }
  checkExecutionBudget() {
    this.#lexer.checkExecutionBudget();
  }
  close() {
    return this.#input.return();
  }
}
