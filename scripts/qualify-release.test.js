import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  contractReport,
  nativeContractText,
} from "./fixtures/owl-contract-report.mjs";
import {
  assertDryRunMatchesCandidate,
  assertPrepublicationOwlContract,
  assertRecordedRequirement,
  assertRegistryBootstrapState,
  normalizeNpmPublishDryRun,
  npmPublishDryRunInvocation,
  readContractEvidenceFile,
  selectRecordedDefinitions,
} from "./qualify-release.mjs";

const candidate = {
  package: { name: "@hadden-industries/owlapi", version: "0.1.0-rc.2" },
  tarball: {
    fileName: "hadden-industries-owlapi-0.1.0-rc.2.tgz",
    sha256: "a".repeat(64),
    bytes: 1234,
  },
  packedPaths: ["README.md", "index.js", "package.json"],
};

describe("release-candidate publication qualification", () => {
  test("bounds downloaded contract evidence and rejects directories", () => {
    const directory = mkdtempSync(join(tmpdir(), "owl-contract-reader-"));
    try {
      const evidence = join(directory, "native.ndjson");
      writeFileSync(evidence, "{}\n");
      expect(readContractEvidenceFile(evidence)).toBe("{}\n");
      writeFileSync(evidence, Buffer.alloc(256 * 1024 + 1));
      expect(() => readContractEvidenceFile(evidence)).toThrow(/size/u);
      const nested = join(directory, "directory");
      mkdirSync(nested);
      expect(() => readContractEvidenceFile(nested)).toThrow(/type/u);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  const acceptedContract = () => {
    const report = contractReport(undefined, {
      workflow: "Release",
      tarballSha256: candidate.tarball.sha256,
    });
    return {
      candidate,
      report,
      nativeText: nativeContractText,
      identity: report.identity,
      artifact: report.candidate.artifact,
      pinnedSources: report.consumerSources,
    };
  };
  test("prepublication accepts the same native OWL suite without downstream reports", () => {
    const input = acceptedContract();
    expect(assertPrepublicationOwlContract(input)).toBe(input.report);
  });
  test.each(["commit", "tree"])(
    "rejects a substituted consumer %s even with identical interface blobs",
    (field) => {
      const input = acceptedContract();
      input.pinnedSources = JSON.parse(JSON.stringify(input.pinnedSources));
      input.pinnedSources.snapshots[0][field] = "9".repeat(40);
      expect(() => assertPrepublicationOwlContract(input)).toThrow(/pin/iu);
    },
  );
  test.each([
    "candidate",
    "native",
    "source",
    "workflow",
    "attempt",
    "missing",
    "skipped",
    "artifact",
  ])("rejects invalid prepublication contract %s", (fault) => {
    const input = acceptedContract();
    if (fault === "candidate")
      input.candidate = {
        ...candidate,
        tarball: { ...candidate.tarball, sha256: "b".repeat(64) },
      };
    if (fault === "native")
      input.nativeText = input.nativeText.replace("passed", "failed");
    if (fault === "source") input.pinnedSources = {};
    if (fault === "workflow")
      input.identity = { ...input.identity, runId: 999 };
    if (fault === "attempt")
      input.identity = { ...input.identity, runAttempt: 1 };
    if (fault === "missing") input.report.assertions.pop();
    if (fault === "skipped") input.report.assertions[0].skipped = true;
    if (fault === "artifact") input.artifact = { ...input.artifact, id: 999 };
    expect(() => assertPrepublicationOwlContract(input)).toThrow();
  });

  test("cannot accept a lifecycle result before the parity checkpoint passes", () => {
    const text = readFileSync(
      new URL("../docs/release/producer-gates.json", import.meta.url),
      "utf8",
    );
    const definitions = JSON.parse(text);
    const passed = (requirementId) => ({
      requirementId,
      finalResult: "PASS",
      requirementDigest: definitions.requirements.find(
        (row) => row.requirementId === requirementId,
      ).requirementDigest,
    });
    const record = {
      accepted: true,
      definitionDigests: {
        gateRegistrySha256: createHash("sha256").update(text).digest("hex"),
      },
      requirements: [passed("P22-PRODUCER-CORPUS-001")],
    };
    expect(() =>
      assertRecordedRequirement(record, "P22-PRODUCER-CORPUS-001"),
    ).toThrow(/P21-PRODUCER-CHECKPOINT-001 is not PASS/u);
    record.requirements.push(passed("P21-PRODUCER-CHECKPOINT-001"));
    for (const requirementId of [
      "P21-INTEGRATION-001",
      "P21-PARITY-001",
      "P21-OWL-CONTRACT-001",
    ]) {
      expect(() =>
        assertRecordedRequirement(record, "P22-PRODUCER-CORPUS-001"),
      ).toThrow(new RegExp(`${requirementId} is not PASS`, "u"));
      record.requirements.push(passed(requirementId));
    }
    expect(
      assertRecordedRequirement(record, "P22-PRODUCER-CORPUS-001"),
    ).toEqual({
      requirementId: "P22-PRODUCER-CORPUS-001",
      finalResult: "PASS",
    });
    record.requirements.find(
      ({ requirementId }) => requirementId === "P21-OWL-CONTRACT-001",
    ).finalResult = "PRODUCT_FAILURE";
    expect(() =>
      assertRecordedRequirement(record, "P22-PRODUCER-CORPUS-001"),
    ).toThrow(/P21-OWL-CONTRACT-001 is not PASS/u);
  });
  test("historical ledgers select their recorded definitions without translating retired IDs", () => {
    const text = readFileSync(
      new URL("../docs/release/gates.json", import.meta.url),
      "utf8",
    );
    const definitions = JSON.parse(text);
    const requirementId = "P19-SCOPE-001";
    const definition = definitions.requirements.find(
      (row) => row.requirementId === requirementId,
    );
    const record = {
      accepted: true,
      definitionDigests: {
        gateRegistrySha256: createHash("sha256").update(text).digest("hex"),
      },
      requirements: [
        {
          requirementId,
          requirementDigest: definition.requirementDigest,
          finalResult: "PASS",
        },
      ],
    };
    expect(selectRecordedDefinitions(record)).toEqual(definitions);
    expect(assertRecordedRequirement(record, requirementId)).toEqual({
      requirementId,
      finalResult: "PASS",
    });
    record.requirements[0].requirementDigest = `sha256:${"0".repeat(64)}`;
    expect(() => assertRecordedRequirement(record, requirementId)).toThrow(
      /not PASS/u,
    );
    record.definitionDigests.gateRegistrySha256 = "0".repeat(64);
    expect(() => selectRecordedDefinitions(record, text)).toThrow(
      /exact recorded/u,
    );
  });

  test("normalizes npm 12's single package-keyed dry-run envelope", () => {
    const record = {
      name: "@hadden-industries/owlapi",
      version: "0.1.0-rc.2",
      filename: "hadden-industries-owlapi-0.1.0-rc.2.tgz",
    };

    expect(
      normalizeNpmPublishDryRun({ "@hadden-industries/owlapi": record }),
    ).toEqual(record);
  });

  test("rejects an ambiguous or mislabeled dry-run envelope", () => {
    expect(() =>
      normalizeNpmPublishDryRun({
        owlapi: { name: "@hadden-industries/owlapi", version: "0.1.0-rc.2" },
        other: { name: "other", version: "1.0.0" },
      }),
    ).toThrow(/exactly one package record/u);
    expect(() =>
      normalizeNpmPublishDryRun({
        unexpected: {
          name: "@hadden-industries/owlapi",
          version: "0.1.0-rc.2",
        },
      }),
    ).toThrow(/key disagrees/u);
  });

  test("invokes the exact npm CLI through Node without a command shell", () => {
    expect(
      npmPublishDryRunInvocation({
        npmCli: "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js",
        tarballPath: "C:\\candidate\\owlapi.tgz",
      }),
    ).toMatchObject({
      command: process.execPath,
      arguments: [
        "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js",
        "publish",
        "C:\\candidate\\owlapi.tgz",
        "--dry-run",
        "--tag",
        "next",
        "--access",
        "public",
        "--registry=https://registry.npmjs.org/",
        "--json",
      ],
    });
  });

  test("accepts an exact npm dry-run projection of the retained tarball", () => {
    expect(
      assertDryRunMatchesCandidate({
        candidate,
        dryRun: {
          name: "@hadden-industries/owlapi",
          version: "0.1.0-rc.2",
          filename: "hadden-industries-owlapi-0.1.0-rc.2.tgz",
          size: 1234,
          entryCount: 3,
          files: [
            { path: "package.json" },
            { path: "README.md" },
            { path: "index.js" },
          ],
        },
      }),
    ).toEqual({
      coordinate: "@hadden-industries/owlapi@0.1.0-rc.2",
      fileCount: 3,
      tarballSha256: "a".repeat(64),
    });
  });

  test("rejects a dry run with an extra packed path", () => {
    expect(() =>
      assertDryRunMatchesCandidate({
        candidate,
        dryRun: {
          name: "@hadden-industries/owlapi",
          version: "0.1.0-rc.2",
          filename: "hadden-industries-owlapi-0.1.0-rc.2.tgz",
          size: 1234,
          entryCount: 4,
          files: [
            { path: "package.json" },
            { path: "README.md" },
            { path: "index.js" },
            { path: "unexpected.js" },
          ],
        },
      }),
    ).toThrow(/packlist/u);
  });

  test("accepts only the absent-coordinate direct-bootstrap state", () => {
    expect(
      assertRegistryBootstrapState({
        canonicalTagExists: false,
        registryVersion: null,
        retainedSha256: "a".repeat(64),
      }),
    ).toEqual({ action: "DIRECT_BOOTSTRAP_READY" });
  });

  test("rejects an already public coordinate at pre-publication time", () => {
    expect(() =>
      assertRegistryBootstrapState({
        canonicalTagExists: false,
        registryVersion: { tarballSha256: "a".repeat(64) },
        retainedSha256: "a".repeat(64),
      }),
    ).toThrow(/already public/u);
  });

  test("accepts only a terminal PASS result for a requested gate requirement", () => {
    const text = readFileSync(
      new URL("../docs/release/producer-gates.json", import.meta.url),
      "utf8",
    );
    const definitions = JSON.parse(text);
    const binding = {
      definitionDigests: {
        gateRegistrySha256: createHash("sha256").update(text).digest("hex"),
      },
    };
    const requirementDigest = definitions.requirements.find(
      (row) => row.requirementId === "P19-PRODUCER-SCOPE-001",
    ).requirementDigest;
    expect(
      assertRecordedRequirement(
        {
          ...binding,
          accepted: true,
          requirements: [
            {
              requirementId: "P19-PRODUCER-SCOPE-001",
              requirementDigest,
              finalResult: "PASS",
            },
          ],
        },
        "P19-PRODUCER-SCOPE-001",
      ),
    ).toEqual({ requirementId: "P19-PRODUCER-SCOPE-001", finalResult: "PASS" });
    expect(() =>
      assertRecordedRequirement(
        {
          ...binding,
          accepted: false,
          requirements: [
            {
              requirementId: "P19-PRODUCER-SCOPE-001",
              requirementDigest,
              finalResult: "CONTROL_FAILURE",
            },
          ],
        },
        "P19-PRODUCER-SCOPE-001",
      ),
    ).toThrow(/not PASS/u);
  });
});
