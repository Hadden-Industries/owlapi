import {
  ResourceLimitError,
  SecurityPolicyError,
  XmlParseError,
} from "../../io/index.js";

const PREDEFINED_ENTITIES = new Set(["amp", "apos", "gt", "lt", "quot"]);
const DEFAULT_LIMITS = Object.freeze({
  maxEntityDeclarations: 256,
  maxEntityExpansionDepth: 16,
  maxEntityReplacementLength: 65_536,
  maxExpandedXmlBytes: 33_554_432,
});
const textEncoder = new TextEncoder();

const byteLength = (value) => textEncoder.encode(value).byteLength;

const isXmlNameStartCodePoint = (codePoint) =>
  codePoint === 0x3a ||
  codePoint === 0x5f ||
  (codePoint >= 0x41 && codePoint <= 0x5a) ||
  (codePoint >= 0x61 && codePoint <= 0x7a) ||
  (codePoint >= 0xc0 && codePoint <= 0xd6) ||
  (codePoint >= 0xd8 && codePoint <= 0xf6) ||
  (codePoint >= 0xf8 && codePoint <= 0x2ff) ||
  (codePoint >= 0x370 && codePoint <= 0x37d) ||
  (codePoint >= 0x37f && codePoint <= 0x1fff) ||
  (codePoint >= 0x200c && codePoint <= 0x200d) ||
  (codePoint >= 0x2070 && codePoint <= 0x218f) ||
  (codePoint >= 0x2c00 && codePoint <= 0x2fef) ||
  (codePoint >= 0x3001 && codePoint <= 0xd7ff) ||
  (codePoint >= 0xf900 && codePoint <= 0xfdcf) ||
  (codePoint >= 0xfdf0 && codePoint <= 0xfffd) ||
  (codePoint >= 0x10000 && codePoint <= 0xeffff);

const isXmlNameCodePoint = (codePoint) =>
  isXmlNameStartCodePoint(codePoint) ||
  codePoint === 0x2d ||
  codePoint === 0x2e ||
  codePoint === 0xb7 ||
  (codePoint >= 0x30 && codePoint <= 0x39) ||
  (codePoint >= 0x300 && codePoint <= 0x36f) ||
  (codePoint >= 0x203f && codePoint <= 0x2040);

const isXmlName = (value) => {
  const points = [...value].map((character) => character.codePointAt(0));
  return (
    points.length > 0 &&
    isXmlNameStartCodePoint(points[0]) &&
    points.slice(1).every(isXmlNameCodePoint)
  );
};

const resourceLimit = (resource, limit, observed, details = {}) => {
  throw new ResourceLimitError(`The XML ${resource} limit was exceeded`, {
    ...details,
    limit,
    observed,
    resource,
  });
};

const xmlError = (message, details = {}) => {
  throw new XmlParseError(message, details);
};

const findDelimitedEnd = (text, start, terminator) => {
  const offset = text.indexOf(terminator, start);
  return offset < 0 ? text.length : offset + terminator.length;
};

