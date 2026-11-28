import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import {
  createSupabaseChainMock,
  type SupabaseMockResponse,
} from "@/test/helpers/supabaseChain";

let resp: SupabaseMockResponse = { data: [], error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({ fromResolver: () => resp }),
}));

import { useCustomer, useCustomers } from "../useCustomers";
import { mergeCustomerRelation } from "../customerQueries";

describe("useCustomers — RLS contract", () => {
  beforeEach(() => {
    resp = { data: [], error: null };
  });

  it("propaga permission denied del backend", async () => {
    resp = {
      data: null,
      error: { code: "42501", message: "permission denied for table customers" },
    };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCustomers(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("lista vacia cuando RLS oculta todo", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCustomers(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

describe("useCustomer — detalle por id", () => {
  beforeEach(() => {
    resp = { data: null, error: null };
  });

  it("no ejecuta la query cuando id es undefined", () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCustomer(undefined), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("devuelve el cliente aun cuando useCustomers estaría truncada", async () => {
    // Simula: 500 clientes en la lista, pero pedimos uno por id → debe llegar directo.
    // Tramo 9: el detalle se lee a través de la relación comercial de la
    // empresa (`organization_customers` + `customers!inner`), así que la fila
    // del backend trae el cliente embebido.
    resp = {
      data: { status: "active", customers: { id: "cust-999", name: "Cliente 999", deleted_at: null } },
      error: null,
    };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCustomer("cust-999"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ id: "cust-999" });
  });

  it("tramo 9: sin relación comercial activa en la empresa, el detalle es null", async () => {
    // RLS/filtro de relación devuelven ninguna fila → el cliente no existe
    // para esta empresa aunque exista globalmente.
    resp = { data: null, error: null };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCustomer("cust-otra-empresa"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("usa datos de la relación y mantiene la identidad global como respaldo", () => {
    const customer = mergeCustomerRelation({
      customers: { id: "c1", name: "HYVA", email: "global@example.com", phone: "111", website: "global.example", address: "global", created_by_organization_id: "org-a" },
      organization_id: "org-a",
      alias: "HYVA Monterrey", email: "mty@example.com", phone: "222",
      website: null, billing_address: "Dirección local", updated_at: "2026-09-23T00:00:00Z",
      tax_rate: 16,
    } as Parameters<typeof mergeCustomerRelation>[0]);
    expect(customer).toMatchObject({
      name: "HYVA Monterrey", email: "mty@example.com", phone: "222",
      website: "global.example", address: "Dirección local",
      relation_updated_at: "2026-09-23T00:00:00Z",
    });
  });

  it("no muestra contacto global en otra empresa cuando su relación está vacía", () => {
    const customer = mergeCustomerRelation({
      customers: { id: "c1", name: "HYVA", email: "a@example.com", phone: "111", website: "a.example", address: "Dirección A", notes: "Sólo A", created_by_organization_id: "org-a" },
      organization_id: "org-b", alias: "HYVA Bajío", email: null, phone: null,
      billing_address: null, notes: null, contact_person: null, website: null,
      updated_at: "2026-09-23T00:00:00Z", tax_rate: 16,
    } as Parameters<typeof mergeCustomerRelation>[0]);
    expect(customer).toMatchObject({
      name: "HYVA Bajío", email: null, phone: null, address: null,
      notes: null, contact_person: null, website: null,
    });
  });
});
