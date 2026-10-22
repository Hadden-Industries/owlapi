import { crc32 as nativeCrc32 } from "node:zlib";
import { crc32 } from "./crc32.js";

describe("Node CRC32", () => {
  it("matches independent empty and standard IEEE CRC32 vectors", () => {
    expect(crc32(Buffer.alloc(0))).toBe(0);
    expect(crc32(Buffer.from("123456789", "ascii"))).toBe(0xcbf43926);
  });

  it.each([1, 255, 65535, 65536, 65537, 196625])(
    "matches the producer runtime for %i binary bytes at a nonzero offset",
    (length) => {
      const storage = Buffer.alloc(length + 19, 0xff);
      const bytes = storage.subarray(7, 7 + length);
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = index % 256;
      }
      expect(crc32(bytes)).toBe(nativeCrc32(bytes));
    },
  );

  it("requires bytes rather than implicitly encoding strings", () => {
    expect(() => crc32("123456789")).toThrow(TypeError);
  });
});
