import { gzipSync } from "node:zlib";

import {
  assertReleasePacklist,
  formatSha256Sums,
  inspectGzipTar,
  isStrictDescendantPath,
  readGzipTarFile,
} from "./release-artifacts.mjs";

const tarEntry = (name, content) => {
  const body = Buffer.from(content);
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  header.write(
    `${body.length.toString(8).padStart(11, "0")}\0`,
    124,
    12,
    "ascii",
  );
  header.write("0", 156, 1, "ascii");
  const padding = Buffer.alloc((512 - (body.length % 512)) % 512);
  return Buffer.concat([header, body, padding]);
};

describe("release artifact primitives", () => {
  it("inspects the real paths and bytes in a gzip-compressed tar archive", () => {
    const archive = gzipSync(
      Buffer.concat([
        tarEntry("package/index.js", "export {};\n"),
        tarEntry("package/README.md", "# owlapi\n"),
        Buffer.alloc(1024),
      ]),
    );

    expect(inspectGzipTar(archive)).toEqual([
      { path: "index.js", size: 11 },
      { path: "README.md", size: 9 },
    ]);
    expect(readGzipTarFile(archive, "README.md").toString("utf8")).toBe(
      "# owlapi\n",
    );
  });

  it("fails closed when a requested packed file is absent or duplicated", () => {
    const absent = gzipSync(
      Buffer.concat([
        tarEntry("package/index.js", "export {};\n"),
        Buffer.alloc(1024),
      ]),
    );
    expect(() => readGzipTarFile(absent, "package.json")).toThrow(/absent/u);

    const duplicate = gzipSync(
      Buffer.concat([
        tarEntry("package/package.json", "{}\n"),
        tarEntry("package/package.json", "{}\n"),
        Buffer.alloc(1024),
      ]),
    );
    expect(() => readGzipTarFile(duplicate, "package.json")).toThrow(
      /more than once/u,
    );
  });

  it("formats a deterministic two-entry SHA256SUMS file", () => {
    expect(
      formatSha256Sums([
        { fileName: "owlapi-0.1.0-alpha.0.tgz", sha256: "b".repeat(64) },
        {
          fileName: "owlapi-0.1.0-alpha.0.cdx.json",
          sha256: "a".repeat(64),
        },
      ]),
    ).toBe(
      `${"a".repeat(64)}  owlapi-0.1.0-alpha.0.cdx.json\n${"b".repeat(64)}  owlapi-0.1.0-alpha.0.tgz\n`,
    );
  });

  it("rejects development and generated surfaces from a release packlist", () => {
    expect(() =>
      assertReleasePacklist([
        "index.js",
        "package.json",
        "internal/parsing/parserRegistry.js",
        "internal/parsing/parserRegistry.test.js",
      ]),
    ).toThrow(/parserRegistry\.test\.js/u);

    expect(() =>
      assertReleasePacklist(["index.js", "package.json", "dist/owlapi.min.js"]),
    ).toThrow(/dist\/owlapi\.min\.js/u);
  });

  it("recognizes only strict descendants for destructive cleanup", () => {
    expect(
      isStrictDescendantPath("temporary-root", "temporary-root/candidate"),
    ).toBe(true);
    expect(isStrictDescendantPath("temporary-root", "temporary-root")).toBe(
      false,
    );
    expect(
      isStrictDescendantPath("temporary-root", "adjacent-root/candidate"),
    ).toBe(false);
  });
});
