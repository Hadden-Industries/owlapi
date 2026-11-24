import { XSD_NAMESPACE } from "../../rdfjs/vocabulary.js";
import { parseIri } from "@hyperjump/uri";
import { OWLDocumentFormats } from "../../../formats/index.js";
import {
  OWLOntologyStorageError,
  ResourceLimitError,
} from "../../../io/errors.js";
import {
  AXIOM_KINDS,
  ENTITY_KINDS,
  OWLObjectKind as K,
} from "../../../model/kinds.js";
import { StructuralSet } from "../../../model/structural.js";
import { structuralFields } from "../../model/structuralFields.js";
import {
  minimumTwoSetFields,
  repeatSingleton,
} from "../../model/setConstructs.js";
import {
  createStructuralValidator,
  validateStructuralShape,
} from "../../model/structuralValidation.js";
import { OWLXML_GRAMMAR } from "../../parsing/owlxml/grammar.js";
import { defaultDocumentStoragePolicy } from "../../behavior/ontologyBehaviorContext.js";
import {
  readStorageFormatParameters,
  readForceStringDatatype,
} from "../storageFormatParameters.js";
import { owlXmlHeader, owlXmlPrefixes } from "./owlXmlPresentation.js";
import {
  collectStorageText,
  failAfterStoragePrefix,
} from "../storageFailureOutput.js";
import { visitStructuralValues } from "../../model/sourceEvidence.js";
import { snapshotAxioms, sortedStructuralValues } from "../snapshotValues.js";
import {
  xmlAttribute,
  xmlText,
  xmlTextChunks,
  isXmlText,
  utf8Length,
} from "../xmlTokens.js";
import { utf8Chunks } from "../utf8ChunkWriter.js";

const tags = new Set([
  ...OWLXML_GRAMMAR.axioms,
  ...OWLXML_GRAMMAR.classExpressions,
  ...OWLXML_GRAMMAR.dataRanges,
  ...OWLXML_GRAMMAR.entities,
  ...OWLXML_GRAMMAR.objectPropertyExpressions,
  "Annotation",
  "Literal",
  "IRI",
  "AnonymousIndividual",
  "FacetRestriction",
]);
const fail = (message) => {
  throw new OWLOntologyStorageError(message, {
    reason: "ONTOLOGY_NOT_REPRESENTABLE",
  });
};
const chainTag = Symbol("ObjectPropertyChain");

function* children(value) {
  // The Java-compatible writer attaches the chain container before the
  // annotation siblings, then fills its operands in their authored order.
  if (value.kind === K.SUB_PROPERTY_CHAIN_AXIOM)
    yield { kind: chainTag, chain: value.chain };
  if (AXIOM_KINDS.includes(value.kind) || value.kind === K.ANNOTATION)
    yield* value.annotations;
  for (const field of structuralFields.get(value.kind)) {
    if (
      ["annotations", "cardinality", "facet"].includes(field) ||
      (value.kind === K.SUB_PROPERTY_CHAIN_AXIOM && field === "chain")
    )
      continue;
    const result =
      minimumTwoSetFields.get(value.kind) === field
        ? repeatSingleton(value[field])
        : value[field];
    if (Array.isArray(result)) yield* result;
    else if (result !== undefined) yield result;
  }
}

