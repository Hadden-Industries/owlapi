import { expect, test } from "@jest/globals";
import { rdfDataFactory as data, rdfDatasetFactory } from "./environment.js";
import { CompactRdfGraph, isCompactRdfGraph } from "./compactRdfGraph.js";
import { createRdfReadView } from "../mapping/rdfReadView.js";
import { selectOntologyGraph } from "./graphPolicy.js";

test.each([
  ["default", data.defaultGraph()],
  ["named", data.namedNode("urn:graph")],
])(
  "%s graph retains one dense row for 512 equal statement occurrences",
  (_name, graph) => {
    const packed = new CompactRdfGraph();
    const statement = () =>
      data.quad(
        data.namedNode("urn:s"),
        data.namedNode("urn:p"),
        data.literal("hello", "en"),
        graph,
      );
    for (let i = 0; i < 512; i++) packed.add(statement());
    packed.seal();
    expect(packed.size).toBe(1);
    expect(packed.createRowMarks()).toHaveLength(1);
    expect(packed.rowOf(statement())).toBe(0);
    // The final packed column itself ends at its only representative.
    expect(packed.rowTermId(1, 0)).toBeUndefined();
    for (const projected of [packed.project(graph), packed.project()]) {
      expect(projected.createRowMarks()).toHaveLength(1);
      expect([...projected]).toEqual([
        data.quad(
          statement().subject,
          statement().predicate,
          statement().object,
        ),
      ]);
    }
  },
);

test("interleaved duplicate occurrences leave dense IDs in first insertion order across graphs", () => {
  const s = data.namedNode("urn:s"),
    p = data.namedNode("urn:p"),
    g = data.blankNode("g");
  const lit = data.literal("same"),
    lang = data.literal("same", "fr");
  const representatives = [
    data.quad(s, p, lit, g),
    data.quad(s, p, lit),
    data.quad(s, p, lang, g),
    data.quad(s, p, lang),
  ];
  const packed = new CompactRdfGraph();
  const provider = rdfDatasetFactory.dataset();
  for (let end = 1; end <= representatives.length; end++) {
    for (let i = 0; i < 512; i++) {
      const q = representatives[i % end];
      packed.add(q);
      provider.add(q);
    }
  }
  packed.seal();
  expect([...packed]).toEqual([...provider]);
  expect(packed.createRowMarks()).toHaveLength(4);
  for (const [id, q] of representatives.entries())
    expect(packed.rowOf(q)).toBe(id);
  expect([...packed.match(s, p)]).toEqual([...provider.match(s, p)]);
  for (const policy of [
    { rdfDatasetGraphPolicy: "merge" },
    { rdfDatasetGraphPolicy: "selectGraph", selectedGraph: g },
  ]) {
    expect([...selectOntologyGraph(packed, policy).dataset]).toEqual([
      ...selectOntologyGraph(provider, policy).dataset,
    ]);
  }
});

test("keeps representatives through ingestion-index growth and later equal occurrences", () => {
  const s = data.namedNode("urn:repeat:s"),
    p = data.namedNode("urn:repeat:p");
  const make = (i) =>
    data.quad(
      s,
      p,
      data.literal("value-" + Math.floor(i / 2)),
      i % 2 ? data.blankNode("partition") : data.defaultGraph(),
    );
  const packed = new CompactRdfGraph();
  const provider = rdfDatasetFactory.dataset();
  for (let i = 0; i < 257; i++) {
    packed.add(make(i));
    provider.add(make(i));
    packed.add(make(Math.floor(i / 3)));
  }
  for (let i = 256; i >= 0; i--) packed.add(make(i));
  packed.seal();
  expect(packed.createRowMarks()).toHaveLength(257);
  for (let i = 0; i < 257; i++) expect(packed.rowOf(make(i))).toBe(i);
  expect([...packed]).toEqual([...provider]);
  expect([...packed.match(s, p, null, data.blankNode("partition"))]).toEqual([
    ...provider.match(s, p, null, data.blankNode("partition")),
  ]);
});

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
  const packed = new CompactRdfGraph();
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

