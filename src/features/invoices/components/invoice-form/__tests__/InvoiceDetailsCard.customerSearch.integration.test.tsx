import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PropsWithChildren } from "react";
import { Form } from "@/components/ui/form";
import { customerQueries, useCustomers, useCustomerSelectorSearch } from "@/features/customers/hooks/customers/customerQueries";
import { useInvoiceFormHandlers } from "../../../hooks/invoiceForm/useInvoiceFormHandlers";
import { buildEmptyInvoiceValues, type InvoiceFormValues } from "../../../lib/invoiceFormSchema";
import { InvoiceDetailsCard } from "../InvoiceDetailsCard";

// Keep the selector, query hooks, debounce, relation merge and PostgREST SDK real.
// Only the HTTP boundary and the already-resolved organization are simulated.
const wire = vi.hoisted(() => ({ fetch: vi.fn<typeof fetch>() }));
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return { supabase: createClient("http://127.0.0.1:54321", "offline-test-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (...args) => wire.fetch(...args) },
  }) };
});
vi.mock("@/contexts/OrganizationContext", () => ({
  useOrganizationContext: () => ({ status: "ready", organizationId: "qa-org" }),
}));
vi.mock("@/features/customers", async () => ({
  CustomerSelector: (await import("@/features/customers/components/customers/CustomerSelector")).CustomerSelector,
  customerTaxRate: (await import("@/features/customers/lib/customerTaxRate")).customerTaxRate,
}));

function relation(index: number, fields: Record<string, unknown> = {}) {
  return {
    status: "active", organization_id: "qa-org", alias: `Cliente ${String(index).padStart(3, "0")}`,
    razon_social: "Relacion QA SA", rfc: "REL010101AA1", regimen_fiscal: "601", uso_cfdi: "G03",
    domicilio_fiscal_cp: "64000", tax_rate: 8, email: null, phone: null, contact_person: null,
    billing_address: null, representante_legal: null, notes: null, website: null, updated_at: "2026-11-08T00:00:00Z",
    customers: { id: `customer-${index}`, name: `Identidad ${index}`, razon_social: "Identidad global SA",
      rfc: "GLOBAL010101AA1", tax_rate: 16, created_by_organization_id: "qa-org" },
    ...fields,
  };
}
const remote = relation(700, { alias: "Cliente remoto 700", razon_social: "Remoto relacion SA", rfc: "REM010101AA1",
  regimen_fiscal: "612", uso_cfdi: "G01", domicilio_fiscal_cp: "03100", tax_rate: 0 });
const initialRows = Array.from({ length: 501 }, (_, i) => relation(i + 1));
const requests: URL[] = [];
const clients: QueryClient[] = [];
function response(rows: unknown[]) {
  return new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json" } });
}
function searchRequest(url: URL) {
  return [...url.searchParams.getAll("or"), ...url.searchParams.getAll("customers.or")].some((filter) => filter.includes("ilike.%"));
}
function mockTransport(detail: () => Response | Promise<Response>, rows = initialRows) {
  wire.fetch.mockImplementation(async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    requests.push(url);
    expect(url.origin).toBe("http://127.0.0.1:54321");
    expect(url.pathname).toBe("/rest/v1/organization_customers");
    expect(init?.method ?? "GET").toBe("GET");
    if (url.searchParams.has("customer_id")) return detail();
    return response(searchRequest(url) ? [remote] : rows);
  });
}
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  return { client, Wrapper: ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider> };
}
function Harness({ saved }: { saved?: InvoiceFormValues }) {
  const customers = useCustomers();
  const form = useForm({ defaultValues: saved ?? buildEmptyInvoiceValues() });
  const handlers = useInvoiceFormHandlers({ form, customers: customers.data, bookings: [], forklifts: [],
    loadQuoteCharges: async () => ({ complete: true, quotes: [] }) });
  const values = useWatch({ control: form.control });
  return <Form {...form}><InvoiceDetailsCard isEdit form={form} customers={customers.data} availableBookings={[]}
    handleCustomerSelect={handlers.handleCustomerSelect} handleBookingsChange={handlers.handleBookingsChange} />
    <output data-testid="values">{JSON.stringify(values)}</output></Form>;
}
function formValues(): InvoiceFormValues { return JSON.parse(screen.getByTestId("values").textContent!); }

beforeEach(() => { requests.length = 0; wire.fetch.mockReset(); });
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.useRealTimers();
});

