import { readFileSync } from "node:fs";
import { openJsonSourceSession } from "@hadden-industries/json-quality";
import {
  assertSha384Integrity,
  toLocalProviderPath,
} from "./reference-import-map-admission.mjs";
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

// Validate the same captured bytes that are parsed below. JSON.parse alone
// collapses duplicate decoded member names in a maintainer's approval record.
const readApproval = async (path) => {
  const bytes = readFileSync(path);
  const session = await openJsonSourceSession();
  try {
    const source = {
      async *open() {
        for (let offset = 0; offset < bytes.length; offset += 65536) {
          yield bytes.subarray(offset, offset + 65536);
        }
      },
    };
    let terminal;
    for await (const event of session.check(
      source,
      {
        formatContract: "preserved-bytes",
        normalization: "preserve",
        expected: {
          sha256: sha256Buffer(bytes),
          byteLength: String(bytes.length),
          diagnostics: [],
        },
      },
      { retainValues: false },
    )) {
      if (event.ruleId === "json/no-duplicate-keys") {
        throw new Error("Duplicate member in provider pin approval record");
      }
      if (event.type === "terminal") terminal = event;
    }
    if (!terminal?.contractSatisfied)
      throw new Error("Malformed provider pin approval record");
    return JSON.parse(bytes.toString("utf8"));
  } finally {
    await session.close();
  }
};

/** Authorize each changed existing URL against the exact starting reviewed bytes. */
export const assertApprovedProviderPinChanges = async ({
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
    const approval = await readApproval(approvalPath);
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
