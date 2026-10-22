import { crc32 } from "../io/node/crc32.js";
import { readZipArchiveFilesWith } from "./release-zip-core.mjs";

/** Consumer-compatible ZIP validation uses the bounded shared native provider. */
export const readZipArchiveFiles = (archive) =>
  readZipArchiveFilesWith(archive, { crc32 });
