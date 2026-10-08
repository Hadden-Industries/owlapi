import {
  OWLOntologyStorageError,
  OWLStorerNotFoundError,
} from "../../io/errors.js";
import {
  replaceStringDocumentTargetText,
  StringDocumentTarget,
} from "../../io/stringDocumentTarget.js";
import {
  OWLDocumentFormat,
  readDocumentFormatParameters,
} from "../../model/owlDocumentFormat.js";
import { functionalSyntaxStorer } from "./functional/functionalSyntaxStorer.js";
import { rdfXmlStorer } from "./rdfxml/rdfXmlStorer.js";
import { visitStructuralValues } from "../model/sourceEvidence.js";

const requireDocumentFormat = (format) => {
  if (!(format instanceof OWLDocumentFormat) || !Object.isFrozen(format)) {
    throw new TypeError("format must be an OWLDocumentFormat");
  }
  // Invoke the native private-field-bearing friend, not a caller override:
  // prototype lookalikes and proxies must not impersonate an immutable format.
  readDocumentFormatParameters(format);
};

/** Package-private exact-format storer selection and complete-text storage. */
export class StorerRegistry {
  #storersByFormatKey = new Map();

  /** Capture immutable descriptors; one format can have exactly one storer. */
  constructor(storers) {
    for (const storer of storers) {
      const { formatKey, render } = storer ?? {};
      if (
        typeof formatKey !== "string" ||
        formatKey.length === 0 ||
        typeof render !== "function"
      ) {
        throw new TypeError(
          "Each storer must have a nonempty formatKey and render function",
        );
      }
      if (this.#storersByFormatKey.has(formatKey)) {
        throw new TypeError(
          `Duplicate ontology storer format key: ${formatKey}`,
        );
      }
      this.#storersByFormatKey.set(
        formatKey,
        Object.freeze({ formatKey, render }),
      );
    }
    Object.freeze(this);
  }

  /** Select by the requested format key only, never by a syntax fallback. */
  select(format) {
    requireDocumentFormat(format);
    const storer = this.#storersByFormatKey.get(format.key);
    if (!storer) throw new OWLStorerNotFoundError(format);
    return storer;
  }

  /**
   * Render a committed ontology snapshot without giving the renderer a target.
   * Publish complete string text only after success; every failure retains the
   * previous target value. Invalid public arguments remain TypeErrors.
   */
  async store(ontologySnapshot, format, target, writerContext) {
    requireDocumentFormat(format);
    StringDocumentTarget.prototype.toString.call(target);
    const storer = this.select(format);
    try {
      if (
        ontologySnapshot.documentMetadata?.sourceStructure?.statements?.length
      ) {
        throw new OWLOntologyStorageError(
          "The selected OWL storer cannot represent retained RDFS source statements",
          {
            reason: "ONTOLOGY_NOT_REPRESENTABLE",
            sourceKind: "retained-rdfs",
            format: format.key,
          },
        );
      }
      const expressions =
        ontologySnapshot.documentMetadata?.sourceStructure?.expressions ?? [];
      if (expressions.length) {
        const represented = new Set();
        visitStructuralValues(
          [
            ontologySnapshot.directAxioms,
            ontologySnapshot.directOntologyAnnotations,
          ],
          (value) => {
            if (typeof value.structuralKey === "function")
              represented.add(value.structuralKey());
          },
        );
        if (
          expressions.some((value) => !represented.has(value.structuralKey()))
        )
          throw new OWLOntologyStorageError(
            "The selected OWL storer cannot represent unattached source expressions",
            {
              reason: "ONTOLOGY_NOT_REPRESENTABLE",
              sourceKind: "unattached-expression",
              format: format.key,
            },
          );
      }
      const completeText = await storer.render(
        ontologySnapshot,
        format,
        writerContext,
      );
      replaceStringDocumentTargetText(target, completeText);
    } catch (cause) {
      if (cause instanceof OWLOntologyStorageError) throw cause;
      throw new OWLOntologyStorageError("The ontology could not be stored", {
        cause,
      });
    }
  }
}

/** Each manager owns its registry; public construction accepts no storer hook. */
export const createDefaultStorerRegistry = () =>
  new StorerRegistry([functionalSyntaxStorer, rdfXmlStorer]);
