import {
  OWLOntologyStorageError,
  OWLStorerNotFoundError,
} from "../../io/errors.js";
import {
  replaceStringDocumentTargetText,
  appendStringDocumentTargetText,
  StringDocumentTarget,
} from "../../io/stringDocumentTarget.js";
import {
  isStreamDocumentTarget,
  writeStreamDocumentTarget,
} from "../../io/streamDocumentTarget.js";
import { utf8Chunks } from "./utf8ChunkWriter.js";
import {
  OWLDocumentFormat,
  readDocumentFormatParameters,
} from "../../model/owlDocumentFormat.js";
import { functionalSyntaxStorer } from "./functional/functionalSyntaxStorer.js";
import { rdfXmlStorer } from "./rdfxml/rdfXmlStorer.js";
import { turtleStorer } from "./turtle/turtleStorer.js";
import { owlXmlStorer } from "./owlxml/owlXmlStorer.js";
import { visitStructuralValues } from "../model/sourceEvidence.js";
import { snapshotAxioms } from "./snapshotValues.js";
import { OWLObjectKind } from "../../model/kinds.js";
const swrlFormats = new Set([
  functionalSyntaxStorer.formatKey,
  rdfXmlStorer.formatKey,
  turtleStorer.formatKey,
]);
import { defaultBehaviorProfileDefinition } from "../behavior/ontologyBehaviorContext.js";
import { readPartialStorageOutput } from "./storageFailureOutput.js";

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
      const { formatKey, render, renderBytes } = storer ?? {};
      if (
        typeof formatKey !== "string" ||
        formatKey.length === 0 ||
        typeof render !== "function" ||
        (renderBytes !== undefined && typeof renderBytes !== "function")
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
        Object.freeze({ formatKey, render, renderBytes }),
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
  async store(
    ontologySnapshot,
    format,
    target,
    writerContext,
    behaviorProfileDefinition = defaultBehaviorProfileDefinition,
  ) {
    const { documentStoragePolicy } = behaviorProfileDefinition;
    requireDocumentFormat(format);
    const streamed = isStreamDocumentTarget(target);
    if (!streamed) StringDocumentTarget.prototype.toString.call(target);
    const storer = this.select(format);
    try {
      if (
        !documentStoragePolicy.supportsScopedSwrl ||
        !swrlFormats.has(format.key)
      ) {
        for (const axiom of snapshotAxioms(ontologySnapshot) ?? []) {
          if (axiom.kind === OWLObjectKind.SWRL_RULE)
            throw new OWLOntologyStorageError(
              "The selected profile and format cannot represent SWRL rules",
              {
                reason: "ONTOLOGY_NOT_REPRESENTABLE",
                format: format.key,
                kind: axiom.kind,
              },
            );
        }
      }
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
      if (streamed && storer.renderBytes) {
        const chunks = await storer.renderBytes(
          ontologySnapshot,
          format,
          writerContext,
          documentStoragePolicy,
          behaviorProfileDefinition,
        );
        await writeStreamDocumentTarget(target, chunks);
        return;
      }
      const completeText = await storer.render(
        ontologySnapshot,
        format,
        writerContext,
        documentStoragePolicy,
        behaviorProfileDefinition,
      );
      if (streamed)
        await writeStreamDocumentTarget(target, utf8Chunks([completeText]));
      else if (documentStoragePolicy.targetPublication === "append")
        appendStringDocumentTargetText(target, completeText);
      else replaceStringDocumentTargetText(target, completeText);
    } catch (cause) {
      const partialOutput = readPartialStorageOutput(cause);
      if (
        !streamed &&
        documentStoragePolicy.targetPublication === "append" &&
        partialOutput !== undefined
      )
        appendStringDocumentTargetText(target, partialOutput);
      if (cause instanceof OWLOntologyStorageError) throw cause;
      throw new OWLOntologyStorageError("The ontology could not be stored", {
        cause,
      });
    }
  }
}

/** Each manager owns its registry; public construction accepts no storer hook. */
export const createDefaultStorerRegistry = () =>
  new StorerRegistry([
    functionalSyntaxStorer,
    rdfXmlStorer,
    turtleStorer,
    owlXmlStorer,
  ]);
