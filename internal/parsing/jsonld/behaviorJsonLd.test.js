import { jest } from "@jest/globals";
import { OWLManager } from "../../../apibinding/index.js";
import { OWLDocumentFormats } from "../../../formats/index.js";
import { StringDocumentSource } from "../../../io/index.js";
import { OWLOntologyLoaderConfiguration } from "../../../model/index.js";
import processor from "./provider/jsonld.js";

const behaviorProfileId = "java-owlapi-5.5.1";
// Independent constants observed from the released RDF4J provider.
const allowed = [
  "http://schema.org/",
  "http://www.w3.org/ns/activitystreams.jsonld",
  "http://www.w3.org/ns/anno.jsonld",
  "http://www.w3.org/ns/hydra/context.jsonld",
  "http://www.w3.org/ns/ldp.jsonld",
  "http://www.w3.org/ns/oa.jsonld",
  "http://xmlns.com/foaf/spec/index.jsonld",
  "https://auto.schema.org/",
  "https://bib.schema.org/",
  "https://geojson.org/geojson-ld/geojson-context.jsonld",
  "https://health-lifesci.schema.org/",
  "https://pending.schema.org/",
  "https://project-open-data.cio.gov/v1.1/schema/catalog.jsonld",
  "https://schema.org/",
  "https://schema.org/docs/jsonldcontext.jsonld",
  "https://schema.org/version/latest/schemaorg-all-http.jsonld",
  "https://schema.org/version/latest/schemaorg-all-https.jsonld",
  "https://schema.org/version/latest/schemaorg-all.jsonld",
  "https://schema.org/version/latest/schemaorg-current-http.jsonld",
  "https://schema.org/version/latest/schemaorg-current-https.jsonld",
  "https://schema.org/version/latest/schemaorg-current.jsonld",
  "https://w3c.github.io/json-ld-rc/context.jsonld",
  "https://w3id.org/security/v1",
  "https://www.w3.org/2018/credentials/v1",
  "https://www.w3.org/2019/wot/td/v1",
];
const context = {
  "@vocab": "urn:jsonld:",
  owl: "http://www.w3.org/2002/07/owl#",
};
const source = (url = allowed[0], format = OWLDocumentFormats.JSON_LD) =>
  new StringDocumentSource(
    JSON.stringify({
      "@context": url,
      "@id": "urn:jsonld:A",
      "@type": "owl:Class",
    }),
    { format },
  );
const load = (loader, document = source()) =>
  OWLManager.createOWLOntologyManager({
    behaviorProfileId,
    documentLoader: loader,
  }).loadOntologyFromOntologyDocument(document);

test("Java consumes the first complete JSON structure while normative rejects trailing content", async () => {
  const text =
    '{"@id":"urn:jsonld:A","@type":"http://www.w3.org/2002/07/owl#Class"} trailing-content';
  const document = new StringDocumentSource(text, {
    format: OWLDocumentFormats.JSON_LD,
  });
  expect((await load(undefined, document)).getAxiomCount()).toBe(1);
  await expect(
    OWLManager.createOWLOntologyManager({
      behaviorProfileId: "normative-v1",
    }).loadOntologyFromOntologyDocument(document),
  ).rejects.toThrow();
});

test("Java rejects malformed JSON inside its first structure even when trailing content is ignored", async () => {
  const document = new StringDocumentSource('{"@id": "urn:jsonld:A",} {}', {
    format: OWLDocumentFormats.JSON_LD,
  });
  await expect(load(undefined, document)).rejects.toThrow();
});

test("JSON-LD policy retains the selected identity when a configuration overrides its public getter", async () => {
  class MisreportedConfiguration extends OWLOntologyLoaderConfiguration {
    getBehaviorProfileId() {
      return "java-owlapi-5.5.1";
    }
  }
  const loader = {
    load: jest.fn(() => JSON.stringify({ "@context": context })),
  };
  const manager = OWLManager.createOWLOntologyManager({
    documentLoader: loader,
  });
  const ontology = await manager.loadOntologyFromOntologyDocument(
    source("https://example.com/context"),
    new MisreportedConfiguration({ remoteJsonLdContexts: true }),
  );
  expect(ontology.getAxiomCount()).toBe(1);
  expect(loader.load).toHaveBeenCalledTimes(1);
});

test("Java loads all 25 native allowlisted contexts without URL rewriting", async () => {
  const calls = [];
  const loader = {
    load(iri) {
      calls.push(iri.value);
      const next = allowed.indexOf(iri.value) + 1;
      return JSON.stringify({
        "@context": next < allowed.length ? allowed[next] : context,
      });
    },
  };
  expect((await load(loader)).getAxiomCount()).toBe(1);
  expect(calls).toEqual(allowed);
});

test("Java provider whitelist rejection precedes acquisition and ignores OWLAPI format secure-mode parameters", async () => {
  const loader = {
    load: jest.fn(() => JSON.stringify({ "@context": context })),
  };
  await expect(
    load(
      loader,
      source(
        "https://example.com/context",
        OWLDocumentFormats.JSON_LD.withParameter(
          "org.eclipse.rdf4j.rio.jsonld_secure_mode",
          false,
        ),
      ),
    ),
  ).rejects.toThrow();
  expect(loader.load).not.toHaveBeenCalled();
});

test("Java reuses successful contexts across managers within the same host authority", async () => {
  const loader = {
    load: jest.fn(() => JSON.stringify({ "@context": context })),
  };
  await load(loader);
  await load(loader);
  expect(loader.load).toHaveBeenCalledTimes(1);
  const other = {
    load: jest.fn(() => JSON.stringify({ "@context": context })),
  };
  await load(other);
  expect(other.load).toHaveBeenCalledTimes(1);
});

