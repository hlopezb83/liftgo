import { describe, expect, it, vi } from "vitest";
import { createSupabaseChainMock, type ChainCall } from "@/test/helpers/supabaseChain";

const calls: Record<string, ChainCall[][]> = { invoices: [], organization_customers: [] };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: {
      invoices: (chain) => { calls.invoices.push(chain); return { data: null, error: null }; },
      organization_customers: (chain) => {
        calls.organization_customers.push(chain);
        return { data: [{ customer_id: "customer-1" }], error: null };
      },
    },
  }),
}));

describe("sincronización fiscal del receptor", () => {
  it("actualiza sólo la relación comercial local y nunca la identidad global", async () => {
    const captured: { mutationFn?: (input: unknown) => Promise<unknown> } = {};
    vi.doMock("@/lib/hooks/useEntityMutation", () => ({
      useEntityMutation: (opts: { mutationFn: (input: unknown) => Promise<unknown> }) => {
        captured.mutationFn = opts.mutationFn;
        return {};
      },
    }));
    vi.resetModules();
    const { useUpdateReceptorFiscalInfo } = await import("../useReceptorTaxInfo");
    useUpdateReceptorFiscalInfo();
    await captured.mutationFn?.({
      invoiceId: "invoice-1", customerId: "customer-1", syncCustomer: true,
      patch: {
        receptor_razon_social: "CLIENTE LOCAL",
        receptor_regimen_fiscal: "601",
        receptor_domicilio_fiscal_cp: "64000",
      },
    });
    expect(calls.invoices).toHaveLength(1);
    expect(calls.organization_customers).toHaveLength(1);
    const relation = calls.organization_customers[0];
    expect(relation.find((call) => call.method === "update")?.args[0]).toMatchObject({ razon_social: "CLIENTE LOCAL" });
    expect(relation.filter((call) => call.method === "eq").map((call) => call.args))
      .toContainEqual(["customer_id", "customer-1"]);
    expect(JSON.stringify(relation)).not.toContain("organization_id");
    vi.doUnmock("@/lib/hooks/useEntityMutation");
    vi.resetModules();
  });
});
