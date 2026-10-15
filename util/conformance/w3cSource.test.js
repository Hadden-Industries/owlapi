import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertW3cSource } from "./w3cSource.mjs";
import { execFileSync } from "node:child_process";

const corpora = ["trig", "turtle", "nquads", "ntriples", "rdfxml"].map((name) =>
  JSON.parse(
    readFileSync(
      new URL(
        `../../docs/conformance/generated/w3c-${name}.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  ),
);
test("every generated RDF source matches its independently pinned original Git identity", () => {
  for (const corpus of corpora)
    for (const fixture of corpus.tests)
      assert.equal(
        assertW3cSource(
          Buffer.from(fixture.source),
          fixture.baseIRI,
          corpus.revision,
        ),
        fixture.source,
      );
});
test("converted newlines, same-size corruption and changed revision fail source admission", () => {
  const corpus = corpora[0],
    fixture = corpus.tests[0];
  assert.throws(() =>
    assertW3cSource(
      Buffer.from(fixture.source.replaceAll("\n", "\r\n")),
      fixture.baseIRI,
      corpus.revision,
    ),
  );
  const bytes = Buffer.from(fixture.source);
  bytes[0] = (bytes[0] + 1) % 256;
  assert.throws(() => assertW3cSource(bytes, fixture.baseIRI, corpus.revision));
  assert.throws(() =>
    assertW3cSource(
      Buffer.from(fixture.source),
      fixture.baseIRI,
      "0".repeat(40),
    ),
  );
});
test("an original CRLF source stays original rather than being normalized", () => {
  const corpus = corpora[0],
    fixture = corpus.tests.find((fixture) => fixture.source.includes("\r\n"));
  assert.ok(fixture);
  assert.equal(
    assertW3cSource(
      Buffer.from(fixture.source),
      fixture.baseIRI,
      corpus.revision,
    ),
    fixture.source,
  );
  assert.throws(() =>
    assertW3cSource(
      Buffer.from(fixture.source.replaceAll("\r\n", "\n")),
      fixture.baseIRI,
      corpus.revision,
    ),
  );
});
test("all JSON-LD sources, resources and expected results match original Git bytes", () => {
  const corpus = JSON.parse(
    readFileSync(
      new URL(
        "../../docs/conformance/generated/w3c-jsonld.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const base = "https://w3c.github.io/json-ld-api/tests/";
  let count = 0;
  const check = (source, url) => {
    assert.equal(
      assertW3cSource(Buffer.from(source), url, corpus.revision),
      source,
    );
    count++;
  };
  for (const [url, source] of Object.entries(corpus.resources))
    check(source, url);
  for (const fixture of corpus.tests) {
    check(fixture.source, new URL(fixture.action, base).href);
    if (fixture.result)
      check(fixture.expected, new URL(fixture.result, base).href);
  }
  assert.equal(count, 1306);
  const fixture = corpus.tests.find(
    (fixture) =>
      fixture.source.includes("\n") &&
      fixture.baseIRI !== new URL(fixture.action, base).href,
  );
  assert.ok(fixture, "custom semantic base must not replace source provenance");
  assert.throws(() =>
    assertW3cSource(
      Buffer.from(fixture.source),
      fixture.baseIRI,
      corpus.revision,
    ),
  );
  assert.throws(() =>
    assertW3cSource(
      Buffer.from(fixture.source.replaceAll("\n", "\r\n")),
      new URL(fixture.action, base).href,
      corpus.revision,
    ),
  );
});
test("Git disables text conversion for original upstream archives", () => {
  const paths = [
    "docs/conformance/upstream/w3c-json-ld-api/tests/toRdf-manifest.jsonld",
    "docs/conformance/upstream/w3c-rdf-tests/rdf/rdf11/rdf-turtle/manifest.ttl",
  ];
  const output = execFileSync(
    "git",
    ["check-attr", "text", "eol", "--", ...paths],
    { encoding: "utf8", windowsHide: true },
  );
  for (const path of paths) {
    assert.ok(output.includes(`${path}: text: unset`));
    assert.ok(output.includes(`${path}: eol: unspecified`));
  }
});
