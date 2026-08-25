import { describe, it, expect } from "vitest";
import { vi } from "vitest";

/**
 * L-6a: si una de las tres consultas de la búsqueda global falla, la sección
 * afectada debe reportarse (no devolverse vacía como "sin resultados").
 */
vi.mock("@/integrations/supabase/client", () => {
  const build = (data: unknown, error: { message: string } | null) => {
    const chain: Record<string, unknown> = {};
    const ret = { data, error };
    ["select", "or", "order", "limit", "neq", "is"].forEach((k) => {
      chain[k] = vi.fn(() => (k === "limit" ? Promise.resolve(ret) : chain));
    });
    return chain;
  };
  return {
    supabase: {
      from: (table: string) => {
        if (table === "invoices") return build(null, { message: "permission denied" });
        if (table === "customers") return build([{ id: "c1", name: "Cliente Uno", rfc: "AAA010101AAA" }], null);
        if (table === "bookings") return build([{ id: "b1", booking_number: "RSV-1", customer_name: "ACME" }], null);
        return build([], null);
      },
    },
  };
});

const { searchEntities } = await import("@/features/system/hooks/useEntitySearch");

describe("searchEntities — fallo parcial", () => {
  it("reporta la sección fallida y conserva las demás", async () => {
    const res = await searchEntities("ACME");
    expect(res.errors?.invoices).toMatch(/permission denied/);
    expect(res.errors?.customers).toBeUndefined();
    expect(res.customers).toHaveLength(1);
    expect(res.bookings).toHaveLength(1);
  });
});
