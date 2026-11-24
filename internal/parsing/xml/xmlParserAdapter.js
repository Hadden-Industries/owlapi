import { ResourceLimitError, XmlParseError } from "../../../io/errors.js";
import { xmlProcessingPolicy } from "./xmlProcessingPolicy.js";

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
    implementation = await import("@xmldom/xmldom");
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

export function xmlProviderLimitFailure(element, attributes, policy) {
  if (attributes.length > policy.maxAttributesPerElement) {
    return new ResourceLimitError(
      "The XML provider attribute count limit was exceeded",
      {
        resource: "maxAttributesPerElement",
        limit: policy.maxAttributesPerElement,
        observed: attributes.length,
      },
    );
  }
  for (const name of [element, ...attributes]) {
    const separator = name.indexOf(":");
    const nameLength = Math.max(separator, name.length - separator - 1);
    if (nameLength > policy.maxXmlNameCodeUnits) {
      return new ResourceLimitError(
        "The XML provider name length limit was exceeded",
        {
          resource: "maxXmlNameCodeUnits",
          limit: policy.maxXmlNameCodeUnits,
          observed: nameLength,
        },
      );
    }
  }
  return undefined;
}

const qualifiedName = (node) =>
  node.nodeName ??
  node.name ??
  (node.prefix ? node.prefix + ":" + node.localName : node.localName);

export class XmlParserAdapter {
  async parseXml(text, configuration) {
    if (typeof text !== "string") {
      throw new TypeError("XML source text must be a string");
    }
    return this.parsePreparedXml(
      prepareXml(text, configuration),
      configuration,
    );
  }

  async parsePreparedXml(
    preparedText,
    configuration,
    { syntheticRoot = false, observeAttributes } = {},
  ) {
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
    const policy = xmlProcessingPolicy(configuration);
    const pending = syntheticRoot
      ? Array.from(document.documentElement.childNodes).filter(
          (child) => child.nodeType === 1,
        )
      : [document.documentElement];
    while (pending.length) {
      const element = pending.pop();
      const attributes = Array.from(element.attributes);
      const limit = xmlProviderLimitFailure(
        qualifiedName(element),
        attributes.map(qualifiedName),
        policy,
      );
      if (limit) throw limit;
      observeAttributes?.(attributes);
      for (const child of Array.from(element.childNodes))
        if (child.nodeType === 1) pending.push(child);
    }
    return document;
  }
}

export const xmlParserAdapter = new XmlParserAdapter();
