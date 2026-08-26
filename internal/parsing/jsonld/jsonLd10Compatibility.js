import { OWLSyntaxError } from "../../../io/errors.js";

const IRI_SHAPED_TERM = /(?::[^:])|\//u;
const PREFIX_END = /[:/?#[\]@]$/u;

const collectKeys = (value, keys = new Set()) => {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectKeys(entry, keys);
    }
  } else if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      keys.add(key);
      collectKeys(entry, keys);
    }
  }
  return keys;
};

const requiresLegacyTermAlias = (term, definition) => {
  if (!IRI_SHAPED_TERM.test(term)) {
    return false;
  }
  if (typeof definition === "string") {
    return definition !== term;
  }
  return Boolean(
    definition &&
    typeof definition === "object" &&
    Object.hasOwn(definition, "@id") &&
    definition["@id"] !== term,
  );
};

const normalizeLegacyPrefixDefinition = (definition) => {
  if (
    definition &&
    typeof definition === "object" &&
    !Array.isArray(definition) &&
    Object.keys(definition).length === 1 &&
    typeof definition["@id"] === "string" &&
    PREFIX_END.test(definition["@id"])
  ) {
    // JSON-LD 1.0 treated this expanded one-member definition as a compact-
    // IRI prefix. Its string shorthand is semantically equivalent in 1.0 and
    // lets the current 1.1 processor retain that historical prefix behavior.
    return definition["@id"];
  }
  return definition;
};

const createTransformer = (document) => {
  const occupiedKeys = collectKeys(document);
  const aliasesByTerm = new Map();
  let nextAlias = 0;
  const aliasFor = (term) => {
    const existing = aliasesByTerm.get(term);
    if (existing) {
      return existing;
    }
    let alias;
    do {
      alias = `__owlapi_jsonld10_term_${nextAlias}`;
      nextAlias += 1;
    } while (occupiedKeys.has(alias));
    occupiedKeys.add(alias);
    aliasesByTerm.set(term, alias);
    return alias;
  };

  const transformContext = (context, inheritedAliases) => {
    if (context === null) {
      return { aliases: new Map(), context };
    }
    if (Array.isArray(context)) {
      let aliases = new Map(inheritedAliases);
      const transformed = [];
      for (const entry of context) {
        const result = transformContext(entry, aliases);
        aliases = result.aliases;
        transformed.push(result.context);
      }
      return { aliases, context: transformed };
    }
    if (!context || typeof context !== "object") {
      // A string context remains delegated to the injected loader. The adapter
      // applies this transformer again after that document is loaded, while
      // local aliases continue across the reference as part of the active
      // context.
      return { aliases: new Map(inheritedAliases), context };
    }

    const aliases = new Map(inheritedAliases);
    const transformed = {};
    for (const [term, definition] of Object.entries(context)) {
      if (term.startsWith("@")) {
        transformed[term] = definition;
        continue;
      }
      const activeAlias = aliases.get(term);
      const alias =
        activeAlias ??
        (requiresLegacyTermAlias(term, definition) ? aliasFor(term) : term);
      if (alias !== term) {
        aliases.set(term, alias);
      }
      transformed[alias] = normalizeLegacyPrefixDefinition(definition);
    }
    return { aliases, context: transformed };
  };

  const transformValue = (value, inheritedAliases = new Map()) => {
    if (Array.isArray(value)) {
      return value.map((entry) => transformValue(entry, inheritedAliases));
    }
    if (!value || typeof value !== "object") {
      return value;
    }

    const localContext = Object.hasOwn(value, "@context")
      ? transformContext(value["@context"], inheritedAliases)
      : { aliases: new Map(inheritedAliases), context: undefined };
    const transformed = {};
    for (const [property, entry] of Object.entries(value)) {
      if (property === "@context") {
        transformed[property] = localContext.context;
      } else {
        transformed[localContext.aliases.get(property) || property] =
          transformValue(entry, localContext.aliases);
      }
    }
    return transformed;
  };

  return transformValue;
};

export const prepareJsonLd10Document = (document) =>
  createTransformer(document)(document);

export const rejectJsonLd10ListsOfLists = (value) => {
  if (Array.isArray(value)) {
    for (const entry of value) {
      rejectJsonLd10ListsOfLists(entry);
    }
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  if (Object.hasOwn(value, "@list")) {
    const entries = Array.isArray(value["@list"])
      ? value["@list"]
      : [value["@list"]];
    if (
      entries.some(
        (entry) =>
          entry && typeof entry === "object" && Object.hasOwn(entry, "@list"),
      )
    ) {
      throw new OWLSyntaxError(
        "JSON-LD 1.0 does not permit a list to contain another list",
        { syntax: "JSON-LD" },
      );
    }
  }
  for (const entry of Object.values(value)) {
    rejectJsonLd10ListsOfLists(entry);
  }
};
