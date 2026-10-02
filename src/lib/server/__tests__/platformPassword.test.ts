import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CallerClient } from "../guards/httpError";

const state = vi.hoisted(() => ({ session: vi.fn(), guard: vi.fn(), rate: vi.fn(),
  getUser: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), create: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: (...args: unknown[]) => {
  state.create(...args); return { auth: { signInWithPassword: state.signIn } };
} }));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => ({ headers: new Headers({ authorization: "Bearer original-jwt" }) }) }));
vi.mock("../guards/platformSession.server", () => ({ requirePlatformSession: state.session }));
vi.mock("../guards/platformOperator.server", () => ({ requirePlatformOperator: state.guard }));
vi.mock("../guards/rateLimit.server", () => ({ enforceRateLimit: state.rate }));
import { requirePlatformPassword } from "../guards/platformPassword.server";

const actor = "92000000-0000-4000-8000-000000000001";
const caller = { auth: { getUser: state.getUser } } as unknown as CallerClient;
const admin = { auth: { admin: { signOut: state.signOut } } };
describe("confirmación de contraseña sólo para accesos de plataforma", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("SUPABASE_URL", "https://example.com");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    state.session.mockResolvedValue({ id: "original-session" });
    state.guard.mockResolvedValue({ admin }); state.rate.mockResolvedValue(undefined);
    state.getUser.mockResolvedValue({ data: { user: { id: actor, email: "root@example.com", email_confirmed_at: "2026-10-02" } }, error: null });
    state.signIn.mockResolvedValue({ data: { user: { id: actor }, session: { access_token: "temporary-jwt" } }, error: null });
    state.signOut.mockResolvedValue({ error: null });
  });
  it("confirma la identidad verificada, revoca sólo la sesión temporal y vuelve a comprobar permisos", async () => {
    await expect(requirePlatformPassword(caller, actor, "test-confirmation")).resolves.toEqual({ admin, sessionId: "original-session" });
    expect(state.getUser).toHaveBeenCalledWith("original-jwt");
    expect(state.signIn).toHaveBeenCalledWith({ email: "root@example.com", password: "test-confirmation" });
    expect(state.signOut).toHaveBeenCalledExactlyOnceWith("temporary-jwt", "local");
    expect(state.guard).toHaveBeenCalledTimes(2);
    expect(state.guard).toHaveBeenLastCalledWith(caller, actor, "operators.manage");
    expect(state.rate).toHaveBeenCalledWith(admin, "platform_access_change", actor, 5, 60);
    expect(state.create.mock.calls[0][2].auth).toEqual({ persistSession: false, autoRefreshToken: false, detectSessionInUrl: false });
  });
  it.each(["session", "guard", "rate"] as const)("rechaza antes de comprobar contraseña si falla %s", async (guard) => {
    state[guard].mockRejectedValue(new Error("denied"));
    await expect(requirePlatformPassword(caller, actor, "test")).rejects.toThrow("denied");
    expect(state.signIn).not.toHaveBeenCalled();
  });
  it("una contraseña incorrecta no entrega autorización", async () => {
    state.signIn.mockResolvedValue({ data: { user: null, session: null }, error: { message: "private-provider-detail" } });
    await expect(requirePlatformPassword(caller, actor, "wrong")).rejects.toMatchObject({ status: 403 });
    expect(state.signOut).not.toHaveBeenCalled(); expect(state.guard).toHaveBeenCalledOnce();
  });
  it("nunca acepta otra identidad ni deja su sesión temporal abierta", async () => {
    state.signIn.mockResolvedValue({ data: { user: { id: "other-account" }, session: { access_token: "temporary-jwt" } }, error: null });
    await expect(requirePlatformPassword(caller, actor, "test")).rejects.toMatchObject({ status: 403 });
    expect(state.signOut).toHaveBeenCalledWith("temporary-jwt", "local");
  });
  it("bloquea si la limpieza falla y no usa cierre global como compensación", async () => {
    state.signOut.mockResolvedValue({ error: { message: "network" } });
    await expect(requirePlatformPassword(caller, actor, "test")).rejects.toMatchObject({ status: 503 });
    expect(state.signOut).toHaveBeenCalledExactlyOnceWith("temporary-jwt", "local");
    expect(state.guard).toHaveBeenCalledOnce();
  });
  it.each([{ id: "other", email: "root@example.com", email_confirmed_at: "today" },
    { id: actor, email: "root@example.com", email_confirmed_at: null }])("rechaza una identidad original diferente o no verificada", async (user) => {
    state.getUser.mockResolvedValue({ data: { user }, error: null });
    await expect(requirePlatformPassword(caller, actor, "test")).rejects.toMatchObject({ status: 401 });
    expect(state.signIn).not.toHaveBeenCalled();
  });
  it("revisa la revocación de la sesión original después de confirmar", async () => {
    state.session.mockResolvedValueOnce({ id: "original-session" }).mockRejectedValueOnce(new Error("expired"));
    await expect(requirePlatformPassword(caller, actor, "test")).rejects.toThrow("expired");
    expect(state.signOut).toHaveBeenCalledWith("temporary-jwt", "local");
  });
  it("rechaza permisos revocados durante la confirmación", async () => {
    state.guard.mockResolvedValueOnce({ admin }).mockRejectedValueOnce(new Error("revoked"));
    await expect(requirePlatformPassword(caller, actor, "test")).rejects.toThrow("revoked");
  });
  it("rechaza cambiar de sesión durante la confirmación", async () => {
    state.session.mockResolvedValueOnce({ id: "original-session" }).mockResolvedValueOnce({ id: "other-session" });
    await expect(requirePlatformPassword(caller, actor, "test")).rejects.toMatchObject({ status: 401 });
  });
});
