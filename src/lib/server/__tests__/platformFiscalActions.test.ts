import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ session: vi.fn(), guard: vi.fn(), rate: vi.fn(), rpc: vi.fn(), lookup: vi.fn() }));
vi.mock("../guards/platformSession.server", () => ({ requirePlatformSession: m.session }));
vi.mock("../adminGuards.server", async () => ({ HttpError: (await import("../guards/httpError")).HttpError,
  requirePlatformOperator: m.guard, enforceRateLimit: m.rate, asUntypedRpc: () => ({ rpc: m.rpc }) }));
vi.mock("../platformFiscalLookup.server", () => ({ lookupPlatformFiscalDocument: m.lookup }));
import { performPlatformFiscalAction } from "../platformFiscalActions.server";
import type { CallerClient } from "../guards/httpError";
const context = { userId: "actor", supabase: {} as CallerClient };
const input = { jobId: "job", requestId: "request", revision: "9007199254740993", reason: "Comprobar recuperación", intent: "retry" as const };
const reservation = { started: true, apiKey: "sk_test_ci_only", mode: "test", documentId: "99000000-0000-4000-8000-000000000031", knownId: "provider-1" };
describe("acciones fiscales: reserva antes de consultar y no filtra datos privados", () => {
  beforeEach(() => {
    vi.resetAllMocks(); m.session.mockResolvedValue({ id: "session" }); m.guard.mockResolvedValue({ admin: {} });
    m.rpc.mockResolvedValueOnce({ data: reservation, error: null }).mockResolvedValue({ data: "pac_pending", error: null });
    m.lookup.mockResolvedValue({ outcome: "pending", providerId: "provider-1", uuid: null, cancellation: "none", folio: null, series: null });
  });
  it("autoridad propia, permiso de acción, límite, reserva y GET antes de guardar; ID/llave no llegan a la UI", async () => {
    const result = await performPlatformFiscalAction(context, input);
    expect(m.guard).toHaveBeenCalledWith(context.supabase, "actor", "integrations.retry");
    expect(m.rpc).toHaveBeenNthCalledWith(1, "platform_begin_fiscal_action", expect.objectContaining({ p_actor: "actor", p_session: "session", p_revision: input.revision }));
    expect(m.rpc.mock.invocationCallOrder[0]).toBeLessThan(m.lookup.mock.invocationCallOrder[0]);
    expect(m.rpc).toHaveBeenNthCalledWith(2, "platform_complete_fiscal_action", { p_actor: "actor", p_session: "session", p_request: "request",
      p_outcome: "pending", p_provider_id: "provider-1", p_uuid: null, p_cancellation: "none", p_folio: null, p_series: null });
    expect(result).toEqual({ status: "pac_pending" }); expect(JSON.stringify(result)).not.toMatch(/provider-1|apiKey|sk_test/);
  });
  it.each(["pending", "retry_scheduled", "expired"])("solicitud ya reservada/completada (%s) no repite el GET", async (status) => {
    m.rpc.mockReset().mockResolvedValue({ data: { started: false, status }, error: null });
    expect(await performPlatformFiscalAction(context, input)).toEqual({ status });
    expect(m.lookup).not.toHaveBeenCalled(); expect(m.rpc).toHaveBeenCalledTimes(1);
  });
  it.each(["42501", "40001", "P0001", "22023", "XX000"])("un fallo de reserva %s no llama al proveedor ni muestra datos SQL", async (code) => {
    m.rpc.mockReset().mockResolvedValue({ data: null, error: { code, message: "private-key" } });
    await expect(performPlatformFiscalAction(context, input)).rejects.not.toThrow("private-key");
    expect(m.lookup).not.toHaveBeenCalled();
  });
  it("sin sesión no construye un cliente privilegiado", async () => {
    m.session.mockRejectedValue(new Error("No session"));
    await expect(performPlatformFiscalAction(context, input)).rejects.toThrow("No session");
    expect(m.guard).not.toHaveBeenCalled(); expect(m.lookup).not.toHaveBeenCalled();
  });
  it("sin capacidad no reserva ni consulta", async () => {
    m.guard.mockRejectedValue(new Error("No capability"));
    await expect(performPlatformFiscalAction(context, input)).rejects.toThrow("No capability");
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("el fallo al guardar no reenvía una consulta ni se presenta como éxito", async () => {
    m.rpc.mockReset().mockResolvedValueOnce({ data: reservation, error: null }).mockResolvedValue({ data: null, error: { code: "42501" } });
    await expect(performPlatformFiscalAction(context, input)).rejects.toThrow("acceso cambió");
    expect(m.lookup).toHaveBeenCalledTimes(1);
  });
});
