import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseChainMock, type ChainCall } from "@/test/helpers/supabaseChain";

const tables: string[] = [];
const relationCalls: ChainCall[][] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: {
      quotes: () => ({ data: {
        id: "quote-1", quote_number: "COT-0001", customer_id: "customer-1",
        customer_name: "Cliente", quote_type: "sale", line_items: [],
        subtotal: 100, tax_rate: 16, tax_amount: 16, total: 116,
      }, error: null }),
      invoices: () => ({ data: {
        id: "invoice-1", customer_id: "customer-1", customer_name: "Cliente",
        receptor_rfc: null, receptor_domicilio_fiscal_cp: null,
      }, error: null }),
      organization_customers: (calls) => {
        relationCalls.push(calls);
        return { data: {
          alias: "Cliente local", razon_social: "Cliente local", rfc: "LOC010101AAA",
          domicilio_fiscal_cp: "64000", billing_address: "Dirección local",
          contact_person: "Contacto local", representante_legal: "Representante local",
          customers: { name: "Nombre global" },
        }, error: null };
      },
    },
  }),
}));

vi.mock("@/lib/pdf/shared", () => ({
  fetchCompanyDataAndLogo: async () => ({
    company: { razon_social: "Emisor", rfc: "EMI010101AAA", regimen_fiscal: "601", lugar_expedicion: "64000" },
    logoBase64: null,
  }),
}));

import { supabase } from "@/integrations/supabase/client";
import { fetchInvoicePdfData } from "@/features/invoices/hooks/invoices/pdf/fetchInvoicePdfData";
import { fetchRelatedData } from "../contract/fetchers";
import { fetchQuotePdfData } from "../quote/build";

describe("documentos con cliente compartido", () => {
  beforeEach(() => {
    tables.length = 0;
    relationCalls.length = 0;
    vi.mocked(supabase.from).mockClear();
  });

  it("cotización e factura antigua usan RFC y CP de la empresa actual", async () => {
    const quote = await fetchQuotePdfData("quote-1");
    const invoice = await fetchInvoicePdfData("invoice-1");
    expect(quote).toMatchObject({ customerRfc: "LOC010101AAA", customerCp: "64000" });
    expect(invoice).toMatchObject({ customerRfc: "LOC010101AAA", customerCp: "64000" });
    expect(relationCalls).toHaveLength(2);
    for (const calls of relationCalls) {
      expect(calls.filter((call) => call.method === "eq").map((call) => call.args))
        .toContainEqual(["customer_id", "customer-1"]);
    }
    tables.push(...vi.mocked(supabase.from).mock.calls.map(([name]) => name));
    expect(tables).not.toContain("customers");
  });

  it("contrato sin snapshot toma nombre y datos locales", async () => {
    const result = await fetchRelatedData({
      id: "contract-1", customer_id: "customer-1", forklift_id: null, status: "draft",
    } as Parameters<typeof fetchRelatedData>[0]);
    expect(result.customer).toMatchObject({
      name: "Cliente local", rfc: "LOC010101AAA", address: "Dirección local",
      contact_person: "Contacto local",
    });
    expect(vi.mocked(supabase.from).mock.calls.map(([name]) => name)).not.toContain("customers");
  });
});
