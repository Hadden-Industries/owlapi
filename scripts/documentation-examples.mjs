import { readDocumentationExamples } from "./release-documentation.mjs";

/** Execute selected, complete README fences in the existing isolated consumers.
 * These independent postconditions describe the public examples, not implementation details.
 */
export const documentationExampleModules = (
  readme,
  dependencyName = "owlapi",
) => {
  if (!["owlapi", "@hadden-industries/owlapi"].includes(dependencyName))
    throw new Error("Unexpected documentation dependency name");
  const assertions = {
    "load-ontology": `if (ontology.getAxioms().size !== 0 || String(ontology.getOntologyID().ontologyIRI) !== "https://example.com/my-ontology") throw new Error("README load-ontology result changed");`,
    "behavior-profiles": `if (defaultManager.getBehaviorProfileId() !== "normative-v1" || javaManager.getBehaviorProfileId() !== "java-owlapi-5.5.1") throw new Error("README behavior-profile selection/default changed");`,
  };
  return Object.fromEntries(
    Object.entries(readDocumentationExamples(readme)).map(([id, source]) => {
      const imports =
        source.match(/^import .+ from "owlapi(?:\/[^"\n]+)?";$/gmu) ?? [];
      const body = source.replace(
        /^import .+ from "owlapi(?:\/[^"\n]+)?";\n?/gmu,
        "",
      );
      if (!imports.length || /^import\b/mu.test(body))
        throw new Error(`Unsupported README import form: ${id}`);
      return [
        id,
        `${imports.join("\n").replaceAll(/"owlapi(?="|\/)/gu, `"${dependencyName}`)}\nexport async function exercise() {\n${body}\n${assertions[id]}\n}\n`,
      ];
    }),
  );
};
