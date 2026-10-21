import { describe, expect, it, vi } from "vitest";
import type { BrowserContext } from "@playwright/test";
import publishedConfig from "../../playwright.prod-smoke.config";
import { guardReadOnlyApp } from "../../tests/smoke/readOnlyApp";
import { allowReadOnlyRequest, PUBLISHED_APP_ORIGIN, responseProblem } from "../../tests/smoke/readOnlyPolicy";

// Inspect runner settings without loading the Playwright runner inside Vitest.
vi.mock("@playwright/test", () => ({
  defineConfig: (config: unknown) => config,
  devices: { "Desktop Chrome": { browserName: "chromium" } },
}));

const ORIGIN = PUBLISHED_APP_ORIGIN;
const request = (path: string, method = "GET", resourceType = "fetch") => ({
  url: new URL(path, ORIGIN).href, method, resourceType,
});

describe("public smoke read-only network policy", () => {
  it.each(["/", "/auth", "/portal/login"])("allows only public document %s", (path) => {
    expect(allowReadOnlyRequest(request(path, "GET", "document"), ORIGIN)).toBe(true);
  });

  it.each(["/assets/entry-ab12.js", "/assets/route-cd34.mjs", "/assets/app-123.css", "/favicon.png", "/brand/liftgo-montacargas.png", "/version.json"])("allows shipped asset %s", (path) => {
    expect(allowReadOnlyRequest(request(path), ORIGIN)).toBe(true);
    expect(allowReadOnlyRequest(request(path, "HEAD"), ORIGIN)).toBe(true);
  });

  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "CONNECT"])("blocks %s even on an otherwise allowed URL", (method) => {
    expect(allowReadOnlyRequest(request("/", method, "document"), ORIGIN)).toBe(false);
    expect(allowReadOnlyRequest(request("/assets/app.js", method), ORIGIN)).toBe(false);
  });

  it.each([
    "/api/remove", "/_server/function", "/auth/v1/token", "/rest/v1/invoices", "/invoices",
    "/?action=delete", "/auth?token=unexpected", "/assets/../api/test.js", "/assets/folder/api.js",
    "/assets/app.js?payload=unexpected", "/version.json?token=unexpected",
    "https://liftgo.lovable.app.attacker.invalid/assets/app.js",
    "https://backend.invalid/rest/v1/invoices", "http://liftgo.lovable.app/assets/app.js",
    "https://user:password@liftgo.lovable.app/assets/app.js",
  ])("blocks backend, external, credentialed or unlisted URL %s", (path) => {
    expect(allowReadOnlyRequest(request(path), ORIGIN)).toBe(false);
  });

  it("does not allow a public document as an API fetch or an asset as navigation", () => {
    expect(allowReadOnlyRequest(request("/auth"), ORIGIN)).toBe(false);
    expect(allowReadOnlyRequest(request("/assets/app.js", "GET", "document"), ORIGIN)).toBe(false);
    expect(allowReadOnlyRequest({ url: "invalid", method: "GET", resourceType: "fetch" }, ORIGIN)).toBe(false);
  });

  it.each([
    ["/assets/app.js", 200, "text/javascript; charset=utf-8"],
    ["/assets/app.mjs", 200, "application/javascript"],
    ["/assets/app.css", 200, "text/css"],
    ["/favicon.png", 200, "image/png"],
    ["/version.json", 200, "application/json"],
    ["/portal/login", 200, "text/html; charset=utf-8"],
  ] as const)("accepts valid response %s", (path, status, mime) => {
    expect(responseProblem(`${ORIGIN}${path}`, status, mime)).toBeUndefined();
  });

  it.each([
    ["/assets/app.js", 200, "text/html"], ["/assets/app.css", 200, "text/html"],
    ["/version.json", 200, "text/html"], ["/favicon.png", 200, "text/html"],
    ["/portal/login", 200, "application/json"], ["/assets/app.js", 404, "application/javascript"],
    ["/assets/app.js", 500, "application/javascript"], ["/assets/app.js", 302, "text/html"],
    ["/assets/app.js", 304, ""], ["/assets/app.css", 200, ""],
  ] as const)("rejects broken/fallback/redirect response %s %s %s", (path, status, mime) => {
    expect(responseProblem(`${ORIGIN}${path}`, status, mime)).toBeDefined();
  });
});

