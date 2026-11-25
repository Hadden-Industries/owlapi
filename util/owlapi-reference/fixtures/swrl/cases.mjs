import { readFile } from "node:fs/promises";

const fixture = (file) => readFile(new URL(file, import.meta.url), "utf8");

/** Project-owned documents used by the native probe and public manager tests. */
export async function scopedSwrlCases() {
  const [simple, annotated, declarations, functional] = await Promise.all(
    ["simple.rdf", "annotated.rdf", "declarations.rdf", "simple.ofn"].map(fixture),
  );
  const builtin = `<swrl:Imp>
    <swrl:body rdf:parseType="Collection">
      <swrl:ClassAtom><swrl:classPredicate rdf:resource="urn:owlapi:test:swrl#C"/>
        <swrl:argument1 rdf:resource="urn:swrl#x"/></swrl:ClassAtom>
      <swrl:BuiltinAtom><swrl:builtin rdf:resource="urn:owlapi:test:swrl#check"/>
        <swrl:arguments rdf:parseType="Collection"><swrl:Variable rdf:about="urn:swrl#x"/></swrl:arguments>
      </swrl:BuiltinAtom>
    </swrl:body>
    <swrl:head rdf:resource="http://www.w3.org/1999/02/22-rdf-syntax-ns#nil"/>
  </swrl:Imp>`;
  const group = (body, head) => `Prefix(:=<urn:owlapi:test:swrl#>)
    Ontology(<urn:owlapi:test:swrl:functional>
      Declaration(Class(:C)) Declaration(Class(:D)) DLSafeRule(Body(${body}) Head(${head})))`;
  const c = "ClassAtom(:C Variable(<urn:swrl#x>))";
  const d = "ClassAtom(:D Variable(<urn:swrl:var#x>))";
  const shared = simple.replace(
    /<swrl:body rdf:parseType="Collection">[\s\S]*?<\/swrl:head>/u,
    `<swrl:body rdf:nodeID="shared"/><swrl:head rdf:nodeID="shared"/>`,
  ).replace("</rdf:RDF>", `<rdf:Description rdf:nodeID="shared">
    <rdf:first><swrl:ClassAtom><swrl:classPredicate rdf:resource="urn:owlapi:test:swrl#C"/>
    <swrl:argument1 rdf:resource="urn:swrl#x"/></swrl:ClassAtom></rdf:first>
    <rdf:rest rdf:resource="http://www.w3.org/1999/02/22-rdf-syntax-ns#nil"/></rdf:Description></rdf:RDF>`);
  return [
    { id: "declarations", text: declarations },
    { id: "simple", text: simple },
    { id: "simple-functional", format: "functional", text: functional },
    { id: "strict-rdf", strict: true, text: simple },
    { id: "annotated", text: annotated },
    { id: "annotations-disabled", annotations: false, text: annotated },
    { id: "iri-annotation", text: annotated.replace('<rdfs:comment>Both endpoints are excluded.</rdfs:comment>', '<rdfs:comment rdf:resource="urn:owlapi:test:note"/>') },
    { id: "unsupported-first", text: simple.replace("<swrl:Imp>", builtin + "<swrl:Imp>") },
    { id: "unsupported-last", text: simple.replace("</rdf:RDF>", builtin + "</rdf:RDF>") },
    { id: "empty-rdf", text: simple.replace(/<swrl:Imp>[\s\S]*?<\/swrl:Imp>/u, "<swrl:Imp/>") },
    { id: "shared-list", text: shared },
    { id: "crossed-list", text: shared.replace('<swrl:head rdf:nodeID="shared"/>', '<swrl:head rdf:nodeID="other"/>')
        .replace("</rdf:RDF>", `<rdf:Description rdf:nodeID="other">
          <rdf:first><swrl:ClassAtom><swrl:classPredicate rdf:resource="urn:owlapi:test:swrl#C"/>
          <swrl:argument1 rdf:resource="urn:swrl:var#x"/></swrl:ClassAtom></rdf:first>
          <rdf:rest rdf:nodeID="shared"/></rdf:Description></rdf:RDF>`) },
    { id: "empty-functional", format: "functional", text: group("", "") },
    { id: "free-head", format: "functional", text: group(c, d) },
    { id: "duplicates", format: "functional", text: group([d, c, d].join(" "), "") },
    { id: "reordered", format: "functional", text: group([c, d].join(" "), "") },
    { id: "missing-head", format: "functional", text: group(c, "").replace(" Head()", "") },
  ];
}
