import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ perform: vi.fn(), list: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const builder = { middleware: () => builder, validator: () => builder, handler: (fn: unknown) => fn }; return builder;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("../server/platformFiscalActions.server", () => ({ performPlatformFiscalAction: m.perform }));
vi.mock("../server/platformFiscalJobs.server", () => ({ fiscalJobsRpc: m.list }));
import { listPlatformFiscalActionsFn, performPlatformFiscalActionFn } from "../platformFiscalActions.functions";
type Handler = (args: { data: unknown; context: { userId: string; supabase: object } }) => Promise<unknown>;
const context = { userId: "own-user", supabase: {} };
const input = { jobId: "11111111-1111-4111-8111-111111111111", requestId: "22222222-2222-4222-8222-222222222222",
  revision: "1", intent: "retry", reason: "Comprobar el comprobante fiscal" };
describe("acciones fiscales: valida el contrato y conserva el contexto verificado", () => {
  beforeEach(() => vi.resetAllMocks());
  it.each([{ revision: "9223372036854775808" }, { revision: "0" }, { requestId: "invalid" }, { intent: "stamp" },
    { reason: "corto" }, { reason: "x".repeat(301) }])("rechaza entrada inválida antes de la acción: %j", async (patch) => {
    await expect((performPlatformFiscalActionFn as unknown as Handler)({ data: { ...input, ...patch }, context })).rejects.toThrow("Revisa el trabajo");
    expect(m.perform).not.toHaveBeenCalled();
  });
  it("redacta credenciales en el motivo y descarta la identidad suministrada por el navegador", async () => {
    m.perform.mockResolvedValue({ status: "retry_scheduled" });
    const reason = "Revisar sk_test_fixture_secret y Bearer fixture-session";
    await (performPlatformFiscalActionFn as unknown as Handler)({ data: { ...input, reason, p_actor: "another-user", apiKey: "private" }, context });
    expect(m.perform).toHaveBeenCalledWith(context, { ...input, reason: "Revisar [REDACTADO] y Bearer [REDACTADO]" });
  });
  it("el historial descarta huellas y secretos privados", async () => {
    m.list.mockResolvedValue([{ id: input.requestId, actorId: input.jobId, actorName: "Soporte", intent: "retry", reason: input.reason,
      status: "retry_scheduled", expectedRevision: "1", startedAt: "now", completedAt: "now", expiresAt: "later",
      key_fingerprint: "private", document_snapshot: { customer: "private" }, apiKey: "private" }]);
    const result = await (listPlatformFiscalActionsFn as unknown as Handler)({ data: { jobId: input.jobId }, context });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(m.list).toHaveBeenCalledWith(context, "platform_list_fiscal_actions", { p_job: input.jobId });
  });
  it("una respuesta inválida no se presenta como historial vacío", async () => {
    m.list.mockResolvedValue({ rows: [] });
    await expect((listPlatformFiscalActionsFn as unknown as Handler)({ data: { jobId: input.jobId }, context })).rejects.toThrow("No se pudo cargar");
  });
});
