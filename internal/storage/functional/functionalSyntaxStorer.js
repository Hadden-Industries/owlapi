import { OWLDocumentFormats } from "../../../formats/index.js";
import { renderFunctionalSyntax } from "./functionalSyntaxRenderer.js";
import { defaultDocumentStoragePolicy } from "../../behavior/ontologyBehaviorContext.js";
import {
  readStorageFormatParameters,
  readForceStringDatatype,
} from "../storageFormatParameters.js";

/** Package-private descriptor; target mutation belongs only to the registry. */
export const functionalSyntaxStorer = Object.freeze({
  formatKey: OWLDocumentFormats.FUNCTIONAL.key,
  render(
    snapshot,
    format,
    _writerContext,
    policy = defaultDocumentStoragePolicy,
  ) {
    const parameters = readStorageFormatParameters(format, policy);
    return renderFunctionalSyntax(snapshot, {
      forceXsdString:
        policy.functionalStringDatatypeDefault === "explicit" ||
        readForceStringDatatype(parameters),
    });
  },
});
