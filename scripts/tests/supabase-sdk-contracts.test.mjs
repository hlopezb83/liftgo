import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { after, mock, test } from "node:test";
import { fileURLToPath } from "node:url";

// Real SDK, synthetic responses only. Even an SDK regression that ignores the
// injected transport must fail here rather than contact an external service.
const networkGuard = mock.method(globalThis, "fetch", () => {
  throw new Error("Unexpected network: every SDK request must use the fixture transport");
});
const socketGuard = mock.method(globalThis, "WebSocket", function forbiddenWebSocket() {
  throw new Error("Unexpected network: Realtime must use the fixture WebSocket transport");
});
// Install both guards before loading the SDK, including any environment probes
// performed when its Realtime/Phoenix modules are initialized.
const { createClient } = await import("@supabase/supabase-js");
after(() => { networkGuard.mock.restore(); socketGuard.mock.restore(); });
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../../", import.meta.url));
const origin = "https://supabase-sdk-fixture.invalid";
const apiKey = "fixture-api-key";
const token = "fixture-session-token";
const userId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const factorId = "11111111-2222-4333-8444-555555555555";
const authOptions = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

function installedManifest(consumer, name) {
  const entry = consumer.resolve(name);
  for (let directory = path.dirname(entry); ; directory = path.dirname(directory)) {
    const file = path.join(directory, "package.json");
    if (existsSync(file)) {
      const manifest = JSON.parse(readFileSync(file, "utf8"));
      if (manifest.name === name) return manifest;
    }
    assert.notEqual(directory, path.dirname(directory), `Missing manifest for ${name}`);
  }
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json", ...headers },
  });
}

function fixture(respond) {
  const requests = [];
  const transport = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : input);
    assert.equal(url.origin, origin);
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    const request = { url, headers, method: init.method ?? "GET", body: init.body, signal: init.signal };
    requests.push(request);
    return respond(request);
  };
  const client = createClient(origin, apiKey, {
    auth: authOptions, global: { fetch: transport, headers: { Authorization: `Bearer ${token}` } },
  });
  return { client, requests };
}

function assertHeaders(request) {
  assert.equal(request.headers.get("apikey"), apiKey);
  assert.equal(request.headers.get("authorization"), `Bearer ${token}`);
}

test("Supabase and its five installed consumers stay aligned with stable 2.118.0 and Node 26", () => {
  const sdk = installedManifest(require, "@supabase/supabase-js");
  assert.equal(sdk.version, "2.118.0");
  const sdkRequire = createRequire(require.resolve("@supabase/supabase-js"));
  const pinnedNode = readFileSync(path.join(root, ".node-version"), "utf8").trim();
  assert.match(pinnedNode, /^26\.\d+\.\d+$/);
  assert.equal(process.versions.node, pinnedNode);
  assert.ok(Number(process.versions.node.split(".")[0]) >= 22);
  for (const name of ["auth-js", "functions-js", "postgrest-js", "realtime-js", "storage-js"]) {
    const dependency = `@supabase/${name}`;
    const installed = installedManifest(sdkRequire, dependency);
    assert.equal(sdk.dependencies[dependency], "2.118.0", dependency);
    assert.equal(installed.version, "2.118.0", dependency);
    assert.equal(installed.engines.node, ">=22.0.0", dependency);
  }
});

test("Auth Admin preserves UUID case, routes, methods and headers through the real SDK", async () => {
  const { client, requests } = fixture(({ url }) =>
    url.pathname.endsWith("/factors") ? json([]) : json({ user: { id: url.pathname.split("/")[5] } }));
  for (const id of [userId, userId.toUpperCase()]) {
    for (const [method, suffix, execute] of [
      ["GET", "", () => client.auth.admin.getUserById(id)],
      ["PUT", "", () => client.auth.admin.updateUserById(id, { user_metadata: { fixture: true } })],
      ["DELETE", "", () => client.auth.admin.deleteUser(id, true)],
      ["GET", "/factors", () => client.auth.admin.mfa.listFactors({ userId: id })],
      ["DELETE", `/factors/${factorId}`, () => client.auth.admin.mfa.deleteFactor({ userId: id, id: factorId })],
    ]) {
      const result = await execute();
      assert.equal(result.error, null);
      if (!suffix) assert.equal(result.data.user.id, id);
      const request = requests.at(-1);
      assert.equal(request.method, method);
      assert.equal(request.url.pathname, `/auth/v1/admin/users/${id}${suffix}`);
      assertHeaders(request);
      if (method === "PUT") assert.deepEqual(JSON.parse(request.body), { user_metadata: { fixture: true } });
      if (method === "DELETE" && !suffix) assert.deepEqual(JSON.parse(request.body), { should_soft_delete: true });
    }
  }
  assert.equal(requests.length, 10, "Positive control must exercise the transport");
});

