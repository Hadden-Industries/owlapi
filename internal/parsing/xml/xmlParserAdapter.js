import { XmlParseError } from "../../../io/errors.js";

import { prepareXml } from "./xmlEntityPolicy.js";

const PARSER_ERROR_NAMESPACE =
  "http://www.mozilla.org/newlayout/xml/parsererror.xml";

const sourceLocation = (message) => {
  const match = String(message).match(
    /(?:line\s*[:=]?\s*)?(\d+)[,:]\s*(?:column\s*[:=]?\s*)?(\d+)/iu,
  );
  return match
    ? {
        column: Number.parseInt(match[2], 10),
        line: Number.parseInt(match[1], 10),
      }
    : {};
};

const parserError = (document) => {
  const root = document?.documentElement;
  if (!root) {
    return undefined;
  }
  if (
    root.localName === "parsererror" &&
    (!root.namespaceURI || root.namespaceURI === PARSER_ERROR_NAMESPACE)
  ) {
    return root;
  }
  return undefined;
};

const nodeParser = async () => {
  let implementation;
  try {
    implementation = await import(/* @vite-ignore */ "@xmldom/xmldom");
  } catch (cause) {
    throw new XmlParseError(
      "No XML parser implementation is available in this environment",
      { cause },
    );
  }
  return new implementation.DOMParser({
    locator: true,
    onError(level, message) {
      const error = new Error(message);
      error.level = level;
      throw error;
    },
  });
};

const browserParser = () =>
  typeof globalThis.DOMParser === "function"
    ? new globalThis.DOMParser()
    : undefined;

export class XmlParserAdapter {
  async parseXml(text, configuration) {
    if (typeof text !== "string") {
      throw new TypeError("XML source text must be a string");
    }
    const preparedText = prepareXml(text, configuration);

    const parser = browserParser() || (await nodeParser());
    let document;
    try {
      document = parser.parseFromString(preparedText, "application/xml");
    } catch (cause) {
      throw new XmlParseError("The XML document is not well formed", {
        ...sourceLocation(cause?.message),
        cause,
      });
    }

    const errorElement = parserError(document);
    if (errorElement) {
      const message = errorElement.textContent?.trim() || "Malformed XML";
      throw new XmlParseError("The XML document is not well formed", {
        ...sourceLocation(message),
        parserMessage: message,
      });
    }
    if (!document?.documentElement) {
      throw new XmlParseError("The XML document has no root element");
    }
    return document;
  }
}

export const xmlParserAdapter = new XmlParserAdapter();
