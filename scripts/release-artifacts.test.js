import { crc32, deflateRawSync, gzipSync } from "node:zlib";

import * as releaseArtifacts from "./release-artifacts.mjs";

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

const zipArchive = (entries) => {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const { path, content, compression = "stored" } of entries) {
    const name = Buffer.from(path, "utf8");
    const body = Buffer.from(content);
    const method = compression === "deflated" ? 8 : 0;
    const compressed = method === 8 ? deflateRawSync(body) : body;
    const checksum = crc32(body);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(body.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    const localRecord = Buffer.concat([localHeader, name, compressed]);
    localParts.push(localRecord);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(body.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(Buffer.concat([centralHeader, name]));
    localOffset += localRecord.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
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

  it("reads the real stored and deflated file bytes from a ZIP archive", () => {
    const archive = zipArchive([
      { path: "SHA256SUMS", content: "checksums\n" },
      {
        path: "owlapi-0.1.0-alpha.0.tgz",
        content: "tarball bytes",
        compression: "deflated",
      },
    ]);

    expect(releaseArtifacts.readZipArchiveFiles(archive)).toEqual([
      {
        path: "SHA256SUMS",
        bytes: 10,
        content: Buffer.from("checksums\n"),
      },
      {
        path: "owlapi-0.1.0-alpha.0.tgz",
        bytes: 13,
        content: Buffer.from("tarball bytes"),
      },
    ]);
  });

  it("rejects duplicate or unsafe paths in a ZIP archive", () => {
    expect(() =>
      releaseArtifacts.readZipArchiveFiles(
        zipArchive([
          { path: "SHA256SUMS", content: "first" },
          { path: "SHA256SUMS", content: "second" },
        ]),
      ),
    ).toThrow(/duplicate/u);
    expect(() =>
      releaseArtifacts.readZipArchiveFiles(
        zipArchive([{ path: "../candidate.tgz", content: "escape" }]),
      ),
    ).toThrow(/unsafe/u);
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
