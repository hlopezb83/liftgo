import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchEntities } from "../../lib/globalSearchRpc";

const state = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: state.rpc } }));

const access = { invoices: true, quotes: false, customers: true, bookings: true, deliveries: true, returns: true };
const empty = { invoices: [], quotes: [], customers: [], bookings: [], deliveries: [], returns: [] };

beforeEach(() => state.rpc.mockReset());

describe("global search RPC contract", () => {
  it.each(["a", "  "])("skips terms shorter than two characters (%j)", async (term) => {
    await expect(searchEntities(term, "org-a", access)).resolves.toEqual(empty);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("skips requests until organization and at least one section are authorized", async () => {
    await expect(searchEntities("ACME", undefined, access)).resolves.toEqual(empty);
    await expect(searchEntities("ACME", "org-a", {
      invoices: false, quotes: false, customers: false, bookings: false, deliveries: false, returns: false,
    })).resolves.toEqual(empty);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("uses one normalized, scoped RPC and accepts all requested hits", async () => {
    const invoice = { id: "i1", label: "FAC-0001", sub: "ACME", url: "/invoices/i1" };
    const customer = { id: "c1", label: "Cliente Uno", sub: "AAA010101AAA", url: "/customers/c1" };
    state.rpc.mockResolvedValue({ data: { ...empty, invoices: [invoice], customers: [customer] }, error: null });
    const result = await searchEntities("  ACME ", "org-a", access);
    expect(state.rpc).toHaveBeenCalledExactlyOnceWith("get_global_search", {
      p_expected_organization_id: "org-a", p_query: "acme",
      p_sections: ["invoices", "customers", "bookings", "deliveries", "returns"],
    });
    expect(result).toEqual({ ...empty, invoices: [invoice], customers: [customer] });
  });
});
