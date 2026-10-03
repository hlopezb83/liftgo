import { beforeEach, describe, expect, it, vi } from "vitest";
const s = vi.hoisted(() => ({ guard: vi.fn(), rpc: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const builder = { middleware: () => builder, validator: () => builder, handler: (fn: unknown) => fn }; return builder;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("../server/adminGuards.server", () => ({
  requirePlatformOperator: s.guard, asUntypedRpc: () => ({ rpc: s.rpc }), enforceRateLimit: vi.fn(),
  isUUID: (value: unknown) => typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value),
  HttpError: class extends Error { constructor(public status: number, message: string) { super(message); } },
}));
import { savePlatformEquipmentModelFn, savePlatformPartCatalogFn } from "../platformCatalog.functions";
import { listPlatformLegalTemplateVersionsFn, publishPlatformLegalTemplateVersionFn } from "../platformLegalTemplates.functions";
type Handler = (args: { data: unknown; context: { userId: string; supabase: object } }) => Promise<unknown>;
const call = (fn: unknown, data: unknown) => (fn as Handler)({ data, context: { userId: "verified-user", supabase: {} } });
const id = "10100000-0000-4000-8000-000000000011";
const token = "2026-10-03T20:00:00.123456+00:00";
const model = { id, expected_updated_at: token, manufacturer: "Toyota", model: "8FGU25" };
const part = { id, expected_updated_at: token, sku: "FLT-001", name: "Filtro", unit_of_measure: "pieza" };
const legal = { definition_id: id, expected_version_id: id, change_summary: "Cambio revisado", content: {}, assign_all_active: false };
describe("ediciones globales con base verificada", () => {
  beforeEach(() => {
    vi.resetAllMocks(); s.guard.mockResolvedValue({ userId: "verified-user", admin: {} });
    s.rpc.mockResolvedValue({ data: [{ version_id: id, version: 2, checksum_sha256: "checksum" }], error: null });
  });
  it.each([[savePlatformEquipmentModelFn, model], [savePlatformPartCatalogFn, part]])("preserva microsegundos y actor del servidor", async (fn, input) => {
    await call(fn, { ...input, p_actor: "forged" });
    expect(s.rpc.mock.calls[0][1]).toMatchObject({ p_actor: "verified-user", p_expected_updated_at: token });
    expect(s.guard.mock.calls[0][2]).toBe("catalogs.write");
  });
  it.each([[savePlatformEquipmentModelFn, model], [savePlatformPartCatalogFn, part]])("un cliente sin base no escribe", async (fn, input) => {
    await expect(call(fn, { ...input, expected_updated_at: undefined })).rejects.toMatchObject({ status: 400 });
    expect(s.rpc).not.toHaveBeenCalled();
  });
  it.each([[savePlatformEquipmentModelFn, model], [savePlatformPartCatalogFn, part], [publishPlatformLegalTemplateVersionFn, legal]])("traduce conflicto SQL a 409", async (fn, input) => {
    s.rpc.mockResolvedValue({ data: null, error: { code: "40001", message: "Los datos cambiaron" } });
    await expect(call(fn, input)).rejects.toMatchObject({ status: 409, message: "Los datos cambiaron" });
  });
  it("publica contra la versión de partida sin aceptar un actor enviado", async () => {
    await call(publishPlatformLegalTemplateVersionFn, { ...legal, p_actor: "forged" });
    expect(s.rpc).toHaveBeenCalledWith("platform_publish_legal_template_version", expect.objectContaining({
      p_actor: "verified-user", p_expected_version_id: id, p_assign_all_active: false,
    }));
  });
  it("permiso de lectura del historial no requiere publicación ni asignación", async () => {
    s.rpc.mockResolvedValue({ data: [], error: null });
    await call(listPlatformLegalTemplateVersionsFn, { definition_id: id });
    expect(s.guard).toHaveBeenCalledWith({}, "verified-user", "templates.read");
    expect(s.rpc).toHaveBeenCalledWith("platform_list_legal_template_history", { p_actor: "verified-user", p_definition_id: id });
  });
  it("rechaza al actor sin permisos antes de acceder al RPC", async () => {
    s.guard.mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403 }));
    await expect(call(savePlatformEquipmentModelFn, model)).rejects.toMatchObject({ status: 403 });
    expect(s.rpc).not.toHaveBeenCalled();
  });
});
