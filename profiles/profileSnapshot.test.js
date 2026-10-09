import {
  OWLManager,
  IRI,
  StringDocumentSource,
  OWL2DLProfile,
  OWL2ELProfile,
  OWL2QLProfile,
  OWL2RLProfile,
} from "../index.js";

test.each([OWL2DLProfile, OWL2ELProfile, OWL2QLProfile, OWL2RLProfile])(
  "%p never retains a valid formal verdict when the source pass detects mutation",
  async (Profile) => {
    let sourcePassMutations = 0;
    // Enumerate bounded public microtask interleavings instead of depending on
    // wall-clock delays or one internal traversal's exact checkpoint count.
    for (let delay = 0; delay <= 120; delay += 8) {
      const manager = OWLManager.createOWLOntologyManager();
      const ontology = await manager.loadOntologyFromOntologyDocument(
        new StringDocumentSource(
          "<urn:snapshot:A> a <http://www.w3.org/2002/07/owl#Class> .",
          { format: "turtle" },
        ),
        { parsingMode: "preserve" },
      );
      const factory = manager.getOWLDataFactory();
      const invalid = factory.getOWLAnnotationAssertionAxiom(
        factory.getRDFSLabel(),
        IRI.create("urn:snapshot:A"),
        factory.getOWLLiteral(
          "bad",
          factory.getOWLDatatype(
            IRI.create("http://www.w3.org/2001/XMLSchema#integer"),
          ),
        ),
      );
      let completed = false;
      const checking = new Profile()
        .checkOntology(ontology, { sourceAssessment: true })
        .then((report) => {
          completed = true;
          return report;
        });
      const schedule = (remaining) =>
        queueMicrotask(() => {
          if (completed) return;
          if (remaining) schedule(remaining - 1);
          else manager.addAxiom(ontology, invalid);
        });
      schedule(delay);
      const report = await checking;
      if (
        report.sourceAssessment.unverifiedChecks.some(
          ({ code }) => code === "ONTOLOGY_CHANGED_DURING_CHECK",
        )
      ) {
        sourcePassMutations++;
        expect(report.isInProfile()).toBe(false);
        expect(report.unverifiedChecks).toContainEqual(
          expect.objectContaining({ code: "ONTOLOGY_CHANGED_DURING_CHECK" }),
        );
      }
    }
    expect(sourcePassMutations).toBeGreaterThan(0);
  },
);