test("all five GHSA-8r88-6cj9-9fh5 Auth Admin paths reject malformed identifiers before transport", async () => {
  const { client, requests } = fixture(() => json({ unexpected: true }));
  for (const invalid of ["", "not-a-uuid", "../users", `${userId}/factors`, `${userId}?x=1`, `${userId}%2f..`, ` ${userId}`]) {
    for (const execute of [
      () => client.auth.admin.getUserById(invalid),
      () => client.auth.admin.updateUserById(invalid, { user_metadata: {} }),
      () => client.auth.admin.deleteUser(invalid),
      () => client.auth.admin.mfa.listFactors({ userId: invalid }),
      () => client.auth.admin.mfa.deleteFactor({ userId: invalid, id: factorId }),
      () => client.auth.admin.mfa.deleteFactor({ userId, id: invalid }),
    ]) await assert.rejects(execute, /Expected parameter to be UUID/);
  }
  assert.equal(requests.length, 0);
});

test("PostgREST query and RPC preserve parameters, pagination, payloads and response data", async () => {
  const rows = [{ id: userId, total: "42.50" }];
  const { client, requests } = fixture(({ url }) =>
    url.pathname.includes("/rpc/") ? json({ total: "42.50" }) : json(rows, 200, { "Content-Range": "0-0/1" }));
  const query = await client.from("invoices").select("id,total", { count: "exact" })
    .eq("organization_id", userId).in("status", ["draft", "sent"])
    .order("id", { ascending: true }).range(0, 1);
  assert.equal(query.error, null);
  assert.deepEqual(query.data, rows);
  assert.equal(query.count, 1);
  const request = requests[0];
  assert.equal(request.method, "GET");
  assert.equal(request.url.pathname, "/rest/v1/invoices");
  for (const [name, value] of Object.entries({ select: "id,total", organization_id: `eq.${userId}`, status: "in.(draft,sent)", order: "id.asc", offset: "0", limit: "2" })) {
    assert.equal(request.url.searchParams.get(name), value, name);
  }
  assertHeaders(request);
  const rpc = await client.rpc("preview_invoice_totals", { p_invoice_id: userId });
  assert.equal(rpc.error, null);
  assert.deepEqual(rpc.data, { total: "42.50" });
  assert.equal(requests[1].method, "POST");
  assert.equal(requests[1].url.pathname, "/rest/v1/rpc/preview_invoice_totals");
  assert.deepEqual(JSON.parse(requests[1].body), { p_invoice_id: userId });
  assertHeaders(requests[1]);
});

test("PostgREST preserves errors and the caller's AbortSignal without another request", async () => {
  const failure = fixture(() => json({ message: "fixture permission denied", code: "42501", details: "fixture", hint: null }, 403));
  const result = await failure.client.from("invoices").select("id");
  assert.equal(result.status, 403);
  assert.equal(result.data, null);
  assert.equal(result.error.code, "42501");
  const controller = new AbortController();
  const cancelled = fixture(({ signal }) => {
    assert.equal(signal, controller.signal);
    return new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("fixture cancelled", "AbortError")), { once: true });
      controller.abort();
    });
  });
  const aborted = await cancelled.client.from("invoices").select("id").abortSignal(controller.signal);
  assert.equal(aborted.data, null);
  assert.match(aborted.error.message, /AbortError.*fixture cancelled/);
  assert.equal(cancelled.requests.length, 1);
});

