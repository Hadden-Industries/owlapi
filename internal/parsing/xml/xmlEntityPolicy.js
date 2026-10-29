import { isXmlName } from "./xmlNames.js";
import { xmlProcessingPolicy } from "./xmlProcessingPolicy.js";
import {
  applyDtdAttributes,
  readAttributeListDeclaration,
} from "./xmlDtdAttributes.js";
import {
  validateElementDeclaration,
  validateNotationDeclaration,
} from "./xmlDtdDeclarations.js";
import {
  ResourceLimitError,
  SecurityPolicyError,
  XmlParseError,
} from "../../../io/errors.js";

const PREDEFINED_ENTITIES = new Set(["amp", "apos", "gt", "lt", "quot"]);
import { XML_ENTITY_DEFAULTS as DEFAULT_LIMITS } from "./xmlEntityDefaults.js";
const textEncoder = new TextEncoder();

const byteLength = (value) => textEncoder.encode(value).byteLength;

const xmlError = (message, details = {}) => {
  throw new XmlParseError(message, details);
};

const decodeCharacterReferences = (text) =>
  text.replace(/&#(x[\dA-Fa-f]+|\d+);/gu, (_reference, digits) => {
    const code = Number.parseInt(
      digits[0] === "x" ? digits.slice(1) : digits,
      digits[0] === "x" ? 16 : 10,
    );
    if (!(
      code === 9 ||
      code === 10 ||
      code === 13 ||
      (code >= 32 && code <= 0xd7ff) ||
      (code >= 0xe000 && code <= 0xfffd) ||
      (code >= 0x10000 && code <= 0x10ffff)
    ))
      xmlError("An XML character reference is invalid");
    return String.fromCodePoint(code);
  });

