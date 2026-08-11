import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../io/index.js";
import { OWLManager } from "../../manager/index.js";
import { IRI, OWLDataFactory } from "../../model/index.js";

const OWL_NAMESPACE = "http://www.w3.org/2002/07/owl#";

const annotatedOntology = (doctype, literal) => `
  ${doctype}
  <Ontology xmlns="${OWL_NAMESPACE}" ontologyIRI="urn:test:entities">
    <Annotation>
      <AnnotationProperty IRI="urn:test:label"/>
      <Literal>${literal}</Literal>
    </Annotation>
  </Ontology>
`;

const configuration = (values) => new OWLOntologyLoaderConfiguration(values);

const nestedClassExpression = (depth) => {
  let expression = '<Class IRI="urn:test:B"/>';
  for (let index = 0; index < depth; index += 1) {
    expression = `<ObjectComplementOf>${expression}</ObjectComplementOf>`;
  }
  return expression;
};

const nestedAnnotation = (depth) => {
  let annotation = `
    <Annotation>
      <AnnotationProperty IRI="urn:test:label"/>
      <Literal>leaf</Literal>
    </Annotation>
  `;
  for (let index = 1; index < depth; index += 1) {
    annotation = `
      <Annotation>
        ${annotation}
        <AnnotationProperty IRI="urn:test:label"/>
        <Literal>level-${index}</Literal>
      </Annotation>
    `;
  }
  return annotation;
};

