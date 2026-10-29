import {
  OWL_NAMESPACE as OWL,
  XML_NAMESPACE as XML,
} from "../../rdfjs/vocabulary.js";
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
import {
  initializeJavaOwlXmlDocument,
  serializeJavaOwlXmlDocument,
} from "./owlXmlPresentation.js";
import { retainPartialStorageOutput } from "../storageFailureOutput.js";
import { visitStructuralValues } from "../../model/sourceEvidence.js";
import { XSD_NAMESPACE } from "../../rdfjs/vocabulary.js";

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
  render(
    snapshot,
    format,
    writerContext,
    documentStoragePolicy = defaultDocumentStoragePolicy,
  ) {
    const parameters = readStorageFormatParameters(
      format,
      documentStoragePolicy,
    );
    const usesJavaPresentation =
      documentStoragePolicy.owlXmlPresentation === "java-writer";
    let forceXsdString = !usesJavaPresentation;
    const document = new DOMImplementation().createDocument(
      OWL,
      "Ontology",
      null,
    );
    const serializer = new XMLSerializer();
    const validate = createStructuralValidator();
    const root = document.documentElement;
    if (usesJavaPresentation)
      initializeJavaOwlXmlDocument(document, snapshot.ontologyID);
    const labels = new Map();
    let constructionBytes = 0;
    const encoder = new TextEncoder();
    const byteLength = (value) =>
      /^\p{ASCII}*$/u.test(value)
        ? value.length
        : encoder.encode(value).byteLength;
    const admit = (value) => {
      if (typeof value !== "string" || !value.isWellFormed())
        fail("OWL/XML requires well-formed Unicode");
      // XML 1.0 explicitly excludes these controls; this is validation, not matching document content.
      if (
        documentStoragePolicy.requiresXml10Characters &&
        // eslint-disable-next-line no-control-regex
        /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/u.test(value)
      )
        fail("OWL/XML requires XML 1.0-compatible characters");
      constructionBytes += byteLength(value);
      if (constructionBytes > documentStoragePolicy.maxOutputBytes)
        throw new ResourceLimitError("OWL/XML output byte limit exceeded", {
          resource: "outputBytes",
          limit: documentStoragePolicy.maxOutputBytes,
        });
      // Character admission is complete above. The native serializer's
      // non-strict Text path only escapes <, > and &, so serializing a throwaway
      // Text node here adds no validation. Serialize the actual document below.
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
    const declarationAxioms = sorted(
      snapshot.directAxioms.filter(
        (axiom) => axiom.kind === K.DECLARATION_AXIOM,
      ),
    );
    const declared = new Set(
      declarationAxioms.map((axiom) => axiom.entity.structuralKey()),
    );
    let hasUndeclaredEntity = false;
    if (usesJavaPresentation)
      visitStructuralValues(
        [snapshot.directOntologyAnnotations, snapshot.directAxioms],
        (value) => {
          if (
            ENTITY_KINDS.includes(value.kind) &&
            !declared.has(value.structuralKey())
          )
            hasUndeclaredEntity = true;
        },
      );
    const configurationBoundary = {};
    const values = [
      ...sorted(snapshot.directOntologyAnnotations),
      ...(usesJavaPresentation
        ? [
            ...declarationAxioms,
            configurationBoundary,
            ...sorted(
              snapshot.directAxioms.filter(
                (axiom) => axiom.kind !== K.DECLARATION_AXIOM,
              ),
            ),
          ]
        : sorted(snapshot.directAxioms)),
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
      if (value === configurationBoundary) {
        if (hasUndeclaredEntity) {
          try {
            forceXsdString = readForceStringDatatype(parameters);
          } catch (cause) {
            throw retainPartialStorageOutput(
              new OWLOntologyStorageError(
                "OWL/XML string datatype configuration is invalid",
                { cause },
              ),
              serializeJavaOwlXmlDocument(document, serializer, writerContext, {
                completed: false,
              }),
            );
          }
        }
        continue;
      }
      if (exiting) {
        validate(value);
        active.delete(value);
        continue;
      }
      if (depth > documentStoragePolicy.maxStructureDepth)
        throw new ResourceLimitError("OWL/XML output depth limit exceeded", {
          resource: "outputDepth",
          limit: documentStoragePolicy.maxStructureDepth,
        });
      if (annotationDepth > documentStoragePolicy.maxAnnotationDepth)
        throw new ResourceLimitError(
          "OWL/XML annotation depth limit exceeded",
          {
            resource: "annotationDepth",
            limit: documentStoragePolicy.maxAnnotationDepth,
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
        else if (
          forceXsdString ||
          value.datatype.iri.value !== `${XSD_NAMESPACE}string`
        )
          attribute(element, "datatypeIRI", iri(value.datatype.iri));
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
    // Escape value whitespace before adding layout; parsed literal content must
    // survive XML end-of-line normalization in either presentation.
    const valueSerializer = {
      serializeToString: (node) =>
        serializer.serializeToString(node).replaceAll("\r", "&#13;"),
    };
    const text = usesJavaPresentation
      ? serializeJavaOwlXmlDocument(document, valueSerializer, writerContext)
      : `<?xml version="1.0" encoding="UTF-8"?>\n${serializer.serializeToString(document).replaceAll("\r", "&#13;").replaceAll("\n", "&#10;").replaceAll("\t", "&#9;")}\n`;
    if (byteLength(text) > documentStoragePolicy.maxOutputBytes)
      throw new ResourceLimitError("OWL/XML output byte limit exceeded", {
        resource: "outputBytes",
        limit: documentStoragePolicy.maxOutputBytes,
      });
    return text;
  },
});
