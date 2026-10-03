import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureOperationalError } from "@/lib/observability/captureOperationalError";
import { notifyAsync, notifyError } from "@/lib/ui/appFeedback";
import { openErrorReport } from "@/lib/ui/errorDetailsStore";

const sdk = vi.hoisted(() => ({
  getClient: vi.fn(), withScope: vi.fn(), captureException: vi.fn(),
  setTag: vi.fn(), setContext: vi.fn(),
}));
const sonner = vi.hoisted(() => ({ error: vi.fn(), promise: vi.fn(), dismiss: vi.fn() }));
vi.mock("@/lib/observability/sentry", () => ({ Sentry: sdk }));
vi.mock("sonner", () => ({ toast: sonner }));
vi.mock("@/lib/ui/errorDetailsStore", () => ({ openErrorReport: vi.fn() }));
const writeText = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  sdk.getClient.mockReturnValue({});
  sdk.withScope.mockImplementation((callback) => callback({ setTag: sdk.setTag, setContext: sdk.setContext }));
  writeText.mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("el diagnóstico local sobrevive a fallos de Sentry", () => {
  it.each(["getClient", "withScope", "captureException"] as const)("conserva toast, detalles y JSON cuando falla %s", async (method) => {
    sdk[method].mockImplementationOnce(() => { throw new Error("telemetry unavailable"); });
    const failure = Object.assign(new Error("Servicio no disponible"), { status: 503 });
    expect(() => notifyError({ error: failure, title: "No se pudo guardar", phase: "mutation" })).not.toThrow();
    expect(sonner.error).toHaveBeenCalledTimes(1);
    const [title, options] = sonner.error.mock.calls[0];
    expect(title).toBe("No se pudo guardar");
    expect(options.duration).toBe(Infinity);
    render(options.action);
    fireEvent.click(screen.getByRole("button", { name: "Copiar JSON" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const report = JSON.parse(writeText.mock.calls[0][0]);
    expect(report).toMatchObject({ title: "No se pudo guardar", phase: "mutation", errorCode: "INTERNAL_ERROR",
      errorDetails: { message: "Servicio no disponible", status: 503 } });
    expect(report.requestId).toBeTruthy();
    expect(JSON.stringify(report)).not.toContain("telemetry unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Ver detalles" }));
    expect(openErrorReport).toHaveBeenCalledWith(options.action.props.report);
  });

  it("conserva la promesa y el diagnóstico original del toast asíncrono", async () => {
    sdk.withScope.mockImplementationOnce(() => { throw new Error("telemetry unavailable"); });
    const failure = new Error("No se pudo descargar");
    const promise = Promise.reject(failure);
    const result = notifyAsync(promise, { loading: "Descargando…", success: "Descargado", error: "Descarga interrumpida" });
    expect(result).toBe(promise);
    await expect(result).rejects.toBe(failure);
    const toastError = sonner.promise.mock.calls[0][1].error(failure);
    expect(toastError.action.props.report.errorDetails.message).toBe(failure.message);
    expect(toastError.action.props.report.errorCode).toBe("UNKNOWN");
    expect(toastError.duration).toBe(Infinity);
  });

  it("permite registrar de nuevo tras un fallo del SDK y deduplica tras capturar", () => {
    sdk.captureException.mockImplementationOnce(() => { throw new Error("capture failed"); });
    const failure = new Error("Error original");
    const capture = () => captureOperationalError(failure, { errorCode: "INTERNAL_ERROR" });
    expect(capture).not.toThrow();
    capture();
    capture();
    expect(sdk.captureException).toHaveBeenCalledTimes(2);
  });
});
