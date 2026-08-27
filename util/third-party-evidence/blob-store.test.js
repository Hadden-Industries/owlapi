import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeCorpusRoot, retainBlob, verifyBlob } from "./blob-store.mjs";

const withStore = async (run) => {
  const root = await mkdtemp(join(tmpdir(), "owlapi-blob-test-"));
  try {
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

describe("retainBlob", () => {
  it("deduplicates identical bytes at a lowercase suffixless digest path", async () => {
    await withStore(async (root) => {
      const first = await retainBlob(root, Buffer.from("licence text\n"));
      const second = await retainBlob(root, Buffer.from("licence text\n"));

      expect(second).toEqual(first);
      expect(first).toEqual({
        sha256:
          "dce7dcb8e730d19eb877b46c306dbc3dcc3b93158a051035abff5a89e4d2aa62",
        bytes: 13,
        path: "blobs/sha256/dc/dce7dcb8e730d19eb877b46c306dbc3dcc3b93158a051035abff5a89e4d2aa62",
      });
      expect(await readdir(join(root, "blobs", "sha256", "dc"))).toEqual([
        first.sha256,
      ]);
      await expect(verifyBlob(root, first)).resolves.toBe(true);
    });
  });

  it("fails rather than overwriting corrupt bytes already stored under a digest", async () => {
    await withStore(async (root) => {
      const reference = {
        sha256:
          "dce7dcb8e730d19eb877b46c306dbc3dcc3b93158a051035abff5a89e4d2aa62",
        bytes: 13,
        path: "blobs/sha256/dc/dce7dcb8e730d19eb877b46c306dbc3dcc3b93158a051035abff5a89e4d2aa62",
      };
      const directory = join(root, "blobs", "sha256", "dc");
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, reference.sha256), "corrupt");

      await expect(
        retainBlob(root, Buffer.from("licence text\n")),
      ).rejects.toThrow(/existing evidence blob is corrupt/iu);
      await expect(verifyBlob(root, reference)).rejects.toThrow(
        /evidence blob byte length mismatch/iu,
      );
    });
  });
});

describe("computeCorpusRoot", () => {
  it("is order-independent and binds digest, length, and semantic kind", () => {
    const licence = {
      sha256: "a".repeat(64),
      bytes: 100,
      kind: "LICENCE",
    };
    const notice = {
      sha256: "b".repeat(64),
      bytes: 20,
      kind: "NOTICE",
    };
    const expected = computeCorpusRoot([licence, notice]);

    expect(computeCorpusRoot([notice, licence])).toBe(expected);
    expect(computeCorpusRoot([{ ...licence, bytes: 101 }, notice])).not.toBe(
      expected,
    );
    expect(
      computeCorpusRoot([{ ...licence, kind: "NOTICE" }, notice]),
    ).not.toBe(expected);
    expect(
      computeCorpusRoot([{ ...licence, sha256: "c".repeat(64) }, notice]),
    ).not.toBe(expected);
  });
});
