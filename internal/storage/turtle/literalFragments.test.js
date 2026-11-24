import { expect, test } from "@jest/globals";
import { Writer } from "n3";
import { rdfDataFactory as data } from "../../rdfjs/environment.js";
import { XSD_NAMESPACE } from "../../rdfjs/vocabulary.js";
import {
  canFragmentTurtleLiteral,
  prepareTurtleLiteral,
} from "./literalFragments.js";

function writer(chunks) {
  return new Writer(
    {
      write(text, _encoding, done) {
        chunks.push(text);
        done?.();
        return true;
      },
      end(done) {
        done?.();
      },
    },
    { format: "text/turtle" },
  );
}

test.each([true, false])(
  "matches N3 for long quoted values and neighboring native quads (line mode %s)",
  (line) => {
    const expected = [],
      actual = [],
      pending = [];
    const oracle = writer(expected),
      candidate = writer(pending);
    const long = 'x\\"🦉\r\n\t\u0000\u0019é'.repeat(2200);
    const s = data.namedNode("urn:subject"),
      p = data.namedNode("urn:predicate"),
      other = data.namedNode("urn:other");
    const rows = [
      data.quad(s, p, data.literal("before")),
      data.quad(s, p, data.literal(long)),
      data.quad(s, p, data.literal(long, "ro")),
      data.quad(s, p, data.literal(long, { language: "en", direction: "rtl" })),
      data.quad(
        s,
        other,
        data.literal(long, data.namedNode("urn:domain:custom")),
      ),
      data.quad(
        other,
        p,
        data.literal(long, data.namedNode(XSD_NAMESPACE + "decimal")),
      ),
      data.quad(other, p, data.literal("after")),
    ];
    for (const quad of rows) {
      if (line)
        expected.push(
          oracle.quadToString(
            quad.subject,
            quad.predicate,
            quad.object,
            quad.graph,
          ),
        );
      else oracle.addQuad(quad);
      if (quad.object.value === long) {
        expect(canFragmentTurtleLiteral(quad.object)).toBe(true);
        const make = prepareTurtleLiteral(
          candidate,
          pending,
          quad,
          quad.subject,
          line,
          false,
        );
        const parts = [...make()];
        expect(parts.length).toBeGreaterThan(2);
        expect(
          Math.max(...parts.map((part) => part.length)),
        ).toBeLessThanOrEqual(65_536);
        actual.push(...pending, ...parts);
      } else if (line)
        actual.push(
          candidate.quadToString(
            quad.subject,
            quad.predicate,
            quad.object,
            quad.graph,
          ),
        );
      else {
        candidate.addQuad(quad);
        actual.push(...pending);
      }
      pending.length = 0;
    }
    oracle.end();
    candidate.end();
    actual.push(...pending);
    expect(actual.join("")).toBe(expected.join(""));
  },
);

test("delegates potentially abbreviated numeric lexical forms in their entirety", () => {
  const s = data.namedNode("urn:s"),
    p = data.namedNode("urn:p");
  const type = data.namedNode(XSD_NAMESPACE + "decimal");
  const value = "7".repeat(20_000) + ".5";
  const whole = data.literal(value, type),
    prefix = data.literal(value.slice(0, -2), type);
  const native = writer([]);
  expect(canFragmentTurtleLiteral(whole)).toBe(false);
  expect(native.quadToString(s, p, whole)).toBe(
    "<urn:s> <urn:p> " + value + " .\n",
  );
  expect(native.quadToString(s, p, prefix)).toContain(
    '"^^<' + type.value + ">",
  );
});
