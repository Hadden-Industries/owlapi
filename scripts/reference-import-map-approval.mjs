import {
  assertSha384Integrity,
  toLocalProviderPath,
} from "./reference-import-map-admission.mjs";
import { readJson } from "./reference-import-map.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";

const hasFields = (object, fields) =>
  object !== null &&
  typeof object === "object" &&
  !Array.isArray(object) &&
  Object.keys(object).length === fields.length &&
  fields.every((name) => Object.hasOwn(object, name));

const validReference = (value) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  !/\p{Cc}/u.test(value);

/** Authorize each changed existing URL against the exact starting reviewed bytes. */
export const assertApprovedProviderPinChanges = ({
  startingBytes,
  startingPins,
  generatedPins,
  approvalPath,
}) => {
  const changes = new Map(
    Object.entries(startingPins).filter(
      ([url, pin]) =>
        Object.hasOwn(generatedPins, url) && generatedPins[url] !== pin,
    ),
  );
  const errors = [];
  if (approvalPath !== undefined) {
    const approval = readJson(approvalPath);
    if (
      !hasFields(approval, ["startingMapSha256", "replacements"]) ||
      !Array.isArray(approval.replacements) ||
      typeof approval.startingMapSha256 !== "string" ||
      !/^[a-f0-9]{64}$/u.test(approval.startingMapSha256)
    ) {
      throw new Error("Malformed provider pin approval record");
    }
    if (approval.startingMapSha256 !== sha256Buffer(startingBytes)) {
      throw new Error(
        "Provider pin approval does not match the exact starting reviewed map",
      );
    }
    const seen = new Set();
    for (const replacement of approval.replacements) {
      if (
        !hasFields(replacement, [
          "url",
          "previousIntegrity",
          "replacementIntegrity",
          "evidenceReference",
          "decisionReference",
        ])
      ) {
        throw new Error("Malformed provider pin replacement entry");
      }
      const {
        url,
        previousIntegrity,
        replacementIntegrity,
        evidenceReference,
        decisionReference,
      } = replacement;
      toLocalProviderPath(url);
      assertSha384Integrity(previousIntegrity, url);
      assertSha384Integrity(replacementIntegrity, url);
      if (
        !validReference(evidenceReference) ||
        !validReference(decisionReference)
      ) {
        throw new Error(
          `Provider pin approval lacks evidence or decision reference for ${url}`,
        );
      }
      if (seen.has(url))
        throw new Error(`Duplicate provider pin approval for ${url}`);
      seen.add(url);
      if (
        !changes.has(url) ||
        changes.get(url) !== previousIntegrity ||
        generatedPins[url] !== replacementIntegrity
      ) {
        errors.push(`Extra or stale provider pin approval for ${url}`);
      } else {
        changes.delete(url);
      }
    }
  }
  for (const url of changes.keys())
    errors.push(`Unapproved provider pin replacement for ${url}`);
  if (errors.length) throw new Error(errors.join("\n"));
};
