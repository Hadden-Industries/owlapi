import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";

import { providerPathForRequest } from "./reference-import-map-admission.mjs";
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

const resolveRequestPath = (root, requestUrl) => {
  try {
    const url = new URL(requestUrl, "http://127.0.0.1");
    const [, mode, ...segments] = url.pathname.split("/");
    if (!new Set(["bundler", "import-map", "worker"]).has(mode)) {
      return undefined;
    }
    const requestedPath = segments.join("/") || "index.html";
    let localPath;
    if (mode === "import-map" && segments[0] === "provider") {
      // Retain the browser URL exactly, including the query on a relative
      // import, and resolve it to the admitted provider's encoded disk name.
      localPath = providerPathForRequest(requestedPath, url.search);
    } else {
      const decoded = segments.map(decodeURIComponent);
      if (
        decoded.some(
          (segment) =>
            /[/%\\\p{Cc}]/u.test(segment) ||
            (process.platform === "win32" && /[:<>"|?*]/u.test(segment)),
        )
      )
        return undefined;
      localPath = decoded.join("/") || "index.html";
    }
    const base = resolve(modeRoot(root, mode));
    const path = resolve(base, localPath);
    if (!isStrictDescendantPath(base, path)) return undefined;
    return {
      path,
      contentType:
        CONTENT_TYPES[extname(requestedPath)] ?? "application/octet-stream",
    };
  } catch {
    return undefined;
  }
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