test("integer cursors replay row and term IDs and preserve each outgoing cancellation check", () => {
  const [s, p, q, a, b] = ["s", "p", "q", "a", "b"].map((value) =>
    data.namedNode("urn:" + value),
  );
  const packed = new CompactRdfGraph();
  const quads = [
    data.quad(s, p, a),
    data.quad(s, q, b),
    data.quad(s, p, b),
    data.quad(s, p, a),
  ];
  for (const quad of quads) packed.add(quad);
  packed.seal();
  expect(isCompactRdfGraph(Object.create(CompactRdfGraph.prototype))).toBe(
    false,
  );
  const standard = rdfDatasetFactory.dataset(quads);
  let checks = 0;
  const view = createRdfReadView(packed, {
    check: () => {
      checks++;
    },
  });
  const sId = packed.termId(s),
    pId = packed.termId(p);
  const matching = [];
  view.forEachMatchingRow(
    sId,
    pId,
    undefined,
    0,
    (row, subject, predicate, object, graph) => {
      const quad = data.quad(
        ...[subject, predicate, object, graph].map(view.termById),
      );
      expect(packed.rowOf(quad)).toBe(row);
      matching.push(quad);
    },
  );
  expect(matching).toEqual([...standard.match(s, p)]);
  const outgoing = [];
  view.forEachOutgoingRow(sId, pId, (_row, _s, _p, object) =>
    outgoing.push(view.termById(object)),
  );
  const objects = [...standard.match(s)]
    .filter((quad) => quad.predicate.equals(p))
    .map((quad) => quad.object);
  expect(outgoing).toEqual(objects);
  expect(view.termById(view.firstObjectId(sId, pId))).toEqual(objects[0]);
  expect([...view.outgoing(s, p.value)].map((quad) => quad.object)).toEqual(
    objects,
  );
  expect(checks).toBe(3 + standard.match(s).size);
  expect(view.outgoing(s, "urn:absent")).toHaveLength(0);
  expect(checks).toBe(2 * (3 + standard.match(s).size));
});

test("retains graph membership, cross-graph duplicates and the provider's match replay order", () => {
  const [a, b, c, p, q] = ["a", "b", "c", "p", "q"].map((value) =>
    data.namedNode("urn:term:" + value),
  );
  const named = data.blankNode("graph");
  const quads = [
    data.quad(b, p, c, a),
    data.quad(c, b, a),
    data.quad(b, p, c),
    data.quad(b, p, c, named),
    data.quad(c, q, b, a),
    data.quad(a, p, q, named),
    data.quad(c, q, b, a),
  ];
  const standard = rdfDatasetFactory.dataset(quads);
  const packed = new CompactRdfGraph();
  for (const quad of quads) packed.add(quad);
  packed.seal();
  expect(packed.size).toBe(6);
  expect([...packed]).toEqual([...standard]);
  for (const graph of [null, a, named, data.defaultGraph()]) {
    for (const s of [null, b])
      for (const ptn of [null, p])
        for (const o of [null, c]) {
          const terms = [s, ptn, o, graph];
          expect([...packed.match(...terms)]).toEqual([
            ...standard.match(...terms),
          ]);
        }
  }
  for (const policy of [
    { rdfDatasetGraphPolicy: "defaultGraphOnly" },
    { rdfDatasetGraphPolicy: "selectGraph", selectedGraph: a },
    { rdfDatasetGraphPolicy: "selectGraph", selectedGraph: named },
    { rdfDatasetGraphPolicy: "merge" },
  ]) {
    const expected = selectOntologyGraph(standard, policy);
    const actual = selectOntologyGraph(packed, policy);
    expect(actual.diagnostics).toEqual(expected.diagnostics);
    expect([...actual.dataset]).toEqual([...expected.dataset]);
    expect([...actual.dataset.match(b)]).toEqual([
      ...expected.dataset.match(b),
    ]);
  }
});
