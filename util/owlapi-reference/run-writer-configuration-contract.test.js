import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  compareRdfXmlPresentation,
  runWriterConfigurationContract,
} from "./run-writer-configuration-contract.mjs";

describe("RDF/XML presentation comparison", () => {
  const input =
    '<rdf:RDF>\n    <!-- urn:class:A -->\n\n\n    <owl:Class rdf:about="urn:class:A"/>\n</rdf:RDF>\n';
  it("does not normalize unknown presentation differences", () => {
    for (const altered of [
      input.replace("    <!--", "  <!--"),
      input.replace("\n\n\n", "\n\n"),
      input.replace("urn:class:A -->", "A -->"),
      input + "<!-- Unrecognized generator -->\n",
    ])
      expect(
        compareRdfXmlPresentation(input, altered, "defaults").matches,
      ).toBe(false);
  });
  it("allows only anonymous identifier renaming, preserving sharing", () => {
    const java =
      '<rdf:Description rdf:nodeID="native1"><p rdf:nodeID="native1"/></rdf:Description>';
    expect(
      compareRdfXmlPresentation(
        java,
        java.replaceAll("native1", "js0"),
        "save-ids",
      ).matches,
    ).toBe(true);
    expect(
      compareRdfXmlPresentation(
        java,
        java.replace('<p rdf:nodeID="native1"', '<p rdf:nodeID="other"'),
        "save-ids",
      ).matches,
    ).toBe(false);
  });
});

const nativeTest = process.env.OWLAPI_REFERENCE_CHECKOUT ? it : it.skip;
nativeTest(
  "compares the same input and seven save modes against fresh pinned Java output",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "owlapi-writer-contract-"));
    try {
      const report = await runWriterConfigurationContract({
        outputDirectory: join(directory, "evidence"),
      });
      expect(report.observations).toHaveLength(7);
      for (const observation of report.observations) {
        expect({
          mode: observation.mode,
          presentation: observation.presentation,
        }).toEqual({
          mode: observation.mode,
          presentation: { matches: true, firstDifferentLine: null },
        });
        expect(observation.structural.exitCode).toBe(0);
        expect(observation.structural.result.comparisonOutcome).toBe("MATCH");
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  120_000,
);
