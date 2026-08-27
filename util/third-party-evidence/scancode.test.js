import { readFileSync } from "node:fs";
import {
  SCANCODE_EXECUTION_OPTIONS,
  SCANCODE_SEMANTIC_OPTIONS,
  SCANCODE_TOOL,
  buildScancodeArguments,
  normalizeScancodeReport,
} from "./scancode.mjs";
import { sha256, stableJson } from "./digests.mjs";

const readFixture = (name) =>
  JSON.parse(
    readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"),
  );

const WINDOWS_ROOT =
  "C:\\Users\\runner\\work\\owlapi\\.release\\scan\\artifact-a";
const UBUNTU_ROOT = "/home/runner/work/owlapi/.release/scan/artifact-a";

describe("normalizeScancodeReport", () => {
  it("produces identical evidence from Windows and Ubuntu execution metadata", () => {
    const windows = normalizeScancodeReport(
      readFixture("scancode-report.windows.json"),
      { artifactId: "artifact-a", inputRoot: WINDOWS_ROOT },
    );
    const ubuntu = normalizeScancodeReport(
      readFixture("scancode-report.ubuntu.json"),
      { artifactId: "artifact-a", inputRoot: UBUNTU_ROOT },
    );

    expect(windows).toEqual(ubuntu);
    expect(windows).toMatchObject({
      artifactId: "artifact-a",
      scanner: {
        name: "scancode-toolkit",
        version: "32.5.0",
        outputFormatVersion: "4.1.0",
        semanticOptions: SCANCODE_SEMANTIC_OPTIONS,
        executionOptions: SCANCODE_EXECUTION_OPTIONS,
      },
    });
    expect(windows.files.map(({ path }) => path)).toEqual([
      "package/LICENSE",
      "package/lib/index.js",
    ]);
    expect(stableJson(windows)).not.toMatch(
      /Users|home|runner|start_timestamp|duration|operating_system/iu,
    );
  });

  it("changes the normalized digest for a substantive licence finding", () => {
    const report = readFixture("scancode-report.ubuntu.json");
    const baseline = normalizeScancodeReport(report, {
      artifactId: "artifact-a",
      inputRoot: UBUNTU_ROOT,
    });
    report.files.find(
      ({ name }) => name === "LICENSE",
    ).detected_license_expression_spdx = "Apache-2.0";
    const changed = normalizeScancodeReport(report, {
      artifactId: "artifact-a",
      inputRoot: UBUNTU_ROOT,
    });

    expect(sha256(stableJson(changed))).not.toBe(sha256(stableJson(baseline)));
  });

  it.each([
    [
      "wrong scanner version",
      (report) => {
        report.headers[0].tool_version = "32.4.1";
      },
      /ScanCode version/iu,
    ],
    [
      "missing semantic option",
      (report) => {
        report.headers[0].options["--license-text"] = false;
      },
      /semantic option/iu,
    ],
    [
      "different worker count",
      (report) => {
        report.headers[0].options["--processes"] = 2;
      },
      /execution option/iu,
    ],
    [
      "header error",
      (report) => {
        report.headers[0].errors = ["failed to scan input"];
      },
      /scan error/iu,
    ],
    [
      "file error",
      (report) => {
        report.files[0].scan_errors = ["unable to read file"];
      },
      /scan error/iu,
    ],
    [
      "outside-root path",
      (report) => {
        report.files[0].path = "/tmp/unrelated/LICENSE";
      },
      /outside the ScanCode input root/iu,
    ],
    [
      "relative sibling-root path",
      (report) => {
        report.files[1].path = "different-artifact/package/LICENSE";
      },
      /outside the ScanCode input root/iu,
    ],
  ])("rejects a %s", (_label, mutate, message) => {
    const report = readFixture("scancode-report.ubuntu.json");
    mutate(report);

    expect(() =>
      normalizeScancodeReport(report, {
        artifactId: "artifact-a",
        inputRoot: UBUNTU_ROOT,
      }),
    ).toThrow(message);
  });
});

describe("SCANCODE_TOOL", () => {
  it("pins the independently checksum-verified Python 3.14 Windows and Linux assets", () => {
    expect(SCANCODE_TOOL).toMatchObject({
      version: "32.5.0",
      assets: {
        windows: {
          url: expect.stringContaining("_py3.14-windows.zip"),
          sha256:
            "74dfca9f0f2a607dbc90cfbfd03df1ed5b3e7e4b3a12dbb028e0d158c1311ec5",
        },
        linux: {
          url: expect.stringContaining("_py3.14-linux.tar.gz"),
          sha256:
            "02be93341e2f9775f88b4abd03cdd74f2e4de91941a12a1d8cd150eeb72a0945",
        },
      },
    });
  });

  it("bounds Python 3.14 scans to one worker without changing the semantic option set", () => {
    expect(SCANCODE_EXECUTION_OPTIONS).toEqual(["--processes", "1"]);
    expect(
      buildScancodeArguments({
        outputPath: "C:\\release\\report.json",
        inputRoot: "C:\\release\\scan\\artifact-a",
      }),
    ).toEqual([
      ...SCANCODE_SEMANTIC_OPTIONS,
      "--processes",
      "1",
      "--json-pp",
      "C:\\release\\report.json",
      "C:\\release\\scan\\artifact-a",
    ]);
  });
});
