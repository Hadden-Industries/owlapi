import { prepareXml } from "./xmlEntityPolicy.js";
import { ResourceLimitError } from "../../../io/errors.js";

describe("XML entity preparation boundaries", () => {
  it.each([
    '<r attribute="markers &lt; > \' &amp;">plain text Ω😀</r>',
    "<r attribute='markers &lt; > \" &amp;'>plain text Ω😀</r>",
    "<?probe &undeclared;?>\n<r><!-- &undeclared; -->plain<![CDATA[&undeclared; < >]]></r>",
    "<r><!----><![CDATA[]]><?probe?></r>",
  ])("preserves markup and built-in references in %s", (text) => {
    expect(prepareXml(text)).toBe(text);
  });

  it("expands only references outside comments, CDATA, and processing instructions", () => {
    const text =
      '<!DOCTYPE r [<!ENTITY token "value">]><r a="&token;"><!-- &token; --><![CDATA[&token;]]><?p &token;?>&token;</r>';
    expect(prepareXml(text)).toBe(
      '<r a="value"><!-- &token; --><![CDATA[&token;]]><?p &token;?>value</r>',
    );
  });

  it("preserves the first failing chunk's exact byte observation", () => {
    const text = "<r>😀<!-- comment -->tail</r>";
    expect(() => prepareXml(text, { maxExpandedXmlBytes: 5 })).toThrow(
      ResourceLimitError,
    );
    try {
      prepareXml(text, { maxExpandedXmlBytes: 5 });
    } catch (error) {
      expect(error).toMatchObject({
        resource: "maxExpandedXmlBytes",
        limit: 5,
        observed: 23,
      });
    }
    expect(
      prepareXml(text, {
        maxExpandedXmlBytes: new TextEncoder().encode(text).length,
      }),
    ).toBe(text);
  });
});