describe("OWL/XML finite resource and security behavior", () => {
  it("expands bounded internal entities without enabling external resolution", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(
      annotatedOntology(
        `<!DOCTYPE Ontology [
          <!ENTITY inner "bounded &amp; safe">
          <!ENTITY outer "value: &inner;">
        ]>`,
        "&outer;",
      ),
    );

    expect([...ontology.getAnnotations()][0].value.lexicalForm).toBe(
      "value: bounded & safe",
    );
  });

  it("rejects external subsets and external entity declarations", async () => {
    const manager = OWLManager.createOWLOntologyManager();

    await expect(
      manager.loadOntologyFromOntologyDocument(
        annotatedOntology(
          '<!DOCTYPE Ontology SYSTEM "https://example.com/ontology.dtd">',
          "value",
        ),
      ),
    ).rejects.toMatchObject({
      code: "SECURITY_POLICY_VIOLATION",
      policy: "externalXmlSubset",
    });
    await expect(
      manager.loadOntologyFromOntologyDocument(
        annotatedOntology(
          '<!DOCTYPE Ontology [<!ENTITY remote SYSTEM "https://example.com/value">]>',
          "&remote;",
        ),
      ),
    ).rejects.toMatchObject({
      code: "SECURITY_POLICY_VIOLATION",
      policy: "externalXmlEntity",
    });
  });

  it("rejects parameter-entity references inside general entity values", async () => {
    const manager = OWLManager.createOWLOntologyManager();

    await expect(
      manager.loadOntologyFromOntologyDocument(
        annotatedOntology(
          '<!DOCTYPE Ontology [<!ENTITY payload "%parameter;">]>',
          "&payload;",
        ),
      ),
    ).rejects.toMatchObject({
      code: "SECURITY_POLICY_VIOLATION",
      policy: "xmlParameterEntity",
    });
  });

  it("rejects entity declarations whose names are not XML Names", async () => {
    const manager = OWLManager.createOWLOntologyManager();

    await expect(
      manager.loadOntologyFromOntologyDocument(
        annotatedOntology(
          '<!DOCTYPE Ontology [<!ENTITY 1invalid "value">]>',
          "&1invalid;",
        ),
      ),
    ).rejects.toMatchObject({ code: "XML_PARSE_ERROR" });
  });

  it("rejects a DOCTYPE name that is not an XML Name", async () => {
    const manager = OWLManager.createOWLOntologyManager();

    await expect(
      manager.loadOntologyFromOntologyDocument(
        annotatedOntology("<!DOCTYPE 1invalid>", "value"),
      ),
    ).rejects.toMatchObject({ code: "XML_PARSE_ERROR" });
  });

  it.each([
    {
      configuration: { maxEntityDeclarations: 1 },
      doctype: '<!DOCTYPE Ontology [<!ENTITY a "a"><!ENTITY b "b">]>',
      literal: "&a;",
      resource: "maxEntityDeclarations",
    },
    {
      configuration: { maxEntityReplacementLength: 4 },
      doctype: '<!DOCTYPE Ontology [<!ENTITY value "12345">]>',
      literal: "&value;",
      resource: "maxEntityReplacementLength",
    },
    {
      configuration: { maxEntityExpansionDepth: 1 },
      doctype:
        '<!DOCTYPE Ontology [<!ENTITY inner "value"><!ENTITY outer "&inner;">]>',
      literal: "&outer;",
      resource: "maxEntityExpansionDepth",
    },
    {
      configuration: { maxExpandedXmlBytes: 128 },
      doctype:
        '<!DOCTYPE Ontology [<!ENTITY value "01234567890123456789012345678901234567890123456789">]>',
      literal: "&value;&value;&value;&value;",
      resource: "maxExpandedXmlBytes",
    },
  ])(
    "enforces $resource",
    async ({ configuration, doctype, literal, resource }) => {
      const manager = OWLManager.createOWLOntologyManager();

      await expect(
        manager.loadOntologyFromOntologyDocument(
          annotatedOntology(doctype, literal),
          new OWLOntologyLoaderConfiguration(configuration),
        ),
      ).rejects.toMatchObject({
        code: "RESOURCE_LIMIT_EXCEEDED",
        resource,
      });
    },
  );

  it("reports malformed XML and leaves manager state transactional", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontologyId = manager
      .getOWLDataFactory()
      .getOWLOntologyID(IRI.create("urn:test:transactional-xml"));

    await expect(
      manager.loadOntologyFromOntologyDocument(
        new StringDocumentSource(
          `<Ontology xmlns="${OWL_NAMESPACE}" ontologyIRI="urn:test:transactional-xml"><Declaration>`,
          { fileName: "broken.owx" },
        ),
        new OWLOntologyLoaderConfiguration({ format: "owlxml" }),
      ),
    ).rejects.toMatchObject({ code: "XML_PARSE_ERROR" });
    expect(manager.getOntology(ontologyId)).toBeUndefined();
  });

  it("enforces XML, axiom, blank-node, expression, and annotation ceilings", async () => {
    const manager = OWLManager.createOWLOntologyManager();

    const declaration = `<Ontology xmlns="${OWL_NAMESPACE}"><Declaration><Class IRI="urn:test:A"/></Declaration></Ontology>`;
    await expect(
      manager.loadOntologyFromOntologyDocument(
        declaration,
        configuration({ maxXmlNestingDepth: 3 }),
      ),
    ).resolves.toBeDefined();
    await expect(
      manager.loadOntologyFromOntologyDocument(
        declaration,
        configuration({ maxXmlNestingDepth: 2 }),
      ),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      limit: 2,
      observed: 3,
      resource: "maxXmlNestingDepth",
    });

    await expect(
      manager.loadOntologyFromOntologyDocument(
        `<Ontology xmlns="${OWL_NAMESPACE}"><Declaration><Class IRI="urn:test:A"/></Declaration><Declaration><Class IRI="urn:test:B"/></Declaration></Ontology>`,
        configuration({ maxAxioms: 1 }),
      ),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      limit: 1,
      resource: "maxAxioms",
    });
    await expect(
      manager.loadOntologyFromOntologyDocument(
        `<Ontology xmlns="${OWL_NAMESPACE}"><SameIndividual><AnonymousIndividual nodeID="one"/><AnonymousIndividual nodeID="two"/></SameIndividual></Ontology>`,
        configuration({ maxBlankNodes: 1 }),
      ),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      limit: 1,
      resource: "maxBlankNodes",
    });

    const expressionDocument = (depth) => `
      <Ontology xmlns="${OWL_NAMESPACE}">
        <SubClassOf>
          <Class IRI="urn:test:A"/>
          ${nestedClassExpression(depth)}
        </SubClassOf>
      </Ontology>
    `;
    await expect(
      manager.loadOntologyFromOntologyDocument(
        expressionDocument(1),
        configuration({ maxExpressionDepth: 2 }),
      ),
    ).resolves.toBeDefined();
    await expect(
      manager.loadOntologyFromOntologyDocument(
        expressionDocument(2),
        configuration({ maxExpressionDepth: 2 }),
      ),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      limit: 2,
      observed: 3,
      resource: "maxExpressionDepth",
    });

    const annotationDocument = (depth) => `
      <Ontology xmlns="${OWL_NAMESPACE}">
        ${nestedAnnotation(depth)}
      </Ontology>
    `;
    await expect(
      manager.loadOntologyFromOntologyDocument(
        annotationDocument(2),
        configuration({ maxAnnotationDepth: 2 }),
      ),
    ).resolves.toBeDefined();
    await expect(
      manager.loadOntologyFromOntologyDocument(
        annotationDocument(3),
        configuration({ maxAnnotationDepth: 2 }),
      ),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      limit: 2,
      observed: 3,
      resource: "maxAnnotationDepth",
    });
  });

  it("enforces the configured parse timeout", async () => {
    const manager = OWLManager.createOWLOntologyManager();

    await expect(
      manager.loadOntologyFromOntologyDocument(
        `<Ontology xmlns="${OWL_NAMESPACE}"/>`,
        configuration({ timeoutMs: 0 }),
      ),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      limit: 0,
      resource: "timeoutMs",
    });
  });

  it("cooperatively yields so an in-flight parse can be aborted", async () => {
    class CountingDataFactory extends OWLDataFactory {
      declarationsCreated = 0;

      getOWLDeclarationAxiom(...arguments_) {
        this.declarationsCreated += 1;
        return super.getOWLDeclarationAxiom(...arguments_);
      }
    }

    const dataFactory = new CountingDataFactory();
    const manager = OWLManager.createOWLOntologyManager({ dataFactory });
    const controller = new AbortController();
    const declarations = Array.from(
      { length: 25_000 },
      (_, index) =>
        `<Declaration><Class IRI="urn:test:C${index}"/></Declaration>`,
    ).join("\n");
    const loading = manager.loadOntologyFromOntologyDocument(
      `<Ontology xmlns="${OWL_NAMESPACE}">${declarations}</Ontology>`,
      configuration({ signal: controller.signal, timeoutMs: 30_000 }),
    );
    queueMicrotask(() => controller.abort());

    await expect(loading).rejects.toMatchObject({ name: "AbortError" });
    expect(dataFactory.declarationsCreated).toBeLessThan(25_000);
  });
});
