import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { createServer as createTcpServer, connect } from "node:net";
import test from "node:test";
import { DENIED_BODY, denyOutbound, denyWorker } from "../browser-test-egress.mjs";

// Resolve the exact Miniflare shipped with this checkout's pinned Wrangler.
const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve("wrangler"));
const { Miniflare } = wranglerRequire("miniflare");

const worker = (name, contents, env = {}, outboundService = denyOutbound) => ({
  config: {
    name,
    compatibilityDate: "2026-08-01",
    compatibilityFlags: ["nodejs_compat"],
    manifest: {
      mainModule: "index.mjs",
      modules: { "index.mjs": { type: "esm", contents } },
    },
    env,
  },
  dev: { ...(outboundService ? { outboundService } : {}), unsafeRegisterWorker: false },
});

const probe = `import { connect } from "cloudflare:sockets";
import { createConnection } from "node:net";
export default { async fetch(req) {
  const input = new URL(req.url).searchParams;
  const kind = input.get("kind"); const target = input.get("target");
  if (kind === "ingress") return new Response("ingress-ok");
  if (kind === "tcp" || kind === "tls") {
    let socket;
    try {
      socket = connect(target, { secureTransport: kind === "tls" ? "on" : "off" });
      socket.closed.catch(() => {});
      await socket.opened; await socket.close(); return new Response("TCP_OPENED");
    } catch { return new Response("TCP_DENIED"); }
  }
  if (kind === "node-net") {
    const parsed = new URL("tcp://" + target);
    const result = await new Promise((resolve, reject) => {
      const socket = createConnection({host: parsed.hostname, port: Number(parsed.port)});
      const timer = setTimeout(() => {socket.destroy(); reject(new Error("node:net timeout"));}, 3000);
      socket.once("connect", () => { clearTimeout(timer); socket.destroy(); resolve("TCP_OPENED"); });
      socket.once("error", () => { clearTimeout(timer); socket.destroy(); resolve("TCP_DENIED"); });
    });
    return new Response(result);
  }
  if (kind === "websocket-constructor") {
    const result = await new Promise((resolve, reject) => {
      const socket = new WebSocket(target);
      const timer = setTimeout(() => { reject(new Error("WebSocket timeout")); }, 3000);
      socket.addEventListener("open", () => { clearTimeout(timer); socket.close(); resolve("WS_OPENED"); });
      socket.addEventListener("error", () => { clearTimeout(timer); resolve("WS_DENIED"); });
    });
    return new Response(result);
  }
  const response = await fetch(target, kind === "websocket-upgrade" ? {headers: {Upgrade: "websocket"}} : {});
  if (response.webSocket) { response.webSocket.accept(); response.webSocket.close(); }
  return new Response(response.status + ":" + await response.text());
}};`;

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}

