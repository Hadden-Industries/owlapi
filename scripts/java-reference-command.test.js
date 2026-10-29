import { JAVA_TOOLCHAIN } from "./java-toolchain.mjs";
import { expect, test } from "@jest/globals";
import { assertNativeReferenceInputs } from "./java-reference-command.mjs";
import { createReferenceInputRecord } from "../util/owlapi-reference/reference-inputs.mjs";

const reverseMembers = (value) =>
  Array.isArray(value)
    ? value.map(reverseMembers)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .reverse()
            .map(([key, entry]) => [key, reverseMembers(entry)]),
        )
      : value;
test("native input admission accepts serialized member permutations but rejects changed facts", () => {
  const environment = Object.fromEntries(
    [
      "runtime",
      "java.version",
      "java.vendor",
      "java.vm.name",
      "java.vm.version",
      "os.name",
      "os.version",
      "os.arch",
      "file.encoding",
      "native.encoding",
      "stdout.encoding",
      "stderr.encoding",
      "locale",
      "timezone",
    ].map((key) => [key, "fixture"]),
  );
  const record = createReferenceInputRecord({
    sourceCommit: "b61ebe2da83daceebb3e7ba7afbd2582c9240c33",
    sourceTree: "b8dad5241dae6ff3bd3b755b9a1c605623eeb2c2",
    externalSha256: "1".repeat(64),
    runtimeGraphSha256: "2".repeat(64),
    mavenDistributionSha256: "3".repeat(64),
    jdkDistributionSha256: "4".repeat(64),
    environment: {
      ...environment,
      runtime: JAVA_TOOLCHAIN.runtime,
      "java.version": JAVA_TOOLCHAIN.version,
      "java.vendor": "Eclipse Adoptium",
      "java.vm.version": JAVA_TOOLCHAIN.runtime,
      "file.encoding": "UTF-8",
      "stdout.encoding": "UTF-8",
      "stderr.encoding": "UTF-8",
      locale: "en-GB",
      timezone: "UTC",
      "os.arch": "amd64",
      "os.name": "Linux",
    },
    host: {
      os: "Linux",
      architecture: "X64",
      image: "ubuntu24",
      imageVersion: "20261001.1.0",
    },
  });
  const reordered = JSON.parse(JSON.stringify(reverseMembers(record)));
  expect(assertNativeReferenceInputs(reordered)).toEqual(record);
  reordered.semantic.host.imageVersion = "20261002.1.0";
  expect(() => assertNativeReferenceInputs(reordered)).toThrow(
    "no longer matches",
  );
});
