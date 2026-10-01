import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACTOR_ID, importPreview, SOURCE_ID } from "@/features/platform/__tests__/catalogImport.fixture";

const state = vi.hoisted(() => ({ guard: vi.fn(), rpc: vi.fn(), rate: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const builder = { middleware: () => builder, validator: () => builder, handler: (handler: unknown) => handler };
  return builder;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("../server/adminGuards.server", () => ({
  requirePlatformOperator: (...args: unknown[]) => state.guard(...args),
  asUntypedRpc: () => ({ rpc: state.rpc }), enforceRateLimit: (...args: unknown[]) => state.rate(...args),
  HttpError: class extends Error { constructor(public status: number, message: string) { super(message); } },
}));
import { getCatalogImportPreviewFn, importCatalogCandidateFn, listCatalogImportCandidatesFn } from "../platformCatalogImport.functions";
type Handler = (input: { data: unknown; context: { userId: string; supabase: object } }) => Promise<unknown>;
const list = listCatalogImportCandidatesFn as unknown as Handler;
const preview = getCatalogImportPreviewFn as unknown as Handler;
const save = importCatalogCandidateFn as unknown as Handler;
const context = { userId: ACTOR_ID, supabase: {} };
const input = { request_id: "90000000-0000-4000-8000-000000000060", kind: "model", source_id: SOURCE_ID,
  fingerprint: "a".repeat(64), resolution: "create", reason: "Modelo aprobado para LiftGo" };
describe("incorporaciones de maestros en servidor", () => {
  beforeEach(() => { vi.clearAllMocks(); state.guard.mockResolvedValue({ userId: ACTOR_ID, admin: {} }); state.rate.mockResolvedValue(undefined); });
  it.each([list, preview, save])("deniega antes del RPC cuando se pierde autoridad", async (call) => {
    state.guard.mockRejectedValue(new Error("Forbidden"));
    await expect(call({ data: input, context })).rejects.toThrow("Forbidden");
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it.each([{ ...input, p_actor: SOURCE_ID }, { ...input, source_organization_id: SOURCE_ID }, { ...input, fingerprint: "invalid" }, { ...input, reason: "ok" }])(
    "rechaza campos extra y revisiones inválidas", async (data) => {
      await expect(save({ data, context })).rejects.toMatchObject({ status: 400 }); expect(state.rpc).not.toHaveBeenCalled();
    });
  it("usa actor autenticado, limita escrituras y mantiene la clave del cliente", async () => {
    const result = { id: input.request_id, kind: "model", source_id: SOURCE_ID, target_id: SOURCE_ID, version_id: null, resolution: "create" };
    state.rpc.mockResolvedValue({ data: { ...result, secret: "DO_NOT_EXPOSE" }, error: null });
    expect(await save({ data: input, context })).toEqual(result);
    expect(state.rate).toHaveBeenCalledWith({}, "platform-import-catalog", ACTOR_ID, 20, 60);
    expect(state.rpc).toHaveBeenCalledWith("platform_import_catalog_candidate", {
      p_actor: ACTOR_ID, p_request_id: input.request_id, p_kind: "model", p_source_id: SOURCE_ID,
      p_fingerprint: input.fingerprint, p_resolution: "create", p_reason: input.reason,
    });
  });
  it("proyecta la vista previa sin tarifas ni metadata extra", async () => {
    const data = importPreview(); state.rpc.mockResolvedValue({ data: { ...data, source: { ...data.source, default_daily_rate: 999 }, secret: "HIDDEN" }, error: null });
    expect(await preview({ data: { kind: "model", source_id: SOURCE_ID }, context })).toEqual(data);
  });
  it("un contrato roto devuelve error, nunca un vacío o éxito", async () => {
    state.rpc.mockResolvedValue({ data: { broken: true }, error: null });
    await expect(list({ data: { kind: "model" }, context })).rejects.toMatchObject({ status: 503 });
    await expect(save({ data: input, context })).rejects.toMatchObject({ status: 503 });
  });
  it("una revisión desactualizada conserva el conflicto recuperable", async () => {
    state.rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "Los datos cambiaron desde la revisión" } });
    await expect(save({ data: input, context })).rejects.toMatchObject({ status: 409 });
  });
  it("no permite consultar tipos ni offsets inválidos", async () => {
    await expect(list({ data: { kind: "billing_secrets" }, context })).rejects.toMatchObject({ status: 400 });
    await expect(list({ data: { kind: "model", offset: -1 }, context })).rejects.toMatchObject({ status: 400 });
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
