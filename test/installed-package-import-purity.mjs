import assert from "node:assert/strict";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";

const observations = [];
const deny = (surface) => () => {
  observations.push(surface);
  throw new Error(`Unexpected import-time operation through ${surface}`);
};

globalThis.fetch = deny("fetch");
for (const [container, methods, prefix] of [
  [dns, ["lookup", "resolve", "resolve4", "resolve6"], "dns"],
  [http, ["get", "request"], "http"],
  [https, ["get", "request"], "https"],
  [net, ["connect", "createConnection"], "net"],
  [tls, ["connect"], "tls"],
]) {
  for (const method of methods) {
    container[method] = deny(`${prefix}.${method}`);
  }
}

const globalKeysBefore = new Set(Reflect.ownKeys(globalThis));
const [
  root,
  apibinding,
  model,
  io,
  formats,
  util,
  profiles,
  parameters,
  search,
  renderer,
  locality,
] = await Promise.all([
  import("owlapi"),
  import("owlapi/apibinding"),
  import("owlapi/model"),
  import("owlapi/io"),
  import("owlapi/formats"),
  import("owlapi/util"),
  import("owlapi/profiles"),
  import("owlapi/model/parameters"),
  import("owlapi/search"),
  import("owlapi/manchestersyntax/renderer"),
  import("owlapi/modularity/locality"),
]);
const globalKeysAfter = Reflect.ownKeys(globalThis).filter(
  (key) => !globalKeysBefore.has(key),
);

assert.deepEqual(observations, []);
assert.deepEqual(globalKeysAfter, []);
assert.strictEqual(root.OWLManager, apibinding.OWLManager);
assert.strictEqual(root.OWLDataFactory, model.OWLDataFactory);
assert.strictEqual(root.StringDocumentSource, io.StringDocumentSource);
assert.strictEqual(root.OWLDocumentFormats, formats.OWLDocumentFormats);
assert.strictEqual(root.OWL2DLProfile, profiles.OWL2DLProfile);
assert.strictEqual(root.Imports, parameters.Imports);
assert.strictEqual(root.AxiomAnnotations, parameters.AxiomAnnotations);
assert.strictEqual(root.EntitySearcher, search.EntitySearcher);
assert.strictEqual(root.LocalityClass, locality.LocalityClass);
assert.strictEqual(
  root.SyntacticLocalityModuleExtractor,
  locality.SyntacticLocalityModuleExtractor,
);
assert.strictEqual(
  root.ManchesterOWLSyntaxOWLObjectRendererImpl,
  renderer.ManchesterOWLSyntaxOWLObjectRendererImpl,
);
assert.strictEqual(root.OWLOntologyMerger, util.OWLOntologyMerger);
assert.strictEqual(
  root.OWLOntologyImportsClosureSetProvider,
  util.OWLOntologyImportsClosureSetProvider,
);

process.stdout.write("Installed owlapi imports are pure\n");
