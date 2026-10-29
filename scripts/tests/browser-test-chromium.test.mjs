import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import http from "node:http";
import test from "node:test";
import { chromium } from "@playwright/test";
import { browserLaunchOptions } from "../browser-test-config.mjs";
import { startBrowserProxy } from "../browser-test-proxy.mjs";

const executablePath = (process.env.SMOKE_CHROMIUM_PATH
  ? [process.env.SMOKE_CHROMIUM_PATH]
  : [chromium.executablePath(), "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"]
).find((path) => existsSync(path));

async function serve(handler) {
  const sockets = new Set();
  const server = http.createServer(handler);
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    server,
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      for (const socket of sockets) socket.destroy();
    }),
  };
}

function localControl(origin, upgrade = false) {
  return new Promise((resolve, reject) => {
    const target = new URL(origin);
    const request = http.request({
      hostname: "127.0.0.1", port: target.port, path: "/control", agent: false,
      headers: upgrade ? {
        connection: "Upgrade", upgrade: "websocket",
        "sec-websocket-version": "13", "sec-websocket-key": "c3ludGhldGljLW9ubHkhIQ==",
      } : {},
    }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode));
    });
    request.on("upgrade", (response, socket) => { socket.destroy(); resolve(response.statusCode); });
    request.on("error", reject);
    request.end();
  });
}

test("Chromium manual contexts obey the browser proxy for HTTP, redirects and WebSocket", {
  timeout: 60_000,
}, async (t) => {
  assert.ok(executablePath, "Browser isolation requires an existing Chromium/Chrome/Edge binary; no installation attempted");
  let canaryRequests = 0;
  let canaryConnections = 0;
  let canaryUpgrades = 0;
  const canary = await serve((_request, response) => {
    canaryRequests++;
    response.setHeader("access-control-allow-origin", "*");
    response.end("synthetic canary");
  });
  canary.server.on("connection", () => { canaryConnections++; });
  canary.server.on("upgrade", (request, socket) => {
    canaryUpgrades++;
    const accept = createHash("sha1")
      .update(request.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
      .digest("base64");
    socket.end(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  });
  t.after(canary.close);

  // Demonstrate both canary services are reachable before testing denial.
  assert.equal(await localControl(canary.origin), 200);
  assert.equal(await localControl(canary.origin, true), 101);
  assert.equal(canaryRequests, 1);
  assert.equal(canaryUpgrades, 1);
  assert.equal(canaryConnections, 2);
  const controls = { requests: canaryRequests, upgrades: canaryUpgrades, connections: canaryConnections };

  const app = await serve((request, response) => {
    if (request.url === "/redirect" || request.url === "/route-redirect") {
      response.writeHead(302, { location: `${canary.origin}/redirect-canary` });
      response.end();
    } else {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end("<!doctype html><title>Local proxy control</title><h1>Synthetic app</h1>");
    }
  });
  t.after(app.close);
  const proxy = await startBrowserProxy(app.origin);
  t.after(proxy.close);
  const launch = browserLaunchOptions(proxy.url, executablePath);
  assert.equal(launch.proxy.server, proxy.url);
  assert.equal(launch.proxy.bypass, "<-loopback>");
  assert.ok(launch.args.includes("--disable-quic"));
  assert.ok(launch.args.includes("--force-webrtc-ip-handling-policy=disable_non_proxied_udp"));
  const browser = await chromium.launch({ ...launch, headless: true });
  t.after(() => browser.close());
  t.diagnostic(`Synthetic browser control: ${browser.version()}; executable=${executablePath}`);

  // Recovery tests create their own contexts: the launch-level proxy must be
  // inherited even when no context-level proxy option is supplied.
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  const allowed = await page.goto(`${app.origin}/`);
  assert.equal(allowed.status(), 200);
  assert.equal(await page.title(), "Local proxy control");
  const api = await context.request.get(`${app.origin}/api-control`);
  assert.equal(api.status(), 200, "APIRequestContext must reach only the pinned app tunnel");
  const apiDenied = await context.request.get(`${canary.origin}/api-canary`)
    .then((response) => response.status(), () => "denied");
  assert.ok(apiDenied === 403 || apiDenied === "denied", "APIRequestContext must inherit the proxy for disallowed origins");
  let routeFetches = 0;
  await page.route(`${app.origin}/route-control`, async (route) => {
    const upstream = await route.fetch();
    assert.equal(upstream.status(), 200);
    routeFetches++;
    await route.fulfill({ response: upstream });
  });
  assert.equal((await page.goto(`${app.origin}/route-control`)).status(), 200);
  assert.equal(routeFetches, 1, "route.fetch must preserve the pinned app tunnel");
  let routeRedirectStatus;
  await page.route(`${app.origin}/route-redirect`, async (route) => {
    try {
      const upstream = await route.fetch();
      routeRedirectStatus = upstream.status();
    } catch {
      routeRedirectStatus = "denied";
    }
    // CONNECT denial can produce an empty response. Return a deterministic
    // document to Chromium and independently assert the API's real result.
    await route.fulfill({ status: 403, contentType: "text/html", body: "<title>Synthetic API redirect denied</title>" });
  });
  assert.equal((await page.goto(`${app.origin}/route-redirect`)).status(), 403);
  assert.ok(routeRedirectStatus === 403 || routeRedirectStatus === "denied",
    "route.fetch automatic redirects must preserve the proxy allowlist");
  await page.goto(`${app.origin}/`);
  const direct = await page.evaluate(async (origin) => {
    try { return (await fetch(`${origin}/direct-canary`)).status; }
    catch { return "denied"; }
  }, canary.origin);
  assert.ok(direct === 403 || direct === "denied");
  const ws = await page.evaluate((origin) => new Promise((resolve) => {
    const socket = new WebSocket(origin.replace("http:", "ws:") + "/socket-canary");
    const timer = setTimeout(() => { socket.close(); resolve("timeout"); }, 5000);
    socket.onopen = () => { clearTimeout(timer); socket.close(); resolve("opened"); };
    socket.onerror = () => { clearTimeout(timer); resolve("denied"); };
  }), canary.origin);
  assert.equal(ws, "denied");
  const redirected = await page.goto(`${app.origin}/redirect`);
  assert.equal(redirected.status(), 403);
  assert.match(await page.textContent("body"), /proxy denied destination/);
  assert.deepEqual({ requests: canaryRequests, upgrades: canaryUpgrades, connections: canaryConnections }, controls,
    "browser direct, redirect and WebSocket negatives must not connect to the local canary");
  await context.close();
});
