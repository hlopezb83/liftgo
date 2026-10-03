import { beforeEach, describe, expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const builder = { middleware: () => builder, validator: () => builder, handler: (fn: unknown) => fn }; return builder;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("../server/platformOrganizationGovernance.server", () => ({ organizationGovernanceRpc: rpc }));
import { platformAuditEventSchema } from "../platformAudit.types";
import { getPlatformOrganizationGovernanceFn, listPlatformOrganizationGovernanceFn, setPlatformOrganizationGovernanceFn } from "../platformOrganizationGovernance.functions";
type Handler = (args: { data?: unknown; context: { userId: string; supabase: object } }) => Promise<unknown>;
const context = { userId: "own-user", supabase: {} };
const id = "10100000-0000-4000-8000-000000000011";
const summary = { organizationId: id, classification: "test", city: "Monterrey", territory: "Noreste", revision: "9007199254740993", updatedAt: null };
const detail = { ...summary, contactName: "Mariana Garza", contactEmail: "mariana@example.com", contactPhone: "+52 81 1234 5678" };
const input = { organizationId: id, classification: "test", city: " Monterrey ", territory: "Noreste", revision: detail.revision,
  contactName: detail.contactName, contactEmail: detail.contactEmail, contactPhone: detail.contactPhone, reason: "Ficha administrativa revisada" };
describe("ficha de empresa: contratos y mínima proyección", () => {
  beforeEach(() => vi.resetAllMocks());
  it("la lista descarta el contacto y extras aunque el servidor los añada", async () => {
    rpc.mockResolvedValue([{ ...detail, apiKey: "private-key" }]);
    const v = await (listPlatformOrganizationGovernanceFn as unknown as Handler)({ context });
    expect(v).toEqual([summary]); expect(JSON.stringify(v)).not.toMatch(/contactName|contactEmail|contactPhone|private-key/);
  });
  it("el contacto usa permiso de detalle y sólo el identificador validado", async () => {
    rpc.mockResolvedValue(detail);
    await (getPlatformOrganizationGovernanceFn as unknown as Handler)({ context, data: { organizationId: id, p_actor: "forged" } });
    expect(rpc).toHaveBeenCalledExactlyOnceWith(context, "platform_get_organization_governance", "organizations.details", { p_organization_id: id });
  });
  it("conserva revisión textual, normaliza espacios y descarta identidad forjada", async () => {
    rpc.mockResolvedValue({ changed: true, governance: detail });
    await (setPlatformOrganizationGovernanceFn as unknown as Handler)({ context, data: { ...input, actor: "forged", p_session: "forged" } });
    expect(rpc).toHaveBeenCalledWith(context, "platform_set_organization_governance", "organizations.configure", expect.objectContaining({
      p_organization_id: id, p_revision: detail.revision, p_city: "Monterrey",
    }));
    expect(rpc.mock.calls[0][3]).not.toHaveProperty("actor"); expect(rpc.mock.calls[0][3]).not.toHaveProperty("p_session");
  });
  it.each(["bad", "-1", "01", "9223372036854775808"])("rechaza revisión %s antes de ejecutar RPC", async (revision) => {
    await expect((setPlatformOrganizationGovernanceFn as unknown as Handler)({ context, data: { ...input, revision } })).rejects.toMatchObject({ status: 400 });
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([{ classification: "other" }, { contactEmail: "not-an-email" }, { contactPhone: "free-text" }, { reason: "sk_test_private" }, { reason: "corto".slice(0, 4) }])(
    "no guarda una clasificación, contacto o motivo inválidos: %j", async (fields) => {
      await expect((setPlatformOrganizationGovernanceFn as unknown as Handler)({ context, data: { ...input, ...fields } })).rejects.toMatchObject({ status: 400 });
      expect(rpc).not.toHaveBeenCalled();
    });
  it("una respuesta incompleta no se convierte en éxito o lista vacía", async () => {
    rpc.mockResolvedValue(null);
    await expect((listPlatformOrganizationGovernanceFn as unknown as Handler)({ context })).rejects.toMatchObject({ status: 503 });
    await expect((setPlatformOrganizationGovernanceFn as unknown as Handler)({ context, data: input })).rejects.toMatchObject({ status: 503 });
  });
  it("la bitácora conserva ciudad/territorio sin exponer valores del contacto", () => {
    const v = platformAuditEventSchema.parse({ id: "1", occurred_at: "now", actor_id: null, actor_name: null, organization_id: id,
      target_type: "organizations", target_id: id, action: "UPDATE", reason: "Revisado", request_id: id,
      changed_fields: ["contactEmail", "city"], old_state: null, new_state: { name: "LiftGo Norte", city: "Monterrey", territory: "Noreste", classification: "test",
        contactEmail: "private@example.com", apiKey: "private-key" }, is_legacy: false });
    expect(v.new_state).toMatchObject({ city: "Monterrey", territory: "Noreste", classification: "test" });
    expect(JSON.stringify(v.new_state)).not.toMatch(/private|contactEmail/);
  });
});
