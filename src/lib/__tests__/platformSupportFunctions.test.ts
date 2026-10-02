import { beforeEach, describe, expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const builder = { middleware: () => builder, validator: () => builder, handler: (fn: unknown) => fn }; return builder;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("../server/platformSupport.server", () => ({ supportRpc: rpc, supportScreenshot: rpc }));
import { getPlatformSupportFn, getPlatformSupportScreenshotFn, listPlatformSupportFn, updatePlatformSupportFn } from "../platformSupport.functions";
type Handler = (args: { data?: unknown; context: { userId: string; supabase: object } }) => Promise<unknown>;
const context = { userId: "own-user", supabase: {} };
const id = "94000000-0000-4000-8000-000000000001";
const record = { id, organizationId: id, organizationName: "Empresa CI", folio: "FB-0001", revision: "9007199254740993",
  status: "new", severity: "medium", assigneeId: null, assigneeName: null, createdAt: "2026-10-02T10:00:00Z",
  updatedAt: "2026-10-02T10:00:00Z", shared: true, sharedUntil: "2026-12-31T10:00:00Z", title: "Problema al guardar",
  description: "Pasos revisados", module: "Flota", appVersion: "8.43.0", requestId: null, hasScreenshot: false };
describe("contratos de soporte: validación y proyección mínima", () => {
  beforeEach(() => vi.resetAllMocks());
  it("no acepta filtros desconocidos ni ejecuta una consulta más amplia", async () => {
    await expect((listPlatformSupportFn as unknown as Handler)({ data: { status: "unknown" }, context })).rejects.toThrow("inválidos");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("descarta metadata, screenshot_path y secretos fuera de su contrato", async () => {
    rpc.mockResolvedValue({ rows: [{ ...record, screenshot_path: "private-path", apiKey: "private-key", context_json: { token: "private" } }], total: 1, observedAt: "now" });
    const result = await (listPlatformSupportFn as unknown as Handler)({ data: {}, context });
    expect(JSON.stringify(result)).not.toMatch(/private|context_json|apiKey|screenshot_path/);
    expect(rpc).toHaveBeenCalledWith(context, "platform_list_support", "support.read", expect.objectContaining({ p_offset: 0 }));
  });
  it("conserva la revisión como texto para evitar pérdida de precisión", async () => {
    rpc.mockResolvedValue(record);
    await (updatePlatformSupportFn as unknown as Handler)({ data: { caseId: id, revision: record.revision, status: "new", severity: "medium", assigneeId: null, actor: "forged" }, context });
    expect(rpc).toHaveBeenCalledWith(context, "platform_update_support", "support.manage", expect.objectContaining({ p_revision: record.revision }));
    expect(rpc.mock.calls[0][3]).not.toHaveProperty("actor");
  });
  it.each([getPlatformSupportFn, getPlatformSupportScreenshotFn])("rechaza casos y cursores manipulados", async (fn) => {
    await expect((fn as unknown as Handler)({ data: { caseId: "other-company", before: "-1" }, context })).rejects.toThrow("inválido");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("una respuesta incompleta no se interpreta como una bandeja vacía", async () => {
    rpc.mockResolvedValue({ rows: [] });
    await expect((listPlatformSupportFn as unknown as Handler)({ data: {}, context })).rejects.toThrow("No se pudieron cargar");
  });
});
