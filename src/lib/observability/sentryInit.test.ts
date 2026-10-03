import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({
  init: vi.fn(), setTag: vi.fn(), getClient: vi.fn(),
  addIntegration: vi.fn(), tanstackRouterBrowserTracingIntegration: vi.fn(() => ({ name: "BrowserTracing" })),
}));
vi.mock("@sentry/react", () => sdk);
import { attachSentryRouter, createClientSentryOptions, initClientSentry } from "./sentry";

beforeEach(() => { vi.clearAllMocks(); sdk.getClient.mockReturnValue(undefined); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("arranque explícito del cliente", () => {
  it("no inicializa ni transmite en pruebas/desarrollo o SSR", () => {
    vi.stubEnv("MODE", "test"); initClientSentry();
    vi.stubEnv("MODE", "development"); vi.stubEnv("VITE_SENTRY_FORCE", ""); initClientSentry();
    vi.stubEnv("MODE", "production"); vi.stubGlobal("window", undefined); initClientSentry();
    expect(sdk.init).not.toHaveBeenCalled();
  });
  it("un DSN vacío permite deshabilitar el monitoreo", () => {
    vi.stubEnv("MODE", "production"); vi.stubEnv("VITE_SENTRY_DSN", ""); initClientSentry();
    expect(sdk.init).not.toHaveBeenCalled();
  });
  it("inicializa en producción una sola vez y conecta el router una sola vez", () => {
    vi.stubEnv("MODE", "production"); vi.stubEnv("VITE_SENTRY_REPLAY", "");
    sdk.init.mockImplementation(() => sdk.getClient.mockReturnValue({}));
    initClientSentry(); initClientSentry();
    const router = { subscribe: vi.fn() };
    attachSentryRouter(router); attachSentryRouter(router);
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.tanstackRouterBrowserTracingIntegration).toHaveBeenCalledTimes(1);
    expect(sdk.tanstackRouterBrowserTracingIntegration).toHaveBeenCalledWith(router);
    expect(sdk.addIntegration).toHaveBeenCalledTimes(1);
  });
  it("elimina breadcrumbs de console e interacción y no oculta fallos de chunks", () => {
    const config = createClientSentryOptions("production", "https://public@example.com/1");
    for (const category of ["console", "ui.input", "ui.click"]) expect(config.beforeBreadcrumb?.({ category })).toBeNull();
    expect(config.ignoreErrors).not.toContain("Failed to fetch dynamically imported module");
    expect(config.beforeSendLog?.({ level: "error", body: "private" } as never)).toBeNull();
    expect(config.beforeSendMetric?.({ name: "private" } as never)).toBeNull();
  });
});
