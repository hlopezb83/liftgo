import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import http from "node:http";
import net from "node:net";
import test from "node:test";
import { startBrowserProxy } from "../browser-test-proxy.mjs";

async function serve(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    server,
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => {
      server.closeAllConnections();
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

function throughProxy(proxy, target, options = {}) {
  const address = new URL(proxy.url);
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: "127.0.0.1",
      port: address.port,
      path: target,
      method: options.method ?? "GET",
      headers: { host: new URL(target).host, ...options.headers },
      agent: false,
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body }));
      response.on("error", reject);
    });
    request.on("error", reject);
    request.end(options.body);
  });
}

function rawProxy(proxy, wire) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port: new URL(proxy.url).port });
    let response = "";
    socket.setEncoding("utf8");
    socket.setTimeout(5000, () => socket.destroy(new Error("Proxy response timeout")));
    socket.on("connect", () => socket.write(wire));
    socket.on("data", (chunk) => { response += chunk; });
    socket.on("end", () => resolve(response));
    socket.on("error", reject);
  });
}

test("CONNECT normal close delivers every byte under backpressure", { timeout: 5000 }, async (t) => {
  const payload = Buffer.alloc(8 * 1024 * 1024 + 123, 97);
  payload.write("synthetic-final-bytes", payload.length - 21);
  let releaseReader;
  const producerBlocked = new Promise(resolve => { releaseReader = resolve; });
  let producerBackpressure = false;
  const app = await serve((_request, response) => {
    response.writeHead(200, { "content-length": payload.length, connection: "close" });
    producerBackpressure = !response.write(payload);
    response.end();
    releaseReader();
  });
  t.after(app.close);
  const proxy = await startBrowserProxy(app.origin);
  t.after(proxy.close);
  const proxyPort = Number(new URL(proxy.url).port);
  const appPort = Number(new URL(app.origin).port);
  let proxyBackpressure = false;
  let upstreamEnded = false;
  let upstreamErrors = 0;
  const normalDestroySnapshots = [];
  let heldFirstWrite = false;
  const socketWrite = net.Socket.prototype._write;
  t.mock.method(net.Socket.prototype, "_write", function (chunk, encoding, callback) {
    if (this.localPort === proxyPort && !heldFirstWrite
      && chunk.toString("ascii").startsWith("HTTP/1.1 200 OK")) {
      heldFirstWrite = true;
      // Keep one owned write pending through write()'s return so the bounded
      // queue actually applies backpressure even on fast loopback interfaces.
      setImmediate(() => socketWrite.call(this, chunk, encoding, callback));
    } else socketWrite.call(this, chunk, encoding, callback);
  });
  const write = net.Socket.prototype.write;
  t.mock.method(net.Socket.prototype, "write", function (...args) {
    // Bound the owned downstream queue instead of relying on OS buffer sizes.
    if (this.localPort === proxyPort) this._writableState.highWaterMark = 1024;
    const accepted = write.apply(this, args);
    if (this.localPort === proxyPort && !accepted) proxyBackpressure = true;
    return accepted;
  });
  const emit = net.Socket.prototype.emit;
  t.mock.method(net.Socket.prototype, "emit", function (event, ...args) {
    if (this.remotePort === appPort) {
      if (event === "end") upstreamEnded = true;
      if (event === "error") upstreamErrors++;
    }
    return emit.call(this, event, ...args);
  });
  const destroy = net.Socket.prototype.destroy;
  t.mock.method(net.Socket.prototype, "destroy", function (error) {
    if (this.localPort === proxyPort && upstreamEnded && !error) {
      normalDestroySnapshots.push({ pendingBytes: this.writableLength, writableFinished: this.writableFinished });
    }
    return destroy.call(this, error);
  });
  const socket = net.connect({ host: "127.0.0.1", port: proxyPort, highWaterMark: 1024 });
  t.after(() => socket.destroy());
  socket.setTimeout(5000, () => socket.destroy(new Error("Local CONNECT contract timeout")));
  const host = new URL(app.origin).host;
  socket.on("connect", () => socket.write(`CONNECT ${host} HTTP/1.1\r\nHost: ${host}\r\n\r\nGET /synthetic-large HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`));
  // Keep the receiver paused until the owned producer has queued its response.
  await Promise.race([producerBlocked, new Promise((_, reject) => socket.once("error", reject))]);
  const chunks = [];
  let readError;
  try {
    for await (const chunk of socket) {
      chunks.push(chunk);
      await new Promise(resolve => setImmediate(resolve));
    }
  } catch (error) { readError = error; }
  const wire = Buffer.concat(chunks);
  const connectEnd = wire.indexOf("\r\n\r\n") + 4;
  assert.match(wire.subarray(0, connectEnd).toString("ascii"), /^HTTP\/1\.1 200 Connection Established\r\n/);
  const bodyStart = wire.indexOf("\r\n\r\n", connectEnd) + 4;
  assert.match(wire.subarray(connectEnd, bodyStart).toString("ascii"), /^HTTP\/1\.1 200 OK\r\n/);
  const body = wire.subarray(bodyStart);
  t.diagnostic(JSON.stringify({ expectedBytes: payload.length, receivedBytes: body.length, producerBackpressure, proxyBackpressure, upstreamEnded, upstreamErrors, normalDestroySnapshots, readError: readError?.code ?? null }));
  assert.equal(producerBackpressure, true);
  assert.equal(heldFirstWrite, true);
  assert.equal(proxyBackpressure, true);
  assert.equal(upstreamEnded, true);
  assert.equal(upstreamErrors, 0);
  assert.equal(body.length, payload.length, "normal upstream FIN must preserve queued response bytes");
  assert.equal(createHash("sha256").update(body).digest("hex"), createHash("sha256").update(payload).digest("hex"));
  assert.equal(readError, undefined);
});

