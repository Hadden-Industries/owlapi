import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import {
  ARCHIVE_LIMITS,
  inspectPackageTarball,
  materializePackageForScan,
} from "./archive-evidence.mjs";

const BLOCK_BYTES = 512;

const writeString = (buffer, offset, length, value) => {
  Buffer.from(value).copy(buffer, offset, 0, length);
};

const writeOctal = (buffer, offset, length, value) => {
  const octal = value.toString(8).padStart(length - 1, "0");
  writeString(buffer, offset, length, `${octal}\0`);
};

const tar = (entries) => {
  const chunks = [];
  for (const entry of entries) {
    const body = Buffer.from(entry.body || "");
    const header = Buffer.alloc(BLOCK_BYTES);
    writeString(header, 0, 100, entry.path);
    writeOctal(header, 100, 8, 0o644);
    writeOctal(header, 108, 8, 0);
    writeOctal(header, 116, 8, 0);
    writeOctal(header, 124, 12, body.length);
    writeOctal(header, 136, 12, 0);
    header.fill(0x20, 148, 156);
    header[156] = Buffer.from(entry.type || "0")[0];
    writeString(header, 157, 100, entry.linkpath || "");
    writeString(header, 257, 6, "ustar\0");
    writeString(header, 263, 2, "00");
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    writeString(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
    chunks.push(header, body);
    const padding = (BLOCK_BYTES - (body.length % BLOCK_BYTES)) % BLOCK_BYTES;
    if (padding > 0) {
      chunks.push(Buffer.alloc(padding));
    }
  }
  chunks.push(Buffer.alloc(BLOCK_BYTES * 2));
  return gzipSync(Buffer.concat(chunks), { mtime: 0 });
};

const packageJson = (overrides = {}) =>
  JSON.stringify({
    name: "alpha",
    version: "1.0.0",
    license: "MIT",
    author: "Example Maintainer",
    ...overrides,
  });

const baseEntries = () => [
  { path: "package/package.json", body: packageJson() },
];

const inspect = async (
  entries,
  { expected = { name: "alpha", version: "1.0.0" }, ...options } = {},
) => {
  const directory = await mkdtemp(join(tmpdir(), "owlapi-archive-test-"));
  const path = join(directory, "fixture.tgz");
  try {
    await writeFile(path, tar(entries));
    return await inspectPackageTarball(path, expected, options);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

describe("inspectPackageTarball", () => {
  it("recursively inventories files and retains legal evidence without extracting it", async () => {
    const result = await inspect([
      ...baseEntries(),
      { path: "package/LICENSE", body: "MIT licence text\n" },
      {
        path: "package/docs/Third-Party-Licenses.txt",
        body: "Dependency terms\n",
      },
      { path: "package/legal/AUTHORS", body: "Example Maintainer\n" },
      {
        path: "package/README.md",
        body: "Alpha\n\nCopyright Example. Licensed under MIT.\n",
      },
      { path: "package/lib/index.js", body: "export default 1;\n" },
    ]);

    expect(result.packageIdentity).toMatchObject({
      name: "alpha",
      version: "1.0.0",
      license: "MIT",
      author: "Example Maintainer",
    });
    expect(result.entries.map(({ path }) => path)).toEqual([
      "package/LICENSE",
      "package/README.md",
      "package/docs/Third-Party-Licenses.txt",
      "package/legal/AUTHORS",
      "package/lib/index.js",
      "package/package.json",
    ]);
    expect(
      result.evidenceFiles.map(({ path, kind, bytes }) => ({
        path,
        kind,
        text: bytes.toString("utf8"),
      })),
    ).toEqual([
      {
        path: "package/LICENSE",
        kind: "LICENCE",
        text: "MIT licence text\n",
      },
      {
        path: "package/README.md",
        kind: "README_ATTRIBUTION",
        text: "Alpha\n\nCopyright Example. Licensed under MIT.\n",
      },
      {
        path: "package/docs/Third-Party-Licenses.txt",
        kind: "THIRD_PARTY_LICENCE",
        text: "Dependency terms\n",
      },
      {
        path: "package/legal/AUTHORS",
        kind: "AUTHORS",
        text: "Example Maintainer\n",
      },
    ]);
    expect(result.expandedBytes).toBe(
      result.entries.reduce((sum, { size }) => sum + size, 0),
    );
    expect(
      result.entries.every(({ sha256 }) => /^[0-9a-f]{64}$/u.test(sha256)),
    ).toBe(true);
  });

  it("accepts a valid historical registry package with one nonstandard archive root", async () => {
    const result = await inspect(
      [
        {
          path: "yargs/package.json",
          body: packageJson({ name: "@types/yargs", version: "17.0.35" }),
        },
        { path: "yargs/LICENSE", body: "MIT licence text\n" },
      ],
      { expected: { name: "@types/yargs", version: "17.0.35" } },
    );

    expect(result.archiveRoot).toBe("yargs");
    expect(result.packageIdentity).toMatchObject({
      name: "@types/yargs",
      version: "17.0.35",
      license: "MIT",
    });
    expect(result.evidenceFiles.map(({ path }) => path)).toEqual([
      "yargs/LICENSE",
    ]);
  });

  it("canonicalizes harmless dot components before inventorying and materializing files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "owlapi-dot-path-test-"));
    const tarballPath = join(directory, "fixture.tgz");
    const destination = join(directory, "scan");
    try {
      await writeFile(
        tarballPath,
        tar([
          ...baseEntries(),
          {
            path: "package/./dist/index.js",
            body: "export default 1;\n",
          },
        ]),
      );

      const inventory = await inspectPackageTarball(tarballPath, {
        name: "alpha",
        version: "1.0.0",
      });
      expect(inventory.entries.map(({ path }) => path)).toContain(
        "package/dist/index.js",
      );

      const packageRoot = await materializePackageForScan(
        tarballPath,
        inventory,
        destination,
      );
      await expect(
        readFile(join(packageRoot, "dist", "index.js"), "utf8"),
      ).resolves.toBe("export default 1;\n");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("does not retain a README that contains no legal or attribution evidence", async () => {
    const result = await inspect([
      ...baseEntries(),
      { path: "package/README.md", body: "Usage and examples only.\n" },
    ]);

    expect(result.evidenceFiles).toEqual([]);
  });

  it("ignores a non-text README rather than failing archive authentication", async () => {
    const result = await inspect([
      ...baseEntries(),
      { path: "package/README.bin", body: Buffer.from([0xff, 0xfe, 0xfd]) },
    ]);

    expect(result.evidenceFiles).toEqual([]);
  });

  it.each([
    ["absolute path", "/package/LICENSE", "0", /unsafe archive path/iu],
    ["path traversal", "package/../LICENSE", "0", /unsafe archive path/iu],
    ["Windows drive path", "C:/package/LICENSE", "0", /unsafe archive path/iu],
    ["Windows separator", "package\\LICENSE", "0", /unsafe archive path/iu],
    ["Windows reserved name", "package/CON", "0", /unsafe archive path/iu],
    [
      "Windows alternate stream",
      "package/LICENSE:meta",
      "0",
      /unsafe archive path/iu,
    ],
    ["Windows-trimmed name", "package/LICENSE. ", "0", /unsafe archive path/iu],
    ["second package root", "other/LICENSE", "0", /single package root/iu],
    [
      "symbolic link",
      "package/LICENSE",
      "2",
      /unsupported archive entry type/iu,
    ],
    ["hard link", "package/LICENSE", "1", /unsupported archive entry type/iu],
    ["FIFO", "package/channel", "6", /unsupported archive entry type/iu],
  ])("rejects an archive with a %s", async (_label, path, type, message) => {
    const linkpath =
      type === "1" || type === "2" ? "package/NOTICE" : undefined;
    await expect(
      inspect([...baseEntries(), { path, type, linkpath }]),
    ).rejects.toThrow(message);
  });

  it("retains one canonical entry for byte-identical duplicate tar members", async () => {
    const result = await inspect([
      ...baseEntries(),
      { path: "package/dist/index.js", body: "same" },
      { path: "package/dist/index.js", body: "same" },
    ]);

    expect(result.physicalEntryCount).toBe(3);
    expect(
      result.entries.filter(({ path }) => path === "package/dist/index.js"),
    ).toHaveLength(1);
    expect(result.duplicateEntries).toEqual([
      {
        path: "package/dist/index.js",
        type: "FILE",
        size: 4,
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
        occurrenceCount: 2,
      },
    ]);
    expect(result.expandedBytes).toBe(
      result.entries.reduce((sum, { size }) => sum + size, 0) + 4,
    );
  });

  it("rejects conflicting duplicate and case-folding-colliding archive paths", async () => {
    await expect(
      inspect([
        ...baseEntries(),
        { path: "package/LICENSE", body: "one" },
        { path: "package/LICENSE", body: "two" },
      ]),
    ).rejects.toThrow(/duplicate archive path/iu);
    await expect(
      inspect([
        ...baseEntries(),
        { path: "package/LICENSE", body: "one" },
        { path: "package/license", body: "two" },
      ]),
    ).rejects.toThrow(/case-folding collision/iu);
    await expect(
      inspect([
        ...baseEntries(),
        { path: "package/dist/index.js", body: "one" },
        { path: "package/./dist/index.js", body: "two" },
      ]),
    ).rejects.toThrow(/duplicate archive path/iu);
  });

  it("rejects package metadata whose identity does not match the locked artifact", async () => {
    await expect(
      inspect([
        {
          path: "package/package.json",
          body: packageJson({ version: "1.0.1" }),
        },
      ]),
    ).rejects.toThrow(/package identity mismatch/iu);
  });

  it("fails closed when an archive exceeds an explicit safety ceiling", async () => {
    await expect(
      inspect([...baseEntries(), { path: "package/LICENSE", body: "12345" }], {
        limits: { ...ARCHIVE_LIMITS, entryBytes: 4 },
      }),
    ).rejects.toThrow(/entry byte limit/iu);
    await expect(
      inspect([...baseEntries(), { path: "package/LICENSE", body: "text" }], {
        limits: { ...ARCHIVE_LIMITS, entries: 1 },
      }),
    ).rejects.toThrow(/entry count limit/iu);
    await expect(
      inspect(
        [
          ...baseEntries(),
          { path: "package/dist/index.js", body: "same" },
          { path: "package/dist/index.js", body: "same" },
        ],
        { limits: { ...ARCHIVE_LIMITS, entries: 2 } },
      ),
    ).rejects.toThrow(/entry count limit/iu);
    await expect(
      inspect(
        [
          ...baseEntries(),
          { path: "package/LICENSE", body: "one" },
          { path: "package/NOTICE", body: "two" },
        ],
        {
          limits: { ...ARCHIVE_LIMITS, retainedEvidenceBytes: 5 },
        },
      ),
    ).rejects.toThrow(/retained evidence byte limit/iu);
  });

  it("materializes only an already-validated, re-hashed package into a fresh scan root", async () => {
    const directory = await mkdtemp(join(tmpdir(), "owlapi-materialize-test-"));
    const tarballPath = join(directory, "fixture.tgz");
    const destination = join(directory, "scan");
    try {
      await writeFile(
        tarballPath,
        tar([
          ...baseEntries(),
          { path: "package/LICENSE", body: "MIT licence text\n" },
          { path: "package/lib/index.js", body: "export default 1;\n" },
          { path: "package/lib/index.js", body: "export default 1;\n" },
        ]),
      );
      const inventory = await inspectPackageTarball(tarballPath, {
        name: "alpha",
        version: "1.0.0",
      });

      const packageRoot = await materializePackageForScan(
        tarballPath,
        inventory,
        destination,
      );

      await expect(
        readFile(join(packageRoot, "LICENSE"), "utf8"),
      ).resolves.toBe("MIT licence text\n");
      await expect(
        readFile(join(packageRoot, "lib", "index.js"), "utf8"),
      ).resolves.toBe("export default 1;\n");
      await expect(
        materializePackageForScan(tarballPath, inventory, destination),
      ).rejects.toThrow(/fresh scan destination/iu);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("returns the validated nonstandard package root after materialization", async () => {
    const directory = await mkdtemp(join(tmpdir(), "owlapi-materialize-test-"));
    const tarballPath = join(directory, "fixture.tgz");
    const destination = join(directory, "scan");
    try {
      await writeFile(
        tarballPath,
        tar([
          {
            path: "yargs/package.json",
            body: packageJson({ name: "@types/yargs", version: "17.0.35" }),
          },
          { path: "yargs/LICENSE", body: "MIT licence text\n" },
        ]),
      );
      const inventory = await inspectPackageTarball(tarballPath, {
        name: "@types/yargs",
        version: "17.0.35",
      });

      const packageRoot = await materializePackageForScan(
        tarballPath,
        inventory,
        destination,
      );

      expect(packageRoot).toBe(join(destination, "yargs"));
      await expect(
        readFile(join(packageRoot, "LICENSE"), "utf8"),
      ).resolves.toBe("MIT licence text\n");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("removes the scan tree if any duplicate occurrence changes after inspection", async () => {
    const directory = await mkdtemp(join(tmpdir(), "owlapi-materialize-test-"));
    const tarballPath = join(directory, "fixture.tgz");
    const destination = join(directory, "scan");
    try {
      await writeFile(
        tarballPath,
        tar([
          ...baseEntries(),
          { path: "package/lib/index.js", body: "same" },
          { path: "package/lib/index.js", body: "same" },
        ]),
      );
      const inventory = await inspectPackageTarball(tarballPath, {
        name: "alpha",
        version: "1.0.0",
      });
      await writeFile(
        tarballPath,
        tar([
          ...baseEntries(),
          { path: "package/lib/index.js", body: "same" },
          { path: "package/lib/index.js", body: "evil" },
        ]),
      );

      await expect(
        materializePackageForScan(tarballPath, inventory, destination),
      ).rejects.toThrow(/content no longer matches/iu);
      await expect(access(destination)).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("removes the scan tree if the tarball changes after inspection", async () => {
    const directory = await mkdtemp(join(tmpdir(), "owlapi-materialize-test-"));
    const tarballPath = join(directory, "fixture.tgz");
    const destination = join(directory, "scan");
    try {
      await writeFile(tarballPath, tar(baseEntries()));
      const inventory = await inspectPackageTarball(tarballPath, {
        name: "alpha",
        version: "1.0.0",
      });
      await writeFile(
        tarballPath,
        tar([...baseEntries(), { path: "package/extra.js", body: "changed" }]),
      );

      await expect(
        materializePackageForScan(tarballPath, inventory, destination),
      ).rejects.toThrow(/inventory/iu);
      await expect(access(destination)).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects a malformed or truncated gzip stream", async () => {
    const directory = await mkdtemp(join(tmpdir(), "owlapi-archive-test-"));
    const path = join(directory, "truncated.tgz");
    try {
      const bytes = tar(baseEntries());
      await writeFile(path, bytes.subarray(0, bytes.length - 8));
      await expect(
        inspectPackageTarball(path, { name: "alpha", version: "1.0.0" }),
      ).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
