import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIST_PAGE_LIMIT } from "@/lib/supabase/constants";

const state = vi.hoisted(() => ({
  organization: "org-a",
  requests: [] as URL[],
  fetch: vi.fn(),
  failOffset: -1,
  wrongScope: false,
}));
vi.mock("@/contexts/OrganizationContext", () => ({
  useOrganizationContext: () => state.organization === "loading" ? { status: "loading" }
    : { status: "ready", organizationId: state.organization },
}));
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return { supabase: createClient("http://127.0.0.1:54321", "offline", {
    auth: { persistSession: false },
    global: { fetch: (...args: Parameters<typeof fetch>) => state.fetch(...args) },
  }) };
});

import {
  supplierLinkedBillsOptions, supplierLinkedMaintenanceOptions,
  useSupplierLinkedBills, useSupplierLinkedMaintenance,
} from "../useSupplierLinkedActivity";

type Kind = "bills" | "maintenance";
const tables = { bills: "supplier_bills", maintenance: "maintenance_logs" } as const;
const recordCount = LIST_PAGE_LIMIT + 7;
function row(index: number, supplierId = "supplier-a", organizationId = "org-a") {
  return {
    id: `row-${organizationId}-${supplierId}-${index}`, supplier_id: supplierId, organization_id: organizationId,
    issue_date: "2026-11-12", category: "mantenimiento", description: "Servicio", total: 10, currency: "MXN", exchange_rate: 1,
    status: "sent", forklift_id: "forklift-a", performed_at: "2026-11-12", service_type: "Preventivo", cost: 5,
    deleted_at: null, forklifts: { name: "Montacargas del proveedor" },
  };
}
function responseFor(input: string | URL | Request) {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  state.requests.push(url);
  if (!Object.values(tables).some(table => url.pathname.endsWith(`/${table}`))) {
    throw new Error(`Unexpected table request: ${url.pathname}`);
  }
  const offset = Number(url.searchParams.get("offset") ?? 0);
  if (offset === state.failOffset) {
    return new Response(JSON.stringify({ code: "42501", message: "permission denied" }), {
      status: 403, headers: { "content-type": "application/json" },
    });
  }
  const rows = [
    ...Array.from({ length: recordCount }, (_, index) => row(index)),
    row(0, "supplier-b"), row(0, "supplier-a", "org-b"),
  ];
  const supplierId = url.searchParams.get("supplier_id")?.replace(/^eq\./, "");
  const organizationId = url.searchParams.get("organization_id")?.replace(/^eq\./, "");
  const filtered = rows.filter(value => value.supplier_id === supplierId && value.organization_id === organizationId);
  const page = filtered.slice(offset, offset + Number(url.searchParams.get("limit")));
  if (state.wrongScope && page[0]) page[0] = { ...page[0], organization_id: "another-company" };
  return new Response(JSON.stringify(page), { headers: { "content-type": "application/json" } });
}
const optionsFor = (kind: Kind, supplierId = "supplier-a", organizationId = "org-a") => kind === "bills"
  ? supplierLinkedBillsOptions(supplierId, organizationId)
  : supplierLinkedMaintenanceOptions(supplierId, organizationId);
function read(client: QueryClient, kind: Kind, supplierId = "supplier-a", organizationId = "org-a") {
  if (kind === "bills") return client.fetchQuery(supplierLinkedBillsOptions(supplierId, organizationId));
  return client.fetchQuery(supplierLinkedMaintenanceOptions(supplierId, organizationId));
}
function client() { return new QueryClient({ defaultOptions: { queries: { retry: false } } }); }
function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  state.requests = [];
  state.failOffset = -1;
  state.wrongScope = false;
  state.organization = "org-a";
  state.fetch.mockReset().mockImplementation(async (input: string | URL | Request) => responseFor(input));
});
afterEach(cleanup);