test("CONNECT normal FIN drains a pending downstream write before closing", { timeout: 5000 }, async (t) => {
  const payload = Buffer.alloc(1024, 97);
  const app = await serve((_request, response) => {
    response.writeHead(200, { "content-length": payload.length, connection: "close" });
    response.end(payload);
  });
  t.after(app.close);
  const proxy = await startBrowserProxy(app.origin);
  t.after(proxy.close);
  const proxyPort = Number(new URL(proxy.url).port);
  const appPort = Number(new URL(app.origin).port);
  let releaseWrite;
  let heldSocket;
  let pendingAtFin = 0;
  let normalFin = false;
  let destroyedBeforeRelease;
  let released;
  const writeReleased = new Promise(resolve => { released = resolve; });
  const write = net.Socket.prototype._write;
  t.mock.method(net.Socket.prototype, "_write", function (chunk, encoding, callback) {
    if (this.localPort === proxyPort && chunk.toString("ascii").startsWith("HTTP/1.1 200 OK")) {
      heldSocket = this;
      // Model a slow writable without depending on kernel buffer capacity.
      // This response fits below the high-water mark, so upstream FIN can
      // arrive while the downstream write is still pending.
      releaseWrite = () => {
        destroyedBeforeRelease = this.destroyed;
        write.call(this, chunk, encoding, callback);
        released();
      };
    } else write.call(this, chunk, encoding, callback);
  });
  const emit = net.Socket.prototype.emit;
  t.mock.method(net.Socket.prototype, "emit", function (event, ...args) {
    if (event === "end" && this.remotePort === appPort) {
      normalFin = true;
      pendingAtFin = heldSocket?.writableLength ?? 0;
      // Run after all upstream close handlers, precisely the old destroy race.
      this.once("close", () => setImmediate(() => releaseWrite?.()));
    }
    return emit.call(this, event, ...args);
  });
  const socket = net.connect({ host: "127.0.0.1", port: proxyPort });
  t.after(() => socket.destroy());
  socket.setTimeout(5000, () => socket.destroy(new Error("Local CONNECT contract timeout")));
  const host = new URL(app.origin).host;
  socket.on("connect", () => socket.write(`CONNECT ${host} HTTP/1.1\r\nHost: ${host}\r\n\r\nGET /pending-write HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`));
  const chunks = [];
  let readError;
  try { for await (const chunk of socket) chunks.push(chunk); }
  catch (error) { readError = error; }
  await writeReleased;
  const wire = Buffer.concat(chunks);
  const connectEnd = wire.indexOf("\r\n\r\n") + 4;
  const bodyStart = wire.indexOf("\r\n\r\n", connectEnd) + 4;
  const body = wire.subarray(bodyStart);
  assert.equal(normalFin, true);
  assert.ok(pendingAtFin > 0, "fixture must exercise queued bytes at normal FIN");
  assert.equal(destroyedBeforeRelease, false, "normal upstream close must not discard the pending write");
  assert.match(wire.subarray(0, connectEnd).toString("ascii"), /^HTTP\/1\.1 200 Connection Established\r\n/);
  assert.match(wire.subarray(connectEnd, bodyStart).toString("ascii"), /^HTTP\/1\.1 200 OK\r\n/);
  assert.equal(body.length, payload.length);
  assert.equal(createHash("sha256").update(body).digest("hex"), createHash("sha256").update(payload).digest("hex"));
  assert.equal(readError, undefined);
});

