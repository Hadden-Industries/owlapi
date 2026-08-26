import { XmlParserAdapter } from "./xmlParserAdapter.js";

const originalDomParser = Object.getOwnPropertyDescriptor(
  globalThis,
  "DOMParser",
);

const setDomParser = (value) => {
  Object.defineProperty(globalThis, "DOMParser", {
    configurable: true,
    value,
    writable: true,
  });
};

afterEach(() => {
  if (originalDomParser) {
    Object.defineProperty(globalThis, "DOMParser", originalDomParser);
  } else {
    delete globalThis.DOMParser;
  }
});

describe("XmlParserAdapter", () => {
  it("uses the Node implementation when native DOMParser is absent", async () => {
    setDomParser(undefined);
    const adapter = new XmlParserAdapter();

    const document = await adapter.parseXml(
      '<root xmlns="urn:test"><child/></root>',
    );

    expect(document.documentElement.localName).toBe("root");
    expect(document.documentElement.namespaceURI).toBe("urn:test");
  });

  it("uses a native browser DOMParser when the environment provides one", async () => {
    const invocations = [];
    const parseFromString = (...arguments_) => {
      invocations.push(arguments_);
      return {
        documentElement: {
          localName: "native",
          namespaceURI: "urn:test:native",
        },
      };
    };
    setDomParser(
      class NativeDOMParser {
        parseFromString(...arguments_) {
          return parseFromString(...arguments_);
        }
      },
    );
    const adapter = new XmlParserAdapter();

    const document = await adapter.parseXml("<native/>");

    expect(invocations).toEqual([["<native/>", "application/xml"]]);
    expect(document.documentElement.localName).toBe("native");
  });

  it("normalizes native parsererror documents to XmlParseError", async () => {
    setDomParser(
      class NativeDOMParser {
        parseFromString() {
          return {
            documentElement: {
              localName: "parsererror",
              namespaceURI:
                "http://www.mozilla.org/newlayout/xml/parsererror.xml",
              textContent: "line 2, column 7: malformed XML",
            },
          };
        }
      },
    );
    const adapter = new XmlParserAdapter();

    await expect(adapter.parseXml("<broken>")).rejects.toMatchObject({
      code: "XML_PARSE_ERROR",
      column: 7,
      line: 2,
    });
  });
});
