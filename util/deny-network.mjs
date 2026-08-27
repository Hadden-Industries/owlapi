import childProcess from "node:child_process";
import dgram from "node:dgram";
import dns from "node:dns";
import dnsPromises from "node:dns/promises";
import http from "node:http";
import http2 from "node:http2";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";

const denialMessage =
  "Network access is disabled for this verification process";
const deny = () => {
  throw new Error(denialMessage);
};

// Node does not currently offer a portable cross-platform `--network=none`
// switch. This preload closes every network primitive reachable by the offline
// verifier and also prevents a dependency from delegating to an external client.
// It is a verification guard, not a security boundary for hostile code.
globalThis.fetch = deny;
if ("WebSocket" in globalThis) {
  globalThis.WebSocket = class NetworkDeniedWebSocket {
    constructor() {
      deny();
    }
  };
}

for (const [module, methods] of [
  [childProcess, ["exec", "execFile", "fork", "spawn"]],
  [dgram, ["createSocket"]],
  [dns, ["lookup", "resolve", "resolve4", "resolve6"]],
  [dnsPromises, ["lookup", "resolve", "resolve4", "resolve6"]],
  [http, ["get", "request"]],
  [http2, ["connect"]],
  [https, ["get", "request"]],
  [net, ["connect", "createConnection"]],
  [tls, ["connect"]],
]) {
  for (const method of methods) {
    module[method] = deny;
  }
}
