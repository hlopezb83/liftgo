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
let updateResponse: SupabaseMockResponse = { data: [{ id: "c1", version: 3 }], error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: {
      organization_customers: (calls) => {
        orgCustomerCalls.push(calls);
        return calls.some((c) => c.method === "update") ? updateResponse : { data: [], error: null };
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
    // Se lee organization_id para decidir el respaldo de datos legados, pero
    // nunca se usa como filtro aportado por el navegador.
    expect(findArg(calls, "eq").some((args) => args[0] === "organization_id")).toBe(false);
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
    orgCustomerCalls.length = 0;
    updateResponse = { data: [{ id: "c1", version: 3 }], error: null };
  });

  it("edita sólo la relación local y compara su fecha de modificación", async () => {
    // Se captura el mutationFn y se invoca directamente (sin React).
    const captured: { mutationFn?: (v: unknown) => Promise<unknown> } = {};
    vi.doMock("@/lib/hooks/useEntityMutation", () => ({
      useEntityMutation: (opts: { mutationFn: (v: unknown) => Promise<unknown> }) => {
        captured.mutationFn = opts.mutationFn;
        return {};
      },
    }));
    vi.resetModules();
    const mod = await import("../customerMutations");
    mod.useUpdateCustomer();
    await captured.mutationFn?.({ id: "c1", name: "Nuevo", email: "local@example.com", expectedUpdatedAt: "2026-09-23T00:00:00Z" });
    const calls = orgCustomerCalls.at(-1)!;
    expect(findArg(calls, "eq")).toContainEqual(["customer_id", "c1"]);
    expect(findArg(calls, "eq")).toContainEqual(["status", "active"]);
    expect(findArg(calls, "eq")).toContainEqual(["updated_at", "2026-09-23T00:00:00Z"]);
    expect(findArg(calls, "update")[0]?.[0]).toMatchObject({ alias: "Nuevo", email: "local@example.com" });
    expect(JSON.stringify(calls)).not.toContain("organization_id");
    vi.doUnmock("@/lib/hooks/useEntityMutation");
    vi.resetModules();
  });
});
