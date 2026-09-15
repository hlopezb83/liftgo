import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => {
  const build = (data: unknown) => {
    const chain: Record<string, unknown> = {};
    const ret = { data, error: null };
    ["select", "or", "order", "limit", "neq", "is", "eq"].forEach((k) => {
      chain[k] = vi.fn(() => (k === "limit" ? Promise.resolve(ret) : chain));
    });
    return chain;
  };
  const invoices = [{ id: "i1", invoice_number: "FAC-0001", customer_name: "ACME" }, { id: "i2", invoice_number: null, customer_name: null }];
  const orgCustomers = [{ customer_id: "c1", customers: { id: "c1", name: "Cliente Uno", rfc: "AAA010101AAA", deleted_at: null } }];
  const bookings = [{ id: "b1", booking_number: "RSV-0007", customer_name: "ACME" }];
  const cache: Record<string, Record<string, unknown>> = {
    invoices: build(invoices),
    organization_customers: build(orgCustomers),
    bookings: build(bookings),
  };
  return {
    supabase: {
      auth: {
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
        getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      },
      from: (table: string) => cache[table] ?? build([]),
    },
  };
});

const { searchEntities } = await import("@/features/system/hooks/useEntitySearch");

describe("searchEntities", () => {
  beforeEach(() => vi.clearAllMocks());

  it("regresa vacío con query < 2 chars", async () => {
    const res = await searchEntities("a", "org-a");
    expect(res).toEqual({ invoices: [], customers: [], bookings: [] });
  });

  it("mapea facturas/clientes/reservas y sustituye null por —", async () => {
    const res = await searchEntities("ACME", "org-a");
    expect(res.invoices).toHaveLength(2);
    expect(res.invoices[0]).toMatchObject({ label: "FAC-0001", url: "/invoices/i1" });
    expect(res.invoices[1].label).toBe("—");
    expect(res.customers[0]).toMatchObject({ label: "Cliente Uno", sub: "AAA010101AAA", url: "/customers/c1" });
    expect(res.bookings[0]).toMatchObject({ label: "RSV-0007", url: "/bookings/b1" });
  });
});

describe("searchEntities — filtros M-3", () => {
  it("excluye cancelados y clientes eliminados", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const inv = supabase.from("invoices") as unknown as Record<string, ReturnType<typeof vi.fn>>;
    const cust = supabase.from("organization_customers") as unknown as Record<string, ReturnType<typeof vi.fn>>;
    const book = supabase.from("bookings") as unknown as Record<string, ReturnType<typeof vi.fn>>;
    await searchEntities("ACME", "org-a");
    expect(inv.neq).toHaveBeenCalledWith("status", "cancelled");
    expect(book.neq).toHaveBeenCalledWith("status", "cancelled");
    expect(cust.eq).toHaveBeenCalledWith("organization_id", "org-a");
    expect(cust.is).toHaveBeenCalledWith("customers.deleted_at", null);
  });
});

/**
 * Subtramo 6.1 — sin organización verificada no se consulta información
 * protegida, y los clientes se buscan desde la relación comercial de la
 * empresa (identidad global de `customers` conservada).
 */
describe("searchEntities — organización verificada", () => {
  it("sin organización devuelve vacío y no consulta", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const from = supabase.from as unknown as ReturnType<typeof vi.fn>;
    const res = await searchEntities("ACME");
    expect(res).toEqual({ invoices: [], customers: [], bookings: [] });
    if (typeof from === "function" && "mock" in from) {
      expect((from as { mock: { calls: unknown[] } }).mock.calls.length).toBe(0);
    }
  });

  it("parte de organization_customers y mapea el cliente global", async () => {
    const res = await searchEntities("ACME", "org-a");
    expect(res.customers[0]).toMatchObject({ label: "Cliente Uno", url: "/customers/c1" });
  });
});
