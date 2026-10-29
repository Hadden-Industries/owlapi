import { ENTITY_KINDS, OWLObjectKind as K } from "../model/kinds.js";
import {
  OWLStructuralObject,
  isCanonicalStructuralObject,
} from "../model/structural.js";
import { ncNameSuffix } from "../internal/parsing/xml/xmlNames.js";

/** Package-private friend shared by label values and the selected provider. */
export const iriShortForm = (iri) => {
  if (!isCanonicalStructuralObject(iri) || iri.kind !== K.IRI)
    throw new TypeError("iri must be an IRI");
  OWLStructuralObject.prototype.toStructuralTuple.call(iri);
  return ncNameSuffix(iri.value) ?? `<${iri.value}>`;
};

/** Java-compatible NCName-suffix display names; full IRI fallback. */
export class SimpleShortFormProvider {
  getShortForm(entity) {
    if (
      !isCanonicalStructuralObject(entity) ||
      !ENTITY_KINDS.includes(entity.kind)
    )
      throw new TypeError("entity must be a named OWL entity");
    // Authenticate the private brand without forcing a display-only key string.
    OWLStructuralObject.prototype.toStructuralTuple.call(entity);
    return iriShortForm(entity.iri);
  }
  /** This stateless provider owns no disposable resources. */
  dispose() {}
}
