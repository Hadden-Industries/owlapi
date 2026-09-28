import { OWLDocumentFormats } from "../../../formats/index.js";
import { OWLOntologyStorageError } from "../../../io/errors.js";
import { readDocumentFormatParameters } from "../../../model/owlDocumentFormat.js";
import { renderFunctionalSyntax } from "./functionalSyntaxRenderer.js";

/** Package-private descriptor; target mutation belongs only to the registry. */
export const functionalSyntaxStorer = Object.freeze({
  formatKey: OWLDocumentFormats.FUNCTIONAL.key,
  render(snapshot, format) {
    if (Object.keys(readDocumentFormatParameters(format)).length !== 0) {
      throw new OWLOntologyStorageError(
        "Functional Syntax storage does not support output parameters",
      );
    }
    return renderFunctionalSyntax(snapshot);
  },
});
