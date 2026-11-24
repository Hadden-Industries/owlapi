import { ResourceLimitError, XmlParseError } from "../../../io/errors.js";
import { decodeStreamText } from "../streamByteReader.js";
import { XmlChunkTokens } from "../xml/xmlChunkTokens.js";
import { createXmlEntityPreparation } from "../xml/xmlEntityPolicy.js";
import { xmlParserAdapter } from "../xml/xmlParserAdapter.js";

const encoder = new TextEncoder();
const xmlSpace = /^[\t\n\r ]*$/u;
const rootName = /^<([^\s/>]+)/u;

/** Retain one DTD environment and its expansion counters across all elements. */
async function* preparedXml(source, configuration) {
  const tokens = new XmlChunkTokens();
  let entities = createXmlEntityPreparation(undefined, configuration);
  tokens.setEntityNameLimit(entities.longestEntityName);
  let prolog = true;
  let hasDoctype = false;
  let expanded = 0;
  function* prepare(text, final = false) {
    for (const token of tokens.read(text, final)) {
      let prepared;
      if (token.kind === "doctype") {
        if (!prolog || hasDoctype)
          throw new XmlParseError(
            "One XML DOCTYPE is permitted before the root element",
          );
        hasDoctype = true;
        entities = createXmlEntityPreparation(token.text, configuration);
        tokens.setEntityNameLimit(entities.longestEntityName);
        prepared = token.text.replace(/[^\r\n]/gu, "");
      } else {
        if (token.kind === "open") prolog = false;
        prepared = entities.prepare(token.text);
      }
      expanded += encoder.encode(prepared).byteLength;
      if (expanded > configuration.maxExpandedXmlBytes)
        throw new ResourceLimitError(
          "The expanded XML byte limit was exceeded",
          {
            resource: "maxExpandedXmlBytes",
            limit: configuration.maxExpandedXmlBytes,
            observed: expanded,
          },
        );
      if (prepared) yield prepared;
    }
    const pending = expanded + tokens.pendingExpandedBytes(hasDoctype);
    if (pending > configuration.maxExpandedXmlBytes)
      throw new ResourceLimitError("The expanded XML byte limit was exceeded", {
        resource: "maxExpandedXmlBytes",
        limit: configuration.maxExpandedXmlBytes,
        observed: pending,
      });
  }
  for await (const text of decodeStreamText(
    source,
    configuration,
    configuration.signal,
    (cause) =>
      new XmlParseError("The OWL/XML source is not valid UTF-8", { cause }),
  ))
    yield* prepare(text);
  yield* prepare("", true);
}

class XmlPosition {
  line = 1;
  column = 1;
  carriageReturn = false;

  advance(text) {
    let from = 0;
    for (const match of text.matchAll(/[\r\n]/gu)) {
      const crlf =
        match[0] === "\n" &&
        (match.index ? text[match.index - 1] === "\r" : this.carriageReturn);
      if (!crlf) this.line++;
      this.column = 1;
      from = match.index + 1;
    }
    this.column += text.length - from;
    if (text.length) this.carriageReturn = text.endsWith("\r");
  }
}

/** Keep the authored root's namespaces, XML base and language around each child
 * while passing complete DOM subtrees to the existing OWL/XML grammar. */
export async function* owlXmlDocuments(source, configuration) {
  const tokens = new XmlChunkTokens();
  const position = new XmlPosition();
  const contentOrigin = new XmlPosition();
  let header;
  let closingTag;
  let closed = false;
  let depth = 0;
  let parts = [];
  let pendingReference = false;
  let start;
  let first = true;
  function* frame(text, final = false) {
    for (const token of tokens.read(text, final)) {
      const { kind, text: markup } = token;
      const location = { line: position.line, column: position.column };
      position.advance(markup);
      if (!header && kind === "open") {
        header = markup;
        const name = rootName.exec(header)?.[1];
        if (!name) throw new XmlParseError("The XML start tag has no name");
        closed = header.endsWith("/>");
        closingTag = closed ? "" : `</${name}>`;
        contentOrigin.advance(header);
        yield { xml: header + closingTag, header: true, location };
      } else if (!header || closed) {
        if (kind === "text" && xmlSpace.test(markup)) {
          first = false;
          continue;
        }
        if (kind !== "instruction" && kind !== "comment")
          throw new XmlParseError(
            "Unexpected XML markup outside the document element",
          );
        if (/^<\?xml(?:\s|\?)/iu.test(markup) && !first)
          throw new XmlParseError(
            "The XML declaration must start the document",
          );
        yield { xml: markup + "<validation/>", validateOnly: true };
      } else if (depth === 0 && kind === "close") {
        // Let the XML provider verify the actual qualified closing tag.
        yield { xml: header + markup, validateOnly: true };
        closed = true;
      } else {
        if (
          depth === 0 &&
          !parts.length &&
          kind === "text" &&
          xmlSpace.test(markup)
        ) {
          first = false;
          continue;
        }
        if (!parts.length) start = location;
        parts.push(markup);
        if (kind === "open" && !markup.endsWith("/>")) depth++;
        if (kind === "close") depth--;
        if (depth > 0 && depth + 1 > configuration.maxXmlNestingDepth) {
          throw new ResourceLimitError(
            "The XML element nesting depth limit was exceeded",
            {
              resource: "maxXmlNestingDepth",
              limit: configuration.maxXmlNestingDepth,
              observed: depth + 1,
            },
          );
        }
        // Incomplete character references may cross producer byte boundaries.
        if (!depth && kind === "text") {
          const ampersand = markup.lastIndexOf("&");
          if (ampersand >= 0)
            pendingReference = !/[;\s]/u.test(markup.slice(ampersand + 1));
          else if (pendingReference) pendingReference = !/[;\s]/u.test(markup);
          if (pendingReference) continue;
        }
        if (!depth) {
          yield {
            xml: header + parts.join("") + closingTag,
            location: start,
            origin: contentOrigin,
          };
          parts = [];
        }
      }
      first = false;
    }
  }
  async function* frames() {
    for await (const text of preparedXml(source, configuration))
      yield* frame(text);
    yield* frame("", true);
    if (!header || !closed || parts.length)
      throw new XmlParseError(
        "The XML document element is missing or unclosed",
      );
  }
  for await (const item of frames()) {
    const document = await xmlParserAdapter.parsePreparedXml(
      item.xml,
      configuration,
    );
    if (!item.validateOnly)
      yield {
        document,
        header: item.header,
        origin: item.origin,
        location: item.location,
      };
  }
}