async function fixture(path = "/assets/app.js", method = "GET", status = 200, contentType = "application/javascript") {
  const context = { route: vi.fn(), routeWebSocket: vi.fn() };
  const guard = await guardReadOnlyApp(context as unknown as BrowserContext, ORIGIN);
  const response = { status: () => status, headers: () => ({ "content-type": contentType }) };
  const route = {
    request: () => ({ url: () => request(path).url, method: () => method, resourceType: () => "fetch" }),
    fetch: vi.fn().mockResolvedValue(response), fulfill: vi.fn(), abort: vi.fn(),
  };
  const handler = context.route.mock.calls[0][1];
  return { context, guard, response, route, handler };
}

describe("public smoke interception enforcement", () => {
  it.each([["/assets/app.js", "POST"], ["/rest/v1/invoices", "GET"], ["https://backend.invalid/auth/v1/token", "POST"]])("never sends blocked request %s %s", async (path, method) => {
    const { route, handler, guard } = await fixture(path, method);
    await handler(route);
    expect(route.fetch).not.toHaveBeenCalled();
    expect(route.fulfill).not.toHaveBeenCalled();
    expect(route.abort).toHaveBeenCalledOnce();
    expect(guard.blocked.size).toBe(1);
  });

  it("reads once without following redirects and serves the actual response", async () => {
    const { route, response, handler, guard } = await fixture();
    await handler(route);
    expect(route.fetch).toHaveBeenCalledWith({ maxRedirects: 0, timeout: 15_000 });
    expect(route.fulfill).toHaveBeenCalledWith({ response });
    expect(guard.assets.has("/assets/app.js")).toBe(true);
    expect(guard.problems).toEqual([]);
  });

  it.each([[302, "text/html"], [200, "text/html"], [404, "text/plain"]])("aborts bad response %s %s", async (status, mime) => {
    const { route, handler, guard } = await fixture("/assets/app.js", "GET", status, mime);
    await handler(route);
    expect(route.abort).toHaveBeenCalledOnce();
    expect(route.fulfill).not.toHaveBeenCalled();
    expect(guard.problems).toHaveLength(1);
  });

  it("records a failed allowed asset read rather than masking it", async () => {
    const { route, handler, guard } = await fixture();
    route.fetch.mockRejectedValue(new Error("connection failed"));
    await handler(route);
    expect(route.abort).toHaveBeenCalledOnce();
    expect(guard.problems).toEqual(["Could not read /assets/app.js"]);
  });

  it("closes WebSockets without connecting to any server", async () => {
    const { context, guard } = await fixture();
    const socket = { close: vi.fn(), connectToServer: vi.fn() };
    context.routeWebSocket.mock.calls[0][1](socket);
    expect(socket.close).toHaveBeenCalledOnce();
    expect(socket.connectToServer).not.toHaveBeenCalled();
    expect(guard.problems).toHaveLength(1);
  });
});


describe("published smoke runner scope", () => {
  it("selects only app boot against the fixed public origin with an empty context", () => {
    expect(publishedConfig.testDir).toBe("./tests/smoke");
    expect(publishedConfig.testMatch).toBe("app-boot.spec.ts");
    expect(publishedConfig.use?.baseURL).toBe(ORIGIN);
    expect(publishedConfig.use?.storageState).toEqual({ cookies: [], origins: [] });
    expect(publishedConfig.use?.serviceWorkers).toBe("block");
    expect(publishedConfig.use?.acceptDownloads).toBe(false);
    expect(publishedConfig.globalSetup).toBeUndefined();
    expect(publishedConfig.globalTeardown).toBeUndefined();
    expect(publishedConfig.webServer).toBeUndefined();
    expect(publishedConfig.projects?.flatMap((project) => project.dependencies ?? [])).toEqual([]);
  });
});
