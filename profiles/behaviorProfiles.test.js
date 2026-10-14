import { readFileSync } from "node:fs";
import { OWLManager } from "../apibinding/index.js";
import { StringDocumentSource } from "../io/index.js";
import { OWLDocumentFormats } from "../formats/index.js";
import { IRI } from "../model/index.js";
import {
  OWL2DLProfile,
  OWL2ELProfile,
  OWL2QLProfile,
  OWL2RLProfile,
} from "./index.js";

const behaviorProfileId = "java-owlapi-5.5.1";
const replay = JSON.parse(
  readFileSync(
    new URL(
      "../docs/compatibility/profiles/java-owlapi-5.5.1/central-selected-parity.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const fixture = JSON.parse(
  replay.observations.find(({ probeId }) => probeId === "RunRC2Profiles")
    .outputs[0].content,
);
const profiles = [
  new OWL2DLProfile({ behaviorProfileId }),
  new OWL2ELProfile({ behaviorProfileId }),
  new OWL2QLProfile({ behaviorProfileId }),
  new OWL2RLProfile({ behaviorProfileId }),
];
const behaviorObservations = JSON.parse(
  readFileSync(
    new URL(
      "../docs/compatibility/profiles/java-owlapi-5.5.1/central-observations.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const literalRows = behaviorObservations.observations
  .find(({ probeId }) => probeId === "ObserveLanguageProfileSemantics")
  .stdout.split("\n")
  .filter((line) => line.startsWith("datatype-literal\t"))
  .map((line) => line.split("\t").slice(1));

test("native literal coverage includes every built in datatype", () =>
  expect(literalRows).toHaveLength(35 * 15));
test.each(literalRows)(
  "released Java literal verdict: %s / %s",
  async (datatypeIRI, input, _nativeLexical, expected) => {
    const manager = OWLManager.createOWLOntologyManager({ behaviorProfileId });
    const f = manager.getOWLDataFactory();
    const ontology = manager.createOntology();
    const property = f.getOWLDataProperty(IRI.create("urn:profiles:d"));
    manager.addAxiom(ontology, f.getOWLDeclarationAxiom(property));
    manager.addAxiom(
      ontology,
      f.getOWLDataPropertyAssertionAxiom(
        property,
        f.getOWLNamedIndividual(IRI.create("urn:profiles:i")),
        f.getOWLLiteral(
          Buffer.from(input, "base64").toString("utf8"),
          f.getOWLDatatype(IRI.create(datatypeIRI)),
        ),
      ),
    );
    expect((await profiles[0].checkOntology(ontology)).isInProfile()).toBe(
      expected === "true",
    );
  },
);

test.each(
  fixture.observations
    .filter(({ input }) => typeof input === "string")
    .map((row) => [row.id, row]),
)("released Java profile verdict: %s", async (_id, row) => {
  const manager = OWLManager.createOWLOntologyManager({ behaviorProfileId });
  const loading = manager.loadOntologyFromOntologyDocument(
    new StringDocumentSource(row.input, {
      format: OWLDocumentFormats.FUNCTIONAL,
    }),
    { parsingMode: "preserve" },
  );
  if (row.parseError) {
    await expect(loading).rejects.toThrow();
    return;
  }
  expect(row.parsedFormat).toBe("OWL Functional Syntax");
  const ontology = await loading;
  expect(ontology.getAxiomCount()).toBe(row.axiomCount);
  for (const profile of profiles) {
    const expected = row.profiles[profile.getName()];
    const checking = profile.checkOntology(ontology);
    if (expected.error) await expect(checking).rejects.toThrow();
    else {
      const report = await checking;
      expect({
        profile: profile.getName(),
        inProfile: report.isInProfile(),
      }).toEqual({ profile: profile.getName(), inProfile: expected.inProfile });
    }
  }
});
