import { parseIri } from "@hyperjump/uri";
import {
  CLASS_EXPRESSION_KINDS,
  DATA_RANGE_KINDS,
  OWLObjectKind as K,
} from "../../model/kinds.js";
import {
  OWL_NAMESPACE as OWL,
  RDF_NAMESPACE as RDF,
  RDFS_NAMESPACE as RDFS,
  XSD_NAMESPACE as XSD,
} from "../rdfjs/vocabulary.js";

const classes = new Set(CLASS_EXPRESSION_KINDS);
const datatypes = new Set(DATA_RANGE_KINDS);
const owlTypes = new Set(
  [
    "Class",
    "ObjectProperty",
    "DatatypeProperty",
    "AnnotationProperty",
    "NamedIndividual",
  ].map((name) => OWL + name),
);
const genericBuiltins = new Map([
  [
    RDFS + "Class",
    new Set([
      ...[
        "Resource",
        "Class",
        "Literal",
        "Datatype",
        "Container",
        "ContainerMembershipProperty",
      ].map((name) => RDFS + name),
      ...[
        "Property",
        "Statement",
        "List",
        "Bag",
        "Seq",
        "Alt",
        "XMLLiteral",
        "langString",
      ].map((name) => RDF + name),
      OWL + "Thing",
      OWL + "Nothing",
    ]),
  ],
  [
    RDF + "Property",
    new Set([
      ...[
        "type",
        "subject",
        "predicate",
        "object",
        "first",
        "rest",
        "value",
      ].map((name) => RDF + name),
      ...[
        "subClassOf",
        "subPropertyOf",
        "domain",
        "range",
        "label",
        "comment",
        "seeAlso",
        "isDefinedBy",
        "member",
      ].map((name) => RDFS + name),
    ]),
  ],
]);
const resource = (value) =>
  value?.kind === K.IRI || value?.kind === K.ANONYMOUS_INDIVIDUAL;
const key = (value, scope) =>
  value?.kind === K.IRI
    ? `iri:${value.value}`
    : value?.kind === K.ANONYMOUS_INDIVIDUAL
      ? `${scope}:${value.structuralKey()}`
      : undefined;

/** Validate the package's retained RDF source vocabulary without manufacturing
 * OWL declarations or axioms. Return every structural payload for the same
 * whole-closure datatype, constructor and global-restriction checks as OWL.
 */
export const inspectSourceStructure = async (members, budget, violate) => {
  const roots = new Map();
  const types = new Map();
  const addType = (id, type) => {
    if (!types.has(id)) types.set(id, new Set());
    types.get(id).add(type);
  };
  for (const member of members) {
    const { scope, structure } = member;
    const values = [];
    roots.set(scope, values);
    if (!structure) continue;
    for (const role of structure.roles) {
      await budget.checkpoint();
      const validType =
        owlTypes.has(role.type) ||
        role.type === RDFS + "Datatype" ||
        genericBuiltins.has(role.type);
      const id =
        role.iri === undefined ? key(role.subject, scope) : `iri:${role.iri}`;
      if (
        !validType ||
        !id ||
        !["declaration", "use"].includes(role.origin) ||
        (role.iri === undefined && role.type !== RDFS + "Class")
      ) {
        violate("SOURCE_ROLE_INVALID", { scope });
        continue;
      }
      if (role.iri !== undefined) {
        try {
          if (!role.iri.isWellFormed()) throw new Error();
          parseIri(role.iri);
        } catch {
          violate("IRI_INVALID", { scope });
        }
        if (
          genericBuiltins.has(role.type) &&
          [OWL, RDF, RDFS, XSD].some((namespace) =>
            role.iri.startsWith(namespace),
          ) &&
          !genericBuiltins.get(role.type).has(role.iri) &&
          !(
            role.type === RDF + "Property" &&
            role.iri.startsWith(RDF + "_") &&
            /^[1-9][0-9]*$/u.test(role.iri.slice(RDF.length + 1))
          )
        )
          violate("RESERVED_SOURCE_ROLE_IRI", { scope, iri: role.iri });
      } else values.push(role.subject);
      addType(id, role.type);
    }
    values.push(...(structure.expressions ?? []));
  }
  const has = (value, scope, type) =>
    types.get(key(value, scope))?.has(type) === true;
  const classTerm = (value, scope) =>
    classes.has(value?.kind) ||
    (resource(value) &&
      (has(value, scope, RDFS + "Class") || has(value, scope, OWL + "Class")));
  const dataTerm = (value, scope) =>
    datatypes.has(value?.kind) ||
    (value?.kind === K.IRI && has(value, scope, RDFS + "Datatype"));
  const propertyTerm = (value, scope) =>
    value?.kind === K.IRI && has(value, scope, RDF + "Property");
  const individual = (value) =>
    [K.NAMED_INDIVIDUAL, K.ANONYMOUS_INDIVIDUAL].includes(value?.kind);
  const ranges = new Map();
  for (const { scope, structure } of members) {
    if (!structure) continue;
    const values = roots.get(scope);
    for (const statement of structure.statements) {
      await budget.checkpoint();
      const { subject, predicate, object, annotations } = statement;
      values.push(subject, predicate, object, annotations);
      if (
        predicate?.kind !== K.IRI ||
        !Array.isArray(annotations) ||
        annotations.some((value) => value.kind !== K.ANNOTATION)
      ) {
        violate("SOURCE_STATEMENT_INVALID", { scope });
        continue;
      }
      let valid = false;
      switch (predicate.value) {
        case RDF + "type":
          valid =
            object?.kind === K.IRI && genericBuiltins.has(object.value)
              ? resource(subject) &&
                has(subject, scope, object.value) &&
                (object.value !== RDF + "Property" || subject.kind === K.IRI)
              : individual(subject) && classTerm(object, scope);
          break;
        case RDFS + "subClassOf":
          valid = classTerm(subject, scope) && classTerm(object, scope);
          break;
        case RDFS + "subPropertyOf":
          valid = propertyTerm(subject, scope) && propertyTerm(object, scope);
          break;
        case RDFS + "domain":
          valid = propertyTerm(subject, scope) && classTerm(object, scope);
          break;
        case RDFS + "range": {
          const category = classTerm(object, scope)
            ? "class"
            : dataTerm(object, scope)
              ? "data"
              : undefined;
          valid = propertyTerm(subject, scope) && category !== undefined;
          if (valid) {
            const id = key(subject, scope);
            if (!ranges.has(id)) ranges.set(id, new Set());
            ranges.get(id).add(category);
          }
          break;
        }
      }
      if (!valid)
        violate("SOURCE_STATEMENT_CATEGORY", {
          scope,
          predicate: predicate.value,
        });
    }
  }
  for (const [id, values] of ranges)
    if (values.size > 1)
      violate("SOURCE_RANGE_CATEGORY_COLLISION", { subject: id });
  for (const [id, values] of types) {
    if (values.has(RDFS + "Class") && values.has(RDFS + "Datatype"))
      violate("SOURCE_CLASS_DATATYPE_COLLISION", { subject: id });
  }
  return roots;
};
