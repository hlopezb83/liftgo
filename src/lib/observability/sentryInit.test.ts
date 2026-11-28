import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({
  init: vi.fn(), setTag: vi.fn(), getClient: vi.fn(),
}));
vi.mock("@sentry/react", () => sdk);
import { createClientSentryOptions, initClientSentry } from "./sentry";

beforeEach(() => { vi.clearAllMocks(); sdk.getClient.mockReturnValue(undefined); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("arranque explícito del cliente", () => {
  it("un fallo de inicialización no detiene la hidratación del ERP", () => {
    vi.stubEnv("MODE", "production");
    sdk.init.mockImplementationOnce(() => { throw new Error("SDK startup failed"); });
    expect(() => initClientSentry()).not.toThrow();
    expect(sdk.init).toHaveBeenCalledTimes(1);
  });

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
  it("inicializa en producción una sola vez con tunnel, traces apagadas por defecto y Replay apagado", () => {
    vi.stubEnv("MODE", "production"); vi.stubEnv("VITE_SENTRY_REPLAY", "1");
    sdk.init.mockImplementation(() => sdk.getClient.mockReturnValue({}));
    initClientSentry(); initClientSentry();
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.init.mock.calls[0][0]).toMatchObject({
      tunnel: "/api/sentry-tunnel",
      environment: "production",
      tracesSampleRate: 0, replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 0,
    });
  });
  it("respeta VITE_SENTRY_ENVIRONMENT, opt-in de VITE_SENTRY_TRACES_SAMPLE_RATE y VITE_SENTRY_TUNNEL vacío", () => {
    vi.stubEnv("MODE", "production");
    vi.stubEnv("VITE_SENTRY_ENVIRONMENT", "preview");
    vi.stubEnv("VITE_SENTRY_TRACES_SAMPLE_RATE", "0.05");
    vi.stubEnv("VITE_SENTRY_TUNNEL", "");
    initClientSentry();
    expect(sdk.init.mock.calls[0][0]).toMatchObject({
      environment: "preview",
      tracesSampleRate: 0.05,
      tunnel: undefined,
    });
  });
  it("elimina breadcrumbs de console e interacción y no oculta fallos de chunks", () => {
    const config = createClientSentryOptions("production", "https://public@example.com/1");
    for (const category of ["console", "ui.input", "ui.click"]) expect(config.beforeBreadcrumb?.({ category })).toBeNull();
    expect(config.ignoreErrors).not.toContain("Failed to fetch dynamically imported module");
    expect(config.beforeSendLog?.({ level: "error", body: "private" } as never)).toBeNull();
    expect(config.beforeSendMetric?.({ name: "private" } as never)).toBeNull();
  });
});
