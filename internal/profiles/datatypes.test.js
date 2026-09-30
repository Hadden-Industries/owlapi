import { IRI, OWLDataFactory } from "../../index.js";
import { inspectLiteral } from "./datatypes.js";

const factory = new OWLDataFactory();
const namespaces = {
  xsd: "http://www.w3.org/2001/XMLSchema#",
  owl: "http://www.w3.org/2002/07/owl#",
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
};
const literal = (type, text) => {
  const [prefix, name] = type.split(":");
  return factory.getOWLLiteral(text, IRI.create(namespaces[prefix] + name));
};

describe("OWL datatype lexical and value constraints", () => {
  test.each([
    ["integer", "+0009007199254740993", "1e3"],
    ["nonNegativeInteger", "-0", "-1"],
    ["positiveInteger", "+1", "0"],
    ["nonPositiveInteger", "-999999999999999999999999", "1"],
    ["negativeInteger", "-1", "-0"],
    ["long", "9223372036854775807", "9223372036854775808"],
    ["int", "-2147483648", "-2147483649"],
    ["short", "32767", "32768"],
    ["byte", "-128", "-129"],
    ["unsignedLong", "18446744073709551615", "18446744073709551616"],
    ["unsignedInt", "4294967295", "4294967296"],
    ["unsignedShort", "65535", "65536"],
    ["unsignedByte", "255", "256"],
    ["decimal", "+0001.000", "1e0"],
    ["double", "+INF", "+NaN"],
    ["float", "NaN", "Infinity"],
    ["boolean", "0", " true "],
    ["string", "a\n😀", "\u0000"],
    ["normalizedString", " a b ", "a\tb"],
    ["token", "a b", "a  b"],
    ["language", "en-12345678", "en-123456789"],
    ["Name", "名:項目", "1name"],
    ["NCName", "Δέλτα", "a:b"],
    ["NMTOKEN", "1:a", "a b"],
    ["hexBinary", "00aF", "abc"],
    ["base64Binary", "Z g = =", "Zh=="],
    ["anyURI", "../relative#fragment", "\u0000"],
    ["dateTime", "2000-02-29T24:00:00.000", "1900-02-29T00:00:00Z"],
    ["dateTimeStamp", "2024-02-29T00:00:00+14:00", "2024-02-29T00:00:00"],
  ])(
    "checks both members of the xsd:%s boundary",
    async (type, valid, invalid) => {
      expect((await inspectLiteral(literal(`xsd:${type}`, valid))).status).toBe(
        "valid",
      );
      expect(
        (await inspectLiteral(literal(`xsd:${type}`, invalid))).status,
      ).toBe("invalid");
    },
  );

  test.each([
    ["owl:rational", "+12/004", true],
    ["owl:rational", "1/0", false],
    ["owl:rational", "1/+2", false],
    ["owl:rational", "1 / 2", false],
    ["owl:real", "1", false],
    ["rdfs:Literal", "text", false],
    ["rdf:PlainLiteral", "a@b@en", true],
    ["rdf:PlainLiteral", "@", true],
    ["rdf:PlainLiteral", "missing", false],
    ["rdf:PlainLiteral", "a@en-x", false],
    ["rdf:XMLLiteral", '<a xmlns="urn:a">&amp;</a>text<b></b>', true],
    ["rdf:XMLLiteral", "<b/>", false],
    ["rdf:XMLLiteral", '<a z="1" a="2"></a>', false],
    ["rdf:XMLLiteral", '<a a="2" z="1"></a>', true],
    ["rdf:XMLLiteral", '<a xmlns:p="urn:p"></a>', false],
    ["rdf:XMLLiteral", '<p:a xmlns:p="urn:p"><p:b></p:b></p:a>', true],
    [
      "rdf:XMLLiteral",
      '<p:a xmlns:p="urn:p"><p:b xmlns:p="urn:p"></p:b></p:a>',
      false,
    ],
    ["rdf:XMLLiteral", '<a xmlns="urn:a"><b xmlns=""></b></a>', true],
    ["rdf:XMLLiteral", '<a xmlns="relative"></a>', false],
    ["rdf:XMLLiteral", '<a xmlns="http://example.test/a b"></a>', false],
    ["rdf:XMLLiteral", '<a xmlns="http://example.test/%ZZ"></a>', false],
    ["rdf:XMLLiteral", '<a xmlns="http://example.test/%20"></a>', true],
    ["rdf:XMLLiteral", '<p:a xmlns:p="urn:good"></p:a>', true],
    ["rdf:XMLLiteral", "<a><![CDATA[text]]></a>", false],
    ["rdf:XMLLiteral", "<a>&#xD;&gt;</a>", true],
    ["rdf:XMLLiteral", '<a a="&#x9;&#xA;&#xD;&quot;"></a>', true],
    ["rdf:XMLLiteral", "<?target data?>text<!--comment-->", true],
    ["rdf:XMLLiteral", "text<!--comment-->", true],
    ["rdf:XMLLiteral", "<a>", false],
    [
      "rdf:XMLLiteral",
      '<!DOCTYPE a SYSTEM "https://example.invalid/external"><a/>',
      false,
    ],
    ["rdf:XMLLiteral", "<unbound:a/>", false],
  ])("classifies %s lexical form %s", async (type, value, valid) => {
    expect((await inspectLiteral(literal(type, value))).status).toBe(
      valid ? "valid" : "invalid",
    );
  });

  test.each(["en-US", "x-private", "i-klingon"])(
    "accepts RDF language %s without lexical coercion",
    async (language) => {
      const value = factory.getOWLLiteral("verbatim\tvalue", language);
      expect((await inspectLiteral(value)).status).toBe("valid");
      expect(value.lexicalForm).toBe("verbatim\tvalue");
    },
  );
  test.each(["en-x", "en--US", "en-0123456789"])(
    "rejects malformed RDF language %s",
    async (language) => {
      expect(
        (await inspectLiteral(factory.getOWLLiteral("text", language))).status,
      ).toBe("invalid");
    },
  );
  it("leaves unsupported datatypes unverified", async () => {
    expect(
      await inspectLiteral(
        factory.getOWLLiteral("opaque", IRI.create("urn:datatype:custom")),
      ),
    ).toMatchObject({ status: "unverified" });
  });
  test.each([
    ["2001-04-31T00:00:00Z", false],
    ["2000-02-29T23:59:59.9-14:00", true],
    ["2000-01-01T24:01:00Z", false],
    ["2000-01-01T24:00:00.1Z", false],
    ["2000-01-01T00:00:60Z", false],
    ["2000-01-01T00:00:00+14:01", false],
    ["12345678901234567890400-02-29T00:00:00Z", true],
    ["0000-02-29T00:00:00Z", true],
    ["-0000-02-29T00:00:00Z", true],
    ["+0000-02-29T00:00:00Z", false],
    ["00000-02-29T00:00:00Z", false],
  ])("checks date/time components exactly: %s", async (value, valid) => {
    expect((await inspectLiteral(literal("xsd:dateTime", value))).status).toBe(
      valid ? "valid" : "invalid",
    );
  });
  test.each([
    ["Zm8=", true],
    ["Zm9=", false],
    ["Zg", false],
    ["Zg===", false],
    ["", true],
    ["Zm9v", true],
    [" Zg==", false],
    ["Zg== ", false],
    ["Z  g==", false],
    ["Z\tg==", false],
    ["Zg==\n", false],
    ["Zm9v ", false],
  ])("checks base64 padding bits: %s", async (value, valid) => {
    expect(
      (await inspectLiteral(literal("xsd:base64Binary", value))).status,
    ).toBe(valid ? "valid" : "invalid");
  });
});