describe.each<Kind>(["bills", "maintenance"])("supplier scoped %s", (kind) => {
  it("reads all pages for this supplier and company without fetching payments or global catalogs", async () => {
    const data = await read(client(), kind);
    expect(data).toHaveLength(recordCount);
    expect(data.every(value => value.supplier_id === "supplier-a" && value.organization_id === "org-a")).toBe(true);
    expect(state.requests.map(url => Number(url.searchParams.get("offset")))).toEqual([0, LIST_PAGE_LIMIT]);
    for (const url of state.requests) {
      expect(url.pathname).toBe(`/rest/v1/${tables[kind]}`);
      expect(url.searchParams.get("supplier_id")).toBe("eq.supplier-a");
      expect(url.searchParams.get("organization_id")).toBe("eq.org-a");
      expect(url.searchParams.get("limit")).toBe(String(LIST_PAGE_LIMIT));
      expect(url.searchParams.get("order")).toBe(kind === "bills" ? "issue_date.desc,id.asc" : "performed_at.desc,id.asc");
      expect(url.searchParams.get("select")).not.toContain("*");
      expect(url.searchParams.get("select")).not.toContain("payments");
      if (kind === "bills") expect(url.searchParams.get("status")).toBe("neq.cancelled");
      else {
        expect(url.searchParams.get("deleted_at")).toBe("is.null");
        expect(url.searchParams.get("or")).toContain("is_e2e");
        expect(url.searchParams.get("select")).toContain("forklifts(name)");
      }
    }
  });

  it("does not publish partial rows when a later page is denied", async () => {
    state.failOffset = LIST_PAGE_LIMIT;
    const queryClient = client();
    await expect(read(queryClient, kind)).rejects.toMatchObject({ code: "42501" });
    expect(queryClient.getQueryData(optionsFor(kind).queryKey)).toBeUndefined();
    expect(state.requests).toHaveLength(2);
  });

  it("separates suppliers and companies while keeping existing mutation invalidations effective", async () => {
    const queryClient = client();
    const first = await read(queryClient, kind);
    const otherSupplier = await read(queryClient, kind, "supplier-b");
    const otherCompany = await read(queryClient, kind, "supplier-a", "org-b");
    expect(first).toHaveLength(recordCount);
    expect(otherSupplier).toHaveLength(1);
    expect(otherCompany).toHaveLength(1);
    expect(otherCompany[0].organization_id).toBe("org-b");
    await queryClient.invalidateQueries({ queryKey: [tables[kind]], refetchType: "none" });
    for (const query of queryClient.getQueryCache().getAll()) expect(query.state.isInvalidated).toBe(true);
  });

  it("rejects a response from an unexpected company", async () => {
    state.wrongScope = true;
    await expect(read(client(), kind)).rejects.toThrow("no corresponde al proveedor");
    expect(state.requests).toHaveLength(1);
  });

  it("does not read another page or cache a late response after cancellation", async () => {
    let release!: () => void;
    state.fetch.mockImplementation((input: string | URL | Request) => {
      const response = responseFor(input);
      return new Promise<Response>(resolve => { release = () => resolve(response); });
    });
    const queryClient = client();
    const result = read(queryClient, kind).catch(error => error);
    await waitFor(() => expect(state.requests).toHaveLength(1));
    await queryClient.cancelQueries({ queryKey: optionsFor(kind).queryKey });
    release();
    await result;
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(state.requests).toHaveLength(1);
    expect(queryClient.getQueryData(optionsFor(kind).queryKey)).toBeUndefined();
  });
});

it("waits for organization verification and never retains another company's data", async () => {
  state.organization = "loading";
  const queryClient = client();
  const { result, rerender } = renderHook(() => ({
    bills: useSupplierLinkedBills("supplier-a"), maintenance: useSupplierLinkedMaintenance("supplier-a"),
  }), { wrapper: wrapper(queryClient) });
  expect(result.current.bills.isLoading).toBe(true);
  expect(state.requests).toHaveLength(0);
  state.organization = "org-a";
  rerender();
  await waitFor(() => expect(result.current.bills.data).toHaveLength(recordCount));
  await waitFor(() => expect(result.current.maintenance.data).toHaveLength(recordCount));
  state.organization = "org-b";
  rerender();
  expect(result.current.bills.data).toBeUndefined();
  expect(result.current.maintenance.data).toBeUndefined();
  await waitFor(() => expect(result.current.bills.data?.[0].organization_id).toBe("org-b"));
  await waitFor(() => expect(result.current.maintenance.data?.[0].organization_id).toBe("org-b"));
});

it("does not query when no supplier is selected", () => {
  const { result } = renderHook(() => ({
    bills: useSupplierLinkedBills(undefined), maintenance: useSupplierLinkedMaintenance(undefined),
  }), { wrapper: wrapper(client()) });
  expect(result.current.bills.data).toBeUndefined();
  expect(result.current.maintenance.data).toBeUndefined();
  expect(state.requests).toHaveLength(0);
});
