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

import {
  installOfflineDispatcher,
  portalInvoices,
  portalQuotes,
  invoiceCustomerName,
  type OfflineProfile,
} from "../../tests/mobile/offlineDispatcher";

const ORIGIN = "http://localhost:4173";
const BACKEND = "http://127.0.0.1:54321";

async function fixture(
  authenticated = true,
  profile: OfflineProfile = "dispatcher",
) {
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
    profile,
  );
  const request = async (
    url: string,
    method = "GET",
    headers: Record<string, string> = {},
    body: unknown = {},
    responseStatus = 200,
  ) => {
    const route = {
      request: () => ({
        url: () => url,
        method: () => method,
        headers: () => headers,
        postDataJSON: () => body,
      }),
      abort: vi.fn(),
      continue: vi.fn(),
      fetch: vi.fn(async () => ({ status: () => responseStatus })),
      fulfill: vi.fn(),
    };
    await handler(route as unknown as Route);
    return route;
  };
  return { context, state, request };
}

beforeEach(() => vi.clearAllMocks());

describe("mobile offline fixture isolation", () => {
  it("fetches local GET assets without following redirects and closes every websocket", async () => {
    const { context, request } = await fixture();
    const asset = await request(`${ORIGIN}/assets/index.js`);
    expect(asset.fetch).toHaveBeenCalledWith({ maxRedirects: 0 });
    expect(asset.fulfill).toHaveBeenCalledOnce();
    expect(asset.continue).not.toHaveBeenCalled();
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

describe("invoice review read-only fixtures", () => {
  it("provides only synthetic identity, customer and empty billing history", async () => {
    const { state, request } = await fixture(true, "invoice");
    const role = await request(`${BACKEND}/rest/v1/user_roles`);
    expect(JSON.parse(role.fulfill.mock.calls[0][0].body)[0].role).toBe("admin");
    const customers = await request(`${BACKEND}/rest/v1/organization_customers`);
    const customer = JSON.parse(customers.fulfill.mock.calls[0][0].body)[0];
    expect(customer.customers.name).toBe(invoiceCustomerName);
    expect(customer.rfc).toBe("AAA010101AAA");
    const history = await request(`${BACKEND}/rest/v1/invoices`);
    expect(JSON.parse(history.fulfill.mock.calls[0][0].body)).toEqual([]);
    const number = await request(`${BACKEND}/rest/v1/rpc/peek_next_draft_invoice_number`, "POST");
    expect(JSON.parse(number.fulfill.mock.calls[0][0].body)).toBe("QA-FAC-001");
    expect(state.unexpected).toEqual([]);
  });

  it.each([
    ["/rest/v1/invoices", "POST"],
    ["/rest/v1/invoices", "PATCH"],
    ["/rest/v1/invoices", "DELETE"],
    ["/rest/v1/rpc/save_invoice_with_bookings", "POST"],
    ["/rest/v1/rpc/next_invoice_number", "POST"],
    ["/rest/v1/rpc/get_portal_invoice", "POST"],
    ["/rest/v1/customers", "GET"],
    ["/functions/v1/stamp-invoice", "POST"],
    ["/auth/v1/token", "POST"],
  ])("rejects writes, fiscal calls and unlisted invoice reads: %s %s", async (path, method) => {
    const { state, request } = await fixture(true, "invoice");
    const result = await request(`${BACKEND}${path}`, method);
    expect(result.abort).toHaveBeenCalledOnce();
    expect(result.fulfill).not.toHaveBeenCalled();
    expect(result.fetch).not.toHaveBeenCalled();
    expect(state.unexpected).toHaveLength(1);
  });

  it.each(["dispatcher", "portal"] as const)("does not expand %s RPC allowlist", async (profile) => {
    const { request } = await fixture(true, profile);
    const result = await request(`${BACKEND}/rest/v1/rpc/peek_next_draft_invoice_number`, "POST");
    expect(result.abort).toHaveBeenCalledOnce();
  });
});

describe("portal mobile read-only fixtures", () => {
  it("provides a customer role, portal membership and synthetic list/detail rows", async () => {
    const { state, request } = await fixture(true, "portal");
    const membership = await request(`${ORIGIN}/_serverFn/abc123`);
    expect(
      JSON.parse(membership.fulfill.mock.calls[0][0].body).result.context,
    ).toMatchObject({
      memberType: "portal",
      customerId: "00000000-0000-4000-8000-000000000010",
    });
    const role = await request(`${BACKEND}/rest/v1/user_roles`);
    expect(JSON.parse(role.fulfill.mock.calls[0][0].body)[0].role).toBe(
      "customer",
    );
    const list = await request(
      `${BACKEND}/rest/v1/rpc/get_portal_invoices_page`,
      "POST",
      {},
      {
        p_page_size: 25,
        p_offset: 0,
        p_only_balance: false,
      },
    );
    expect(JSON.parse(list.fulfill.mock.calls[0][0].body)).toEqual({
      rows: portalInvoices,
      total_count: 2,
    });
    const invoice = await request(
      `${BACKEND}/rest/v1/rpc/get_portal_invoice`,
      "POST",
      {},
      {
        p_invoice_id: portalInvoices[1].id,
      },
    );
    expect(JSON.parse(invoice.fulfill.mock.calls[0][0].body)).toEqual([
      portalInvoices[1],
    ]);
    const quote = await request(
      `${BACKEND}/rest/v1/quotes?id=eq.${portalQuotes[1].id}`,
      "GET",
      {
        accept: "application/vnd.pgrst.object+json",
      },
    );
    expect(JSON.parse(quote.fulfill.mock.calls[0][0].body)).toEqual(
      portalQuotes[1],
    );
    expect(state.observed).toContain("get_portal_invoices_page");
    expect(state.unexpected).toEqual([]);
  });

  it.each([
    ["/rest/v1/quotes", "POST", {}],
    ["/rest/v1/quotes", "PATCH", {}],
    ["/rest/v1/quotes", "DELETE", {}],
    ["/rest/v1/rpc/accept_quote_from_portal", "POST", {}],
    ["/rest/v1/rpc/reject_quote_from_portal", "POST", {}],
    ["/rest/v1/rpc/get_portal_invoice", "POST", { p_invoice_id: "unknown" }],
    [
      "/rest/v1/rpc/get_portal_invoices_page",
      "POST",
      { p_offset: 25, p_page_size: 25, p_only_balance: false },
    ],
    ["/rest/v1/quotes?id=eq.unknown", "GET", {}],
    ["/rest/v1/bookings", "GET", {}],
    ["/auth/v1/token", "POST", {}],
  ])(
    "blocks unknown or mutating portal requests: %s %s",
    async (path, method, body) => {
      const { state, request } = await fixture(true, "portal");
      const result = await request(`${BACKEND}${path}`, method, {}, body);
      expect(result.abort).toHaveBeenCalledOnce();
      expect(result.fulfill).not.toHaveBeenCalled();
      expect(result.fetch).not.toHaveBeenCalled();
      expect(state.unexpected).toHaveLength(1);
    },
  );

  it("does not expand the dispatcher RPC allowlist", async () => {
    const { request } = await fixture();
    const result = await request(
      `${BACKEND}/rest/v1/rpc/get_portal_invoices_page`,
      "POST",
    );
    expect(result.abort).toHaveBeenCalledOnce();
  });

  it("rejects local redirects before they can contact an external origin", async () => {
    const { state, request } = await fixture(true, "portal");
    const result = await request(`${ORIGIN}/redirect`, "GET", {}, {}, 302);
    expect(result.fetch).toHaveBeenCalledWith({ maxRedirects: 0 });
    expect(result.abort).toHaveBeenCalledOnce();
    expect(result.fulfill).not.toHaveBeenCalled();
    expect(result.continue).not.toHaveBeenCalled();
    expect(state.unexpected).toEqual(["GET /redirect"]);
  });
});
