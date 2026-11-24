import { ENTITY_KINDS, OWLObjectKind as K } from "../model/kinds.js";
import {
  OWLStructuralObject,
  isCanonicalStructuralObject,
  isFactoryStructuralObject,
  nativeStructuralMethods,
} from "../model/structural.js";
import { ncNameSuffix } from "../internal/parsing/xml/xmlNames.js";

const ENTITY_KIND_SET = new Set(ENTITY_KINDS);

function checkTupleReceiver(value) {
  const method = OWLStructuralObject.prototype.toStructuralTuple;
  if (
    !isFactoryStructuralObject(value) ||
    method !== nativeStructuralMethods.toStructuralTuple
  ) {
    method.call(value);
  }
}

/** Package-private friend shared by label values and the selected provider. */
export const iriShortForm = (iri) => {
  if (!isCanonicalStructuralObject(iri) || iri.kind !== K.IRI)
    throw new TypeError("iri must be an IRI");
  checkTupleReceiver(iri);
  return ncNameSuffix(iri.value) ?? `<${iri.value}>`;
};

/** Java-compatible NCName-suffix display names; full IRI fallback. */
export class SimpleShortFormProvider {
  getShortForm(entity) {
    if (
      isFactoryStructuralObject(entity) &&
      ENTITY_KIND_SET.has(entity.kind) &&
      OWLStructuralObject.prototype.toStructuralTuple ===
        nativeStructuralMethods.toStructuralTuple &&
      OWLStructuralObject.prototype.structuralKey ===
        nativeStructuralMethods.structuralKey &&
      isFactoryStructuralObject(entity.iri) &&
      entity.iri.kind === K.IRI
    ) {
      return ncNameSuffix(entity.iri.value) ?? `<${entity.iri.value}>`;
    }
    if (
      !isCanonicalStructuralObject(entity) ||
      !ENTITY_KIND_SET.has(entity.kind)
    )
      throw new TypeError("entity must be a named OWL entity");
    // Authenticate the private brand without forcing a display-only key string.
    checkTupleReceiver(entity);
    return iriShortForm(entity.iri);
  }
  /** This stateless provider owns no disposable resources. */
  dispose() {}
}
