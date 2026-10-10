import { Buffer } from "node:buffer";
import { gzipSync } from "node:zlib";
import { analyzeBrowserChunks } from "./browserBundleCost.mjs";

it("deduplicates static cycles/shared imports, excludes dynamic chunks and sorts code", () => {
  const chunk = (fileName, imports, code, modules = {}, extra = {}) => ({
    type: "chunk",
    fileName,
    imports,
    code,
    modules,
    ...extra,
  });
  const output = {
    output: [
      chunk(
        "z",
        ["a", "shared"],
        "entry",
        {},
        { isEntry: true, dynamicImports: ["lazy"] },
      ),
      chunk("a", ["z", "shared"], "cycle"),
      chunk("shared", [], "shared"),
      chunk("lazy", ["shared"], "lazy", {
        "C:\\repo\\node_modules\\n3\\browser\\n3.min.js": {},
      }),
    ],
  };
  const graph = analyzeBrowserChunks(output);
  const initial = graph.transitiveImports(
    graph.chunks.filter((c) => c.isEntry),
  );
  expect([...initial]).toEqual(["z", "a", "shared"]);
  const lazy = graph.transitiveImports(
    graph.chunks.filter((c) => graph.containsModule(c, "/node_modules/n3/")),
  );
  for (const file of initial) lazy.delete(file);
  expect([...lazy]).toEqual(["lazy"]);
  const code = "cycle\nshared\nentry";
  expect(graph.size(initial)).toEqual({
    chunkCount: 3,
    minifiedBytes: Buffer.byteLength(code),
    gzipBytes: gzipSync(code).byteLength,
  });
});
