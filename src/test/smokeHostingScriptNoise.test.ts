import { describe, expect, it, vi } from "vitest";
import type { BrowserContext } from "@playwright/test";
import { classifyConsoleError, normalizeUrl } from "../../tests/smoke/consoleNoise";
import { expectedHostingScriptAbort, knownHostingScriptUrl } from "../../tests/smoke/hostingScriptNoise";
import { guardReadOnlyApp } from "../../tests/smoke/readOnlyApp";
import { allowReadOnlyRequest, PUBLISHED_APP_ORIGIN, type SmokeRequest } from "../../tests/smoke/readOnlyPolicy";

const ORIGIN = PUBLISHED_APP_ORIGIN;
const TRANSPORT = "Failed to load resource: net::ERR_FAILED";
const URLS = [`${ORIGIN}/__l5e/events.js`, `${ORIGIN}/~flock.js`, `${ORIGIN}/__l5e/events.4d3abd1f6b7321c2.js`, `${ORIGIN}/__l5e/events.b21a279f52bb8621.js`];
const script = (url: string): SmokeRequest => ({ url, method: "GET", resourceType: "script" });
const noiseContext = (urls: string[] = []) => ({
  origin: ORIGIN,
  blocked: new Set<string>(),
  blockedHostingScripts: new Set(urls),
});

function mockRoute(request: SmokeRequest) {
  return {
    request: () => ({ url: () => request.url, method: () => request.method, resourceType: () => request.resourceType }),
    abort: vi.fn(), fetch: vi.fn(), fulfill: vi.fn(),
  };
}

async function fixture(origin = ORIGIN) {
  const context = { route: vi.fn(), routeWebSocket: vi.fn() };
  const guard = await guardReadOnlyApp(context as unknown as BrowserContext, origin);
  return { guard, handler: context.route.mock.calls[0][1] };
}

// Includes aliases new URL() would otherwise canonicalize (default port,
// host case, empty credentials and dot segments). Only fragments are ignored.
const INVALID_URLS = [
  `${ORIGIN}/__l5e/events.js?`, `${ORIGIN}/__l5e/events.js?event=1`,
  `${ORIGIN}/__l5e/events.js.map`, `${ORIGIN}/__l5e/events.jsx`,
  `${ORIGIN}/__l5e/Events.js`, `${ORIGIN}/other/events.js`,
  `https://other.invalid/__l5e/events.js`,

  "invalid", "//liftgo.lovable.app/~flock.js",
  "https://other.invalid/~flock.js", "https://liftgo.lovable.app.attacker.invalid/~flock.js",
  "http://liftgo.lovable.app/~flock.js", "https://liftgo.lovable.app:444/~flock.js",
  "https://liftgo.lovable.app:443/~flock.js", "http://localhost:4173/~flock.js",
  "https://user:password@liftgo.lovable.app/~flock.js", "https://@liftgo.lovable.app/~flock.js",
  "https://LIFTGO.lovable.app/~flock.js", `${ORIGIN}/~Flock.js`,
  `${ORIGIN}/~flock.js?`, `${ORIGIN}/~flock.js?event=1`, `${ORIGIN}/~flock.js?#fragment`,
  `${ORIGIN}/~flock.js/`, `${ORIGIN}/~flock.js.map`, `${ORIGIN}/~flock.jsx`,
  `${ORIGIN}/other/~flock.js`, `${ORIGIN}/other/../~flock.js`, `${ORIGIN}/%7Eflock.js`,
  `${ORIGIN}/__l5e/events.4d3abd1f6b7321c3.js`, `${ORIGIN}/__l5e/events.4D3ABD1F6B7321C2.js`,
  `${ORIGIN}/__l5e/events.4d3abd1f6b7321c2.js?`, `${ORIGIN}/__l5e/events.4d3abd1f6b7321c2.js?event=1`,
  `${ORIGIN}/__l5e/events.4d3abd1f6b7321c2.js.map`, `${ORIGIN}/__l5e/other.js`,
  `${ORIGIN}/__l5e/events.b21a279f52bb8622.js`, `${ORIGIN}/__l5e/events.B21A279F52BB8621.js`,
  `${ORIGIN}/__l5e/events.b21a279f52bb8621.js?`, `${ORIGIN}/__l5e/events.b21a279f52bb8621.js?event=1`,
  `${ORIGIN}/__l5e/events.b21a279f52bb8621.js.map`, `${ORIGIN}/other/events.b21a279f52bb8621.js`,
  `https://other.invalid/__l5e/events.b21a279f52bb8621.js`,
  `${ORIGIN}/__l5e/replay`, `${ORIGIN}/__l5e/rrweb-record.js`,
  `${ORIGIN}/~api/analytics`, `${ORIGIN}/__l5e/trackevents`, `${ORIGIN}/api/invoices`,
  `${ORIGIN}/assets/app.js`, `${ORIGIN}/version.json`,
];

