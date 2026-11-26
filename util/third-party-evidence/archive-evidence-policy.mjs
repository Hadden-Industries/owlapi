import { PUBLIC_REGISTRY_ORIGIN } from "./format.mjs";
import {
  SCANCODE_EXECUTION_OPTIONS,
  SCANCODE_NORMALIZATION_VERSION,
  SCANCODE_PRE_SCAN_EXCLUDED_FILE_SUFFIXES,
  SCANCODE_SEMANTIC_OPTIONS,
  SCANCODE_TOOL,
} from "./scancode.mjs";

/** Acquisition policy shared by the source corpus and separately observed archives. */
export const archiveEvidencePolicy = () => ({
  registryOrigin: PUBLIC_REGISTRY_ORIGIN,
  provenance: "VERIFY_WHEN_PUBLISHED",
  scanner: {
    name: SCANCODE_TOOL.name,
    version: SCANCODE_TOOL.version,
    pythonVersion: SCANCODE_TOOL.pythonVersion,
    outputFormatVersion: SCANCODE_TOOL.outputFormatVersion,
    normalizationVersion: SCANCODE_NORMALIZATION_VERSION,
    semanticOptions: SCANCODE_SEMANTIC_OPTIONS,
    preScanExcludedFileSuffixes: SCANCODE_PRE_SCAN_EXCLUDED_FILE_SUFFIXES,
    executionOptions: SCANCODE_EXECUTION_OPTIONS,
  },
});
