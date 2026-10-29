import assert from "node:assert/strict";
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