const readDoctypeEnd = (text, start) => {
  let quote;
  let subsetDepth = 0;
  for (let offset = start + 9; offset < text.length; offset += 1) {
    const character = text[offset];
    if (quote) {
      if (character === quote) {
        quote = undefined;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "[") {
      subsetDepth += 1;
    } else if (character === "]") {
      subsetDepth -= 1;
      if (subsetDepth < 0) {
        xmlError("The XML DOCTYPE has an unexpected closing bracket", {
          offset,
        });
      }
    } else if (character === ">" && subsetDepth === 0) {
      return offset + 1;
    }
  }
  xmlError("The XML DOCTYPE declaration is not terminated", { offset: start });
};

const findDoctype = (text) => {
  let doctype;
  let seenRootElement = false;
  for (let offset = 0; offset < text.length;) {
    if (text.startsWith("<!--", offset)) {
      offset = findDelimitedEnd(text, offset + 4, "-->");
    } else if (text.startsWith("<![CDATA[", offset)) {
      offset = findDelimitedEnd(text, offset + 9, "]]>");
    } else if (text.startsWith("<?", offset)) {
      offset = findDelimitedEnd(text, offset + 2, "?>");
    } else if (text.startsWith("<!DOCTYPE", offset)) {
      if (doctype) {
        xmlError("An XML document cannot contain more than one DOCTYPE", {
          offset,
        });
      }
      if (seenRootElement) {
        xmlError("XML DOCTYPE must precede the document element", { offset });
      }
      const end = readDoctypeEnd(text, offset);
      doctype = { end, start: offset, text: text.slice(offset, end) };
      offset = end;
    } else if (
      text[offset] === "<" &&
      text.slice(offset, offset + 9).toUpperCase() === "<!DOCTYPE" &&
      /\s/u.test(text[offset + 9] || "")
    ) {
      xmlError("XML DOCTYPE is case-sensitive", { offset });
    } else if (
      text[offset] === "<" &&
      !text.startsWith("</", offset) &&
      !text.startsWith("<!", offset)
    ) {
      seenRootElement = true;
      offset += 1;
    } else {
      offset += 1;
    }
  }
  return doctype;
};

const internalSubsetBounds = (doctype) => {
  const body = doctype.slice(9, -1);
  let quote;
  let opening = -1;
  let closing = -1;
  for (let offset = 0; offset < body.length; offset += 1) {
    const character = body[offset];
    if (quote) {
      if (character === quote) {
        quote = undefined;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "[") {
      if (opening >= 0) {
        xmlError("Nested XML DOCTYPE subsets are not supported");
      }
      opening = offset;
    } else if (character === "]") {
      closing = offset;
    }
  }
  if (opening < 0 !== closing < 0 || closing < opening) {
    xmlError("The XML DOCTYPE internal subset is malformed");
  }
  if (closing >= 0 && body.slice(closing + 1).trim().length > 0) {
    xmlError("Unexpected content follows the XML DOCTYPE internal subset");
  }
  return {
    head: (opening < 0 ? body : body.slice(0, opening)).trim(),
    subset: opening < 0 ? "" : body.slice(opening + 1, closing),
  };
};

const validateDoctypeHead = (head) => {
  const match = head.match(/^([^\s<>&'"[\]]+)(?:\s+([\s\S]*))?$/u);
  if (!match) {
    xmlError("The XML DOCTYPE name is malformed");
  }
  if (!isXmlName(match[1])) {
    xmlError("The XML DOCTYPE name is malformed");
  }
  const external = match[2]?.trim();
  if (external) {
    if (/^(?:SYSTEM|PUBLIC)\b/u.test(external)) {
      throw new SecurityPolicyError("External XML subsets are disabled", {
        policy: "externalXmlSubset",
      });
    }
    xmlError("The XML DOCTYPE external identifier is malformed");
  }
};

const readMarkupDeclarationEnd = (subset, start) => {
  let quote;
  for (let offset = start + 2; offset < subset.length; offset += 1) {
    const character = subset[offset];
    if (quote) {
      if (character === quote) {
        quote = undefined;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return offset + 1;
    }
  }
  xmlError("A declaration in the XML DOCTYPE is not terminated", {
    offset: start,
  });
};

const parseEntityDeclarations = (subset, limits) => {
  const declarations = new Map();
  for (let offset = 0; offset < subset.length;) {
    if (/\s/u.test(subset[offset])) {
      offset += 1;
      continue;
    }
    if (subset.startsWith("<!--", offset)) {
      const end = subset.indexOf("-->", offset + 4);
      if (end < 0) {
        xmlError("A comment in the XML DOCTYPE is not terminated", { offset });
      }
      offset = end + 3;
      continue;
    }
    if (subset.startsWith("<?", offset)) {
      const end = subset.indexOf("?>", offset + 2);
      if (end < 0) {
        xmlError(
          "A processing instruction in the XML DOCTYPE is not terminated",
          {
            offset,
          },
        );
      }
      offset = end + 2;
      continue;
    }
    if (subset[offset] === "%") {
      throw new SecurityPolicyError("XML parameter entities are disabled", {
        policy: "xmlParameterEntity",
      });
    }
    if (!subset.startsWith("<!ENTITY", offset)) {
      throw new SecurityPolicyError(
        "Only bounded internal general entities are allowed in XML DOCTYPE subsets",
        { policy: "xmlDtdMarkup" },
      );
    }
    const end = readMarkupDeclarationEnd(subset, offset);
    const declaration = subset.slice(offset, end);
    if (/^<!ENTITY\s+%/u.test(declaration)) {
      throw new SecurityPolicyError("XML parameter entities are disabled", {
        policy: "xmlParameterEntity",
      });
    }
    if (/^<!ENTITY\s+[^\s%]+\s+(?:SYSTEM|PUBLIC)\b/u.test(declaration)) {
      const name = declaration.match(/^<!ENTITY\s+([^\s%]+)/u)?.[1];
      throw new SecurityPolicyError("External XML entities are disabled", {
        entityName: name,
        policy: "externalXmlEntity",
      });
    }
    const match = declaration.match(
      /^<!ENTITY\s+([^\s%]+)\s+(["'])([\s\S]*)\2\s*>$/u,
    );
    if (!match || !isXmlName(match[1])) {
      xmlError("The internal XML entity declaration is malformed", { offset });
    }
    const [, name, , replacement] = match;
    if (/%[^;\s]+;/u.test(replacement)) {
      throw new SecurityPolicyError("XML parameter entities are disabled", {
        entityName: name,
        policy: "xmlParameterEntity",
      });
    }
    if (declarations.has(name)) {
      xmlError(`The XML entity ${name} is declared more than once`, {
        entityName: name,
      });
    }
    const declarationCount = declarations.size + 1;
    if (declarationCount > limits.maxEntityDeclarations) {
      resourceLimit(
        "maxEntityDeclarations",
        limits.maxEntityDeclarations,
        declarationCount,
      );
    }
    const replacementBytes = byteLength(replacement);
    if (replacementBytes > limits.maxEntityReplacementLength) {
      resourceLimit(
        "maxEntityReplacementLength",
        limits.maxEntityReplacementLength,
        replacementBytes,
        { entityName: name },
      );
    }
    declarations.set(name, replacement);
    offset = end;
  }
  return declarations;
};

const isBuiltInReference = (name) =>
  name.startsWith("#") || PREDEFINED_ENTITIES.has(name);

const replaceEntityReferences = (value, replace) =>
  value.replace(/&([^;\s]+);/gu, (reference, name) =>
    isBuiltInReference(name) ? reference : replace(name),
  );

const resolveDeclarations = (declarations, limits) => {
  const resolved = new Map();

  const resolve = (name, stack = []) => {
    const cached = resolved.get(name);
    if (cached) {
      return cached;
    }
    const replacement = declarations.get(name);
    if (replacement === undefined) {
      xmlError(`The XML entity ${name} is not declared`, { entityName: name });
    }
    if (stack.includes(name)) {
      xmlError(`The XML entity ${name} is recursively defined`, {
        entityName: name,
      });
    }
    let maximumNestedDepth = 0;
    const text = replaceEntityReferences(replacement, (nestedName) => {
      const nested = resolve(nestedName, [...stack, name]);
      maximumNestedDepth = Math.max(maximumNestedDepth, nested.depth);
      return nested.text;
    });
    const depth = maximumNestedDepth + 1;
    if (depth > limits.maxEntityExpansionDepth) {
      resourceLimit(
        "maxEntityExpansionDepth",
        limits.maxEntityExpansionDepth,
        depth,
        { entityName: name },
      );
    }
    const replacementBytes = byteLength(text);
    if (replacementBytes > limits.maxEntityReplacementLength) {
      resourceLimit(
        "maxEntityReplacementLength",
        limits.maxEntityReplacementLength,
        replacementBytes,
        { entityName: name },
      );
    }
    const result = { depth, text };
    resolved.set(name, result);
    return result;
  };

  for (const name of declarations.keys()) {
    resolve(name);
  }
  return resolved;
};

const expandDocumentEntities = (text, declarations, limits) => {
  const output = [];
  let outputBytes = 0;
  const append = (value) => {
    const nextBytes = outputBytes + byteLength(value);
    if (nextBytes > limits.maxExpandedXmlBytes) {
      resourceLimit(
        "maxExpandedXmlBytes",
        limits.maxExpandedXmlBytes,
        nextBytes,
      );
    }
    output.push(value);
    outputBytes = nextBytes;
  };

  let chunkStart = 0;
  let insideTag = false;
  let quote;
  for (let offset = 0; offset < text.length;) {
    if (!insideTag && text.startsWith("<!--", offset)) {
      const end = findDelimitedEnd(text, offset + 4, "-->");
      append(text.slice(chunkStart, end));
      offset = end;
      chunkStart = end;
      continue;
    }
    if (!insideTag && text.startsWith("<![CDATA[", offset)) {
      const end = findDelimitedEnd(text, offset + 9, "]]>");
      append(text.slice(chunkStart, end));
      offset = end;
      chunkStart = end;
      continue;
    }
    if (!insideTag && text.startsWith("<?", offset)) {
      const end = findDelimitedEnd(text, offset + 2, "?>");
      append(text.slice(chunkStart, end));
      offset = end;
      chunkStart = end;
      continue;
    }
    const character = text[offset];
    if (!insideTag && character === "<") {
      insideTag = true;
      offset += 1;
      continue;
    }
    if (insideTag && quote) {
      if (character === quote) {
        quote = undefined;
      }
    } else if (insideTag && (character === '"' || character === "'")) {
      quote = character;
    } else if (insideTag && character === ">") {
      insideTag = false;
    }

    if (character !== "&" || (insideTag && !quote)) {
      offset += 1;
      continue;
    }
    const end = text.indexOf(";", offset + 1);
    if (end < 0) {
      offset += 1;
      continue;
    }
    const name = text.slice(offset + 1, end);
    if (isBuiltInReference(name)) {
      offset = end + 1;
      continue;
    }
    const entity = declarations.get(name);
    if (!entity) {
      xmlError(`The XML entity ${name} is not declared`, {
        entityName: name,
        offset,
      });
    }
    let replacement = entity.text;
    if (insideTag) {
      if (replacement.includes("<")) {
        xmlError("An XML entity used in an attribute contains markup", {
          entityName: name,
          offset,
        });
      }
      replacement = replacement.replaceAll(
        quote,
        quote === '"' ? "&quot;" : "&apos;",
      );
    }
    append(text.slice(chunkStart, offset));
    append(replacement);
    offset = end + 1;
    chunkStart = offset;
  }
  append(text.slice(chunkStart));
  return output.join("");
};

export const prepareXml = (text, configuration = {}) => {
  const limits = { ...DEFAULT_LIMITS, ...configuration };
  const doctype = findDoctype(text);
  let declarations = new Map();
  let documentText = text;
  if (doctype) {
    const { head, subset } = internalSubsetBounds(doctype.text);
    validateDoctypeHead(head);
    declarations = resolveDeclarations(
      parseEntityDeclarations(subset, limits),
      limits,
    );
    const preservedLines = doctype.text.replace(/[^\r\n]/gu, "");
    documentText = `${text.slice(0, doctype.start)}${preservedLines}${text.slice(
      doctype.end,
    )}`;
  }
  return expandDocumentEntities(documentText, declarations, limits);
};
