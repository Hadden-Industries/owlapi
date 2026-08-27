import { readFileSync } from "node:fs";
import {
  SCANCODE_EXECUTION_OPTIONS,
  SCANCODE_PRE_SCAN_EXCLUDED_FILE_SUFFIXES,
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
        preScanExcludedFileSuffixes: SCANCODE_PRE_SCAN_EXCLUDED_FILE_SUFFIXES,
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

  it("replaces transient ScanCode graph UIDs with npm PURLs without breaking references", () => {
    const firstReport = readFixture("scancode-report.ubuntu.json");
    const secondReport = readFixture("scancode-report.ubuntu.json");
    const configureGraph = (report, packageUuid, dependencyUuid) => {
      const packageUid = `pkg:npm/alpha@1.0.0?uuid=${packageUuid}`;
      report.packages[0].purl = "pkg:npm/alpha@1.0.0";
      report.packages[0].package_uid = packageUid;
      report.files.find(({ name }) => name === "LICENSE").for_packages = [
        packageUid,
      ];
      report.dependencies = [
        {
          dependency_uid: `pkg:npm/beta@2.0.0?uuid=${dependencyUuid}`,
          for_package_uid: packageUid,
          datafile_path: "artifact-a/package/package.json",
          extracted_requirement: "^2.0.0",
          is_direct: true,
          is_runtime: true,
          purl: "pkg:npm/beta@2.0.0",
          scope: "dependencies",
        },
      ];
    };
    configureGraph(
      firstReport,
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    );
    configureGraph(
      secondReport,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    );

    const first = normalizeScancodeReport(firstReport, {
      artifactId: "artifact-a",
      inputRoot: UBUNTU_ROOT,
    });
    const second = normalizeScancodeReport(secondReport, {
      artifactId: "artifact-a",
      inputRoot: UBUNTU_ROOT,
    });

    expect(first).toEqual(second);
    expect(first.scanner.normalizationVersion).toBe(1);
    expect(first.packages[0]).toMatchObject({
      purl: "pkg:npm/alpha@1.0.0",
    });
    expect(first.packages[0]).not.toHaveProperty("package_uid");
    expect(first.files.find(({ name }) => name === "LICENSE")).toMatchObject({
      for_packages: ["pkg:npm/alpha@1.0.0"],
    });
    expect(first.dependencies[0]).toMatchObject({
      for_package_purl: "pkg:npm/alpha@1.0.0",
      purl: "pkg:npm/beta@2.0.0",
    });
    expect(first.dependencies[0]).not.toHaveProperty("dependency_uid");
    expect(first.dependencies[0]).not.toHaveProperty("for_package_uid");
  });

  it("preserves a null owner for an unassociated dependency instance", () => {
    const report = readFixture("scancode-report.ubuntu.json");
    report.dependencies = [
      {
        dependency_uid:
          "pkg:npm/%40babel/cli?uuid=11111111-1111-4111-8111-111111111111",
        for_package_uid: null,
        purl: "pkg:npm/%40babel/cli",
      },
    ];

    const normalized = normalizeScancodeReport(report, {
      artifactId: "artifact-a",
      inputRoot: UBUNTU_ROOT,
    });

    expect(normalized.dependencies[0]).toMatchObject({
      for_package_purl: null,
      purl: "pkg:npm/%40babel/cli",
    });
    expect(normalized.dependencies[0]).not.toHaveProperty("dependency_uid");
    expect(normalized.dependencies[0]).not.toHaveProperty("for_package_uid");
  });

  it("rejects duplicate package PURLs instead of inventing occurrence identifiers", () => {
    const report = readFixture("scancode-report.ubuntu.json");
    report.packages = [
      {
        name: "alpha",
        package_uid:
          "pkg:npm/alpha@1.0.0?uuid=11111111-1111-4111-8111-111111111111",
        purl: "pkg:npm/alpha@1.0.0",
        type: "npm",
        version: "1.0.0",
      },
      {
        name: "alpha",
        package_uid:
          "pkg:npm/alpha@1.0.0?uuid=22222222-2222-4222-8222-222222222222",
        purl: "pkg:npm/alpha@1.0.0",
        type: "npm",
        version: "1.0.0",
      },
    ];

    expect(() =>
      normalizeScancodeReport(report, {
        artifactId: "artifact-a",
        inputRoot: UBUNTU_ROOT,
      }),
    ).toThrow(/duplicate package PURL/iu);
  });

  it("rejects a graph reference that does not resolve to a reported package PURL", () => {
    const report = readFixture("scancode-report.ubuntu.json");
    report.packages[0].purl = "pkg:npm/alpha@1.0.0";
    report.packages[0].package_uid =
      "pkg:npm/alpha@1.0.0?uuid=11111111-1111-4111-8111-111111111111";
    report.files.find(({ name }) => name === "LICENSE").for_packages = [
      "pkg:npm/beta@2.0.0?uuid=22222222-2222-4222-8222-222222222222",
    ];

    expect(() =>
      normalizeScancodeReport(report, {
        artifactId: "artifact-a",
        inputRoot: UBUNTU_ROOT,
      }),
    ).toThrow(/unresolved package UID reference/iu);
  });

  it("omits host-derived libmagic classifications from canonical evidence", () => {
    const windowsReport = readFixture("scancode-report.windows.json");
    const ubuntuReport = readFixture("scancode-report.ubuntu.json");
    const windowsFile = windowsReport.files.find(
      ({ name }) => name === "index.js",
    );
    const ubuntuFile = ubuntuReport.files.find(
      ({ name }) => name === "index.js",
    );
    Object.assign(windowsFile, {
      file_type: "HTML document, UTF-8 Unicode text",
      is_script: false,
      mime_type: "text/html",
    });
    Object.assign(ubuntuFile, {
      file_type: "Node.js script, UTF-8 Unicode text executable",
      is_script: true,
      mime_type: "application/javascript",
    });

    const windows = normalizeScancodeReport(windowsReport, {
      artifactId: "artifact-a",
      inputRoot: WINDOWS_ROOT,
    });
    const ubuntu = normalizeScancodeReport(ubuntuReport, {
      artifactId: "artifact-a",
      inputRoot: UBUNTU_ROOT,
    });

    expect(windows).toEqual(ubuntu);
    const normalizedFile = windows.files.find(
      ({ name }) => name === "index.js",
    );
    expect(normalizedFile).not.toHaveProperty("file_type");
    expect(normalizedFile).not.toHaveProperty("is_script");
    expect(normalizedFile).not.toHaveProperty("mime_type");
  });

  it("omits acquisition-day file dates from canonical evidence", () => {
    const firstReport = readFixture("scancode-report.ubuntu.json");
    const secondReport = readFixture("scancode-report.ubuntu.json");
    firstReport.files.find(({ name }) => name === "LICENSE").date =
      "2026-08-27";
    secondReport.files.find(({ name }) => name === "LICENSE").date =
      "2026-08-28";

    const first = normalizeScancodeReport(firstReport, {
      artifactId: "artifact-a",
      inputRoot: UBUNTU_ROOT,
    });
    const second = normalizeScancodeReport(secondReport, {
      artifactId: "artifact-a",
      inputRoot: UBUNTU_ROOT,
    });

    expect(first).toEqual(second);
    expect(
      first.files.find(({ name }) => name === "LICENSE"),
    ).not.toHaveProperty("date");
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

  it("distinguishes codebase paths from package-model file references", () => {
    const report = readFixture("scancode-report.ubuntu.json");
    report.packages = [
      {
        datafile_paths: ["artifact-a/package/package-lock.json"],
        file_references: [{ path: "@babel/code-frame" }],
        purl: "pkg:npm/alpha@1.0.0",
      },
    ];
    report.dependencies = [
      {
        datafile_path: "artifact-a/package/package-lock.json",
        resolved_package: {
          file_references: [{ path: "@babel/code-frame" }],
        },
      },
    ];

    const normalized = normalizeScancodeReport(report, {
      artifactId: "artifact-a",
      inputRoot: UBUNTU_ROOT,
    });

    expect(normalized.packages[0]).toMatchObject({
      datafile_paths: ["package/package-lock.json"],
      file_references: [{ path: "@babel/code-frame" }],
    });
    expect(normalized.dependencies[0]).toMatchObject({
      datafile_path: "package/package-lock.json",
      resolved_package: {
        file_references: [{ path: "@babel/code-frame" }],
      },
    });
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
      "path-ignore option",
      (report) => {
        report.headers[0].options["--ignore"] = ["vendor/**"];
      },
      /path ignores are not permitted/iu,
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
    [
      "outside-root package datafile path",
      (report) => {
        report.packages[0].datafile_paths = [
          "different-artifact/package/package.json",
        ];
      },
      /outside the ScanCode input root/iu,
    ],
    [
      "outside-root dependency datafile path",
      (report) => {
        report.dependencies = [
          {
            datafile_path: "different-artifact/package/package-lock.json",
          },
        ];
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
    expect(SCANCODE_PRE_SCAN_EXCLUDED_FILE_SUFFIXES).toEqual([".node"]);
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