test("a failed Java context acquisition is retried by the next operation", async () => {
  const loader = {
    load: jest
      .fn()
      .mockRejectedValueOnce(new Error("fixture unavailable"))
      .mockResolvedValue(JSON.stringify({ "@context": context })),
  };
  await expect(load(loader)).rejects.toThrow();
  await expect(load(loader)).resolves.toBeDefined();
  expect(loader.load).toHaveBeenCalledTimes(2);
});

test("invalid context JSON is not retained in the provider cache", async () => {
  const loader = {
    load: jest
      .fn()
      .mockResolvedValueOnce("invalid-json")
      .mockResolvedValue(JSON.stringify({ "@context": context })),
  };
  await expect(load(loader)).rejects.toThrow();
  await expect(load(loader)).resolves.toBeDefined();
  expect(loader.load).toHaveBeenCalledTimes(2);
});

test("Java has no implicit JS aggregate timer", async () => {
  const loader = {
    async load() {
      await new Promise((resolve) => setTimeout(resolve, 15));
      return JSON.stringify({ "@context": context });
    },
  };
  await expect(load(loader)).resolves.toBeDefined();
});

test("cached contexts still pass a host's authorization callback", async () => {
  let permitted = true;
  const loader = {
    authorize: jest.fn(() => {
      if (!permitted) throw new Error("host revoked context access");
      return true;
    }),
    load: jest.fn(() => JSON.stringify({ "@context": context })),
  };
  await load(loader);
  permitted = false;
  await expect(load(loader)).rejects.toThrow();
  expect(loader.authorize).toHaveBeenCalledTimes(2);
  expect(loader.load).toHaveBeenCalledTimes(1);
});

test("an explicit context authorization denial prevents both acquisition and cached disclosure", async () => {
  let permitted = false;
  const loader = {
    authorize: () => permitted,
    load: jest.fn(() => JSON.stringify({ "@context": context })),
  };
  await expect(load(loader)).rejects.toThrow();
  expect(loader.load).not.toHaveBeenCalled();
  permitted = true;
  await load(loader);
  permitted = false;
  await expect(load(loader)).rejects.toThrow();
  expect(loader.load).toHaveBeenCalledTimes(1);
});

test("a redirected cached context rechecks authorization for its concrete final IRI", async () => {
  let finalPermitted = true;
  const loader = {
    authorize: (iri) => iri.value !== allowed[1] || finalPermitted,
    load: jest.fn(
      () =>
        new StringDocumentSource(JSON.stringify({ "@context": context }), {
          documentIRI: allowed[1],
        }),
    ),
  };
  await load(loader);
  finalPermitted = false;
  await expect(load(loader)).rejects.toThrow();
  expect(loader.load).toHaveBeenCalledTimes(1);
});

test("Java cache entries expire at one hour after successful completion", async () => {
  let milliseconds = 1000;
  const clock = jest.spyOn(Date, "now").mockImplementation(() => milliseconds);
  const loader = {
    load: jest.fn(() => JSON.stringify({ "@context": context })),
  };
  try {
    await load(loader);
    milliseconds += 3599999;
    await load(loader);
    expect(loader.load).toHaveBeenCalledTimes(1);
    milliseconds++;
    await load(loader);
    expect(loader.load).toHaveBeenCalledTimes(2);
  } finally {
    clock.mockRestore();
  }
});

test("concurrent Java requests share one pending acquisition within the same authority", async () => {
  let finishAcquisition;
  const pending = new Promise((resolve) => {
    finishAcquisition = resolve;
  });
  let confirmAcquisitionStarted;
  const started = new Promise((resolve) => {
    confirmAcquisitionStarted = resolve;
  });
  const loader = {
    authorize: jest.fn(() => true),
    load: jest.fn(() => {
      confirmAcquisitionStarted();
      return pending;
    }),
  };
  const first = load(loader);
  await started;
  const second = load(loader);
  // Both parse continuations run before this event-loop checkpoint; the
  // controlled external acquisition remains pending until explicitly released.
  await new Promise(setImmediate);
  expect(loader.authorize).toHaveBeenCalledTimes(2);
  expect(loader.load).toHaveBeenCalledTimes(1);
  finishAcquisition(JSON.stringify({ "@context": context }));
  await expect(Promise.all([first, second])).resolves.toHaveLength(2);
});

test.each([
  [11, undefined, true],
  [12, undefined, false],
  [257, 257, true],
  [258, 257, false],
])(
  "the provider admits exactly %i chain URLs with configured maximum %s: %s",
  async (count, maximum, succeeds) => {
    let calls = 0;
    const documentLoader = async (url) => {
      calls++;
      const index = Number(url.split("/").at(-1));
      return {
        documentUrl: url,
        contextUrl: null,
        document: {
          "@context":
            index + 1 < count ? `https://example.com/${index + 1}` : context,
        },
      };
    };
    const result = processor.toRDF(
      {
        "@context": "https://example.com/0",
        "@id": "urn:jsonld:A",
        "@type": "owl:Class",
      },
      {
        documentLoader,
        ...(maximum === undefined ? {} : { maxContextUrls: maximum }),
      },
    );
    if (succeeds) {
      expect(await result).toHaveLength(1);
      expect(calls).toBe(count);
    } else {
      await expect(result).rejects.toThrow();
      expect(calls).toBe(maximum ?? 11);
    }
  },
);
