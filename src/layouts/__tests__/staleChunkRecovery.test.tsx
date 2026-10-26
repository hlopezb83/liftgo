import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { ErrorBoundary } from "@/layouts/ErrorBoundary";
import { clearStaleChunkReloadGuard } from "@/lib/staleChunkReload";
import { Route } from "@/routes/__root";

const mocks = vi.hoisted(() => ({ invalidate: vi.fn(), capture: vi.fn(), report: vi.fn() }));
vi.mock("@tanstack/react-router", async (original) => ({
  ...await original<typeof import("@tanstack/react-router")>(),
  useRouter: () => ({ invalidate: mocks.invalidate }),
}));
vi.mock("@/components/feedback/ErrorDiagnostic", () => ({ ErrorDiagnostic: () => <div>Diagnóstico</div> }));
vi.mock("@/layouts/AppProviders", () => ({ AppProviders: () => null }));
vi.mock("@/lib/observability/SentryNavigationSync", () => ({ SentryNavigationSync: () => null }));
vi.mock("@/lib/lovable-error-reporting", () => ({ reportLovableError: mocks.report }));
vi.mock("@/lib/observability/captureOperationalError", () => ({ captureOperationalError: mocks.capture }));
vi.mock("@/lib/observability/sentry", () => ({ Sentry: { withScope: (callback: (scope: unknown) => void) => callback({ setTag: vi.fn(), setContext: vi.fn() }) } }));

const reload = vi.fn();
const staleError = new Error("Failed to fetch dynamically imported module");
const RootError = Route.options.errorComponent as React.ComponentType<ErrorComponentProps>;
function BrokenChunk(): never { throw staleError; }

beforeEach(() => {
  vi.clearAllMocks();
  clearStaleChunkReloadGuard();
  sessionStorage.clear();
  Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, reload } });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); clearStaleChunkReloadGuard(); });

describe("recuperación manual de chunks sin almacenamiento", () => {
  it.each(["getItem", "setItem"] as const)("el boundary de React conserva reporte y acción manual cuando %s falla", (method) => {
    vi.stubGlobal("sessionStorage", { getItem: sessionStorage.getItem.bind(sessionStorage), [method]: () => { throw new Error("Storage blocked"); } });
    render(<ErrorBoundary><BrokenChunk /></ErrorBoundary>);
    expect(reload).not.toHaveBeenCalled();
    expect(mocks.capture).toHaveBeenCalledWith(staleError, expect.anything());
    expect(screen.getByText(/captura sin guardar podría perderse/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refrescar app" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("preload no se suprime y el boundary raíz permite recarga manual", () => {
    vi.stubGlobal("sessionStorage", { getItem: sessionStorage.getItem.bind(sessionStorage), setItem: () => { throw new Error("Storage blocked"); } });
    const event = new Event("vite:preloadError", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    const reset = vi.fn();
    render(<RootError error={staleError} reset={reset} />);
    expect(reload).not.toHaveBeenCalled();
    expect(mocks.capture).toHaveBeenCalledWith(staleError, expect.anything());
    expect(screen.getByText(/recarga automática se detuvo/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Recargar app" }));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(mocks.invalidate).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });

  it("los errores normales conservan invalidate/reset sin recarga completa", () => {
    const reset = vi.fn();
    render(<RootError error={new Error("Other failure")} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(mocks.invalidate).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });
});
