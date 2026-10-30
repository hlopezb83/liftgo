import assert from "node:assert/strict";
import { test } from "node:test";
import { closeOfflinePages } from "./offlineTeardown.ts";

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
