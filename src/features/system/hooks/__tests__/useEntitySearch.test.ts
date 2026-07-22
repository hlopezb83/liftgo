import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => {
  const build = (data: unknown) => {
    const chain: Record<string, unknown> = {};
    const ret = { data, error: null };
    ["select", "or", "order", "limit"].forEach((k) => {
      chain[k] = vi.fn(() => (k === "limit" ? Promise.resolve(ret) : chain));
    });
    return chain;
  };
  const invoices = [{ id: "i1", invoice_number: "FAC-0001", customer_name: "ACME" }, { id: "i2", invoice_number: null, customer_name: null }];
  const customers = [{ id: "c1", name: "Cliente Uno", rfc: "AAA010101AAA" }];
  const bookings = [{ id: "b1", booking_number: "RSV-0007", customer_name: "ACME" }];
  return {
    supabase: {
      from: (table: string) => {
        if (table === "invoices") return build(invoices);
        if (table === "customers") return build(customers);
        if (table === "bookings") return build(bookings);
        return build([]);
      },
    },
  };
});

const { searchEntities } = await import("@/layouts/GlobalSearch");

describe("searchEntities", () => {
  beforeEach(() => vi.clearAllMocks());

  it("regresa vacío con query < 2 chars", async () => {
    const res = await searchEntities("a");
    expect(res).toEqual({ invoices: [], customers: [], bookings: [] });
  });

  it("mapea facturas/clientes/reservas y sustituye null por —", async () => {
    const res = await searchEntities("ACME");
    expect(res.invoices).toHaveLength(2);
    expect(res.invoices[0]).toMatchObject({ label: "FAC-0001", url: "/invoices/i1" });
    expect(res.invoices[1].label).toBe("—");
    expect(res.customers[0]).toMatchObject({ label: "Cliente Uno", sub: "AAA010101AAA", url: "/customers/c1" });
    expect(res.bookings[0]).toMatchObject({ label: "RSV-0007", url: "/bookings/b1" });
  });
});
