import { OWLObjectKind as K } from "../../model/kinds.js";
import { readOntologySnapshot } from "../../model/owlOntology.js";
import { readSourceArity } from "./sourceArity.js";

const owl = "http://www.w3.org/2002/07/owl#";
const rdfs = "http://www.w3.org/2000/01/rdf-schema#";
const entityTypes = new Map([
  [K.CLASS, `${owl}Class`],
  [K.DATATYPE, `${rdfs}Datatype`],
  [K.OBJECT_PROPERTY, `${owl}ObjectProperty`],
  [K.DATA_PROPERTY, `${owl}DatatypeProperty`],
  [K.ANNOTATION_PROPERTY, `${owl}AnnotationProperty`],
  [K.NAMED_INDIVIDUAL, `${owl}NamedIndividual`],
]);
const managers = new WeakMap();
const sources = new WeakMap();

export const visitStructuralValues = (root, visit) => {
  const pending = [root];
  const seen = new Set();
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    visit(value);
    for (const child of Object.values(value)) pending.push(child);
  }
};

export const createSourceStructure = (ontology, retained = {}) => {
  const roles = new Map();
  const arityWitnesses = new Map();
  const declarations = new Set(
    [...ontology.getAxioms()]
      .filter((axiom) => axiom.kind === K.DECLARATION_AXIOM)
      .map((axiom) => axiom.entity.structuralKey()),
  );
  visitStructuralValues(
    [
      ...ontology.getAxioms(),
      ...ontology.getAnnotations(),
      ...(retained.expressions ?? []),
      ...(retained.statements ?? []),
    ],
    (value) => {
      const type = entityTypes.get(value.kind);
      if (type)
        roles.set(
          value.structuralKey(),
          Object.freeze({
            iri: value.iri.value,
            type,
            origin: declarations.has(value.structuralKey())
              ? "declaration"
              : "use",
          }),
        );
      const arity = readSourceArity(value);
      if (arity)
        arityWitnesses.set(
          value.structuralKey(),
          Object.freeze({
            structuralKey: value.structuralKey(),
            kind: value.kind,
            ...arity,
          }),
        );
    },
  );
  return Object.freeze({
    version: 1,
    policy: "preserve",
    roles: Object.freeze([...roles.values(), ...(retained.roles ?? [])]),
    statements: Object.freeze([...(retained.statements ?? [])]),
    expressions: Object.freeze([...(retained.expressions ?? [])]),
    arityWitnesses: Object.freeze([...arityWitnesses.values()]),
  });
};

// Closure authority and original-source qualifications never come from public
// metadata supplied to an OWLOntology constructor. Mutating a parsed ontology
// changes its revision and makes all its original-source qualifications stale.
export const bindManagedOntology = (ontology, readClosure, hasResolvedImport) =>
  managers.set(ontology, { readClosure, hasResolvedImport });

export const publishSourceEvidence = (ontology, structure, trusted) => {
  sources.set(
    ontology,
    Object.freeze({
      revision: readOntologySnapshot(ontology).revision,
      structure,
      trusted,
    }),
  );
};

export const readSourceEvidence = (ontology) => {
  const snapshot = readOntologySnapshot(ontology);
  const evidence = sources.get(ontology);
  if (!evidence || !evidence.trusted || !evidence.structure)
    return { status: "unverified", snapshot };
  if (evidence.revision !== snapshot.revision)
    return { status: "stale", snapshot };
  return { status: "verified", snapshot, structure: evidence.structure };
};

/** Read loaded membership only; completeness remains the caller's policy. */
export const readLoadedImportsClosure = (ontology) => {
  readOntologySnapshot(ontology);
  return managers.get(ontology)?.readClosure() ?? [ontology];
};

export const readProfileClosure = (ontology) => {
  const snapshot = readOntologySnapshot(ontology);
  const manager = managers.get(ontology);
  if (!manager)
    return {
      ontologies: [ontology],
      complete: snapshot.authoredImportDeclarations.length === 0,
    };
  const ontologies = readLoadedImportsClosure(ontology);
  const complete = ontologies.every((member) =>
    readOntologySnapshot(member).authoredImportDeclarations.every(
      (declaration) => manager.hasResolvedImport(member, declaration.iri),
    ),
  );
  return { ontologies, complete };
};
