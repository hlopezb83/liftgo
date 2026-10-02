import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ session: vi.fn(), guard: vi.fn(), rpc: vi.fn(), limit: vi.fn(), check: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const builder = { middleware: () => builder, validator: () => builder, handler: (fn: unknown) => fn }; return builder;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("../server/guards/platformSession.server", () => ({ requirePlatformSession: state.session }));
vi.mock("../server/platformFacturapiHealth.server", () => ({ checkReservedFacturapiConnection: state.check }));
vi.mock("../server/adminGuards.server", async () => {
  const { HttpError } = await import("../server/guards/httpError");
  return { HttpError, requirePlatformOperator: state.guard, enforceRateLimit: state.limit, asUntypedRpc: () => ({ rpc: state.rpc }) };
});
import { checkPlatformIntegrationFn, getPlatformMonitoringFn, listPlatformIntegrationsFn } from "../platformHealth.functions";
type Handler = (input: { data?: unknown; context: { userId: string; supabase: object } }) => Promise<unknown>;
const check = checkPlatformIntegrationFn as unknown as Handler;
const list = listPlatformIntegrationsFn as unknown as Handler;
const context = { userId: "93000000-0000-4000-8000-000000000001", supabase: {} };
const input = { organizationId: "93930000-0000-4000-8000-000000000001", requestId: "93930000-0000-4000-8000-000000000002" };
describe("salud de plataforma: autorización, idempotencia y proyección", () => {
  beforeEach(() => {
    vi.resetAllMocks(); state.session.mockResolvedValue({ id: "own-session" }); state.guard.mockResolvedValue({ admin: {} });
    state.check.mockResolvedValue({ status: "connected", latencyMs: 25, httpStatus: 200 });
    state.rpc.mockResolvedValueOnce({ data: { started: true, mode: "test", apiKey: "private-key", preflight: "ready" }, error: null })
      .mockResolvedValue({ data: "connected", error: null });
  });
  it("reserva antes de llamar al proveedor y no devuelve la llave", async () => {
    const result = await check({ data: { ...input, actor: "forged", apiKey: "forged" }, context });
    expect(result).toEqual({ status: "connected" });
    expect(state.guard).toHaveBeenCalledWith(context.supabase, context.userId, "integrations.check");
    expect(state.rpc).toHaveBeenNthCalledWith(1, "platform_begin_integration_check", {
      p_actor: context.userId, p_session: "own-session", p_org: input.organizationId, p_request: input.requestId,
    });
    expect(state.check).toHaveBeenCalledExactlyOnceWith({ started: true, mode: "test", apiKey: "private-key", preflight: "ready" });
    expect(state.rpc).toHaveBeenNthCalledWith(2, "platform_complete_integration_check", expect.objectContaining({
      p_actor: context.userId, p_session: "own-session", p_request: input.requestId, p_status: "connected", p_latency: 25, p_http_status: 200,
    }));
  });
  it.each(["unconfigured","duplicate_key","invalid_key_mode"])("no contacta al proveedor para %s", async (preflight) => {
    state.rpc.mockReset().mockResolvedValueOnce({ data: { started: true, mode: "test", apiKey: null, preflight }, error: null })
      .mockResolvedValue({ data: preflight, error: null });
    state.check.mockResolvedValue({ status: preflight, latencyMs: null, httpStatus: null });
    expect(await check({ data: input, context })).toEqual({ status: preflight });
  });
  it("una solicitud repetida no vuelve a contactar al proveedor", async () => {
    state.rpc.mockReset().mockResolvedValue({ data: { started: false, status: "pending" }, error: null });
    expect(await check({ data: input, context })).toEqual({ status: "pending" }); expect(state.check).not.toHaveBeenCalled();
  });
  it("rechaza sesión cerrada antes de cargar el cliente privilegiado", async () => {
    state.session.mockRejectedValue(new Error("closed"));
    await expect(check({ data: input, context })).rejects.toThrow("closed"); expect(state.guard).not.toHaveBeenCalled(); expect(state.rpc).not.toHaveBeenCalled();
  });
  it("sin capacidad ni límite disponible no llama al proveedor", async () => {
    state.limit.mockRejectedValue(new Error("limited"));
    await expect(check({ data: input, context })).rejects.toThrow("limited"); expect(state.rpc).not.toHaveBeenCalled(); expect(state.check).not.toHaveBeenCalled();
  });
  it("no transmite mensajes SQL ni llaves en errores de reserva", async () => {
    state.rpc.mockReset().mockResolvedValue({ data: null, error: { code: "P0001", message: "private-key" } });
    await expect(check({ data: input, context })).rejects.toMatchObject({ status: 429 }); expect(state.check).not.toHaveBeenCalled();
  });
  it("valida filtros antes de acceder a datos privilegiados", async () => {
    await expect(list({ data: { offset: -1 }, context })).rejects.toMatchObject({ status: 400 }); expect(state.guard).not.toHaveBeenCalled();
  });
  it("la lista elimina campos adicionales del servidor", async () => {
    state.rpc.mockReset().mockResolvedValue({ error: null, data: { rows: [{ id: input.organizationId, name: "Empresa", active: true, mode: "test",
      keyConfigured: true, lastCheck: null, queuedJobs: 0, exhaustedJobs: 0, apiKey: "excluded", payload: "excluded" }], total: 1, observedAt: "2026-10-02", secret: "excluded" } });
    const result = await list({ data: {}, context });
    expect(JSON.stringify(result)).not.toContain("excluded");
    expect(state.guard).toHaveBeenCalledWith(context.supabase, context.userId, "integrations.read");
  });
  it("monitoreo falla cerrado con una proyección incompleta", async () => {
    state.rpc.mockReset().mockResolvedValue({ data: {}, error: null });
    await expect((getPlatformMonitoringFn as unknown as Handler)({ context })).rejects.toMatchObject({ status: 503 });
  });
});