test("outbound Worker denies HTTP, redirect continuations, WebSocket and raw TCP", { timeout: 30000 }, async (t) => {
  const hits = { http: 0, websocket: 0, tcp: 0, redirect: 0 };
  const sink = createServer((_req, res) => { hits.http++; res.end("local-http-control"); });
  sink.on("upgrade", (req, socket) => {
    hits.websocket++;
    const accept = createHash("sha1").update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
    socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n");
    socket.end(Buffer.from([0x88, 0x02, 0x03, 0xe8]));
  });
  const tcp = createTcpServer((socket) => { hits.tcp++; socket.end("local-tcp-control"); });
  const redirect = createServer((_req, res) => { hits.redirect++; res.writeHead(302, { Location: httpTarget }); res.end(); });
  const sockets = new Set();
  for (const server of [sink, tcp, redirect]) {
    server.on("connection", (socket) => {
      sockets.add(socket);
      // The synthetic clients intentionally close immediately after opening.
      socket.on("error", () => {});
      socket.once("close", () => sockets.delete(socket));
    });
  }
  let mf;
  let controlMf;
  let httpTarget;
  try {
    const httpPort = await listen(sink);
    const tcpPort = await listen(tcp);
    const redirectPort = await listen(redirect);
    httpTarget = `http://127.0.0.1:${httpPort}/sink`;
    const websocketTarget = `ws://127.0.0.1:${httpPort}/socket`;
    const tcpTarget = `127.0.0.1:${tcpPort}`;
    const redirectTarget = `http://127.0.0.1:${redirectPort}/redirect`;

    await t.test("positive controls prove the same loopback sinks are reachable", async () => {
      assert.equal(await (await fetch(httpTarget)).text(), "local-http-control");
      const socket = connect({ host: "127.0.0.1", port: tcpPort });
      const chunks = [];
      socket.on("data", (chunk) => chunks.push(chunk));
      await once(socket, "close");
      assert.equal(Buffer.concat(chunks).toString(), "local-tcp-control");
      const websocket = new WebSocket(websocketTarget);
      await once(websocket, "open");
      await once(websocket, "close");
      assert.deepEqual(hits, { http: 1, websocket: 1, tcp: 1, redirect: 0 });
    });

    await t.test("the same Worker opens the live canaries when the gate is absent", async () => {
      // This control executes only the synthetic probe. It deliberately omits
      // the gate to prove workerd and the surrounding sandbox permit these
      // exact loopback destinations before testing the restrictive variant.
      controlMf = new Miniflare({
        host: "127.0.0.1", port: 0, cf: false,
        workers: [worker("control", probe, {}, null)],
      });
      for (const [kind, target, expected] of [
        ["http", httpTarget, "200:local-http-control"],
        ["websocket-upgrade", httpTarget, "101:"],
        ["websocket-constructor", websocketTarget, "WS_OPENED"],
        ["tcp", tcpTarget, "TCP_OPENED"],
        ["node-net", tcpTarget, "TCP_OPENED"],
      ]) {
        const query = new URLSearchParams({ kind, target });
        const response = await controlMf.dispatchFetch("http://localhost/?" + query);
        assert.equal(await response.text(), expected, `${kind} control failed`);
      }
      assert.deepEqual(hits, { http: 2, websocket: 3, tcp: 3, redirect: 0 });
      await controlMf.dispose();
      controlMf = undefined;
    });

    mf = new Miniflare({
      host: "127.0.0.1", port: 0, cf: false,
      workers: [worker("probe", probe), denyWorker,
        worker("redirect-probe", probe, {}, { type: "worker", worker: "redirect-fixture" }),
        worker("redirect-fixture", `export default { fetch(req, env) {
          if (new URL(req.url).pathname === "/redirect") return env.LOCAL.fetch(req, { redirect: "manual" });
          return env.DENY.fetch(req);
        }};`, {
          LOCAL: { type: "external", address: `127.0.0.1:${redirectPort}`, http: {} },
          DENY: denyOutbound,
        }),
      ],
    });
    const run = async (kind, target, name) => {
      const query = new URLSearchParams({ kind, target });
      const response = name
        ? await (await mf.getWorker(name)).fetch("http://localhost/?" + query)
        : await mf.dispatchFetch("http://localhost/?" + query);
      return response.text();
    };
    const baseline = { ...hits };
    await t.test("positive Worker ingress is still served", async () => {
      assert.equal(await run("ingress", httpTarget), "ingress-ok");
    });
    for (const [kind, target, expected] of [
      ["http", httpTarget, `503:${DENIED_BODY}`],
      ["websocket-upgrade", httpTarget, `503:${DENIED_BODY}`],
      ["websocket-constructor", websocketTarget, "WS_DENIED"],
      ["tcp", tcpTarget, "TCP_DENIED"],
      ["tls", tcpTarget, "TCP_DENIED"],
      ["node-net", tcpTarget, "TCP_DENIED"],
    ]) {
      await t.test(`${kind} never reaches its live local canary`, async () => {
        assert.equal(await run(kind, target), expected);
        assert.deepEqual(hits, baseline);
      });
    }
    await t.test("a real local HTTP 302 is followed into the deny boundary", async () => {
      assert.equal(await run("http", redirectTarget, "redirect-probe"), `503:${DENIED_BODY}`);
      assert.deepEqual(hits, { ...baseline, redirect: 1 });
    });
  } finally {
    // HTTP server.close() does not close upgraded WebSocket connections.
    // These are only sockets accepted by this test's three owned listeners.
    for (const socket of sockets) socket.destroy();
    await controlMf?.dispose();
    await mf?.dispose();
    await Promise.all([sink, tcp, redirect].map((server) => new Promise((resolve) => server.close(resolve))));
  }
});
