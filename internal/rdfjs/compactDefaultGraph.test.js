import { expect, test } from "@jest/globals";
import { rdfDataFactory as data, rdfDatasetFactory } from "./environment.js";
import { CompactDefaultGraph } from "./compactDefaultGraph.js";
import { selectOntologyGraph } from "./graphPolicy.js";

test("keeps provider projection, deduplication and query order with packed rows", () => {
  const [a, b, c, p, q, r] = "abc pqr"
    .replace(" ", "")
    .split("")
    .map((value) => data.namedNode("urn:term:" + value));
  const statements = [
    [b, p, q],
    [a, q, c],
    [a, p, r],
    [a, r, q],
    [a, q, b],
    [a, r, b],
    [b, q, a],
    [c, r, a],
    [c, q, p],
    [a, r, b],
  ].map(([subject, predicate, object]) =>
    data.quad(subject, predicate, object),
  );
  const standard = rdfDatasetFactory.dataset(statements);
  const packed = new CompactDefaultGraph();
  for (const statement of statements) packed.add(statement);
  packed.seal();
  expect([...packed]).toEqual([...standard]);
  const policy = { rdfDatasetGraphPolicy: "requireSingleGraph" };
  const expected = selectOntologyGraph(standard, policy).dataset;
  const actual = selectOntologyGraph(packed, policy).dataset;
  expect([...actual]).toEqual([...expected]);
  for (const pattern of [
    [],
    [a],
    [a, r],
    [null, r],
    [null, null, b],
    [null, r, a],
    [c, null, a],
    [a, r, b],
    [b, r, a],
    [a, null, null, r],
  ]) {
    const rows = actual.match(...pattern);
    const oracle = expected.match(...pattern);
    expect(rows.size).toBe(oracle.size);
    expect([...rows]).toEqual([...oracle]);
  }
  expect(actual.rowOf(statements[5])).toBe(actual.rowOf(statements[9]));
});
