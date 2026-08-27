import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, relative, resolve, sep } from "node:path";

const CONTENT_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
});

const modeRoot = (root, mode) =>
  mode === "import-map"
    ? join(root, mode, "runtime")
    : join(root, mode, "dist");

const resolveRequestPath = (root, requestUrl) => {
  const url = new URL(requestUrl, "http://127.0.0.1");
  const segments = url.pathname.split("/").filter(Boolean);
  const mode = segments.shift();
  if (!new Set(["bundler", "import-map", "worker"]).has(mode)) {
    return undefined;
  }
  const rawRelativePath =
    segments.length === 0 ? "index.html" : segments.join("/");
  const base = resolve(modeRoot(root, mode));
  const path = resolve(base, rawRelativePath);
  const pathFromBase = relative(base, path);
  if (
    pathFromBase === ".." ||
    pathFromBase.startsWith(`..${sep}`) ||
    pathFromBase === ""
  ) {
    return undefined;
  }
  return path;
};

export const startBrowserFixtureServer = async ({ root, port = 0 }) => {
  const resolvedRoot = resolve(root);
  const server = createServer((request, response) => {
    const path = resolveRequestPath(resolvedRoot, request.url ?? "/");
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
      "Content-Type":
        CONTENT_TYPES[extname(path)] ?? "application/octet-stream",
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