describe("invoice customer selection through real queries and offline HTTP", () => {
  it("fetches 501, displays 500, searches customer 700 and preserves its selected fiscal snapshot after detail arrives", async () => {
    let resolveDetail!: (value: Response) => void;
    const pendingDetail = new Promise<Response>((resolve) => { resolveDetail = resolve; });
    mockTransport(() => pendingDetail);
    const { client, Wrapper } = wrapper();
    render(<Harness />, { wrapper: Wrapper });
    const select = await screen.findByRole("combobox", { name: /Cliente/ });
    expect(screen.getByText(/Hay más clientes en la cartera/)).toBeInTheDocument();
    expect(requests[0].searchParams.get("limit")).toBe("501");
    expect(requests[0].searchParams.get("status")).toBe("eq.active");
    expect(requests[0].searchParams.get("customers.deleted_at")).toBe("is.null");
    expect(client.getQueryData(customerQueries.list().queryKey)).toHaveLength(501);
    fireEvent.click(select);
    expect(screen.getAllByRole("option")).toHaveLength(500);
    expect(screen.queryByRole("option", { name: "Cliente 501" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Cliente remoto 700" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Buscar por nombre, razón social o RFC…"), { target: { value: "remoto" } });
    const option = await screen.findByRole("option", { name: "Cliente remoto 700" });
    expect(screen.getAllByRole("option")).toHaveLength(1); // Relation and identity results are deduplicated.
    const searches = requests.filter(searchRequest);
    expect(searches).toHaveLength(2);
    expect(searches.every((url) => url.searchParams.get("limit") === "501")).toBe(true);
    expect(searches.some((url) => url.searchParams.get("or")?.includes("alias.ilike.%remoto%"))).toBe(true);
    expect(searches.some((url) => url.searchParams.getAll("customers.or").some((filter) => filter.includes("name.ilike.%remoto%")))).toBe(true);
    fireEvent.click(option);
    const expected = { customerId: "customer-700", customerName: "Cliente remoto 700", taxRate: 0,
      cfdi: { receptorRfc: "REM010101AA1", receptorRazonSocial: "Remoto relacion SA", receptorRegimenFiscal: "612",
        receptorDomicilioFiscalCp: "03100", usoCfdi: "G01" } };
    expect(formValues()).toMatchObject(expected);
    await waitFor(() => expect(requests.some((url) => url.searchParams.get("customer_id") === "eq.customer-700")).toBe(true));
    const detail = requests.find((url) => url.searchParams.has("customer_id"))!;
    expect(detail.searchParams.has("limit")).toBe(false);
    expect(detail.searchParams.get("status")).toBe("eq.active");
    expect(detail.searchParams.get("select")).toContain("tax_rate");
    expect(detail.searchParams.get("select")).toContain("uso_cfdi");
    await act(async () => resolveDetail(response([{ ...remote, alias: "Nombre actualizado", tax_rate: 16, uso_cfdi: "S01" }])));
    await screen.findByRole("combobox", { name: /Nombre actualizado/ });
    expect(formValues()).toMatchObject(expected); // A later detail read is display-only, not a new selection.
    expect(client.getQueryData(customerQueries.list().queryKey)).toHaveLength(501);
  });

  it("loads an existing off-list selection by ID without changing the saved receiver or showing truncation at exactly 500", async () => {
    mockTransport(() => response([remote]), initialRows.slice(0, 500));
    const saved = buildEmptyInvoiceValues();
    Object.assign(saved, { customerId: "customer-700", customerName: "Nombre guardado", taxRate: 8 });
    Object.assign(saved.cfdi, { receptorRfc: "SAVED010101AA1", receptorRazonSocial: "Snapshot SA", receptorRegimenFiscal: "601",
      receptorDomicilioFiscalCp: "64000", usoCfdi: "I03" });
    const { client, Wrapper } = wrapper();
    render(<Harness saved={saved} />, { wrapper: Wrapper });
    await screen.findByRole("combobox", { name: /Cliente remoto 700/ });
    await waitFor(() => expect(client.getQueryData(customerQueries.list().queryKey)).toHaveLength(500));
    expect(screen.queryByText(/Hay más clientes en la cartera/)).not.toBeInTheDocument();
    expect(requests.filter(searchRequest)).toHaveLength(0);
    expect(requests.filter((url) => url.searchParams.get("customer_id") === "eq.customer-700")).toHaveLength(1);
    expect(formValues()).toEqual(JSON.parse(JSON.stringify(saved)));
  });

  it("uses trimmed two-character searches only after the real 250ms debounce and while enabled", async () => {
    vi.useFakeTimers();
    mockTransport(() => response([remote]));
    const { Wrapper } = wrapper();
    const { rerender } = renderHook(({ term, enabled }) => useCustomerSelectorSearch(term, enabled), {
      wrapper: Wrapper, initialProps: { term: "", enabled: true },
    });
    rerender({ term: " r ", enabled: true });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(requests).toHaveLength(0);
    rerender({ term: " re ", enabled: true });
    await act(async () => { await vi.advanceTimersByTimeAsync(249); });
    expect(requests).toHaveLength(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(requests.filter(searchRequest)).toHaveLength(2);
    expect(requests.every((url) => url.search.includes("%25re%25"))).toBe(true);
    rerender({ term: "otro", enabled: false });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(requests).toHaveLength(2);
  });
});
