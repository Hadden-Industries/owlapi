import { readFileSync } from "node:fs";
import { OWLManager } from "../apibinding/index.js";
import { IRI } from "./index.js";

const observation = JSON.parse(
  readFileSync(
    new URL(
      "../docs/compatibility/profiles/java-owlapi-5.5.1/central-observations.json",
      import.meta.url,
    ),
    "utf8",
  ),
).observations.find(
  ({ probeId }) => probeId === "ObserveLanguageProfileSemantics",
);
const fields = (prefix) =>
  observation.stdout
    .split("\n")
    .filter((line) => line.startsWith(prefix + "\t"))
    .map((line) => line.split("\t").slice(1));
const decode = (text) => Buffer.from(text, "base64").toString("utf8");
const factory = OWLManager.createOWLOntologyManager({
  behaviorProfileId: "java-owlapi-5.5.1",
}).getOWLDataFactory();
const normativeFactory =
  OWLManager.createOWLOntologyManager().getOWLDataFactory();
const literalRows = fields("factory-literal");
const languageRows = fields("factory-language");

test("the independent factory observation covers lexical, datatype, language and numeric boundaries", () => {
  expect(literalRows).toHaveLength(8 * 52 + 256);
  expect(languageRows).toHaveLength(6);
});

test.each(literalRows)(
  "Java factory observable literal: %s / %s",
  (datatypeIRI, input, lexical, resultDatatypeIRI, language) => {
    const literal = factory.getOWLLiteral(
      decode(input),
      factory.getOWLDatatype(IRI.create(datatypeIRI)),
    );
    expect({
      lexicalForm: literal.lexicalForm,
      datatypeIRI: literal.datatype.iri.value,
      language: literal.language,
    }).toEqual({
      lexicalForm: decode(lexical),
      datatypeIRI: resultDatatypeIRI,
      language: decode(language),
    });
    expect(
      normativeFactory.getOWLLiteral(
        decode(input),
        normativeFactory.getOWLDatatype(IRI.create(datatypeIRI)),
      ).lexicalForm,
    ).toBe(decode(input));
  },
);

test.each(languageRows)(
  "Java language overload: %s",
  (inputLanguage, lexical, datatypeIRI, language) => {
    const literal = factory.getOWLLiteral("hello", decode(inputLanguage));
    expect({
      lexicalForm: literal.lexicalForm,
      datatypeIRI: literal.datatype.iri.value,
      language: literal.language,
    }).toEqual({
      lexicalForm: decode(lexical),
      datatypeIRI,
      language: decode(language),
    });
  },
);