const resourceLimit = (resource, limit, observed, details = {}) => {
  throw new ResourceLimitError(`The XML ${resource} limit was exceeded`, {
    ...details,
    limit,
    observed,
    resource,
  });
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
    if (typeof text === "string" && text[offset] !== "<") {
      const next = text.indexOf("<", offset);
      if (next < 0) break;
      offset = next;
    }
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

const validateDoctypeHead = (head, policy) => {
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
      if (policy.admitsExternalDeclarations) {
        if (
          !/^(?:SYSTEM\s+(?:"[^"]*"|'[^']*')|PUBLIC\s+(?:"[^"]*"|'[^']*')\s+(?:"[^"]*"|'[^']*'))$/u.test(
            external,
          )
        )
          xmlError("The XML DOCTYPE external identifier is malformed");
        return;
      }
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

/** Expand internal parameter entities at declaration boundaries. The selected
 * provider disables external parameter retrieval, including external subsets.
 * References inside an internal entity declaration remain XML errors.
 */
const expandParameterDeclarations = (subset, policy, counters) => {
  if (!policy.admitsParameterEntities) return subset;
  const parameters = new Map();
  const visit = (input, stack = []) => {
    const output = [];
    for (let offset = 0; offset < input.length;) {
      if (input.startsWith("<!--", offset) || input.startsWith("<?", offset)) {
        const terminator = input.startsWith("<!--", offset) ? "-->" : "?>";
        const end = findDelimitedEnd(input, offset + 2, terminator);
        output.push(input.slice(offset, end));
        offset = end;
        continue;
      }
      if (input[offset] === "%") {
        const reference = input.slice(offset).match(/^%([^;\s]+);/u);
        if (!reference || !parameters.has(reference[1]))
          xmlError("An XML parameter entity is not declared");
        const name = reference[1];
        if (stack.includes(name))
          xmlError("An XML parameter entity is recursive", {
            entityName: name,
          });
        counters.expansions++;
        if (counters.expansions > policy.maxEntityExpansions)
          resourceLimit(
            "entityExpansionLimit",
            policy.maxEntityExpansions,
            counters.expansions,
          );
        output.push(visit(parameters.get(name), [...stack, name]));
        offset += reference[0].length;
        continue;
      }
      if (!input.startsWith("<!", offset)) {
        output.push(input[offset++]);
        continue;
      }
      const end = readMarkupDeclarationEnd(input, offset);
      const declaration = input.slice(offset, end);
      if (!/^<!ENTITY\s+%/u.test(declaration)) output.push(declaration);
      else {
        const match = declaration.match(
          /^<!ENTITY\s+%\s+([^\s]+)\s+(["'])([\s\S]*)\2\s*>$/u,
        );
        const external = declaration.match(
          /^<!ENTITY\s+%\s+([^\s]+)\s+(?:SYSTEM\s+(?:"[^"]*"|'[^']*')|PUBLIC\s+(?:"[^"]*"|'[^']*')\s+(?:"[^"]*"|'[^']*'))\s*>$/u,
        );
        if ((!match && !external) || !isXmlName((match ?? external)[1]))
          xmlError("An XML parameter entity declaration is malformed");
        const name = (match ?? external)[1];
        const replacement = decodeCharacterReferences(match?.[3] ?? "");
        if (name.length > policy.maxXmlNameCodeUnits)
          resourceLimit(
            "maxXmlNameCodeUnits",
            policy.maxXmlNameCodeUnits,
            name.length,
          );
        if (/%[^;\s]+;/u.test(replacement))
          xmlError(
            "Parameter references cannot occur inside declarations in an internal subset",
          );
        if (replacement.length > policy.maxParameterEntityCodeUnits)
          resourceLimit(
            "maxParameterEntityCodeUnits",
            policy.maxParameterEntityCodeUnits,
            replacement.length,
          );
        counters.declaredCodeUnits += replacement.length;
        if (counters.declaredCodeUnits > policy.maxTotalEntityCodeUnits)
          resourceLimit(
            "maxTotalEntityCodeUnits",
            policy.maxTotalEntityCodeUnits,
            counters.declaredCodeUnits,
          );
        if (!parameters.has(name)) parameters.set(name, replacement);
      }
      offset = end;
    }
    return output.join("");
  };
  return visit(subset);
};

const parseEntityDeclarations = (subset, limits, policy, counters) => {
  const declarations = new Map();
  let declaredEntityCodeUnits = counters.declaredCodeUnits;
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
      const comment = subset.slice(offset + 4, end);
      if (comment.includes("--") || comment.endsWith("-"))
        xmlError(
          "A comment in the XML DOCTYPE contains a forbidden double hyphen",
          { offset },
        );
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
      if (
        policy.admitsDtdMetadataDeclarations &&
        subset.startsWith("<!ATTLIST", offset)
      ) {
        const end = readMarkupDeclarationEnd(subset, offset);
        readAttributeListDeclaration(
          subset.slice(offset, end),
          counters.attributeDeclarations,
        );
        offset = end;
        continue;
      }
      if (
        policy.admitsDtdMetadataDeclarations &&
        subset.startsWith("<!ELEMENT", offset)
      ) {
        const end = readMarkupDeclarationEnd(subset, offset);
        validateElementDeclaration(subset.slice(offset, end));
        offset = end;
        continue;
      }
      if (
        policy.admitsDtdMetadataDeclarations &&
        subset.startsWith("<!NOTATION", offset)
      ) {
        const end = readMarkupDeclarationEnd(subset, offset);
        validateNotationDeclaration(subset.slice(offset, end));
        offset = end;
        continue;
      }
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
      if (policy.admitsExternalDeclarations) {
        if (!isXmlName(name))
          xmlError("An external XML entity name is malformed");
        const external =
          /^<!ENTITY\s+[^\s%]+\s+(?:SYSTEM\s+(?:"[^"]*"|'[^']*')|PUBLIC\s+(?:"[^"]*"|'[^']*')\s+(?:"[^"]*"|'[^']*'))(?:\s+NDATA\s+([^\s>]+))?\s*>$/u.exec(
            declaration,
          );
        if (!external || (external[1] && !isXmlName(external[1])))
          xmlError("An external XML entity declaration is malformed");
        if (!declarations.has(name)) {
          declarations.set(name, "");
          counters.externalEntities.add(name);
          if (external[1]) counters.unparsedEntities.add(name);
        }
        offset = end;
        continue;
      }
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
    if (name.length > policy.maxXmlNameCodeUnits)
      resourceLimit(
        "maxXmlNameCodeUnits",
        policy.maxXmlNameCodeUnits,
        name.length,
      );
    if (replacement.length > policy.maxGeneralEntityCodeUnits)
      resourceLimit(
        "maxGeneralEntityCodeUnits",
        policy.maxGeneralEntityCodeUnits,
        replacement.length,
      );
    declaredEntityCodeUnits += replacement.length;
    if (declaredEntityCodeUnits > policy.maxTotalEntityCodeUnits)
      resourceLimit(
        "maxTotalEntityCodeUnits",
        policy.maxTotalEntityCodeUnits,
        declaredEntityCodeUnits,
      );
    if (/%[^;\s]+;/u.test(replacement)) {
      throw new SecurityPolicyError("XML parameter entities are disabled", {
        entityName: name,
        policy: "xmlParameterEntity",
      });
    }
    if (declarations.has(name)) {
      if (policy.keepsFirstEntityDeclaration) {
        offset = end;
        continue;
      }
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

const createEntityResolver = (
  declarations,
  limits,
  policy,
  externalEntities,
  unparsedEntities,
) => {
  const resolved = new Map();

  const resolve = (name, stack = []) => {
    if (unparsedEntities.has(name))
      xmlError(
        "An unparsed XML entity cannot be referenced as parsed content",
        { entityName: name },
      );
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
    let expansionCount = 1;
    let usesExternalEntity = externalEntities.has(name);
    const text = replaceEntityReferences(replacement, (nestedName) => {
      const nested = resolve(nestedName, [...stack, name]);
      maximumNestedDepth = Math.max(maximumNestedDepth, nested.depth);
      expansionCount += nested.expansionCount;
      usesExternalEntity ||= nested.usesExternalEntity;
      if (expansionCount > policy.maxEntityExpansions)
        resourceLimit(
          "entityExpansionLimit",
          policy.maxEntityExpansions,
          expansionCount,
        );
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
    if (text.length > policy.maxGeneralEntityCodeUnits)
      resourceLimit(
        "maxGeneralEntityCodeUnits",
        policy.maxGeneralEntityCodeUnits,
        text.length,
      );
    const result = { depth, text, expansionCount, usesExternalEntity };
    resolved.set(name, result);
    return result;
  };

  if (policy.resolvesUnusedEntities)
    for (const name of declarations.keys()) {
      resolve(name);
    }
  return resolve;
};

const expandDocumentEntities = (
  text,
  resolveEntity,
  limits,
  policy,
  counters,
) => {
  const output = [];
  let outputBytes = 0;
  let entityExpansions = counters.expansions;
  let expandedEntityCodeUnits = counters.expandedEntityCodeUnits ?? 0;
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
  const markers = /[<&>"\x27]/gu;
  for (let offset = 0; offset < text.length;) {
    if (typeof text === "string") {
      markers.lastIndex = offset;
      const next = markers.exec(text);
      if (!next) break;
      offset = next.index;
    }
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
    const entity = resolveEntity(name);
    if (!entity) {
      xmlError(`The XML entity ${name} is not declared`, {
        entityName: name,
        offset,
      });
    }
    let replacement = entity.text;
    entityExpansions += entity.expansionCount;
    expandedEntityCodeUnits += replacement.length;
    if (entityExpansions > policy.maxEntityExpansions)
      resourceLimit(
        "entityExpansionLimit",
        policy.maxEntityExpansions,
        entityExpansions,
      );
    if (expandedEntityCodeUnits > policy.maxTotalEntityCodeUnits)
      resourceLimit(
        "maxTotalEntityCodeUnits",
        policy.maxTotalEntityCodeUnits,
        expandedEntityCodeUnits,
      );
    if (insideTag) {
      if (entity.usesExternalEntity)
        xmlError("An external XML entity cannot occur in an attribute", {
          entityName: name,
        });
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
  counters.expansions = entityExpansions;
  counters.expandedEntityCodeUnits = expandedEntityCodeUnits;
  return output.join("");
};

export const prepareXml = (text, configuration = {}) => {
  const limits = { ...DEFAULT_LIMITS, ...configuration };
  const policy = xmlProcessingPolicy(configuration);
  const counters = {
    expansions: 0,
    declaredCodeUnits: 0,
    attributeDeclarations: new Map(),
    externalEntities: new Set(),
    unparsedEntities: new Set(),
  };
  const doctype = findDoctype(text);
  let declarations = new Map();
  let documentText = text;
  if (doctype) {
    const { head, subset } = internalSubsetBounds(doctype.text);
    validateDoctypeHead(head, policy);
    declarations = parseEntityDeclarations(
      expandParameterDeclarations(subset, policy, counters),
      limits,
      policy,
      counters,
    );
    const preservedLines = doctype.text.replace(/[^\r\n]/gu, "");
    documentText = `${text.slice(0, doctype.start)}${preservedLines}${text.slice(
      doctype.end,
    )}`;
  }
  const resolveEntity = createEntityResolver(
    declarations,
    limits,
    policy,
    counters.externalEntities,
    counters.unparsedEntities,
  );
  // Default values enter the same expansion and resource accounting path as
  // explicitly written attributes, before the XML parser resolves namespaces.
  const prepared = applyDtdAttributes(
    documentText,
    counters.attributeDeclarations,
    (value, quote) => {
      const prefix = `<a value=${quote}`;
      const suffix = `${quote}/>`;
      const escaped = value.replaceAll(
        quote,
        quote === '"' ? "&quot;" : "&apos;",
      );
      return expandDocumentEntities(
        prefix + escaped + suffix,
        resolveEntity,
        limits,
        policy,
        counters,
      ).slice(prefix.length, -suffix.length);
    },
  );
  return expandDocumentEntities(
    prepared,
    resolveEntity,
    limits,
    policy,
    counters,
  );
};
