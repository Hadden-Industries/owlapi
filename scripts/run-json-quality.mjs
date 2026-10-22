import { fileURLToPath } from "node:url";
import { runJsonQualityCli } from "../tooling/json/public-api.mjs";
import {
  provideNpmEvidenceJson,
  provideArtifactToolEvidenceJson,
} from "../util/third-party-evidence/json-documents.mjs";
import { provideMarkdownArchiveJson } from "../util/third-party-evidence/markdown-json-documents.mjs";
import { provideJsonLdLogicalJson } from "../util/conformance/jsonldJsonDocuments.mjs";
import { readRepositoryJsonPolicy } from "./json-quality-policy.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const requiredOutputs = [
  ...[
    "jsonld",
    "trig",
    "turtle",
    "nquads",
    "ntriples",
    "rdfxml",
    "owl2-rdf-to-owl",
  ].map((name) => `docs/conformance/generated/w3c-${name}.json`),
  "docs/conformance/classification-manifests.json",
  "docs/conformance/suites.json",
  "docs/conformance/owl-to-rdf-mapping.json",
  "docs/conformance/rdf-to-owl-mapping.json",
  "internal/parsing/jsonld/provider/build-manifest.json",
];

process.exitCode = await runJsonQualityCli(process.argv.slice(2), async () => {
  await readRepositoryJsonPolicy(root);
  const logical = await provideJsonLdLogicalJson({ root });
  return {
    root,
    requiredOutputs,
    ...logical,
    nativeProviders: {
      npmEvidence: provideNpmEvidenceJson,
      artifactToolEvidence: provideArtifactToolEvidenceJson,
      markdownArchives: provideMarkdownArchiveJson,
    },
  };
});
