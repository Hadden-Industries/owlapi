import {
  assertRecoveredMacMeasurement,
  selectMacMeasurements,
} from "./macos-material-readmission.mjs";
import { CI_RUNTIME } from "./runtime-policy.mjs";

const platform = {
  os: "darwin",
  cpu: "arm64",
  node: CI_RUNTIME.node[26],
  npm: CI_RUNTIME.consumerNpm,
};
const row = {
  role: "portability-alias",
  commit: "a".repeat(40),
  tarballSha256: "b".repeat(64),
  resolutionSha256: "c".repeat(64),
  platform,
  observationArtifactId: 10,
  observationArtifactSha256: "d".repeat(64),
  scannerArtifactId: 20,
  scannerArtifactSha256: "e".repeat(64),
};
const index = (measurements) =>
  Buffer.from(JSON.stringify({ schemaVersion: 1, measurements }));

test("selects the exact original lock only for its role and original native runtime", () => {
  expect(selectMacMeasurements(index([row]), row)).toEqual({
    entries: [row],
    replay: row,
  });
  expect(
    selectMacMeasurements(index([row]), { ...row, role: "portability-scoped" }),
  ).toEqual({ entries: [row], replay: null });
  expect(
    selectMacMeasurements(index([row]), {
      ...row,
      platform: { ...platform, npm: CI_RUNTIME.npm },
    }),
  ).toEqual({ entries: [row], replay: null });
  expect(
    selectMacMeasurements(index([row]), {
      ...row,
      tarballSha256: "f".repeat(64),
    }),
  ).toEqual({ entries: [], replay: null });
  expect(() =>
    selectMacMeasurements(
      index([row, { ...row, resolutionSha256: "f".repeat(64) }]),
      row,
    ),
  ).toThrow(/Ambiguous signed/iu);
});

test("an npm 12 standalone original is selectable without treating it as a floor-client lock", () => {
  const producer = {
    ...row,
    platform: { ...platform, npm: CI_RUNTIME.npm },
    resolutionSha256: "7".repeat(64),
  };
  expect(selectMacMeasurements(index([producer]), producer)).toEqual({
    entries: [producer],
    replay: producer,
  });
  expect(selectMacMeasurements(index([producer]), row)).toEqual({
    entries: [],
    replay: null,
  });
});

const proof = {
  checkpoint: "1".repeat(40),
  scannerArtifacts: [row.scannerArtifactSha256],
  replayedResolutionSha256: row.resolutionSha256,
};
const evidence = {
  manifest: "original manifest",
  lock: "exact native lock",
  resolution: { platform },
};
const archive = {
  artifactId: "2".repeat(64),
  name: "new-archive",
  version: "2.0.0",
  integrity: "sha512-original",
};
const origin = {
  artifactSha256: row.scannerArtifactSha256,
  materialSha256: "3".repeat(64),
  attempt: 1,
  runId: 2,
  jobId: 3,
  commit: row.commit,
};
const original = {
  archiveMeasurements: proof,
  evidence,
  trustedArchiveMeasurements: [{ record: archive, origin }],
};

test("requires the same observed original and exact SRI from the signed scanner", () => {
  const input = {
    proof,
    evidence,
    record: { artifacts: [{ ...archive, measurementOrigin: origin }] },
  };
  expect(() => assertRecoveredMacMeasurement(original, input)).not.toThrow();
  expect(() =>
    assertRecoveredMacMeasurement(original, {
      ...input,
      proof: { ...proof, scannerArtifacts: ["4".repeat(64)] },
    }),
  ).toThrow(/unsigned scanner selection/iu);
  expect(() =>
    assertRecoveredMacMeasurement(original, {
      ...input,
      evidence: { ...evidence, lock: "different native lock" },
    }),
  ).toThrow(/signed original lock/iu);
  expect(() =>
    assertRecoveredMacMeasurement(original, {
      ...input,
      record: {
        artifacts: [
          {
            ...archive,
            integrity: "sha512-changed",
            measurementOrigin: origin,
          },
        ],
      },
    }),
  ).toThrow(/different scanner measurements/iu);
});
