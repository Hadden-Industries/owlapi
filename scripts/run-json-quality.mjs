import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  openJsonRepositorySession,
  runJsonQualityCli,
} from "../tooling/json/public-api.mjs";
import {
  provideNpmEvidenceJson,
  provideArtifactToolEvidenceJson,
} from "../util/third-party-evidence/json-documents.mjs";
import { provideMarkdownArchiveJson } from "../util/third-party-evidence/markdown-json-documents.mjs";
import {
  capturedJsonLdInventory,
  jsonLdContainerPaths,
} from "../util/conformance/jsonldJsonDocuments.mjs";
import { capturedRepositoryPolicy } from "./json-quality-policy.mjs";

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

const context = () => ({
  root,
  requiredOutputs,
  logicalProviders: [
    {
      definition: {
        id: "repository-policy-approval",
        minimumDocuments: 0,
        containerPaths: [".json-quality.json"],
      },
      inventory: (access) => capturedRepositoryPolicy(access, { root }),
    },
    {
      definition: {
        id: "w3c-jsonld",
        minimumDocuments: 961,
        containerPaths: jsonLdContainerPaths,
      },
      inventory: capturedJsonLdInventory,
    },
  ],
  nativeProviders: {
    npmEvidence: provideNpmEvidenceJson,
    artifactToolEvidence: provideArtifactToolEvidenceJson,
    markdownArchives: provideMarkdownArchiveJson,
  },
});

/** Fixed complete OwlAPI scope; invocation options cannot replace trusted owners. */
export function openRepositoryJsonSession(options = {}) {
  return openJsonRepositorySession({ ...options, ...context() });
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
)
  process.exitCode = await runJsonQualityCli(process.argv.slice(2), context);