/** Emit XML start, content and end tokens while retaining only the active path. */
function* owlXmlFragments(
  snapshot,
  format,
  writer,
  policy = defaultDocumentStoragePolicy,
) {
  const parameters = readStorageFormatParameters(format, policy);
  const java = policy.owlXmlPresentation === "java-writer";
  const width = java && writer.indenting ? Math.max(0, writer.indentSize) : 0;
  const pad = (depth) => (java ? "\n" + " ".repeat(width * depth) : "");
  const validate = createStructuralValidator();
  let constructionBytes = 0;
  function admit(value) {
    if (typeof value !== "string" || !value.isWellFormed())
      fail("OWL/XML requires well-formed Unicode");
    if (policy.requiresXml10Characters && !isXmlText(value))
      fail("OWL/XML requires XML 1.0-compatible characters");
    if (policy.maxOutputBytes !== Infinity)
      constructionBytes += utf8Length(value);
    if (constructionBytes > policy.maxOutputBytes)
      throw new ResourceLimitError("OWL/XML output byte limit exceeded", {
        resource: "outputBytes",
        limit: policy.maxOutputBytes,
      });
    return value;
  }
  function iri(value) {
    validateStructuralShape(value);
    if (value.kind !== K.IRI) fail("OWL/XML requires an IRI");
    validate(value);
    const text = admit(value.value);
    try {
      parseIri(text);
    } catch {
      fail("OWL/XML requires a full IRI");
    }
    return text;
  }
  const attribute = (name, value) => " " + xmlAttribute(name, admit(value));
  const labels = new Map(),
    active = new Set();
  let forceXsdString = !java;
  function* element(root) {
    const pending = [
      {
        value: root,
        depth: 2,
        level: 1,
        annotations: root.kind === K.ANNOTATION ? 1 : 0,
      },
    ];
    while (pending.length) {
      const frame = pending.at(-1);
      const { value, depth, level, annotations } = frame;
      const chain = value.kind === chainTag;
      if (frame.children) {
        const next = frame.children.next();
        if (!next.done) {
          const child = next.value;
          pending.push({
            value: child,
            depth: depth + (chain ? 0 : 1),
            level: level + 1,
            annotations: annotations + Number(child.kind === K.ANNOTATION),
          });
          continue;
        }
        if (!chain) {
          validate(value);
          active.delete(value);
        }
        yield pad(level) + "</" + frame.tag + ">";
        pending.pop();
        continue;
      }
      if (!chain) {
        if (depth > policy.maxStructureDepth)
          throw new ResourceLimitError("OWL/XML output depth limit exceeded", {
            resource: "outputDepth",
            limit: policy.maxStructureDepth,
          });
        if (annotations > policy.maxAnnotationDepth)
          throw new ResourceLimitError(
            "OWL/XML annotation depth limit exceeded",
            { resource: "annotationDepth", limit: policy.maxAnnotationDepth },
          );
        if (active.has(value)) fail("Cyclic OWL/XML structural input");
        validateStructuralShape(value);
      }
      const tag = chain
        ? "ObjectPropertyChain"
        : value.kind === K.IRI
          ? "IRI"
          : value.kind === K.SUB_PROPERTY_CHAIN_AXIOM
            ? "SubObjectPropertyOf"
            : value.kind.slice(3).replace(/Axiom$/u, "");
      if (!chain && !tags.has(tag))
        fail("Unsupported OWL/XML kind " + value.kind);
      if (!chain) admit(value.kind === K.IRI ? value.kind.slice(3) : tag);
      let opening = pad(level) + "<" + tag,
        text;
      if (!chain && ENTITY_KINDS.includes(value.kind))
        opening += attribute("IRI", iri(value.iri));
      else if (value.kind === K.IRI) text = iri(value);
      else if (value.kind === K.ANONYMOUS_INDIVIDUAL) {
        const key = value.structuralKey();
        if (!labels.has(key)) labels.set(key, "genid" + labels.size);
        opening += attribute("nodeID", labels.get(key));
      } else if (value.kind === K.LITERAL) {
        validateStructuralShape(value.datatype);
        validate(value.datatype);
        if (value.language) opening += attribute("xml:lang", value.language);
        else if (
          forceXsdString ||
          value.datatype.iri.value !== XSD_NAMESPACE + "string"
        )
          opening += attribute("datatypeIRI", iri(value.datatype.iri));
        text = admit(value.lexicalForm);
      } else {
        if (value.kind === K.FACET_RESTRICTION)
          opening += attribute("facet", iri(value.facet));
        if (value.cardinality !== undefined)
          opening += attribute("cardinality", String(value.cardinality));
        const items = chain ? value.chain.values() : children(value);
        const next = items.next();
        if (!next.done) {
          frame.children = items;
          frame.tag = tag;
          if (!chain) active.add(value);
          yield opening + ">";
          const child = next.value;
          pending.push({
            value: child,
            depth: depth + (chain ? 0 : 1),
            level: level + 1,
            annotations: annotations + Number(child.kind === K.ANNOTATION),
          });
          continue;
        }
      }
      if (!chain) validate(value);
      if (text === undefined) yield opening + "/>";
      else {
        yield opening + ">";
        yield* xmlTextChunks(text, java ? "java" : "compact");
        yield "</" + tag + ">";
      }
      pending.pop();
    }
  }

  validateStructuralShape(snapshot.ontologyID);
  validate(snapshot.ontologyID);
  const header = owlXmlHeader(snapshot.ontologyID, java, width, (value) =>
    admit(iri(value)),
  );
  const axioms = sortedStructuralValues(snapshotAxioms(snapshot));
  function* content() {
    if (java)
      for (const [name, uri] of owlXmlPrefixes)
        yield (
          pad(1) +
          "<Prefix " +
          xmlAttribute("name", name) +
          " " +
          xmlAttribute("IRI", uri) +
          "/>"
        );
    for (const declaration of sortedStructuralValues(
      snapshot.authoredImportDeclarations,
    )) {
      validateStructuralShape(declaration);
      validate(declaration);
      yield (
        pad(1) +
        "<Import>" +
        xmlText(iri(declaration.iri), java ? "java" : "compact") +
        "</Import>"
      );
    }
    for (const annotation of sortedStructuralValues(
      snapshot.directOntologyAnnotations,
    ))
      yield* element(annotation);
    if (java) {
      const declared = new StructuralSet();
      for (const axiom of axioms)
        if (axiom.kind === K.DECLARATION_AXIOM) {
          declared.add(axiom.entity);
          yield* element(axiom);
        }
      let undeclared = false;
      for (const values of [snapshot.directOntologyAnnotations, axioms]) {
        for (const root of values) {
          visitStructuralValues(root, (value) => {
            if (ENTITY_KINDS.includes(value.kind) && !declared.has(value))
              undeclared = true;
          });
          if (undeclared) break;
        }
        if (undeclared) break;
      }
      if (undeclared) {
        try {
          forceXsdString = readForceStringDatatype(parameters);
        } catch (cause) {
          yield "\n";
          failAfterStoragePrefix(
            new OWLOntologyStorageError(
              "OWL/XML string datatype configuration is invalid",
              { cause },
            ),
            // The Java error prefix preserves raw CR in character data. XML
            // attributes still use numeric references, including their CRs.
            (prefix) =>
              prefix.replace(/>[^<]+</gu, (text) =>
                text.replaceAll("&#13;", "\r"),
              ),
          );
        }
      }
    }
    for (const axiom of axioms)
      if (!java || axiom.kind !== K.DECLARATION_AXIOM) yield* element(axiom);
  }
  const body = content(),
    first = body.next();
  yield (
    (java
      ? '<?xml version="1.0"?>\n'
      : '<?xml version="1.0" encoding="UTF-8"?>\n') +
    header +
    (first.done ? "/>" : ">")
  );
  if (!first.done) {
    yield first.value;
    yield* body;
    yield pad(0) + "</Ontology>";
  }
  yield "\n";
}

function* checkedFragments(
  snapshot,
  format,
  writer,
  policy = defaultDocumentStoragePolicy,
) {
  let bytes = 0;
  for (const text of owlXmlFragments(snapshot, format, writer, policy)) {
    if (policy.maxOutputBytes !== Infinity) bytes += utf8Length(text);
    if (bytes > policy.maxOutputBytes)
      throw new ResourceLimitError("OWL/XML output byte limit exceeded", {
        resource: "outputBytes",
        limit: policy.maxOutputBytes,
      });
    yield text;
  }
}

export const owlXmlStorer = Object.freeze({
  formatKey: OWLDocumentFormats.OWL_XML.key,
  render: (...args) => collectStorageText(checkedFragments(...args)),
  renderBytes: (...args) => utf8Chunks(checkedFragments(...args)),
});
