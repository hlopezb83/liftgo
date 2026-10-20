import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserContext, Route } from "@playwright/test";

const manifest = vi.hoisted(() => ({
  source: `
"abc123": { functionName: "getOrganizationContext_createServerFn_handler" },
"def456": { functionName: "getPlatformOperatorStatusFn_createServerFn_handler" }
`,
}));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const fake = {
    readdirSync: () => ["server-fixture.mjs"],
    readFileSync: () => manifest.source,
  };
  return { ...actual, ...fake, default: { ...actual, ...fake } };
});
vi.mock("@playwright/test", () => ({ expect }));

import { installOfflineDispatcher } from "../../tests/mobile/offlineDispatcher";

const ORIGIN = "http://localhost:4173";
const BACKEND = "http://127.0.0.1:54321";

async function fixture(authenticated = true) {
  let handler!: (route: Route) => Promise<unknown>;
  const context = {
    addInitScript: vi.fn(),
    routeWebSocket: vi.fn(),
    route: vi.fn(async (_url: string, callback: typeof handler) => {
      handler = callback;
    }),
  };
  const state = await installOfflineDispatcher(
    context as unknown as BrowserContext,
    ORIGIN,
    authenticated,
  );
  const request = async (
    url: string,
    method = "GET",
    headers: Record<string, string> = {},
  ) => {
    const route = {
      request: () => ({
        url: () => url,
        method: () => method,
        headers: () => headers,
      }),
      abort: vi.fn(),
      continue: vi.fn(),
      fulfill: vi.fn(),
    };
    await handler(route as unknown as Route);
    return route;
  };
  return { context, state, request };
}

beforeEach(() => vi.clearAllMocks());

describe("mobile offline fixture isolation", () => {
  it("only continues same-origin GET assets and closes every websocket", async () => {
    const { context, request } = await fixture();
    const asset = await request(`${ORIGIN}/assets/index.js`);
    expect(asset.continue).toHaveBeenCalledOnce();
    const external = await request(
      "https://unrelated.example.invalid/asset.js",
    );
    expect(external.abort).toHaveBeenCalledOnce();
    expect(external.continue).not.toHaveBeenCalled();
    const close = vi.fn();
    context.routeWebSocket.mock.calls[0][1]({ close });
    expect(close).toHaveBeenCalledOnce();
  });

  it("supplies nonempty synthetic rows and exactly the two compiled read functions", async () => {
    const { state, request } = await fixture();
    const bookings = await request(`${BACKEND}/rest/v1/bookings`);
    expect(
      JSON.parse(bookings.fulfill.mock.calls[0][0].body)[0].booking_number,
    ).toBe("QA-RES-001");
    for (const id of ["abc123", "def456"]) {
      const fn = await request(`${ORIGIN}/_serverFn/${id}`, "GET", {
        "x-tsr-serverfn": "true",
      });
      expect(JSON.parse(fn.fulfill.mock.calls[0][0].body)).toHaveProperty(
        "result",
      );
      expect(fn.continue).not.toHaveBeenCalled();
    }
    expect(state.observed.has("bookings")).toBe(true);
    expect(state.unexpected).toEqual([]);
  });

  it.each([
    [`${BACKEND}/rest/v1/bookings`, "POST"],
    [`${BACKEND}/rest/v1/bookings?id=eq.fake`, "PATCH"],
    [`${BACKEND}/rest/v1/bookings?id=eq.fake`, "DELETE"],
    [`${BACKEND}/rest/v1/invoices`, "GET"],
    [`${BACKEND}/rest/v1/rpc/unknown_write`, "POST"],
    [`${BACKEND}/auth/v1/token`, "POST"],
    [`${ORIGIN}/_serverFn/abc123`, "POST"],
    [`${ORIGIN}/_serverFn/unknown`, "GET"],
    [`${ORIGIN}/unknown`, "POST"],
  ])("fails closed for %s %s", async (url, method) => {
    const { state, request } = await fixture();
    const result = await request(url, method);
    expect(result.abort).toHaveBeenCalledOnce();
    expect(result.continue).not.toHaveBeenCalled();
    expect(result.fulfill).not.toHaveBeenCalled();
    expect(state.unexpected).toEqual([`${method} ${new URL(url).pathname}`]);
  });

  it("does not seed a session for access-screen scenarios", async () => {
    const { context } = await fixture(false);
    expect(context.addInitScript).not.toHaveBeenCalled();
  });

  it("refuses remote application origins before installing any mocks", async () => {
    await expect(
      installOfflineDispatcher({} as BrowserContext, "https://example.invalid"),
    ).rejects.toThrow();
  });
});
