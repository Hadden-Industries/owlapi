import { Buffer } from "node:buffer";
import { gzipSync } from "node:zlib";
import { build } from "vite";

/** Existing browser probe settings, shared by real and virtual entry probes. */
export const buildBrowserBundle = (input, plugins = []) =>
  build({
    configFile: false,
    logLevel: "silent",
    plugins,
    build: {
      minify: "oxc",
      // These probes measure exported APIs; an application-style entry would erase them.
      rollupOptions: { input, preserveEntrySignatures: "strict" },
      target: "es2022",
      write: false,
    },
  });
export const codeSize = (code) => ({
  gzipBytes: gzipSync(code).byteLength,
  minifiedBytes: Buffer.byteLength(code),
});

/** Analyze static imports only; dynamic imports remain outside initial closure. */
export function analyzeBrowserChunks(output) {
  const chunks = output.output.filter(({ type }) => type === "chunk");
  const chunksByFile = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const containsModule = (chunk, fragment) =>
    Object.keys(chunk.modules).some((id) =>
      id.replaceAll("\\", "/").includes(fragment),
    );
  const transitiveImports = (roots) => {
    const visited = new Set();
    const visit = (fileName) => {
      if (visited.has(fileName)) return;
      visited.add(fileName);
      for (const dependency of chunksByFile.get(fileName)?.imports || [])
        visit(dependency);
    };
    for (const root of roots) visit(root.fileName);
    return visited;
  };
  const size = (files) => ({
    chunkCount: files.size,
    ...codeSize(
      [...files]
        .sort()
        .map((fileName) => chunksByFile.get(fileName)?.code || "")
        .join("\n"),
    ),
  });
  return { chunks, chunksByFile, containsModule, transitiveImports, size };
}
