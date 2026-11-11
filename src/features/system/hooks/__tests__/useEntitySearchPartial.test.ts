import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchEntities } from "../../lib/globalSearchRpc";

const state = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: state.rpc } }));
const access = { invoices: true, quotes: false, customers: true, bookings: false, deliveries: false, returns: false };
const empty = { invoices: [], quotes: [], customers: [], bookings: [], deliveries: [], returns: [] };

beforeEach(() => state.rpc.mockReset());

describe("global search RPC partial failures", () => {
  it("reports one failed section and preserves successful hits", async () => {
    const customer = { id: "c1", label: "Cliente Uno", url: "/customers/c1" };
    state.rpc.mockResolvedValue({
      data: { ...empty, customers: [customer], errors: { invoices: "private diagnostic" } }, error: null,
    });
    const result = await searchEntities("ACME", "org-a", access);
    expect(result.customers).toEqual([customer]);
    expect(result.errors).toEqual({ invoices: "No se pudo completar la búsqueda." });
  });

  it("drops data and errors outside the requested permission mask", async () => {
    state.rpc.mockResolvedValue({
      data: { ...empty, invoices: [{ id: "secret", label: "Secret", url: "/invoices/secret" }], errors: { quotes: "private" } },
      error: null,
    });
    await expect(searchEntities("ACME", "org-a", { ...access, invoices: false })).resolves.toEqual(empty);
  });

  it("propagates total errors and rejects malformed successful payloads", async () => {
    state.rpc.mockResolvedValueOnce({ data: null, error: { message: "offline" } });
    state.rpc.mockResolvedValueOnce({ data: { invoices: [] }, error: null });
    await expect(searchEntities("ACME", "org-a", access)).rejects.toMatchObject({ message: "offline" });
    await expect(searchEntities("ACME", "org-a", access)).rejects.toBeInstanceOf(Error);
  });
});
