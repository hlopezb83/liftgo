import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ session: vi.fn(), guard: vi.fn(), rpc: vi.fn(), sign: vi.fn() }));
vi.mock("../guards/platformSession.server", () => ({ requirePlatformSession: state.session }));
vi.mock("../adminGuards.server", async () => {
  const { HttpError } = await import("../guards/httpError");
  return { HttpError, requirePlatformOperator: state.guard, asUntypedRpc: () => ({ rpc: state.rpc }) };
});
import type { CallerClient } from "../guards/httpError";
import { supportRpc, supportScreenshot } from "../platformSupport.server";
const context = { userId: "actor", supabase: {} as CallerClient };
const path = "94000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000002/123.png";
describe("soporte: identidad actual, errores acotados y acceso a capturas", () => {
  beforeEach(() => {
    vi.resetAllMocks(); state.session.mockResolvedValue({ id: "own-session" });
    state.guard.mockResolvedValue({ admin: { storage: { from: () => ({ createSignedUrl: state.sign }) } } });
    state.rpc.mockResolvedValue({ data: path, error: null });
    state.sign.mockResolvedValue({ data: { signedUrl: "https://storage.example.com/temporary" }, error: null });
  });
  it("reemplaza actor y sesión enviados por el cliente por los de su contexto", async () => {
    await supportRpc(context, "platform_update_support", "support.manage", { p_actor: "forged", p_session: "forged", p_case: "case" });
    expect(state.guard).toHaveBeenCalledWith(context.supabase, "actor", "support.manage");
    expect(state.rpc).toHaveBeenCalledExactlyOnceWith("platform_update_support", { p_actor: "actor", p_session: "own-session", p_case: "case" });
  });
  it("una sesión inválida no carga el cliente privilegiado ni Storage", async () => {
    state.session.mockRejectedValue(new Error("Sesión vencida"));
    await expect(supportScreenshot(context, "case")).rejects.toThrow("Sesión vencida");
    expect(state.guard).not.toHaveBeenCalled(); expect(state.sign).not.toHaveBeenCalled();
  });
  it("un perfil sin permiso no ejecuta la RPC", async () => {
    state.guard.mockRejectedValue(new Error("Sin permiso"));
    await expect(supportRpc(context, "platform_list_support", "support.read", {})).rejects.toThrow("Sin permiso");
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it.each(["40001", "42501", "22023", "XX000"])("no devuelve mensajes privados de SQL (%s)", async (code) => {
    state.rpc.mockResolvedValue({ data: null, error: { code, message: "private-key-and-row-content" } });
    await expect(supportRpc(context, "platform_update_support", "support.manage", {})).rejects.not.toThrow("private-key-and-row-content");
  });
  it("firma únicamente la captura consentida, por 60 segundos, y vuelve a comprobar permiso", async () => {
    await expect(supportScreenshot(context, "case")).resolves.toEqual({ url: "https://storage.example.com/temporary", expiresIn: 60 });
    expect(state.sign).toHaveBeenCalledExactlyOnceWith(path, 60);
    expect(state.rpc).toHaveBeenCalledTimes(2);
    expect(state.guard).toHaveBeenCalledWith(context.supabase, "actor", "support.read");
  });
  it.each([null, "https://private.example.com/image.png", "../other.png", "94000000-0000-4000-8000-000000000001/../secret.png"])("no firma una referencia inválida o retirada: %s", async (value) => {
    state.rpc.mockResolvedValue({ data: value, error: null });
    await expect(supportScreenshot(context, "case")).rejects.toThrow(); expect(state.sign).not.toHaveBeenCalled();
  });
  it("retirar la captura mientras Storage responde impide entregar el enlace", async () => {
    state.rpc.mockResolvedValueOnce({ data: path, error: null }).mockResolvedValueOnce({ data: null, error: null });
    await expect(supportScreenshot(context, "case")).rejects.toThrow("ya no está compartida");
  });
  it("revocar la capacidad durante la firma impide entregar el enlace", async () => {
    state.rpc.mockResolvedValueOnce({ data: path, error: null }).mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    await expect(supportScreenshot(context, "case")).rejects.toThrow("ya no está compartida");
  });
  it("un fallo de Storage no expone el diagnóstico del proveedor", async () => {
    state.sign.mockResolvedValue({ data: null, error: { message: "private-bucket-and-path" } });
    await expect(supportScreenshot(context, "case")).rejects.toThrow("No se pudo abrir la captura");
  });
});