test("CONNECT abnormal upstream close and explicit proxy shutdown release active tunnels", { timeout: 5000 }, async (t) => {
  for (const mode of ["upstream-reset", "proxy-close"]) {
    await t.test(mode, async (t) => {
      let received;
      const requestReceived = new Promise(resolve => { received = resolve; });
      const app = await serve((_request, response) => {
        received();
        if (mode === "upstream-reset") response.socket.resetAndDestroy();
        // Otherwise deliberately leave this owned request active for shutdown.
      });
      t.after(app.close);
      const proxy = await startBrowserProxy(app.origin);
      t.after(proxy.close);
      const host = new URL(app.origin).host;
      const response = rawProxy(proxy, `CONNECT ${host} HTTP/1.1\r\nHost: ${host}\r\n\r\nGET /active HTTP/1.1\r\nHost: ${host}\r\n\r\n`);
      await requestReceived;
      if (mode === "proxy-close") await proxy.close();
      const wire = await response;
      assert.match(wire, /^HTTP\/1\.1 200 Connection Established\r\n/);
      assert.doesNotMatch(wire, /HTTP\/1\.1 200 OK/);
      await proxy.close();
      await proxy.close();
    });
  }
});

test("browser proxy allows only the app origin; all canaries remain untouched", async (t) => {
  let canaryRequests = 0;
  let canaryConnections = 0;
  let appRequests = 0;
  let appUpgrades = 0;
  const canary = await serve((_request, response) => {
    canaryRequests++;
    response.end("must never be reached");
  });
  canary.server.on("connection", () => { canaryConnections++; });
  t.after(canary.close);
  const app = await serve((request, response) => {
    appRequests++;
    if (request.url === "/redirect") {
      response.writeHead(302, { location: `${canary.origin}/redirect-canary` });
      response.end();
    } else {
      let body = "";
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        response.setHeader("x-app-host", request.headers.host);
        response.end(`${request.method} ${request.url} ${body}`);
      });
    }
  });
  app.server.on("upgrade", (_request, socket) => { appUpgrades++; socket.destroy(); });
  t.after(app.close);
  const proxy = await startBrowserProxy(app.origin);
  t.after(proxy.close);

  await t.test("positive GET and POST reach the owned local app", async () => {
    const get = await throughProxy(proxy, `${app.origin}/ok?mode=local`);
    assert.equal(get.status, 200);
    assert.equal(get.body, "GET /ok?mode=local ");
    assert.equal(get.headers["x-app-host"], new URL(app.origin).host);
    const post = await throughProxy(proxy, `${app.origin}/submit`, { method: "POST", body: "synthetic", headers: { "content-length": "9" } });
    assert.equal(post.status, 200);
    assert.equal(post.body, "POST /submit synthetic");
  });
  await t.test("CONNECT pins a tunnel to the owned app for Playwright API requests", async () => {
    const host = new URL(app.origin).host;
    const tunneled = await rawProxy(proxy, `CONNECT ${host} HTTP/1.1\r\nHost: ${host}\r\n\r\nGET /tunnel HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`);
    assert.match(tunneled, /^HTTP\/1\.1 200 Connection Established\r\n/);
    assert.match(tunneled, /HTTP\/1\.1 200 OK\r\n/);
    assert.match(tunneled, /GET \/tunnel /);
  });
  const acceptedRequests = appRequests;

  await t.test("synthetic external hostname and a different local port are denied", async () => {
    assert.equal((await throughProxy(proxy, "http://outside.invalid/never-resolve")).status, 403);
    assert.equal((await throughProxy(proxy, `${canary.origin}/direct-canary`)).status, 403);
  });
  await t.test("credentials, Host mismatch and authority aliases are denied", async () => {
    assert.equal((await throughProxy(proxy, app.origin.replace("http://", "http://user:pass@") + "/")).status, 403);
    assert.equal((await throughProxy(proxy, `${app.origin}/`, { headers: { host: new URL(canary.origin).host } })).status, 403);
    assert.equal((await throughProxy(proxy, `${app.origin.replace("127.0.0.1", "127.1")}/`)).status, 403);
    assert.equal((await throughProxy(proxy, `${app.origin}/bad\\path`)).status, 403);
    const duplicateHost = await rawProxy(proxy, `GET ${app.origin}/ HTTP/1.1\r\nHost: ${new URL(app.origin).host}\r\nHost: ${new URL(app.origin).host}\r\nConnection: close\r\n\r\n`);
    assert.match(duplicateHost, /^HTTP\/1\.1 403 /);
    const control = await rawProxy(proxy, `GET ${app.origin}/bad\u0001path HTTP/1.1\r\nHost: ${new URL(app.origin).host}\r\nConnection: close\r\n\r\n`);
    assert.doesNotMatch(control, /^HTTP\/1\.1 2\d\d /);
    assert.equal(appRequests, acceptedRequests);
  });
  await t.test("redirect is returned and its disallowed next hop is denied", async () => {
    const redirected = await throughProxy(proxy, `${app.origin}/redirect`);
    assert.equal(redirected.status, 302);
    assert.equal(redirected.headers.location, `${canary.origin}/redirect-canary`);
    assert.equal(canaryConnections, 0, "proxy must not follow redirects");
    assert.equal((await throughProxy(proxy, redirected.headers.location)).status, 403);
  });
  await t.test("disallowed CONNECT authorities and direct WebSocket upgrades never open a tunnel", async () => {
    const host = new URL(app.origin).host;
    for (const [destination, headers] of [
      [new URL(canary.origin).host, `Host: ${new URL(canary.origin).host}`],
      ["outside.invalid:443", "Host: outside.invalid:443"],
      [host.replace("127.0.0.1", "127.1"), `Host: ${host}`],
      [`user:pass@${host}`, `Host: ${host}`],
      [`${host}/path`, `Host: ${host}`],
      [host, `Host: ${new URL(canary.origin).host}`],
      [host, `Host: ${host}\r\nHost: ${host}`],
    ]) {
      const connect = await rawProxy(proxy, `CONNECT ${destination} HTTP/1.1\r\n${headers}\r\n\r\n`);
      assert.match(connect, /^HTTP\/1\.1 403 /);
    }
    for (const destination of [app.origin, canary.origin, "http://outside.invalid"]) {
      const upgrade = await rawProxy(proxy, `GET ${destination}/socket HTTP/1.1\r\nHost: ${new URL(destination).host}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: c3ludGhldGljLW9ubHkhIQ==\r\n\r\n`);
      assert.match(upgrade, /^HTTP\/1\.1 403 /);
    }
    assert.equal(appUpgrades, 0);
  });
  assert.equal(canaryRequests, 0);
  assert.equal(canaryConnections, 0, "negative tests must not even connect to the canary");
  assert.equal(appRequests, acceptedRequests + 1, "only the allowed redirect reached the app after controls");
  await proxy.close();
  await proxy.close();
});

test("proxy rejects nonliteral/nonloopback app origins before listening", async () => {
  for (const origin of ["http://outside.invalid:4173", "http://localhost:4173", "http://0.0.0.0:4173", "http://127.1:4173", "http://127.0.0.1:4173/path"]) {
    await assert.rejects(startBrowserProxy(origin), /loopback/);
  }
  await assert.rejects(startBrowserProxy("http://127.0.0.1:4173", -1), /proxy port/);
});