describe("exact hosting script abort identities", () => {
  it.each(URLS)("recognizes %s without allowing a network read", (url) => {
    expect(expectedHostingScriptAbort(script(url), ORIGIN)).toBe(url);
    expect(allowReadOnlyRequest(script(url), ORIGIN)).toBe(false);
    expect(expectedHostingScriptAbort(script(`${url}#fragment`), ORIGIN)).toBe(normalizeUrl(url));
    expect(allowReadOnlyRequest(script(`${url}#fragment`), ORIGIN)).toBe(false);
  });

  it.each(INVALID_URLS)("rejects every non-exact identity %s", (url) => {
    expect(knownHostingScriptUrl(url, ORIGIN)).toBeUndefined();
    expect(expectedHostingScriptAbort(script(url), ORIGIN)).toBeUndefined();
  });

  it.each(["http://localhost:4173", "https://other.invalid", "http://liftgo.lovable.app", `${ORIGIN}:443`, `${ORIGIN}/`])(
    "requires the exact configured origin, not %s", (origin) => {
      for (const url of URLS) expect(expectedHostingScriptAbort(script(url), origin)).toBeUndefined();
    },
  );
});

describe("hosting scripts remain blocked without hiding other requests", () => {
  it.each(URLS.flatMap((url) => ["", "#request-fragment"].map((fragment) => [url, fragment])))(
    "aborts %s%s without fetch, fulfill, problems or asset accounting", async (url, fragment) => {
      const { handler, guard } = await fixture();
      const route = mockRoute(script(`${url}${fragment}`));
      await handler(route);
      expect(route.abort).toHaveBeenCalledExactlyOnceWith();
      expect(route.fetch).not.toHaveBeenCalled();
      expect(route.fulfill).not.toHaveBeenCalled();
      expect(guard.blocked).toEqual(new Set([url]));
      expect(guard.blockedHostingScripts).toEqual(new Set([url]));
      expect(guard.assets).toEqual(new Set());
      expect(guard.problems).toEqual([]);
      expect(classifyConsoleError({ text: TRANSPORT, url: `${url}#console-fragment` }, { origin: ORIGIN, ...guard }).ignored).toBe(true);
    },
  );

  it.each(["HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "CONNECT", "get"])(
    "still fails %s to either hosting URL", async (method) => {
      for (const url of URLS) {
        const { handler, guard } = await fixture();
        const request = { ...script(url), method };
        const route = mockRoute(request);
        expect(allowReadOnlyRequest(request, ORIGIN)).toBe(false);
        expect(expectedHostingScriptAbort(request, ORIGIN)).toBeUndefined();
        await handler(route);
        expect(route.abort).toHaveBeenCalledOnce();
        expect(route.fetch).not.toHaveBeenCalled();
        expect(route.fulfill).not.toHaveBeenCalled();
        expect(guard.blockedHostingScripts.size).toBe(0);
        expect(guard.assets.size).toBe(0);
        expect(guard.problems).toEqual([`Blocked ${method} ${new URL(url).pathname}`]);
      }
    },
  );

  it.each(["fetch", "xhr", "document", "image", "worker", "stylesheet", "other"])(
    "still fails a GET of type %s to either hosting URL", async (resourceType) => {
      for (const url of URLS) {
        const { handler, guard } = await fixture();
        const request = { ...script(url), resourceType };
        const route = mockRoute(request);
        expect(allowReadOnlyRequest(request, ORIGIN)).toBe(false);
        expect(expectedHostingScriptAbort(request, ORIGIN)).toBeUndefined();
        await handler(route);
        expect(route.abort).toHaveBeenCalledOnce();
        expect(route.fetch).not.toHaveBeenCalled();
        expect(route.fulfill).not.toHaveBeenCalled();
        expect(guard.blockedHostingScripts.size).toBe(0);
        expect(guard.problems).toEqual([`Blocked GET ${new URL(url).pathname}`]);
      }
    },
  );

  it.each(INVALID_URLS.filter((url) => {
    try { return new URL(url).origin === ORIGIN && !allowReadOnlyRequest(script(url), ORIGIN); }
    catch { return false; }
  }))("keeps non-exact same-origin URL %s in problems", async (url) => {
    const { handler, guard } = await fixture();
    const route = mockRoute(script(url));
    await handler(route);
    expect(route.abort).toHaveBeenCalledOnce();
    expect(route.fetch).not.toHaveBeenCalled();
    expect(route.fulfill).not.toHaveBeenCalled();
    expect(guard.blockedHostingScripts.size).toBe(0);
    expect(guard.problems).toEqual([`Blocked GET ${new URL(url).pathname}`]);
  });

  it.each(URLS)("does not extend the exception to a local server for %s", async (url) => {
    const origin = "http://localhost:4173";
    const { handler, guard } = await fixture(origin);
    const route = mockRoute(script(`${origin}${new URL(url).pathname}`));
    await handler(route);
    expect(route.abort).toHaveBeenCalledOnce();
    expect(route.fetch).not.toHaveBeenCalled();
    expect(guard.blockedHostingScripts.size).toBe(0);
    expect(guard.problems).toEqual([`Blocked GET ${new URL(url).pathname}`]);
  });

  it.each(URLS)("does not let a prior expected GET of %s hide later POST or fetch", async (url) => {
    const { handler, guard } = await fixture();
    const requests = [script(url), { ...script(url), method: "POST" }, { ...script(url), resourceType: "fetch" }];
    for (const request of requests) {
      const route = mockRoute(request);
      await handler(route);
      expect(route.abort).toHaveBeenCalledOnce();
      expect(route.fetch).not.toHaveBeenCalled();
      expect(route.fulfill).not.toHaveBeenCalled();
    }
    expect(guard.blockedHostingScripts).toEqual(new Set([url]));
    expect(guard.problems).toEqual([`Blocked POST ${new URL(url).pathname}`, `Blocked GET ${new URL(url).pathname}`]);
    expect(guard.assets.size).toBe(0);
  });
});

describe("hosting console noise requires exact error and per-run abort provenance", () => {
  it.each(URLS)("fails %s without a recognized abort, even in generic blocked", (url) => {
    expect(classifyConsoleError({ text: TRANSPORT, url }, noiseContext()).ignored).toBe(false);
    expect(classifyConsoleError({ text: TRANSPORT, url }, { ...noiseContext(), blocked: new Set([url]) }).ignored).toBe(false);
    expect(classifyConsoleError({ text: TRANSPORT, url }, noiseContext(URLS.filter((other) => other !== url))).ignored).toBe(false);
  });

  it.each([`${ORIGIN}/assets/app.js`, `${ORIGIN}/~api/analytics`, `${ORIGIN}/__l5e/trackevents`])(
    "never exempts an app asset or API %s, even if both sets contain it", (url) => {
      const context = { ...noiseContext([url]), blocked: new Set([url]) };
      expect(classifyConsoleError({ text: TRANSPORT, url }, context).ignored).toBe(false);
    },
  );

  it("does not reuse provenance from another guard execution", async () => {
    const first = await fixture();
    const second = await fixture();
    await first.handler(mockRoute(script(URLS[0])));
    expect(classifyConsoleError({ text: TRANSPORT, url: URLS[0] }, { origin: ORIGIN, ...second.guard }).ignored).toBe(false);
  });

  it.each(INVALID_URLS)("rejects %s even if placed in the hosting abort set", (url) => {
    expect(classifyConsoleError({ text: TRANSPORT, url }, noiseContext([normalizeUrl(url)])).ignored).toBe(false);
  });

  it.each([
    "TypeError: Failed to fetch", "Uncaught ReferenceError: __name is not defined",
    "Warning: Hydration failed", "Failed to load resource: net::ERR_CONNECTION_REFUSED",
    "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT", "Failed to load resource: net::ERR_ABORTED",
    "Failed to load resource: net::ERR_FAILED extra", "Failed to load resource:  net::ERR_FAILED",
    "Failed to load resource: net::ERR_FAILED\n",
  ])("never hides other errors: %s", (text) => {
    for (const url of URLS) expect(classifyConsoleError({ text, url }, noiseContext(URLS)).ignored).toBe(false);
  });

  it.each([undefined, ""])("fails an error without an attributed URL (%s)", (url) => {
    expect(classifyConsoleError({ text: TRANSPORT, url }, noiseContext(URLS)).ignored).toBe(false);
  });
});
