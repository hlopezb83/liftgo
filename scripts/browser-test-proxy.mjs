import http from "node:http";
import net from "node:net";
import { assertLocalBaseURL } from "./browser-test-config.mjs";

const HOP_HEADERS = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "proxy-connection", "te", "trailer", "transfer-encoding", "upgrade",
]);

function endToEndHeaders(headers) {
  const blocked = new Set(HOP_HEADERS);
  for (const name of String(headers.connection ?? "").split(",")) {
    blocked.add(name.trim().toLowerCase());
  }
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !blocked.has(name)));
}

function hasAppHost(request, app) {
  const hosts = request.rawHeaders.filter((_, index) => index % 2 === 0
    && request.rawHeaders[index].toLowerCase() === "host");
  return hosts.length === 1 && request.headers.host === app.host;
}

/**
 * Explicit HTTP proxy for Playwright's browser-level proxy option. The only
 * upstream is the run-owned app origin. Redirects are returned unchanged so
 * every subsequent hop must pass through this proxy's allowlist again.
 * CONNECT is pinned to the same app socket for Playwright's APIRequestContext
 * and route.fetch. All other tunnels and direct WebSocket upgrades are denied.
 * This does not constrain Node/Worker traffic; that needs its own runtime policy.
 */
export async function startBrowserProxy(appOrigin, port = 0) {
  const app = assertLocalBaseURL(appOrigin);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("[browser isolation] Invalid browser proxy port");
  }
  const sockets = new Set();
  const upstreams = new Set();
  const server = http.createServer((request, response) => {
    let target;
    try {
      // Reject normalization tricks before WHATWG URL can erase them. Only
      // absolute-form HTTP requests with the exact configured authority pass.
      const raw = request.url ?? "";
      if (/[\x00-\x20\x7f\\]/.test(raw)) throw new Error("Invalid target");
      target = new URL(raw);
      const authority = /^http:\/\/([^/?#]+)/.exec(raw)?.[1];
      if (target.origin !== app.origin || authority !== app.host
        || target.username || target.password || target.hash
        || !hasAppHost(request, app)) {
        throw new Error("Denied target");
      }
    } catch {
      response.writeHead(403, { "content-type": "text/plain", connection: "close" });
      response.end("Browser test proxy denied destination\n");
      return;
    }

    const upstream = http.request({
      hostname: app.hostname.replace(/^\[|\]$/g, ""),
      port: app.port,
      method: request.method,
      path: target.pathname + target.search,
      headers: { ...endToEndHeaders(request.headers), host: app.host },
      agent: false,
      // Literal addresses do not use lookup. Fail closed if that ever changes.
      lookup: (_hostname, _options, callback) => callback(new Error("DNS forbidden")),
    }, (incoming) => {
      response.writeHead(incoming.statusCode ?? 502, endToEndHeaders(incoming.headers));
      incoming.pipe(response);
      incoming.on("error", () => response.destroy());
    });
    upstreams.add(upstream);
    upstream.once("close", () => upstreams.delete(upstream));
    upstream.on("error", () => {
      if (response.headersSent) response.destroy();
      else {
        response.writeHead(502, { "content-type": "text/plain", connection: "close" });
        response.end("Browser test app unavailable\n");
      }
    });
    request.on("aborted", () => upstream.destroy());
    response.on("close", () => upstream.destroy());
    request.pipe(upstream);
  });
  const denyTunnel = (_request, socket) => {
    socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
  };
  server.on("connect", (request, socket, head) => {
    // HttpsProxyAgent uses CONNECT for HTTP requests too. Compare raw
    // authority/Host without URL normalization and never connect to a value
    // supplied by the caller: only this run's validated literal app address.
    if (request.url !== app.host || !hasAppHost(request, app)) {
      denyTunnel(request, socket);
      return;
    }
    let established = false;
    const tunnel = net.connect({
      host: app.hostname.replace(/^\[|\]$/g, ""),
      port: Number(app.port),
      lookup: (_hostname, _options, callback) => callback(new Error("DNS forbidden")),
    });
    upstreams.add(tunnel);
    tunnel.once("connect", () => {
      established = true;
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) tunnel.write(head);
      socket.pipe(tunnel);
      tunnel.pipe(socket);
    });
    tunnel.once("error", () => {
      if (established) socket.destroy();
      else socket.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
    });
    tunnel.once("close", () => {
      upstreams.delete(tunnel);
      // pipe() propagates a normal upstream FIN with socket.end(), which must
      // drain queued response bytes. destroy() here would truncate that tail.
      // Abnormal closure still tears down the downstream immediately.
      if (!tunnel.readableEnded) socket.destroy();
    });
    socket.once("error", () => tunnel.destroy());
    socket.once("close", () => tunnel.destroy());
  });
  server.on("upgrade", denyTunnel);
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  server.on("clientError", (_error, socket) => socket.destroy());
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  let closing;
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close() {
      closing ??= new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
        for (const upstream of upstreams) upstream.destroy();
        for (const socket of sockets) socket.destroy();
      });
      return closing;
    },
  };
}

