import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ session: vi.fn(), password: vi.fn(), guard: vi.fn(), rpc: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const builder = { middleware: () => builder, validator: () => builder, handler: (handler: unknown) => handler };
  return builder;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("../server/guards/platformSession.server", () => ({ requirePlatformSession: state.session }));
vi.mock("../server/guards/platformPassword.server", () => ({ requirePlatformPassword: state.password }));
vi.mock("../server/adminGuards.server", async () => {
  const { HttpError } = await import("../server/guards/httpError");
  return { HttpError, requirePlatformOperator: state.guard, asUntypedRpc: () => ({ rpc: state.rpc }) };
});
import { getPlatformSessionFn, listPlatformOperatorsFn, setPlatformOperatorProfileFn } from "../platformOperators.functions";
type Handler = (input: { data?: unknown; context: { userId: string; supabase: object } }) => Promise<unknown>;
const change = setPlatformOperatorProfileFn as unknown as Handler;
const list = listPlatformOperatorsFn as unknown as Handler;
const context = { userId: "92000000-0000-4000-8000-000000000001", supabase: {} };
const target = "92000000-0000-4000-8000-000000000002";
const input = { userId: target, profile: "support", expectedRevision: "9007199254740993", reason: "Rotación de soporte", password: "test-confirmation" };
describe("funciones de operadores: contrato y actor del servidor", () => {
  beforeEach(() => {
    vi.resetAllMocks(); state.session.mockResolvedValue({ id: "own-session", startedAt: "2026-10-02", expiresAt: null });
    state.password.mockResolvedValue({ admin: {}, sessionId: "own-session" }); state.guard.mockResolvedValue({ admin: {} });
    state.rpc.mockResolvedValue({ data: true, error: null });
  });
  it("no expone el identificador de sesión en la vista propia", async () => {
    expect(await (getPlatformSessionFn as unknown as Handler)({ context })).toEqual({ startedAt: "2026-10-02", expiresAt: null });
    expect(state.guard).not.toHaveBeenCalled();
  });
  it("no llama al RPC sin confirmación de contraseña", async () => {
    state.password.mockRejectedValue(new Error("wrong password"));
    await expect(change({ data: input, context })).rejects.toThrow("wrong password");
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("el actor y sesión provienen del guard, nunca del payload; la contraseña no llega a SQL", async () => {
    await change({ data: { ...input, p_actor: target, p_session: "forged" }, context });
    expect(state.rpc).toHaveBeenCalledExactlyOnceWith("platform_set_operator_profile", {
      p_actor: context.userId, p_session: "own-session", p_user_id: target, p_profile: "support",
      p_expected_revision: "9007199254740993", p_reason: "Rotación de soporte",
    });
  });
  it.each([{ ...input, password: "" }, { ...input, profile: "all" }, { ...input, reason: "x" }])("rechaza entradas inválidas antes de Auth", async (data) => {
    await expect(change({ data, context })).rejects.toMatchObject({ status: 400 });
    expect(state.password).not.toHaveBeenCalled(); expect(state.rpc).not.toHaveBeenCalled();
  });
  it("da un conflicto explícito cuando la revisión quedó obsoleta", async () => {
    state.rpc.mockResolvedValue({ data: null, error: { code: "40001" } });
    await expect(change({ data: input, context })).rejects.toMatchObject({ status: 409 });
  });
  it("la lista exige sesión y capacidad y descarta campos adicionales", async () => {
    state.rpc.mockResolvedValue({ data: { rows: [{ id: target, name: "Soporte", email: "support@example.com", profile: "support", revision: "2", eligible: true, secret: "excluded" }], hasMore: false }, error: null });
    expect(await list({ data: {}, context })).toEqual({ rows: [{ id: target, name: "Soporte", email: "support@example.com", profile: "support", revision: "2", eligible: true }], hasMore: false });
    expect(state.guard).toHaveBeenCalledWith(context.supabase, context.userId, "operators.read");
    expect(state.rpc).toHaveBeenCalledWith("platform_list_operator_accounts", { p_actor: context.userId, p_session: "own-session", p_search: "", p_scope: "operators", p_offset: 0 });
  });
});
