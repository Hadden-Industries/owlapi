import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, readFileSync } from "node:fs";
import { link, lstat, mkdir, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { sha256 } from "./comparison-evidence.mjs";

export const comparisonCatalogue = JSON.parse(
  readFileSync(new URL("./comparison-fixtures.json", import.meta.url), "utf8"),
);
export const julyComparisonManifest = JSON.parse(
  readFileSync(
    new URL("./universal-ontology-july-2026.json", import.meta.url),
    "utf8",
  ),
);

export const comparisonSyntaxes = Object.freeze({
  rdfxml: { mime: "application/rdf+xml", format: "RDF_XML" },
  turtle: { mime: "text/turtle", format: "TURTLE" },
  functional: { mime: "text/owl-functional", format: "FUNCTIONAL" },
  owlxml: { mime: "application/owl+xml", format: "OWL_XML" },
  ntriples: { mime: "application/n-triples", format: "N_TRIPLES" },
  nquads: { mime: "application/n-quads", format: "N_QUADS" },
});

const cgmesWitness = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
 xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
 xmlns:owl="http://www.w3.org/2002/07/owl#" xmlns:cgmes="urn:owlapi:cgmes:">
 <owl:Ontology rdf:about="urn:owlapi:cgmes:witness"/>
 <rdf:Property rdf:about="urn:owlapi:cgmes:property">
  <rdfs:domain rdf:resource="urn:owlapi:cgmes:Class"/>
  <cgmes:dataType rdf:resource="urn:owlapi:cgmes:Resistance"/>
 </rdf:Property>
 <owl:Class rdf:about="urn:owlapi:cgmes:Class"/>
</rdf:RDF>
`;

export function generatedFixture(id, documentIRI, syntax, text) {
  return {
    id,
    collection: "comparison-witnesses",
    suite: "smoke",
    role: "root",
    syntax,
    documentIRI,
    basePolicy: "explicit-test-base",
    acquisition: "generated",
    byteLength: Buffer.byteLength(text),
    sha256: sha256(text),
    source: { kind: "generated", text },
    licenseLead: "Independently authored comparison witness",
  };
}

const example = "https://owlapi.example.test/comparison/";
const turtleHeader = "@prefix owl: <http://www.w3.org/2002/07/owl#> .\n";
const oboPublisher = "https://purl.obolibrary.org";
const oboGitHubRedirects = [
  "https://github.com",
  "https://raw.githubusercontent.com",
  "https://release-assets.githubusercontent.com",
];
const relativeRoot = generatedFixture(
  "relative-imports",
  example + "main.ttl",
  "turtle",
  turtleHeader +
    "<urn:owlapi:relative-root> a owl:Ontology; owl:imports <left/same.ttl>, <right/same.ttl> .\n" +
    "<urn:owlapi:relative-root:RootPart> a owl:Class .\n",
);
const relativeModules = ["left", "right"].map((name) => ({
  ...generatedFixture(
    `relative-import-${name}`,
    example + name + "/same.ttl",
    "turtle",
    turtleHeader + "<same.ttl> a owl:Ontology .\n<#Part> a owl:Class .\n",
  ),
  role: "module",
}));
relativeRoot.imports = relativeModules.map(({ id }) => id);
relativeRoot.closure = true;

function propertyRoleWitnesses() {
  const namespace = "urn:pilot:adjacent#";
  const [base, p, q, c, a, b, x] = ["base", "P", "Q", "C", "a", "b", "X"].map(
    (name) => namespace + name,
  );
  const element = (kind, iri, body = "") =>
    `<${kind} rdf:about="${iri}">${body}</${kind}>`;
  const link = (kind, iri) => `<${kind} rdf:resource="${iri}"/>`;
  const property = (body) => element("rdf:Description", p, body);
  const uses = {
    inverse: element("owl:ObjectProperty", q, link("owl:inverseOf", p)),
    restriction: element(
      "owl:Class",
      x,
      `<rdfs:subClassOf><owl:Restriction>${link("owl:onProperty", p)}
      ${link("owl:someValuesFrom", c)}</owl:Restriction></rdfs:subClassOf>`,
    ),
    literal: element("owl:NamedIndividual", a, "<p:P>text</p:P>"),
    individual: element("owl:NamedIndividual", a, link("p:P", b)),
    subproperty:
      property(link("rdfs:subPropertyOf", q)) +
      element("owl:ObjectProperty", q),
  };
  const domain = property(link("rdfs:domain", c));
  const metadata = property(link("p:dataType", c));
  const variants = { bare: "", domain, ...uses };
  for (const [name, use] of Object.entries(uses)) {
    variants["domain-" + name] = domain + use;
    variants["metadata-" + name] = domain + metadata + use;
  }
  return Object.entries(variants).map(([name, body]) => ({
    ...generatedFixture(
      "cgmes-" + name,
      base,
      "rdfxml",
      `<rdf:RDF
        xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
        xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
        xmlns:owl="http://www.w3.org/2002/07/owl#" xmlns:p="${namespace}">
        ${element("owl:Ontology", base)}${element("owl:Class", c)}
        ${element("rdf:Property", p)}${body}</rdf:RDF>`,
    ),
    suite: "cgmes-adjacent",
  }));
}

export const comparisonWitnesses = Object.freeze([
  generatedFixture(
    "js-closure-after-native-refusal",
    "urn:owlapi:xml-total-control",
    "rdfxml",
    `
<!DOCTYPE rdf:RDF [
<!ENTITY a "${"a".repeat(52_000)}">
<!ENTITY b "${"b".repeat(52_000)}">
]>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:owl="http://www.w3.org/2002/07/owl#">
  <owl:Ontology rdf:about="urn:owlapi:xml-total-control"/>
  <owl:Class rdf:about="urn:owlapi:xml-total-control#Kept"/>
</rdf:RDF>
`,
  ),
  generatedFixture(
    "cgmes-range-less",
    "https://owlapi.example.test/comparison/cgmes.rdf",
    "rdfxml",
    cgmesWitness,
  ),
  relativeRoot,
  ...relativeModules,
  ...propertyRoleWitnesses(),
  ...[
    generatedFixture(
      "literal-version-iri",
      example + "literal-version.ttl",
      "turtle",
      turtleHeader +
        '<urn:owlapi:literal-version> a owl:Ontology; owl:versionIRI "legacy label" .\n',
    ),
    generatedFixture(
      "object-with-datatype-range",
      example + "datatype-range.ttl",
      "turtle",
      turtleHeader +
        "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n" +
        "<urn:owlapi:range> a owl:Ontology .\n<urn:owlapi:Class> a owl:Class .\n" +
        "<urn:owlapi:property> a owl:ObjectProperty; rdfs:domain <urn:owlapi:Class>; " +
        "rdfs:range <http://www.w3.org/2001/XMLSchema#date> .\n",
    ),
    generatedFixture(
      "anonymous-annotation-range",
      example + "annotation-range.ttl",
      "turtle",
      turtleHeader +
        "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n" +
        "<urn:owlapi:range> a owl:Ontology .\n" +
        '<urn:owlapi:annotation> a owl:AnnotationProperty; rdfs:range [ a rdfs:Datatype; owl:oneOf ("a") ] .\n',
    ),
    generatedFixture(
      "annotation-datatype-range-domain",
      example + "annotation-range-domain.ttl",
      "turtle",
      turtleHeader +
        "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n" +
        "<urn:owlapi:range-domain> a owl:Ontology .\n" +
        "<urn:owlapi:Domain> a owl:ObjectProperty .\n" +
        "<urn:owlapi:annotation> a owl:AnnotationProperty; rdfs:domain <urn:owlapi:Domain>; " +
        'rdfs:range [ a rdfs:Datatype; owl:oneOf ("a") ] .\n',
    ),
    generatedFixture(
      "orphan-datatype-class-union",
      example + "orphan-datatype-union.ttl",
      "turtle",
      turtleHeader +
        "@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n" +
        "<urn:owlapi:orphan-union> a owl:Ontology .\n" +
        "<urn:owlapi:Class> a owl:Class .\n" +
        "[] a owl:Class; owl:unionOf (xsd:date xsd:dateTime) .\n",
    ),
    generatedFixture(
      "punned-annotation-and-data",
      example + "punned-property.ttl",
      "turtle",
      turtleHeader +
        "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n" +
        "<urn:owlapi:punning> a owl:Ontology .\n" +
        "<urn:owlapi:label> a owl:AnnotationProperty, owl:DatatypeProperty; " +
        "rdfs:range <http://www.w3.org/2001/XMLSchema#string> .\n" +
        '<urn:owlapi:Class> a owl:Class; <urn:owlapi:label> "class label" .\n' +
        '<urn:owlapi:Individual> a owl:NamedIndividual; <urn:owlapi:label> "individual label" .\n',
    ),
    generatedFixture(
      "empty-has-key",
      example + "empty-key.ttl",
      "turtle",
      turtleHeader +
        "<urn:owlapi:key> a owl:Ontology .\n" +
        "<urn:owlapi:Class> a owl:Class; owl:hasKey () .\n",
    ),
    generatedFixture(
      "string-cardinality",
      example + "string-cardinality.ttl",
      "turtle",
      turtleHeader +
        "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n" +
        "<urn:owlapi:cardinality> a owl:Ontology .\n" +
        "<urn:owlapi:property> a owl:ObjectProperty .\n" +
        "<urn:owlapi:Class> a owl:Class; rdfs:subClassOf [ a owl:Restriction; " +
        'owl:onProperty <urn:owlapi:property>; owl:minCardinality "1" ] .\n',
    ),
  ].map((fixture) => ({ ...fixture, suite: "java-permissive" })),
]);

const julyRoots = new Map(
  julyComparisonManifest.roots.map(({ path, name }) => [path, name]),
);
const julyId = (path) =>
  `july/${julyRoots.get(path) ?? path.split("/").at(-1)}`;
export const julyComparisonFixtures = Object.freeze(
  julyComparisonManifest.mappings.map(({ path, ontologyIRI }) => ({
    ...julyComparisonManifest.originals[path],
    id: julyId(path),
    collection: "universal-ontology-july-2026",
    suite: "july",
    documentIRI: ontologyIRI,
    ontologyIRI,
    basePolicy: "canonical-ontology-base",
    source: { kind: "git", path, revision: julyComparisonManifest.revision },
    acquisition: "local-only",
    role: julyRoots.has(path) ? "root" : "module",
    closure: julyRoots.has(path),
    imports: julyComparisonManifest.mappings
      .filter((entry) => entry.path !== path)
      .map((entry) => julyId(entry.path)),
  })),
);

function assertFixturePin(fixture) {
  if (
    !Number.isSafeInteger(fixture.byteLength) ||
    fixture.byteLength < 1 ||
    !/^[0-9a-f]{64}$/u.test(fixture.sha256) ||
    !Object.hasOwn(comparisonSyntaxes, fixture.syntax)
  ) {
    throw new Error(`Invalid original byte pin or syntax for ${fixture.id}`);
  }
  const documentIRI = new URL(fixture.documentIRI);
  if (!["http:", "https:", "urn:"].includes(documentIRI.protocol)) {
    throw new Error(`Unsupported document IRI for ${fixture.id}`);
  }
}

export async function verifyPinnedFile(path, pin) {
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
  if (!info.isFile() || info.size !== pin.byteLength) {
    throw new Error(`Stored bytes have the wrong type or length for ${pin.id}`);
  }
  const digest = createHash("sha256");
  let byteLength = 0;
  for await (const chunk of createReadStream(path)) {
    byteLength += chunk.length;
    if (byteLength > pin.byteLength)
      throw new Error(`Stored bytes grew for ${pin.id}`);
    digest.update(chunk);
  }
  if (byteLength !== pin.byteLength || digest.digest("hex") !== pin.sha256) {
    throw new Error(`Stored bytes have the wrong digest for ${pin.id}`);
  }
  return true;
}

/** Admit native runtime JARs and ontology inputs without replacing existing objects. */
export async function publishPinnedBytes(path, pin, openInput) {
  if (await verifyPinnedFile(path, pin)) return path;
  await mkdir(dirname(path), { recursive: true });
  const pending = `${path}.${randomUUID()}.pending`;
  const digest = createHash("sha256");
  let byteLength = 0;
  const checkBytes = new Transform({
    transform(chunk, encoding, callback) {
      byteLength += chunk.length;
      if (byteLength > pin.byteLength) {
        callback(new Error(`Acquisition exceeded the byte pin for ${pin.id}`));
        return;
      }
      digest.update(chunk);
      callback(null, chunk);
    },
  });
  try {
    await pipeline(
      await openInput(),
      checkBytes,
      createWriteStream(pending, { flags: "wx" }),
    );
    if (byteLength !== pin.byteLength || digest.digest("hex") !== pin.sha256) {
      throw new Error(`Acquired bytes differ from the original for ${pin.id}`);
    }
    try {
      await link(pending, path);
    } catch (error) {
      if (error.code !== "EEXIST" || !(await verifyPinnedFile(path, pin)))
        throw error;
    }
    return path;
  } finally {
    await rm(pending, { force: true });
  }
}

export async function fetchPinnedBytes(
  source,
  { fetchImpl = globalThis.fetch, accept } = {},
) {
  const origin = new URL(source.url).origin;
  const approved = new Set([
    origin,
    ...source.redirects,
    ...(origin === oboPublisher ? oboGitHubRedirects : []),
  ]);
  let url = new URL(source.url);
  const signal = AbortSignal.timeout(60_000);
  for (let redirects = 0; redirects <= 5; redirects++) {
    if (
      url.protocol !== "https:" ||
      !approved.has(url.origin) ||
      url.username ||
      url.password
    ) {
      throw new Error(`Redirect to an unapproved source origin: ${url.origin}`);
    }
    const response = await fetchImpl(url, {
      redirect: "manual",
      signal,
      ...(accept ? { headers: { Accept: accept } } : {}),
    });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      const location = response.headers.get("location");
      if (!location)
        throw new Error("Fixture retrieval redirect lacks a Location");
      url = new URL(location, url);
      continue;
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error(
        `Fixture retrieval returned HTTP ${response.status} from ${url.origin}`,
      );
    }
    return Readable.fromWeb(response.body);
  }
  throw new Error("Fixture retrieval exceeded the redirect limit");
}

export async function resolveComparisonFixture(
  fixture,
  environment,
  prepare = false,
) {
  if (fixture.acquisition === "unavailable") {
    throw new Error(
      `Original bytes unavailable for ${fixture.id}: ${fixture.reason}`,
    );
  }
  assertFixturePin(fixture);
  if (!isAbsolute(environment.cacheDirectory ?? "")) {
    throw new Error("An absolute comparison cache directory is required");
  }
  const path = join(environment.cacheDirectory, "objects", fixture.sha256);
  if (await verifyPinnedFile(path, fixture)) return path;

  const seed = environment.localSeeds?.get(fixture.id);
  if (seed !== undefined && !isAbsolute(seed)) {
    throw new Error(`Local seed path must be absolute for ${fixture.id}`);
  }
  if (seed !== undefined && !(await verifyPinnedFile(seed, fixture))) {
    throw new Error(`Local seed path is missing for ${fixture.id}`);
  }
  if (fixture.source.kind === "generated") {
    return publishPinnedBytes(path, fixture, () =>
      Readable.from([fixture.source.text]),
    );
  }
  if (!prepare) {
    if (seed) return resolve(seed);
    throw new Error(`Missing verified offline object for ${fixture.id}`);
  }
  if (!seed && fixture.acquisition === "local-only") {
    throw new Error(`An authorized local seed is required for ${fixture.id}`);
  }
  return publishPinnedBytes(path, fixture, () =>
    seed
      ? createReadStream(seed)
      : fetchPinnedBytes(fixture.source, {
          fetchImpl: environment.fetchImpl,
          accept: comparisonSyntaxes[fixture.syntax].mime,
        }),
  );
}
