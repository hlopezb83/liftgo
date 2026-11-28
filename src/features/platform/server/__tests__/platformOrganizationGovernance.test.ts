import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ session: vi.fn(), guard: vi.fn(), rpc: vi.fn() }));
vi.mock("../platformSession.server", () => ({ requirePlatformSession: state.session }));
vi.mock("@/lib/server/adminGuards.server", async () => {
  const { HttpError } = await import("@/lib/server/guards/httpError");
  return { HttpError, requirePlatformOperator: state.guard, asUntypedRpc: () => ({ rpc: state.rpc }) };
});
import type { CallerClient } from "@/lib/server/guards/httpError";
import { organizationGovernanceRpc } from "../platformOrganizationGovernance.server";
const context = { userId: "actor", supabase: {} as CallerClient };
describe("ficha empresarial: autoridad actual y conflictos seguros", () => {
  beforeEach(() => {
    vi.resetAllMocks(); state.session.mockResolvedValue({ id: "own-session" });
    state.guard.mockResolvedValue({ admin: {} }); state.rpc.mockResolvedValue({ data: [], error: null });
  });
  it("usa actor y sesión de Auth aunque el cliente falsifique ambos", async () => {
    await organizationGovernanceRpc(context, "platform_set_organization_governance", "organizations.configure", { p_actor: "forged", p_session: "forged" } as never);
    expect(state.guard).toHaveBeenCalledWith(context.supabase, "actor", "organizations.configure");
    expect(state.rpc).toHaveBeenCalledExactlyOnceWith("platform_set_organization_governance", { p_actor: "actor", p_session: "own-session" });
  });
  it("una sesión vencida no crea el cliente privilegiado", async () => {
    state.session.mockRejectedValue(new Error("expired"));
    await expect(organizationGovernanceRpc(context, "platform_list_organization_governance", "organizations.read")).rejects.toThrow("expired");
    expect(state.guard).not.toHaveBeenCalled(); expect(state.rpc).not.toHaveBeenCalled();
  });
  it("un permiso retirado no consulta ni escribe", async () => {
    state.guard.mockRejectedValue(new Error("revoked"));
    await expect(organizationGovernanceRpc(context, "platform_set_organization_governance", "organizations.configure", {} as never)).rejects.toThrow("revoked");
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it.each([["40001", 409], ["40P01", 409], ["42501", 403], ["22023", 400], ["P0002", 404], ["XX000", 503]])(
    "acota SQL %s al estado %s sin exponer mensajes privados", async (code, status) => {
      state.rpc.mockResolvedValue({ data: null, error: { code, message: "private-contact-and-key" } });
      await expect(organizationGovernanceRpc(context, "platform_set_organization_governance", "organizations.configure", {} as never)).rejects.toMatchObject({ status });
      await expect(organizationGovernanceRpc(context, "platform_set_organization_governance", "organizations.configure", {} as never)).rejects.not.toThrow("private-contact");
    });
});
