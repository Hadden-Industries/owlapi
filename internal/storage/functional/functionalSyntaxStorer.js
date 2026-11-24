import { OWLDocumentFormats } from "../../../formats/index.js";
import {
  renderFunctionalSyntax,
  renderFunctionalSyntaxChunks,
} from "./functionalSyntaxRenderer.js";
import { defaultDocumentStoragePolicy } from "../../behavior/ontologyBehaviorContext.js";
import { utf8Chunks } from "../utf8ChunkWriter.js";
import {
  readStorageFormatParameters,
  readForceStringDatatype,
} from "../storageFormatParameters.js";

const rendererOptions = (format, policy) => {
  const parameters = readStorageFormatParameters(format, policy);
  return {
    forceXsdString:
      policy.functionalStringDatatypeDefault === "explicit" ||
      readForceStringDatatype(parameters),
  };
};

/** Package-private descriptor; target mutation belongs only to the registry. */
export const functionalSyntaxStorer = Object.freeze({
  formatKey: OWLDocumentFormats.FUNCTIONAL.key,
  render(
    snapshot,
    format,
    _writerContext,
    policy = defaultDocumentStoragePolicy,
  ) {
    return renderFunctionalSyntax(snapshot, rendererOptions(format, policy));
  },
  renderBytes(snapshot, format, _writerContext, policy) {
    return utf8Chunks(
      renderFunctionalSyntaxChunks(snapshot, rendererOptions(format, policy)),
    );
  },
});
