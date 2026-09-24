import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import { createSupabaseChainMock, type ChainCall } from "@/test/helpers/supabaseChain";

const state = vi.hoisted(() => ({
  relationCalls: [] as ChainCall[][],
  savedPatch: null as Record<string, unknown> | null,
  saveError: false,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: {
      organization_customers: (calls) => {
        state.relationCalls.push(calls);
        return { data: {
          rfc: "ORG020202BBB", razon_social: "Cliente de esta empresa",
          alias: "Alias local", regimen_fiscal: "601",
          domicilio_fiscal_cp: "64000", uso_cfdi: "G03",
        }, error: null };
      },
      invoices: (calls) => {
        const patch = calls.find((call) => call.method === "update")?.args[0] as Record<string, unknown>;
        state.savedPatch = patch;
        return state.saveError
          ? { data: null, error: { message: "No se pudo guardar" } }
          : { data: { id: "invoice-1", ...patch }, error: null };
      },
    },
  }),
}));

import { supabase } from "@/integrations/supabase/client";
import { backfillStampSnapshot } from "../backfillStampSnapshot";

const invoice = {
  id: "invoice-1", customer_id: "customer-1", customer_name: "Cliente",
  receptor_rfc: null, receptor_razon_social: null,
  receptor_regimen_fiscal: null, receptor_domicilio_fiscal_cp: null,
  uso_cfdi: null, forma_pago: null, metodo_pago: null, moneda: null,
  tipo_cambio: null,
} as Tables<"invoices">;

describe("backfillStampSnapshot multiempresa", () => {
  beforeEach(() => {
    state.relationCalls.length = 0;
    state.savedPatch = null;
    state.saveError = false;
    vi.mocked(supabase.from).mockClear();
  });

  it("copia datos fiscales locales, sin consultar la identidad global", async () => {
    await backfillStampSnapshot(invoice);

    expect(vi.mocked(supabase.from).mock.calls.map(([table]) => table))
      .toEqual(["organization_customers", "invoices"]);
    expect(state.relationCalls[0].filter((call) => call.method === "eq").map((call) => call.args))
      .toContainEqual(["customer_id", "customer-1"]);
    expect(state.savedPatch).toMatchObject({
      receptor_rfc: "ORG020202BBB",
      receptor_razon_social: "Cliente de esta empresa",
      receptor_regimen_fiscal: "601",
      receptor_domicilio_fiscal_cp: "64000",
      uso_cfdi: "G03",
    });
  });

  it("detiene el flujo cuando no se guardó el respaldo fiscal", async () => {
    state.saveError = true;
    await expect(backfillStampSnapshot(invoice)).rejects.toMatchObject({
      message: "No se pudo guardar",
    });
  });
});

