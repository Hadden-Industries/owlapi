import { compareSelectedParity } from "./compare-selected-parity.mjs";
const input = (rows) => ({
  ontologyInputSha256: "a".repeat(64),
  observations: [
    {
      probeId: "RunRC2Search",
      sourceSha256: "b".repeat(64),
      arguments: [],
      exitCode: 0,
      matchesExpectedCompletion: true,
      stdout: "",
      outputs: [
        {
          name: "search.json",
          content: JSON.stringify({ observations: rows }),
        },
      ],
    },
  ],
});
test("independent invocation ordering is neutral, while result and callback order are preserved", () => {
  const a = {
    method: "getAnnotations",
    argument: { kind: "IRI", iri: "urn:a" },
    repeated: false,
    filtered: true,
    results: ["first", "second"],
  };
  const b = {
    method: "getSuperClasses",
    argument: { kind: "Class", iri: "urn:b" },
    results: [],
  };
  expect(
    compareSelectedParity(input([a, b]), input([b, a]))[0]
      .areSelectedResultsEquivalent,
  ).toBe(true);
  expect(
    compareSelectedParity(
      input([a, b]),
      input([{ ...a, results: ["second", "first"] }, b]),
    )[0].areSelectedResultsEquivalent,
  ).toBe(false);
  expect(() => compareSelectedParity(input([a, b]), input([a, a]))).toThrow(
    /Ambiguous/,
  );
});
