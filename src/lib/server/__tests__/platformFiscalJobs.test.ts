import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), guard: vi.fn(), rpc: vi.fn() }));
vi.mock("../guards/platformSession.server", () => ({ requirePlatformSession: mocks.session }));
vi.mock("../adminGuards.server", async () => {
  const { HttpError } = await import("../guards/httpError");
  return { HttpError, requirePlatformOperator: mocks.guard, asUntypedRpc: () => ({ rpc: mocks.rpc }) };
});
import type { CallerClient } from "../guards/httpError";
import { fiscalJobsRpc } from "../platformFiscalJobs.server";
const context = { userId: "current-actor", supabase: {} as CallerClient };
describe("autoridad del historial fiscal", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.session.mockResolvedValue({ id: "current-session" }); mocks.guard.mockResolvedValue({ admin: {} }); mocks.rpc.mockResolvedValue({ data: [], error: null }); });
  it("obtiene identidad y sesión del servidor, nunca del payload", async () => {
    await fiscalJobsRpc(context, "platform_list_fiscal_jobs", { p_actor: "forged", p_session: "forged" });
    expect(mocks.guard).toHaveBeenCalledWith(context.supabase, "current-actor", "integrations.read");
    expect(mocks.rpc).toHaveBeenCalledWith("platform_list_fiscal_jobs", { p_actor: "current-actor", p_session: "current-session" });
  });
  it("sin sesión no obtiene cliente privilegiado", async () => {
    mocks.session.mockRejectedValue(new Error("Sesión inválida"));
    await expect(fiscalJobsRpc(context, "platform_get_fiscal_job", {})).rejects.toThrow("Sesión inválida");
    expect(mocks.guard).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("sin capacidad no lee metadata ni documentos", async () => {
    mocks.guard.mockRejectedValue(new Error("Sin permiso"));
    await expect(fiscalJobsRpc(context, "platform_get_fiscal_job", {})).rejects.toThrow("Sin permiso");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(["42501", "22023", "XX000"])("no expone mensajes privados SQL (%s)", async (code) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code, message: "private-key-and-document" } });
    await expect(fiscalJobsRpc(context, "platform_get_fiscal_job", {})).rejects.not.toThrow("private-key-and-document");
  });
});
