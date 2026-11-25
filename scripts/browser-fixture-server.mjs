import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";

import { isStrictDescendantPath } from "./release-file-utils.mjs";

const CONTENT_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
});

const modeRoot = (root, mode) =>
  mode === "import-map"
    ? join(root, mode, "runtime")
    : join(root, mode, "dist");

// Provider mirror files already use encoded names. Other staged files retain
// their filesystem names and are addressed by the decoded URL path.
const resolveRequestPath = (root, requestUrl) => {
  const url = new URL(requestUrl, "http://127.0.0.1");
  let segments = url.pathname.split("/").filter(Boolean);
  const mode = segments.shift();
  if (!new Set(["bundler", "import-map", "worker"]).has(mode)) {
    return undefined;
  }
  const provider = mode === "import-map" && segments[0] === "provider";
  if (!provider) {
    try {
      segments = segments.map(decodeURIComponent);
    } catch {
      return undefined;
    }
    if (segments.some((segment) => /[/%\\\p{Cc}]/u.test(segment)))
      return undefined;
  }
  const base = resolve(modeRoot(root, mode));
  const path = resolve(base, segments.join("/") || "index.html");
  if (!isStrictDescendantPath(base, path)) return undefined;
  const contentPath = provider
    ? path.replace(/\.__query-[a-f0-9]{64}$/u, "")
    : path;
  return {
    path,
    contentType:
      CONTENT_TYPES[extname(contentPath)] ?? "application/octet-stream",
  };
};

export const startBrowserFixtureServer = async ({ root, port = 0 }) => {
  const resolvedRoot = resolve(root);
  const server = createServer((request, response) => {
    const { path, contentType } =
      resolveRequestPath(resolvedRoot, request.url ?? "/") ?? {};
    if (!path || !existsSync(path) || !statSync(path).isFile()) {
      response.writeHead(404, {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
      });
      response.end("Not found\n");
      return;
    }
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
    });
    createReadStream(path).pipe(response);
  });

  await new Promise((resolveListening, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolveListening);
  });
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolveClose) => server.close(resolveClose)),
  };
};
