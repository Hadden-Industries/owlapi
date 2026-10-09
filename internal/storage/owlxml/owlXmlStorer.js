import { parseIri } from "@hyperjump/uri";
import { DOMImplementation, XMLSerializer } from "@xmldom/xmldom";
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
import { readDocumentFormatParameters } from "../../../model/owlDocumentFormat.js";
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

const OWL = "http://www.w3.org/2002/07/owl#";
const XML = "http://www.w3.org/XML/1998/namespace";
const MAX_OUTPUT_BYTES = 33554432;
const MAX_NODE_DEPTH = 512;
const MAX_ANNOTATION_DEPTH = 64;
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

/** OWL/XML uses the finite W3C grammar and canonical model fields. DOM escaping
 * is shared with RDF/XML. Numeric whitespace references preserve lexical data
 * through XML end-of-line and attribute normalization.
 */
export const owlXmlStorer = Object.freeze({
  formatKey: OWLDocumentFormats.OWL_XML.key,
  render(snapshot, format) {
    if (Object.keys(readDocumentFormatParameters(format)).length)
      throw new OWLOntologyStorageError(
        "OWL/XML storage does not support output parameters",
      );
    const document = new DOMImplementation().createDocument(
      OWL,
      "Ontology",
      null,
    );
    const serializer = new XMLSerializer();
    const validate = createStructuralValidator();
    const root = document.documentElement;
    const labels = new Map();
    let constructionBytes = 0;
    const encoder = new TextEncoder();
    const admit = (value) => {
      if (typeof value !== "string" || !value.isWellFormed())
        fail("OWL/XML requires well-formed Unicode");
      // XML 1.0 explicitly excludes these controls; this is validation, not matching document content.
      // eslint-disable-next-line no-control-regex
      if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/u.test(value))
        fail("OWL/XML requires XML 1.0-compatible characters");
      constructionBytes += encoder.encode(value).byteLength;
      if (constructionBytes > MAX_OUTPUT_BYTES)
        throw new ResourceLimitError("OWL/XML output byte limit exceeded", {
          resource: "outputBytes",
          limit: MAX_OUTPUT_BYTES,
        });
      try {
        serializer.serializeToString(document.createTextNode(value));
      } catch {
        fail("OWL/XML requires XML-compatible characters");
      }
      return value;
    };
    const iri = (value) => {
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
    };
    const attribute = (element, name, value, namespace = null) =>
      element.setAttributeNS(namespace, name, admit(value));
    validateStructuralShape(snapshot.ontologyID);
    validate(snapshot.ontologyID);
    if (snapshot.ontologyID.ontologyIRI)
      attribute(root, "ontologyIRI", iri(snapshot.ontologyID.ontologyIRI));
    if (snapshot.ontologyID.versionIRI)
      attribute(root, "versionIRI", iri(snapshot.ontologyID.versionIRI));
    const sorted = (values) =>
      [...values].sort((a, b) =>
        a.structuralKey() < b.structuralKey()
          ? -1
          : a.structuralKey() > b.structuralKey()
            ? 1
            : 0,
      );
    for (const declaration of sorted(snapshot.authoredImportDeclarations)) {
      validateStructuralShape(declaration);
      validate(declaration);
      const element = document.createElementNS(OWL, "Import");
      element.appendChild(document.createTextNode(iri(declaration.iri)));
      root.appendChild(element);
    }
    const values = [
      ...sorted(snapshot.directOntologyAnnotations),
      ...sorted(snapshot.directAxioms),
    ];
    const pending = values.reverse().map((value) => ({
      value,
      parent: root,
      depth: 2,
      annotationDepth: value.kind === K.ANNOTATION ? 1 : 0,
      exiting: false,
    }));
    const active = new Set();
    while (pending.length) {
      const { value, parent, depth, annotationDepth, exiting } = pending.pop();
      if (exiting) {
        validate(value);
        active.delete(value);
        continue;
      }
      if (depth > MAX_NODE_DEPTH)
        throw new ResourceLimitError("OWL/XML output depth limit exceeded", {
          resource: "outputDepth",
          limit: MAX_NODE_DEPTH,
        });
      if (annotationDepth > MAX_ANNOTATION_DEPTH)
        throw new ResourceLimitError(
          "OWL/XML annotation depth limit exceeded",
          {
            resource: "annotationDepth",
            limit: MAX_ANNOTATION_DEPTH,
          },
        );
      if (active.has(value)) fail("Cyclic OWL/XML structural input");
      validateStructuralShape(value);
      const tag =
        value.kind === K.SUB_PROPERTY_CHAIN_AXIOM
          ? "SubObjectPropertyOf"
          : value.kind.slice(3).replace(/Axiom$/u, "");
      if (value.kind !== K.IRI && !tags.has(tag))
        fail(`Unsupported OWL/XML kind ${value.kind}`);
      const element = document.createElementNS(
        OWL,
        value.kind === K.IRI ? "IRI" : tag,
      );
      admit(tag);
      parent.appendChild(element);
      active.add(value);
      pending.push({ value, exiting: true });
      if (ENTITY_KINDS.includes(value.kind)) {
        attribute(element, "IRI", iri(value.iri));
        continue;
      }
      if (value.kind === K.IRI) {
        element.appendChild(document.createTextNode(iri(value)));
        continue;
      }
      if (value.kind === K.ANONYMOUS_INDIVIDUAL) {
        const key = value.structuralKey();
        if (!labels.has(key)) labels.set(key, `genid${labels.size}`);
        attribute(element, "nodeID", labels.get(key));
        continue;
      }
      if (value.kind === K.LITERAL) {
        validateStructuralShape(value.datatype);
        validate(value.datatype);
        if (value.language) attribute(element, "xml:lang", value.language, XML);
        else attribute(element, "datatypeIRI", iri(value.datatype.iri));
        element.appendChild(document.createTextNode(admit(value.lexicalForm)));
        continue;
      }
      if (value.kind === K.FACET_RESTRICTION)
        attribute(element, "facet", iri(value.facet));
      if (value.cardinality !== undefined)
        attribute(element, "cardinality", String(value.cardinality));
      const bodyFields = structuralFields
        .get(value.kind)
        .filter(
          (field) => !["annotations", "cardinality", "facet"].includes(field),
        );
      const children =
        AXIOM_KINDS.includes(value.kind) || value.kind === K.ANNOTATION
          ? value.annotations.map((child) => ({
              value: child,
              parent: element,
            }))
          : [];
      for (const field of bodyFields) {
        if (value.kind === K.SUB_PROPERTY_CHAIN_AXIOM && field === "chain") {
          const chain = document.createElementNS(OWL, "ObjectPropertyChain");
          element.appendChild(chain);
          children.push(
            ...value.chain.map((child) => ({ value: child, parent: chain })),
          );
        } else {
          const content =
            minimumTwoSetFields.get(value.kind) === field
              ? repeatSingleton(value[field])
              : value[field];
          for (const child of Array.isArray(content) ? content : [content])
            if (child !== undefined)
              children.push({ value: child, parent: element });
        }
      }
      for (let index = children.length - 1; index >= 0; index--)
        pending.push({
          ...children[index],
          depth: depth + 1,
          annotationDepth:
            annotationDepth +
            (children[index].value.kind === K.ANNOTATION ? 1 : 0),
          exiting: false,
        });
    }
    const text = `<?xml version="1.0" encoding="UTF-8"?>\n${serializer.serializeToString(document).replaceAll("\r", "&#13;").replaceAll("\n", "&#10;").replaceAll("\t", "&#9;")}\n`;
    if (encoder.encode(text).byteLength > MAX_OUTPUT_BYTES)
      throw new ResourceLimitError("OWL/XML output byte limit exceeded", {
        resource: "outputBytes",
        limit: MAX_OUTPUT_BYTES,
      });
    return text;
  },
});
