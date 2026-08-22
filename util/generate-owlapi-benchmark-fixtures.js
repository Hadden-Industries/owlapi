"use strict";

const GENERATOR_VERSION = "owlapi-benchmark-corpus-v1";

const requireCount = (value, name, maximum = 5000000) => {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new RangeError(
      `${name} must be an integer from 0 through ${maximum}`,
    );
  }
  return value;
};

const repeated = (count, createLine) => {
  const lines = new Array(requireCount(count, "count"));
  for (let index = 0; index < lines.length; index += 1) {
    lines[index] = createLine(index);
  }
  return lines.join("\n");
};

const generators = Object.freeze({
  functional({ count }) {
    const declarations = repeated(
      count,
      (index) => `Declaration(Class(:C${index}))`,
    );
    return `Prefix(:=<urn:owlapi-js:benchmark:>)\nOntology(<urn:owlapi-js:benchmark:functional>\n${declarations}\n)`;
  },

  manchester({ count }) {
    const frames = repeated(count, (index) => `Class: :C${index}`);
    return `Prefix: : <urn:owlapi-js:benchmark:>\nOntology: <urn:owlapi-js:benchmark:manchester>\n${frames}\n`;
  },

  owlxml({ count }) {
    const declarations = repeated(
      count,
      (index) =>
        `<Declaration><Class IRI="urn:owlapi-js:benchmark:C${index}"/></Declaration>`,
    );
    return `<?xml version="1.0" encoding="UTF-8"?>\n<Ontology xmlns="http://www.w3.org/2002/07/owl#" ontologyIRI="urn:owlapi-js:benchmark:owlxml">\n${declarations}\n</Ontology>`;
  },

  rdfxml({ count }) {
    const declarations = repeated(
      count,
      (index) => `<owl:Class rdf:about="urn:owlapi-js:benchmark:C${index}"/>`,
    );
    return `<?xml version="1.0" encoding="UTF-8"?>\n<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:owl="http://www.w3.org/2002/07/owl#">\n${declarations}\n</rdf:RDF>`;
  },

  turtle({ count }) {
    const declarations = repeated(count, (index) => `:C${index} a owl:Class .`);
    return `@prefix : <urn:owlapi-js:benchmark:> .\n@prefix owl: <http://www.w3.org/2002/07/owl#> .\n${declarations}\n`;
  },

  dl({ count }) {
    return repeated(count, (index) => `C${index} ⊑ Parent${index}`);
  },

  krss2({ count }) {
    return repeated(
      count,
      (index) => `(implies C${index} Parent${index})`,
    );
  },

  "krss2-depth"({ depth }) {
    const normalizedDepth = requireCount(depth, "depth", 100000);
    return `(implies Root ${"(some p ".repeat(normalizedDepth)}Leaf${")".repeat(normalizedDepth)})`;
  },

  "dl-depth"({ depth }) {
    const normalizedDepth = requireCount(depth, "depth", 100000);
    return `Root ⊑ ${"∃ p.(".repeat(normalizedDepth)}Leaf${")".repeat(normalizedDepth)}`;
  },

  "functional-depth"({ depth }) {
    const normalizedDepth = requireCount(depth, "depth", 100000);
    return `Prefix(:=<urn:owlapi-js:benchmark:>)\nOntology(SubClassOf(:Root ${"ObjectSomeValuesFrom(:p ".repeat(normalizedDepth)}:Leaf${")".repeat(normalizedDepth)}))`;
  },

  "turtle-list"({ count }) {
    const members = repeated(count, (index) => `:C${index}`).replaceAll(
      "\n",
      " ",
    );
    return `@prefix : <urn:owlapi-js:benchmark:> .\n@prefix owl: <http://www.w3.org/2002/07/owl#> .\n:Expression owl:unionOf (${members}) .\n`;
  },

  "import-closure"({ count }) {
    const normalizedCount = requireCount(count, "count", 10000);
    const documents = {};
    for (let index = 0; index < normalizedCount; index += 1) {
      const next =
        normalizedCount === 0 ? undefined : (index + 1) % normalizedCount;
      documents[`urn:owlapi-js:benchmark:import:${index}`] =
        `Ontology(<urn:owlapi-js:benchmark:import:${index}>` +
        (next === undefined
          ? ""
          : ` Import(<urn:owlapi-js:benchmark:import:${next}>)`) +
        ")";
    }
    return JSON.stringify({
      documents,
      entry: normalizedCount === 0 ? null : "urn:owlapi-js:benchmark:import:0",
    });
  },

  mismatch({ bytes }) {
    return "x".repeat(requireCount(bytes, "bytes", 33554432));
  },
});

const generateBenchmarkFixture = (kind, parameters = {}) => {
  const generator = generators[kind];
  if (!generator) {
    throw new RangeError(`Unknown benchmark fixture kind: ${kind}`);
  }
  return generator(parameters);
};

module.exports = Object.freeze({
  GENERATOR_VERSION,
  generateBenchmarkFixture,
});

if (require.main === module) {
  const [, , kind, amount] = process.argv;
  const numericAmount = Number(amount);
  const parameterName = [
    "dl-depth",
    "functional-depth",
    "krss2-depth",
  ].includes(kind)
    ? "depth"
    : "count";
  const parameters =
    kind === "mismatch"
      ? { bytes: numericAmount }
      : { [parameterName]: numericAmount };
  process.stdout.write(generateBenchmarkFixture(kind, parameters));
}
