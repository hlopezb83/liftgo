import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  id: "invoice-1" as string | undefined, read: vi.fn(), save: vi.fn(), navigate: vi.fn(),
  empty: [] as never[], unavailable: new Set<string>(), refetch: vi.fn(),
}));
vi.mock("@/lib/router-compat", () => ({ useParams: () => ({ id: state.id }), useSearchParams: () => [new URLSearchParams()] }));
vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => state.navigate }));
vi.mock("@/hooks/useUnsavedChangesGuard", () => ({ useUnsavedChangesGuard: () => undefined }));
vi.mock("@/features/customers", async () => ({
  ...await vi.importActual("@/features/customers/lib/customerTaxRate"), useCustomers: () => ({ data: state.empty }),
}));
vi.mock("@/features/fleet", () => ({ useQuoteAssignments: () => ({ data: state.empty }) }));
vi.mock("@/features/quotes", () => ({
  useQuote: () => ({ data: undefined, refetch: state.refetch }),
  useQuotesByIds: () => ({ data: state.empty }), useQuoteSaleAssignmentStatus: () => ({ isComplete: true }),
}));
vi.mock("../../hooks/invoices/useInvoices", async () => {
  const { useQuery } = await import("@tanstack/react-query");
  return { useInvoice: (id?: string) => useQuery({
    queryKey: ["invoice-load-state", id], queryFn: () => state.read(id), enabled: !!id,
  }) };
});
vi.mock("../../hooks/invoices/useInvoiceBookings", () => ({ useInvoiceBookings: () => ({ data: state.empty }) }));
vi.mock("../../hooks/invoices/useInvoiceBookingCandidates", () => ({ useInvoiceBookingCandidates: () => ({
  data: state.empty, isSuccess: true, isError: false, isPending: false, refetch: state.refetch,
}) }));
vi.mock("../../hooks/invoiceForm/useInvoiceBookingPeriods", () => ({ useInvoiceBookingPeriods: () => ({
  handlerBookings: state.empty, candidates: state.empty, unavailableIds: state.unavailable,
  linkedBlock: () => null, claims: state.empty, billingBookings: state.empty, ready: true,
}) }));
vi.mock("../../hooks/invoiceForm/useInvoiceRentalEquipment", () => ({ useInvoiceRentalEquipment: () => ({ data: state.empty }) }));
vi.mock("../../hooks/invoiceForm/useInvoiceSourceCustomer", () => ({ useInvoiceSourceCustomer: () => ({
  prefillCustomers: state.empty, dependencies: state.empty,
}) }));
vi.mock("../../hooks/invoiceForm/useInvoiceFormHandlers", () => ({ useInvoiceFormHandlers: () => ({}) }));
vi.mock("../../hooks/invoiceForm/useInvoiceQuoteCharges", () => ({
  useInvoiceQuoteCharges: () => ({ relatedQuoteIds: state.empty, chargeAvailability: { data: undefined } }),
  invoiceChargeBlock: () => null,
}));
vi.mock("../../hooks/invoiceForm/useInvoiceFormSubmit", () => ({ useInvoiceFormSubmit: () => ({
  buildPayload: ({ values }: { values: unknown }) => values,
  saveInvoice: { mutate: state.save, isPending: false }, isPending: false,
}) }));
vi.mock("../../hooks/useExtensionPrefill", () => ({ useExtensionPrefill: () => ({ extension: null }) }));
vi.mock("../../hooks/useDamagePrefill", () => ({ useDamagePrefill: () => ({ block: null, isLoading: false }) }));
vi.mock("../../components/invoice-form/CfdiFieldsCard", () => ({ CfdiFieldsCard: () => null }));
vi.mock("../../components/invoice-form/EditableLineItemsTable", () => ({ EditableLineItemsTable: () => null }));
vi.mock("../../components/invoice-form/InvoiceDetailsCard", () => ({ InvoiceDetailsCard: () => null }));
vi.mock("../../components/invoice-form/InvoiceSourceNotice", () => ({ InvoiceSourceNotice: () => null }));
vi.mock("../../components/invoice-form/InvoiceAvailabilityNotice", () => ({ InvoiceAvailabilityNotice: () => null }));

import InvoiceForm from "../InvoiceForm";

