import { OWLOntologyStorageError } from "../../io/errors.js";
import { readDocumentFormatParameters } from "../../model/owlDocumentFormat.js";

/** Read immutable format state at the consumer. Java ignores unknown keys;
 * normative storers reject settings outside their supported parameter set.
 */
export function readStorageFormatParameters(
  format,
  policy,
  supportedKeys = [],
) {
  const parameters = readDocumentFormatParameters(format);
  if (
    policy.rejectsUnknownFormatParameters &&
    Object.keys(parameters).some((key) => !supportedKeys.includes(key))
  )
    throw new OWLOntologyStorageError(
      `${format.key} storage does not support output parameters`,
    );
  return parameters;
}

/** Java's recognized Boolean parameter is cast when the renderer consumes it.
 * A missing or null value uses its native false default.
 */
export function readForceStringDatatype(parameters) {
  const value = parameters["force xsd:string on literals"] ?? false;
  if (typeof value !== "boolean")
    throw new TypeError("force xsd:string on literals must be a boolean");
  return value;
}
