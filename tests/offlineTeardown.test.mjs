import assert from "node:assert/strict";
import { test } from "node:test";
import { closeOfflinePages } from "./offlineTeardown.ts";
import { installComponentTransport } from "./design-group-c/component/transport.ts";

function fixture({ drainError = false } = {}) {
  let intercepted = true;
  const events = [];
  const livePages = new Set();
  for (const name of ["main", "popup"]) {
    const page = {
      async waitForLoadState() {
        assert.equal(intercepted, true);
        events.push(`drain:${name}`);
        if (drainError && name === "main") throw new Error("synthetic drain failure");
      },
      async close(options) {
        assert.equal(intercepted, true, "unload work must remain intercepted");
        assert.equal(options.runBeforeUnload, false);
        events.push(`close:${name}`);
        livePages.delete(page);
      },
    };
    livePages.add(page);
  }
  return {
    context: {
      pages: () => [...livePages],
      async unrouteAll(options) {
        assert.equal(livePages.size, 0, "remove routes only after every page has closed");
        assert.equal(options.behavior, "wait");
        intercepted = false;
        events.push("unroute");
      },
    },
    events,
  };
}

test("offline interception survives draining and closing every page", async () => {
  const { context, events } = fixture();
  assert.deepEqual(await closeOfflinePages(context), []);
  assert.deepEqual(events, ["drain:main", "drain:popup", "close:main", "close:popup", "unroute"]);
});

test("a drain failure still closes guarded pages before returning diagnostics", async () => {
  const { context, events } = fixture({ drainError: true });
  assert.deepEqual(await closeOfflinePages(context), ["Error: synthetic drain failure"]);
  assert.equal(events.at(-1), "unroute");
  assert.equal(context.pages().length, 0);
});

async function componentFixture({ failure, abortFailure = false, status = 200,
  failureError = new Error("synthetic transport failure"), abortError = new Error("synthetic context already closed") } = {}) {
  const { context, events } = fixture();
  let handler;
  Object.assign(context, {
    on() {},
    async routeWebSocket() {},
    async route(_pattern, callback) { handler = callback; },
  });
  for (const page of context.pages()) page.on = () => {};
  const ledger = await installComponentTransport(context);
  const route = {
    request: () => ({ method: () => "GET", url: () => "http://127.0.0.1:4194/node_modules/.vite/deps/lucide-react.js?v=synthetic" }),
    async fetch(options) {
      assert.deepEqual(options, { maxRedirects: 0 });
      events.push("fetch");
      if (failure === "fetch") throw failureError;
      return { status: () => status };
    },
    async fulfill() {
      events.push("fulfill");
      if (failure === "fulfill") throw failureError;
    },
    async abort() {
      events.push("abort");
      if (abortFailure) throw abortError;
    },
  };
  return { context, events, ledger, run: () => handler(route) };
}

for (const failure of ["fetch", "fulfill"]) {
  test(`a component ${failure} failure aborts the route before guarded teardown and stays a gate failure`, async () => {
    const { context, events, ledger, run } = await componentFixture({ failure });
    await run();
    assert.deepEqual(ledger.observed, []);
    assert.deepEqual(ledger.errors, [`Transport failed: GET http://127.0.0.1:4194/node_modules/.vite/deps/lucide-react.js [phase=${failure}; cause=UNKNOWN]`]);
    assert.deepEqual(await closeOfflinePages(context), []);
    assert.deepEqual(events.slice(0, events.indexOf("drain:main")), failure === "fetch"
      ? ["fetch", "abort"] : ["fetch", "fulfill", "abort"]);
    assert.equal(events.at(-1), "unroute");
  });
}

test("a component abort failure is retained without an unhandled route rejection", async () => {
  const { ledger, run } = await componentFixture({ failure: "fetch", abortFailure: true });
  await run();
  assert.equal(ledger.errors.length, 2);
  assert.match(ledger.errors[1], /^Transport abort failed:/);
  assert.deepEqual(ledger.observed, []);
});

test("a successful component asset is observed only after fulfill", async () => {
  const { events, ledger, run } = await componentFixture();
  await run();
  assert.deepEqual(events, ["fetch", "fulfill"]);
  assert.deepEqual(ledger.errors, []);
  assert.equal(ledger.observed.length, 1);
});

test("component redirects remain aborted without fulfillment or success accounting", async () => {
  const { events, ledger, run } = await componentFixture({ status: 302 });
  await run();
  assert.deepEqual(events, ["fetch", "abort"]);
  assert.equal(ledger.unexpected.length, 1);
  assert.deepEqual(ledger.observed, []);
});

test("component transport retains only fixed cause codes and never error payloads", async () => {
  const sensitiveSentinel = "private.fixture.data";
  let codeReads = 0;
  const cases = [
    ...["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE", "ABORT_ERR"].map(code => [
      Object.assign(new Error(sensitiveSentinel), { code, headers: { authorization: sensitiveSentinel }, body: sensitiveSentinel, stack: sensitiveSentinel, cause: { code: sensitiveSentinel } }), code,
    ]),
    [new Error(`route.fetch: aborted\n${sensitiveSentinel}`), "PW_ABORTED"],
    [new Error(`route.fetch: Timeout 30000ms exceeded.\n${sensitiveSentinel}`), "PW_TIMEOUT"],
    [new Error(`route.fulfill: Target page, context or browser has been closed\n${sensitiveSentinel}`), "PW_TARGET_CLOSED"],
    [new Error(`route.fetch: socket hang up\n${sensitiveSentinel}`), "PW_SOCKET_HANGUP"],
    [new Error(`route.fetch: read ECONNRESET ${sensitiveSentinel}`), "ECONNRESET"],
    [Object.assign(new Error(sensitiveSentinel), { code: `ECONNRESET-${sensitiveSentinel}` }), "UNKNOWN"],
    [{ code: { data: sensitiveSentinel }, message: 42 }, "UNKNOWN"],
    [{ get code() { return ++codeReads === 1 ? "ECONNRESET" : sensitiveSentinel; } }, "ECONNRESET"],
    [{ get code() { throw new Error(sensitiveSentinel); } }, "UNKNOWN"],
    [sensitiveSentinel, "UNKNOWN"],
  ];
  for (const [failureError, cause] of cases) {
    const { ledger, run } = await componentFixture({ failure: "fetch", failureError });
    await run();
    assert.deepEqual(ledger.errors, [`Transport failed: GET http://127.0.0.1:4194/node_modules/.vite/deps/lucide-react.js [phase=fetch; cause=${cause}]`]);
    assert.equal(JSON.stringify(ledger).includes(sensitiveSentinel), false);
    assert.deepEqual(ledger.observed, []);
  }
});

test("redirect abort and recovery abort keep distinct sanitized phases", async () => {
  const { ledger, run } = await componentFixture({ status: 302, abortFailure: true,
    abortError: Object.assign(new Error("private.fixture.data"), { code: "EPIPE" }) });
  await run();
  assert.deepEqual(ledger.errors, [
    "Transport failed: GET http://127.0.0.1:4194/node_modules/.vite/deps/lucide-react.js [phase=redirect-abort; cause=EPIPE]",
    "Transport abort failed: GET http://127.0.0.1:4194/node_modules/.vite/deps/lucide-react.js [phase=abort-failure; cause=EPIPE]",
  ]);
  assert.equal(JSON.stringify(ledger).includes("private.fixture.data"), false);
  assert.equal(ledger.unexpected.length, 1);
});