const invoice = {
  id: "invoice-1", invoice_number: "BORRADOR-1", version: 4, status: "draft",
  customer_id: "customer-1", customer_name: "Cliente QA", booking_id: null, quote_id: null,
  issued_at: "2026-11-01", due_date: null, tax_rate: 16, notes: "Nota guardada",
  line_items: [{ description: "Renta", quantity: 1, unit_price: 100, total: 100 }],
  forma_pago: "99", metodo_pago: "PPD", uso_cfdi: "G03", moneda: "MXN", tipo_cambio: 1,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><InvoiceForm /></QueryClientProvider>);
  return client;
}
beforeEach(() => { vi.clearAllMocks(); state.id = invoice.id; state.read.mockReset(); });
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); });

describe("InvoiceForm initial reads and cached drafts", () => {
  it("retries a failed initial read instead of claiming the invoice is missing", async () => {
    const recovered = deferred<typeof invoice>();
    state.read.mockRejectedValueOnce(new Error("Lectura interrumpida")).mockReturnValueOnce(recovered.promise);
    setup();
    expect(await screen.findByText("No se pudo cargar la factura")).toBeInTheDocument();
    expect(screen.queryByText("Factura no encontrada o sin permisos")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Cargando la factura…");
    expect(screen.queryByRole("button", { name: "Actualizar factura" })).not.toBeInTheDocument();
    expect(state.save).not.toHaveBeenCalled();
    await act(async () => { recovered.resolve(invoice); });
    expect(await screen.findByPlaceholderText("Notas adicionales…")).toHaveValue("Nota guardada");
    expect(state.read).toHaveBeenCalledTimes(2);
    expect(state.read).toHaveBeenLastCalledWith(invoice.id);
  });

  it("keeps the missing/access state for a successful empty response", async () => {
    state.read.mockResolvedValue(null);
    setup();
    expect(await screen.findByText("Factura no encontrada o sin permisos")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Volver a facturas" }));
    expect(state.navigate).toHaveBeenCalledWith("/invoices");
  });

  it("does not render editable fields before the initial read finishes", async () => {
    const pending = deferred<typeof invoice>();
    state.read.mockReturnValue(pending.promise);
    setup();
    expect(screen.getByRole("status")).toHaveTextContent("Cargando la factura…");
    expect(screen.queryByRole("button", { name: "Actualizar factura" })).not.toBeInTheDocument();
    expect(screen.queryByText("Factura no encontrada o sin permisos")).not.toBeInTheDocument();
    expect(state.save).not.toHaveBeenCalled();
    await act(async () => { pending.resolve(invoice); });
    expect(await screen.findByRole("button", { name: "Actualizar factura" })).toBeEnabled();
  });

  it("preserves dirty notes, DOM and the original version through failed and successful refetches", async () => {
    state.read.mockResolvedValueOnce(invoice);
    const client = setup();
    const notes = await screen.findByPlaceholderText("Notas adicionales…");
    await waitFor(() => expect(notes).toHaveValue("Nota guardada"));
    fireEvent.change(notes, { target: { value: "Captura sin guardar" } });
    state.read.mockRejectedValueOnce(new Error("Refresco interrumpido"));
    await act(async () => { await client.refetchQueries({ queryKey: ["invoice-load-state", invoice.id] }); });
    expect(screen.getByPlaceholderText("Notas adicionales…")).toBe(notes);
    expect(notes).toHaveValue("Captura sin guardar");
    expect(screen.queryByText("No se pudo cargar la factura")).not.toBeInTheDocument();
    state.read.mockResolvedValueOnce({ ...invoice, version: 5, notes: "Otro cambio remoto" });
    await act(async () => { await client.refetchQueries({ queryKey: ["invoice-load-state", invoice.id] }); });
    expect(screen.getByPlaceholderText("Notas adicionales…")).toBe(notes);
    expect(notes).toHaveValue("Captura sin guardar");
    fireEvent.submit(notes.closest("form")!);
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    expect(state.save.mock.calls[0][0]).toMatchObject({ expectedVersion: 4, payload: { notes: "Captura sin guardar" } });
  });

  it("does not treat the disabled invoice query as loading in creation mode", () => {
    state.id = undefined;
    setup();
    expect(screen.getByRole("button", { name: "Crear factura" })).toBeEnabled();
    expect(screen.getByPlaceholderText("Notas adicionales…")).toHaveValue("");
    expect(state.read).not.toHaveBeenCalled();
  });
});
