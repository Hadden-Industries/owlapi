import { PUBLIC_MODEL_CASES } from "./public-model-cases.js";
/** Shared producer-only shape probes for Node and existing browser/worker modes. */
export const createPublicModelProbes = (owl) => {
  const factory = owl.OWLManager.createOWLOntologyManager().getOWLDataFactory();
  const values = {
    classA: factory.getOWLClass(owl.IRI.create("urn:contract:A")),
    classB: factory.getOWLClass(owl.IRI.create("urn:contract:B")),
    classC: factory.getOWLClass(owl.IRI.create("urn:contract:C")),
    propertyP: factory.getOWLObjectProperty(owl.IRI.create("urn:contract:p")),
    propertyQ: factory.getOWLObjectProperty(owl.IRI.create("urn:contract:q")),
    dataP: factory.getOWLDataProperty(owl.IRI.create("urn:contract:d")),
    dataQ: factory.getOWLDataProperty(owl.IRI.create("urn:contract:e")),
    annotationP: factory.getOWLAnnotationProperty(
      owl.IRI.create("urn:contract:label"),
    ),
    annotationQ: factory.getOWLAnnotationProperty(
      owl.IRI.create("urn:contract:note"),
    ),
    datatype: factory.getOWLDatatype(
      owl.IRI.create("http://www.w3.org/2001/XMLSchema#integer"),
    ),
    otherDatatype: factory.getOWLDatatype(
      owl.IRI.create("http://www.w3.org/2001/XMLSchema#string"),
    ),
    literal: factory.getOWLLiteral(
      "0001",
      owl.IRI.create("http://www.w3.org/2001/XMLSchema#integer"),
    ),
    otherLiteral: factory.getOWLLiteral("word", "en"),
    individualA: factory.getOWLNamedIndividual(
      owl.IRI.create("urn:contract:alice"),
    ),
    individualB: factory.getOWLNamedIndividual(
      owl.IRI.create("urn:contract:bob"),
    ),
    iriA: owl.IRI.create("urn:contract:A"),
  };
  values.facet = factory.getOWLFacetRestriction(
    owl.IRI.create("http://www.w3.org/2001/XMLSchema#minInclusive"),
    values.literal,
  );
  const resolveValue = (value) =>
    Array.isArray(value)
      ? value.map(resolveValue)
      : typeof value === "string"
        ? values[value]
        : value;

  return {
    values,
    probes: PUBLIC_MODEL_CASES.map(([kind, arguments_, fields]) => ({
      kind,
      value: factory[`get${kind}`](...arguments_.map(resolveValue)),
      fields: Object.fromEntries(
        Object.entries(fields).map(([field, expected]) => [
          field,
          resolveValue(expected),
        ]),
      ),
    })),
  };
};

export const exercisePublicModelFields = (owl) => {
  const { probes } = createPublicModelProbes(owl);
  for (const { kind, value, fields } of probes) {
    if (value.kind !== kind) throw new Error(`Public kind differs: ${kind}`);
    for (const [field, expected] of Object.entries(fields))
      if (JSON.stringify(value[field]) !== JSON.stringify(expected))
        throw new Error(`Public model field differs: ${kind}.${field}`);
    if (kind.endsWith("Axiom") && JSON.stringify(value.annotations) !== "[]")
      throw new Error(`Public axiom annotations differ: ${kind}`);
  }
  return probes.length;
};
