/**
 * Contrato de la fachada `useCustomers.ts` (Paquete 7): mismas exportaciones,
 * lecturas sobre `organization_customers` + `customers!inner` y bloqueo
 * optimista que sigue llegando al filtro de actualización.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createSupabaseChainMock,
  type ChainCall,
  type SupabaseMockResponse,
} from "@/test/helpers/supabaseChain";

const orgCustomerCalls: ChainCall[][] = [];
const customerCalls: ChainCall[][] = [];
let updateResponse: SupabaseMockResponse = { data: [{ id: "c1", version: 3 }], error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: {
      organization_customers: (calls) => {
        orgCustomerCalls.push(calls);
        return { data: [], error: null };
      },
      customers: (calls) => {
        customerCalls.push(calls);
        return updateResponse;
      },
    },
  }),
}));

import * as facade from "../useCustomers";

const findArg = (calls: ChainCall[], method: string) =>
  calls.filter((c) => c.method === method).map((c) => c.args);

describe("useCustomers — fachada de compatibilidad", () => {
  beforeEach(() => {
    orgCustomerCalls.length = 0;
    customerCalls.length = 0;
    updateResponse = { data: [{ id: "c1", version: 3 }], error: null };
  });

  it("conserva todas las exportaciones públicas", () => {
    for (const name of [
      "customerQueries",
      "useCustomers",
      "useCustomer",
      "useCustomerPortalAccount",
      "useCreateCustomer",
      "useUpdateCustomer",
      "useDeleteCustomer",
    ]) {
      expect(typeof (facade as Record<string, unknown>)[name]).not.toBe("undefined");
    }
  });

  it("la lista lee la relación comercial con customers!inner y status activo", async () => {
    await facade.customerQueries.list().queryFn?.({} as never);
    const calls = orgCustomerCalls.at(-1)!;
    const select = String(findArg(calls, "select")[0]?.[0] ?? "");
    expect(select).toContain("customers!inner(");
    expect(findArg(calls, "eq")).toContainEqual(["status", "active"]);
    expect(findArg(calls, "is")).toContainEqual(["customers.deleted_at", null]);
    // El navegador nunca envía organization_id: el aislamiento es por relación/RLS.
    expect(JSON.stringify(calls)).not.toContain("organization_id");
  });

  it("el detalle también pasa por organization_customers", async () => {
    await facade.customerQueries.detail("c1").queryFn?.({} as never);
    const calls = orgCustomerCalls.at(-1)!;
    expect(String(findArg(calls, "select")[0]?.[0] ?? "")).toContain("customers!inner(");
    expect(findArg(calls, "eq")).toContainEqual(["customer_id", "c1"]);
  });
});

describe("useUpdateCustomer — bloqueo optimista", () => {
  beforeEach(() => {
    customerCalls.length = 0;
    updateResponse = { data: [{ id: "c1", version: 3 }], error: null };
  });

  it("expectedVersion llega al filtro de actualización", async () => {
    const { useUpdateCustomer } = await import("../customerMutations");
    // Se invoca el mutationFn directamente (sin React) para verificar el filtro.
    const captured: { mutationFn?: (v: unknown) => Promise<unknown> } = {};
    vi.doMock("@/lib/hooks/useEntityMutation", () => ({
      useEntityMutation: (opts: { mutationFn: (v: unknown) => Promise<unknown> }) => {
        captured.mutationFn = opts.mutationFn;
        return {};
      },
    }));
    vi.resetModules();
    const mod = await import("../customerMutations");
    void useUpdateCustomer;
    mod.useUpdateCustomer();
    await captured.mutationFn?.({ id: "c1", name: "Nuevo", expectedVersion: 2 });
    const calls = customerCalls.at(-1)!;
    expect(findArg(calls, "eq")).toContainEqual(["version", 2]);
    expect(findArg(calls, "is")).toContainEqual(["deleted_at", null]);
    vi.doUnmock("@/lib/hooks/useEntityMutation");
    vi.resetModules();
  });
});
