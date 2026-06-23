import { describe, it, expect, vi, beforeEach } from "vitest";

const sonner = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  promise: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: sonner }));
vi.mock("@/lib/ui/errorDetailsStore", () => ({ openErrorReport: vi.fn() }));
vi.mock("@/lib/ui/errorReport", () => ({ buildErrorReport: vi.fn(() => ({})) }));

import {
  notifySuccess,
  notifyInfo,
  notifyWarning,
  notifyError,
  notifyValidation,
  notifyAsync,
} from "@/lib/ui/appFeedback";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("appFeedback", () => {
  it("notifySuccess pasa título y duración por defecto", () => {
    notifySuccess("Factura creada");
    expect(sonner.success).toHaveBeenCalledWith(
      "Factura creada",
      expect.objectContaining({ duration: 3500 }),
    );
  });

  it("notifySuccess soporta description, action y durationMs override", () => {
    const action = { label: "Ver", onClick: vi.fn() };
    notifySuccess("OK", { description: "detalle", action, durationMs: 10_000 });
    expect(sonner.success).toHaveBeenCalledWith(
      "OK",
      expect.objectContaining({ description: "detalle", action, duration: 10_000 }),
    );
  });

  it("notifyInfo usa duración 4000", () => {
    notifyInfo("Sin pólizas pendientes");
    expect(sonner.info).toHaveBeenCalledWith(
      "Sin pólizas pendientes",
      expect.objectContaining({ duration: 4000 }),
    );
  });

  it("notifyWarning acepta string y objeto", () => {
    notifyWarning("Cuidado");
    expect(sonner.warning).toHaveBeenLastCalledWith(
      "Cuidado",
      expect.objectContaining({ duration: 6000 }),
    );

    notifyWarning({ title: "Cuidado", description: "detalle" });
    expect(sonner.warning).toHaveBeenLastCalledWith(
      "Cuidado",
      expect.objectContaining({ description: "detalle", duration: 6000 }),
    );
  });

  it("notifyValidation usa toast.warning con duración corta y sin acción", () => {
    notifyValidation({ message: "Monto > 0" });
    expect(sonner.warning).toHaveBeenCalledWith(
      "Revisa los datos",
      expect.objectContaining({ description: "Monto > 0", duration: 5000 }),
    );
  });

  it("notifyError critical → duración Infinity, con closeButton y acción", () => {
    notifyError({ error: new Error("boom"), title: "Falló" });
    const [, opts] = sonner.error.mock.calls[0];
    expect(opts.duration).toBe(Infinity);
    expect(opts.closeButton).toBe(true);
    expect(opts.action.label).toBe("Ver detalles");
  });

  it("notifyError severity=warning → duración finita (6s)", () => {
    notifyError({ error: new Error("dup"), title: "Duplicado", severity: "warning" });
    const [, opts] = sonner.error.mock.calls[0];
    expect(opts.duration).toBe(6000);
  });

  it("notifyError sin error → usa message como fuente del reporte", () => {
    notifyError({ message: "Algo pasó", title: "Error" });
    expect(sonner.error).toHaveBeenCalled();
  });

  it("notifyAsync delega en toast.promise y devuelve la promesa original", async () => {
    const promise = Promise.resolve(42);
    const result = notifyAsync(promise, { loading: "Timbrando…", success: (n) => `OK ${n}` });
    expect(sonner.promise).toHaveBeenCalledTimes(1);
    await expect(result).resolves.toBe(42);
  });
});