test("Storage uploads preserve object path, body and headers including 2.118 content encoding", async () => {
  const { client, requests } = fixture(() => json({ Id: "fixture-object", Key: "invoice-fixtures/org/line.txt" }));
  const body = new Uint8Array([102, 105, 120, 116, 117, 114, 101]);
  const uploaded = await client.storage.from("invoice-fixtures").upload("org/line.txt", body, {
    contentType: "text/plain", contentEncoding: "gzip", cacheControl: "60", upsert: false,
  });
  assert.equal(uploaded.error, null);
  assert.deepEqual(uploaded.data, { id: "fixture-object", path: "org/line.txt", fullPath: "invoice-fixtures/org/line.txt" });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "POST");
  assert.equal(requests[0].url.pathname, "/storage/v1/object/invoice-fixtures/org/line.txt");
  assert.equal(requests[0].body, body);
  assertHeaders(requests[0]);
  assert.equal(requests[0].headers.get("content-type"), "text/plain");
  assert.equal(requests[0].headers.get("content-encoding"), "gzip");
  assert.equal(requests[0].headers.get("cache-control"), "max-age=60");
  assert.equal(requests[0].headers.get("x-upsert"), "false");
});

// BEGIN REALTIME SDK CONTRACT: keep the same contract in the other ERP.
function fakeWebSocketTransport() {
  const sockets = [];
  class FixtureWebSocket extends EventTarget {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    CONNECTING = 0;
    OPEN = 1;
    CLOSING = 2;
    CLOSED = 3;
    readyState = 0;
    bufferedAmount = 0;
    binaryType = "arraybuffer";
    onopen = null;
    onmessage = null;
    onclose = null;
    onerror = null;
    sent = [];
    closeCalls = [];
    constructor(address, protocols) {
      super();
      assert.equal(arguments.length, 2, "WebSocket transport accepts URL and subprotocols, not HTTP headers");
      this.url = String(address);
      this.protocol = typeof protocols === "string" ? protocols : (protocols?.[0] ?? "");
      sockets.push(this);
    }
    open() {
      this.readyState = this.OPEN;
      this.onopen?.(new Event("open"));
    }
    send(data) {
      assert.equal(this.readyState, this.OPEN);
      let frame;
      if (data instanceof ArrayBuffer) {
        // The real SDK uses a compact binary envelope for user broadcasts,
        // even with a JSON body. Decode the wire layout independently.
        const bytes = new Uint8Array(data);
        assert.equal(bytes[0], 3, "User broadcast push kind");
        assert.equal(bytes[6], 1, "JSON payload encoding");
        const decoder = new TextDecoder();
        let offset = 7;
        const fields = Array.from(bytes.slice(1, 6), (length) => {
          const field = decoder.decode(bytes.slice(offset, offset + length));
          offset += length;
          return field;
        });
        frame = [fields[0], fields[1], fields[2], "broadcast", {
          type: "broadcast", event: fields[3], payload: JSON.parse(decoder.decode(bytes.slice(offset))),
        }];
      } else frame = JSON.parse(data);
      assert.equal(frame.length, 5, "Exercise default Phoenix 2.0 framing");
      this.sent.push(frame);
    }
    receive(frame) {
      this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(frame) }));
    }
    reply(frame, status = "ok", response = {}) {
      this.receive([frame[0], frame[1], frame[2], "phx_reply", { status, response }]);
    }
    close(code, reason) {
      this.closeCalls.push({ code, reason });
      this.readyState = this.CLOSED;
      this.onclose?.({ code: code ?? 1000, reason: reason ?? "", wasClean: true });
    }
  }
  return { sockets, FixtureWebSocket };
}

async function settleRealtime() {
  // Only flush SDK Promise continuations; this does not sleep or open an I/O resource.
  for (let turn = 0; turn < 12; turn++) await Promise.resolve();
}

