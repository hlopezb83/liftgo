import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACTOR_ID,
  auditEvent,
  organizationDetail,
  ORG_ID,
} from "@/features/platform/__tests__/readModels.fixture";

const state = vi.hoisted(() => ({ guard: vi.fn(), rpc: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      validator: () => builder,
      handler: (handler: unknown) => handler,
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: {},
}));
vi.mock("../server/adminGuards.server", () => ({
  requirePlatformOperator: (...args: unknown[]) => state.guard(...args),
  asUntypedRpc: () => ({ rpc: state.rpc }),
  HttpError: class extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));
import { listPlatformAuditEventsFn } from "../platformAudit.functions";
import { getPlatformOrganizationDetailFn } from "../platformOrganizationDetail.functions";

type Handler = (input: {
  data: unknown;
  context: { userId: string; supabase: object };
}) => Promise<unknown>;
const detailCall = getPlatformOrganizationDetailFn as unknown as Handler;
const auditCall = listPlatformAuditEventsFn as unknown as Handler;
const context = { userId: ACTOR_ID, supabase: {} };

describe("lecturas de plataforma del servidor", () => {
  beforeEach(() => {
    state.guard.mockReset().mockResolvedValue({ userId: ACTOR_ID, admin: {} });
    state.rpc.mockReset();
  });

  it.each([detailCall, auditCall])(
    "rechaza antes de llamar al RPC cuando el guard deniega",
    async (call) => {
      state.guard.mockRejectedValue(new Error("Forbidden"));
      await expect(
        call({ data: { organization_id: ORG_ID }, context }),
      ).rejects.toThrow("Forbidden");
      expect(state.rpc).not.toHaveBeenCalled();
    },
  );

  it("usa el actor autenticado y proyecta la ficha sin campos extra", async () => {
    state.rpc.mockResolvedValue({
      data: { ...organizationDetail(), secret: "DO_NOT_EXPOSE" },
      error: null,
    });
    const result = await detailCall({
      data: { organization_id: ORG_ID, p_actor: ORG_ID },
      context,
    });
    expect(state.guard).toHaveBeenCalledWith(context.supabase, ACTOR_ID, "organizations.details");
    expect(state.rpc).toHaveBeenCalledWith("platform_get_organization_detail", {
      p_actor: ACTOR_ID,
      p_organization_id: ORG_ID,
    });
    expect(JSON.stringify(result)).not.toContain("DO_NOT_EXPOSE");
  });

  it("valida destinos y filtros antes del RPC", async () => {
    await expect(
      detailCall({ data: { organization_id: "invalid" }, context }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      auditCall({ data: { target_type: "billing_secrets" }, context }),
    ).rejects.toMatchObject({ status: 400 });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("envía filtros/cursor exactos y no transforma bigint en número", async () => {
    state.rpc.mockResolvedValue({
      data: { events: [auditEvent()], has_more: true },
      error: null,
    });
    await auditCall({
      data: {
        organization_id: ORG_ID,
        target_type: "organizations",
        before_id: "9007199254740993",
      },
      context,
    });
    expect(state.rpc).toHaveBeenCalledWith("platform_list_audit_events", {
      p_actor: ACTOR_ID,
      p_organization_id: ORG_ID,
      p_target_type: "organizations",
      p_before_id: "9007199254740993",
      p_limit: 25,
    });
  });

  it.each([detailCall, auditCall])(
    "un contrato inválido es un error recuperable, nunca un resultado vacío",
    async (call) => {
      state.rpc.mockResolvedValue({ data: { broken: true }, error: null });
      await expect(
        call({ data: { organization_id: ORG_ID }, context }),
      ).rejects.toMatchObject({ status: 503 });
    },
  );
});
