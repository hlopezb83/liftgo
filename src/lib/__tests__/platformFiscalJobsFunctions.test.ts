import { beforeEach, describe, expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const builder = { middleware: () => builder, validator: () => builder, handler: (fn: unknown) => fn }; return builder;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("../server/platformFiscalJobs.server", () => ({ fiscalJobsRpc: rpc }));
import { fiscalJob, fiscalJobDetail } from "@/features/platform/__tests__/fiscalJob.fixture";
import { getPlatformFiscalJobFn, listPlatformFiscalJobsFn } from "../platformFiscalJobs.functions";
type Handler = (args: { data?: unknown; context: { userId: string; supabase: object } }) => Promise<unknown>;
const context = { userId: "own-user", supabase: {} };
describe("historial fiscal: contratos mínimos y filtros estrictos", () => {
  beforeEach(() => vi.resetAllMocks());
  it.each([{ status: "all" }, { operation: "cancel_everything" }, { organizationId: "invalid" }, { offset: -1 }])("no amplía filtros inválidos: %j", async (data) => {
    await expect((listPlatformFiscalJobsFn as unknown as Handler)({ data, context })).rejects.toThrow("inválidos");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("descarta payload, error privado, UUID, llaves y huellas del resultado", async () => {
    rpc.mockResolvedValue({ rows: [{ ...fiscalJob, payload: { secret: "private" }, key_fingerprint: "private", last_error: "private", uuid: "private" }], total: 1, observedAt: "now" });
    const result = await (listPlatformFiscalJobsFn as unknown as Handler)({ data: { organizationId: fiscalJob.organizationId }, context });
    expect(JSON.stringify(result)).not.toMatch(/private|payload|key_fingerprint|last_error/);
    expect(rpc).toHaveBeenCalledWith(context, "platform_list_fiscal_jobs", expect.objectContaining({ p_org: fiscalJob.organizationId, p_offset: 0 }));
  });
  it("conserva ID, revisión y cursor bigint como texto", async () => {
    rpc.mockResolvedValue(fiscalJobDetail);
    const result = await (getPlatformFiscalJobFn as unknown as Handler)({ data: { jobId: fiscalJob.id, before: fiscalJobDetail.nextCursor }, context });
    expect(result).toEqual(fiscalJobDetail);
    expect(rpc).toHaveBeenCalledWith(context, "platform_get_fiscal_job", { p_job: fiscalJob.id, p_before: "9007199254740992" });
  });
  it.each(["invalid", "-1", "0", "9223372036854775808", "9999999999999999999999"])("rechaza cursor %s sin lanzar SyntaxError ni llamar SQL", async (before) => {
    await expect((getPlatformFiscalJobFn as unknown as Handler)({ data: { jobId: fiscalJob.id, before }, context })).rejects.toThrow("inválido");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("un fallo de contrato no se convierte en una bandeja vacía", async () => {
    rpc.mockResolvedValue({ rows: [] });
    await expect((listPlatformFiscalJobsFn as unknown as Handler)({ data: {}, context })).rejects.toThrow("No se pudieron cargar");
  });
});
