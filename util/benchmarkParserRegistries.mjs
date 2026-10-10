import { dlSyntaxParserDescriptor } from "../internal/parsing/dl/descriptor.js";
import { functionalSyntaxParserDescriptor } from "../internal/parsing/functional/descriptor.js";
import { manchesterSyntaxParserDescriptor } from "../internal/parsing/manchester/descriptor.js";
import { owlXmlParserDescriptor } from "../internal/parsing/owlxml/descriptor.js";
import { rdfXmlParserDescriptor } from "../internal/parsing/rdfxml/descriptor.js";
import { turtleParserDescriptor } from "../internal/parsing/turtle/descriptor.js";
import { jsonLdParserDescriptor } from "../internal/parsing/jsonld/descriptor.js";
import { krss2ParserDescriptor } from "../internal/parsing/krss2/descriptor.js";
import { nQuadsParserDescriptor } from "../internal/parsing/nquads/descriptor.js";
import { nTriplesParserDescriptor } from "../internal/parsing/ntriples/descriptor.js";
import { triGParserDescriptor } from "../internal/parsing/trig/descriptor.js";
import { krss1ParserDescriptor } from "../internal/parsing/krss1/descriptor.js";

/** Frozen historical phase9Descriptors inventory; independent of the current default registry. */
export const phase9Descriptors = Object.freeze([
  owlXmlParserDescriptor,
  rdfXmlParserDescriptor,
  turtleParserDescriptor,
  functionalSyntaxParserDescriptor,
  manchesterSyntaxParserDescriptor,
]);

/** Frozen historical phase10Descriptors inventory; independent of the current default registry. */
export const phase10Descriptors = Object.freeze([
  owlXmlParserDescriptor,
  rdfXmlParserDescriptor,
  turtleParserDescriptor,
  dlSyntaxParserDescriptor,
  functionalSyntaxParserDescriptor,
  manchesterSyntaxParserDescriptor,
]);

/** Frozen historical phase11Descriptors inventory; independent of the current default registry. */
export const phase11Descriptors = Object.freeze([
  owlXmlParserDescriptor,
  rdfXmlParserDescriptor,
  turtleParserDescriptor,
  dlSyntaxParserDescriptor,
  krss2ParserDescriptor,
  functionalSyntaxParserDescriptor,
  manchesterSyntaxParserDescriptor,
]);

/** Frozen historical phase12Descriptors inventory; independent of the current default registry. */
export const phase12Descriptors = Object.freeze([
  owlXmlParserDescriptor,
  rdfXmlParserDescriptor,
  nTriplesParserDescriptor,
  turtleParserDescriptor,
  dlSyntaxParserDescriptor,
  krss2ParserDescriptor,
  functionalSyntaxParserDescriptor,
  manchesterSyntaxParserDescriptor,
]);

/** Frozen historical phase13Descriptors inventory; independent of the current default registry. */
export const phase13Descriptors = Object.freeze([
  owlXmlParserDescriptor,
  rdfXmlParserDescriptor,
  nQuadsParserDescriptor,
  nTriplesParserDescriptor,
  turtleParserDescriptor,
  dlSyntaxParserDescriptor,
  krss2ParserDescriptor,
  functionalSyntaxParserDescriptor,
  manchesterSyntaxParserDescriptor,
]);

/** Frozen historical phase14Descriptors inventory; independent of the current default registry. */
export const phase14Descriptors = Object.freeze([
  owlXmlParserDescriptor,
  rdfXmlParserDescriptor,
  nQuadsParserDescriptor,
  nTriplesParserDescriptor,
  triGParserDescriptor,
  turtleParserDescriptor,
  dlSyntaxParserDescriptor,
  krss2ParserDescriptor,
  functionalSyntaxParserDescriptor,
  manchesterSyntaxParserDescriptor,
]);

/** Frozen historical phase15Descriptors inventory; independent of the current default registry. */
export const phase15Descriptors = Object.freeze([
  owlXmlParserDescriptor,
  jsonLdParserDescriptor,
  rdfXmlParserDescriptor,
  nQuadsParserDescriptor,
  nTriplesParserDescriptor,
  triGParserDescriptor,
  turtleParserDescriptor,
  dlSyntaxParserDescriptor,
  krss2ParserDescriptor,
  functionalSyntaxParserDescriptor,
  manchesterSyntaxParserDescriptor,
]);

/** Phase 16 added translation; its parser inventory deliberately equals phase 15. */
export const phase16Descriptors = phase15Descriptors;

/** Frozen historical phase17Descriptors inventory; independent of the current default registry. */
export const phase17Descriptors = Object.freeze([
  ...phase16Descriptors.slice(0, 8),
  krss1ParserDescriptor,
  ...phase16Descriptors.slice(8),
]);
