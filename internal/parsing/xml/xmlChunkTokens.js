import { XmlParseError } from "../../../io/errors.js";

const encoder = new TextEncoder();
const tagMarkers = /[>"']/gu;
const doctypeMarkers = /[[\]>"']/gu;
const delimited = [
  ["<!--", "-->", "comment"],
  ["<![CDATA[", "]]>", "cdata"],
  ["<?", "?>", "instruction"],
];
const markupPrefixes = [
  ...delimited.map(([prefix]) => prefix),
  "<!DOCTYPE",
  "</",
];

function scanTag(text, offset, state) {
  const { kind } = state;
  const markers = kind === "doctype" ? doctypeMarkers : tagMarkers;
  markers.lastIndex = offset;
  for (;;) {
    if (state.quote) {
      const end = text.indexOf(state.quote, markers.lastIndex);
      if (end < 0) return -1;
      state.quote = undefined;
      markers.lastIndex = end + 1;
    }
    const match = markers.exec(text);
    if (!match) return -1;
    const marker = match[0];
    if (marker === '"' || marker === "'") state.quote = marker;
    else if (marker === "[") state.subsetDepth += 1;
    else if (marker === "]") state.subsetDepth -= 1;
    else if (state.subsetDepth <= 0) return markers.lastIndex;
  }
}

function scanDelimited(text, offset, state) {
  const { delimiter, suffix } = state;
  const prefix = suffix + text.slice(offset, offset + delimiter.length - 1);
  const crossing = prefix.indexOf(delimiter);
  if (crossing >= 0 && crossing < suffix.length)
    return offset + crossing + delimiter.length - suffix.length;
  const end = text.indexOf(delimiter, offset);
  if (end >= 0) return end + delimiter.length;
  state.suffix =
    text.length - offset >= delimiter.length - 1
      ? text.slice(-(delimiter.length - 1))
      : prefix.slice(-(delimiter.length - 1));
  return -1;
}

/** Split XML lexical units without accumulating the document or splitting entity references. */
export class XmlChunkTokens {
  #prefix = "";
  #markup;
  #longestEntityName;

  setEntityNameLimit(longestEntityName) {
    this.#longestEntityName = longestEntityName;
  }

  pendingExpandedBytes(hasDtd) {
    const state = this.#markup;
    if (!state || state.kind === "doctype" || (hasDtd && state.kind === "open"))
      return 0;
    return state.bytes;
  }

  *read(chunk, final = false) {
    const text = this.#prefix + chunk;
    this.#prefix = "";
    let offset = 0;
    while (offset < text.length) {
      if (!this.#markup && text[offset] !== "<") {
        const markup = text.indexOf("<", offset);
        let end = markup < 0 ? text.length : markup;
        if (markup < 0 && !final && this.#longestEntityName !== undefined) {
          const ampersand = text.lastIndexOf("&");
          if (
            ampersand >= offset &&
            ampersand > text.lastIndexOf(";") &&
            text[ampersand + 1] !== "#"
          ) {
            const name = text.slice(ampersand + 1);
            if (!/\s/u.test(name)) {
              if (name.length > this.#longestEntityName)
                throw new XmlParseError(
                  "The XML entity reference has no declaration",
                );
              end = ampersand;
            }
          }
          this.#prefix = text.slice(end);
        }
        if (end > offset) yield { kind: "text", text: text.slice(offset, end) };
        offset = end;
        if (markup < 0) break;
        continue;
      }

      if (!this.#markup) {
        const remaining = text.length - offset;
        if (remaining < 9 && !final) {
          const prefix = text.slice(offset);
          if (
            markupPrefixes.some(
              (value) => value.startsWith(prefix) && value !== prefix,
            )
          ) {
            this.#prefix = prefix;
            return;
          }
        }
        const lexical =
          text.startsWith("<!", offset) || text.startsWith("<?", offset)
            ? delimited.find(([prefix]) => text.startsWith(prefix, offset))
            : undefined;
        const kind =
          lexical?.[2] ??
          (text.startsWith("<!DOCTYPE", offset)
            ? "doctype"
            : text.startsWith("</", offset)
              ? "close"
              : text.startsWith("<!", offset)
                ? "declaration"
                : "open");
        const state = {
          kind,
          delimiter: lexical?.[1],
          suffix: "",
          subsetDepth: 0,
          parts: [],
          bytes: 0,
        };
        this.#markup = state;
        const start = offset;
        offset += lexical?.[0].length ?? 1;
        state.parts.push(text.slice(start, offset));
        state.bytes = offset - start;
      }

      const state = this.#markup;
      const end = state.delimiter
        ? scanDelimited(text, offset, state)
        : scanTag(text, offset, state);
      const part = text.slice(offset, end < 0 ? text.length : end);
      state.parts.push(part);
      if (end < 0) {
        state.bytes += encoder.encode(part).byteLength;
        break;
      }
      this.#markup = undefined;
      yield { kind: state.kind, text: state.parts.join("") };
      offset = end;
    }
    if (final && this.#markup)
      throw new XmlParseError("The XML markup is not terminated");
  }
}