test("Realtime joins with scoped auth, transports events and tokens, and removes channels without sockets", async (t) => {
  // Phoenix uses join/heartbeat/reconnect timers. Virtualize them locally so a
  // 10-second SDK disconnect fallback cannot keep the Node test process alive.
  // Socket/channel teardown below is still performed by the real SDK.
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { sockets, FixtureWebSocket } = fakeWebSocketTransport();
  const requests = [];
  let currentToken = token;
  const client = createClient(origin, apiKey, {
    accessToken: async () => currentToken,
    global: { fetch: async (input, init) => {
      requests.push({ url: new URL(input), ...init, headers: new Headers(init.headers) });
      return new Response(null, { status: 202 });
    } },
    realtime: {
      transport: FixtureWebSocket, timeout: 1000, disconnectOnEmptyChannelsAfterMs: 0,
      params: { fixture: "scoped-channel" },
    },
  });
  const changes = { event: "*", schema: "public", table: "invoices", filter: `organization_id=eq.${userId}` };
  const statuses = [];
  const broadcasts = [];
  let channel;
  try {
    await client.realtime.setAuth(currentToken);
    channel = client.channel("invoice-fixture", { config: { private: true, broadcast: { ack: true } } })
      .on("postgres_changes", changes, () => {})
      .on("broadcast", { event: "invoice.updated" }, (event) => broadcasts.push(event.payload))
      .subscribe((status) => statuses.push(status));
    assert.equal(sockets.length, 1, "Positive control must instantiate the supplied transport");
    const socket = sockets[0];
    const address = new URL(socket.url);
    assert.equal(address.origin, origin.replace("https:", "wss:"));
    assert.equal(address.pathname, "/realtime/v1/websocket");
    assert.equal(address.searchParams.get("apikey"), apiKey);
    assert.equal(address.searchParams.get("fixture"), "scoped-channel");
    assert.equal(address.searchParams.get("vsn"), "2.0.0");
    assert.equal(address.searchParams.has("access_token"), false, "Session token belongs in join payload, not URL");
    socket.open();
    await settleRealtime();
    const join = socket.sent.find((frame) => frame[3] === "phx_join");
    assert.ok(join, "Subscribe must send a join frame");
    assert.equal(join[2], "realtime:invoice-fixture");
    assert.equal(join[4].access_token, token);
    assert.equal(join[4].config.private, true);
    assert.deepEqual(join[4].config.postgres_changes, [changes]);
    socket.reply(join, "ok", { postgres_changes: [{ ...changes, id: 17 }] });
    await settleRealtime();
    assert.ok(statuses.includes("SUBSCRIBED"));
    assert.deepEqual(client.getChannels(), [channel]);
    socket.receive([join[0], null, "realtime:other-organization", "broadcast", { event: "invoice.updated", payload: { id: "unrelated" } }]);
    assert.deepEqual(broadcasts, [], "Another channel must not reach this subscription");
    socket.receive([join[0], null, join[2], "broadcast", { event: "invoice.updated", payload: { id: userId, total: "42.50" } }]);
    assert.deepEqual(broadcasts, [{ id: userId, total: "42.50" }]);
    const sending = channel.send({ type: "broadcast", event: "invoice.updated", payload: { id: userId } });
    await settleRealtime();
    const sent = socket.sent.findLast((frame) => frame[3] === "broadcast");
    assert.ok(sent);
    assert.equal(sent[2], join[2]);
    assert.deepEqual(sent[4], { type: "broadcast", event: "invoice.updated", payload: { id: userId } });
    socket.reply(sent);
    assert.equal(await sending, "ok");
    currentToken = "fixture-refreshed-token";
    await client.realtime.setAuth(currentToken);
    const refreshed = socket.sent.findLast((frame) => frame[3] === "access_token");
    assert.ok(refreshed);
    assert.equal(refreshed[2], join[2]);
    assert.deepEqual(refreshed[4], { access_token: currentToken });
    // WebSocket cannot carry custom HTTP headers. The supported HTTP Realtime
    // transport must separately retain apikey and the refreshed bearer token.
    assert.deepEqual(await channel.httpSend("invoice.updated", { id: userId }), { success: true });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url.origin, origin);
    assert.equal(requests[0].url.pathname, "/realtime/v1/api/broadcast/invoice-fixture/events/invoice.updated");
    assert.equal(requests[0].url.searchParams.get("private"), "true");
    assert.equal(requests[0].method, "POST");
    assert.equal(requests[0].headers.get("apikey"), apiKey);
    assert.equal(requests[0].headers.get("authorization"), `Bearer ${currentToken}`);
    assert.deepEqual(JSON.parse(requests[0].body), { id: userId });
    const removing = client.removeChannel(channel);
    await settleRealtime();
    const leave = socket.sent.findLast((frame) => frame[3] === "phx_leave");
    assert.ok(leave, "Cleanup must send a leave frame");
    assert.equal(leave[2], join[2]);
    socket.reply(leave);
    assert.equal(await removing, "ok");
    await settleRealtime();
    assert.deepEqual(client.getChannels(), []);
    assert.ok(statuses.includes("CLOSED"));
    assert.equal(socket.closeCalls.length, 1);
    assert.equal(socket.readyState, socket.CLOSED);
    assert.equal(client.realtime.isConnected(), false);
    t.mock.timers.tick(11000);
    await settleRealtime();
    assert.equal(sockets.length, 1, "Cleanup must not reconnect");
  } finally {
    await client.realtime.disconnect();
  }
});
// END REALTIME SDK CONTRACT
