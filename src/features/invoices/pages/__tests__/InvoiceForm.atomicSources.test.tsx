import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  isEdit: false, fail: false, liveVersion: 4,
  params: new URLSearchParams("extension_id=ext-1&from_quote=quote-1"),
  save: vi.fn(), navigate: vi.fn(), success: vi.fn(), legacyLink: vi.fn(), legacyQuote: vi.fn(),
}));
vi.mock("@/lib/router-compat", () => ({ useParams: () => ({ id: state.isEdit ? "inv-1" : undefined }), useSearchParams: () => [state.params] }));
vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => state.navigate }));
vi.mock("@/hooks/useUnsavedChangesGuard", () => ({ useUnsavedChangesGuard: () => undefined }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifySuccess: state.success }));
vi.mock("@/features/bookings", () => ({ useLinkExtensionInvoice: () => ({ mutateAsync: state.legacyLink }) }));
vi.mock("../../hooks/useDamagePrefill", () => ({ useDamagePrefill: () => undefined }));
vi.mock("../../hooks/useInvoiceFormLogic", async () => {
  const { useForm } = await import("react-hook-form");
  const { buildEmptyInvoiceValues } = await import("../../lib/invoiceFormSchema");
  return { useInvoiceFormLogic: () => ({
    form: useForm({ defaultValues: { ...buildEmptyInvoiceValues(), bookingIds: ["booking-1"] } }),
    isEdit: state.isEdit, id: state.isEdit ? "inv-1" : undefined,
    fromQuoteId: "quote-1", sourceQuote: { id: "quote-1", version: state.liveVersion, quote_number: "COT-1" }, sourceQuoteVersion: 4,
    existing: state.isEdit ? { id: "inv-1" } : undefined, invoiceVersion: 3,
    isLoadingInvoice: false, invoiceNumber: "BORRADOR-1",
    saveInvoice: { mutate: state.save, isPending: false }, updateQuote: { mutate: state.legacyQuote },
    validateSelection: () => null, onSubmit: () => ({ customer_id: "customer-1", quote_id: "quote-1" }),
    extension: { id: "ext-1", booking_id: "booking-1" },
    saleAssignmentGuard: { shouldBlock: false }, serverSaleAssignmentBlock: null,
    chargeBlock: null, customers: [], availableBookings: [], subtotal: 10, total: 10, taxAmount: 0,
  }) };
});
vi.mock("@/components/forms/FormActions", () => ({ FormActions: ({ submitLabel }: { submitLabel: string }) => <button type="submit">{submitLabel}</button> }));
vi.mock("@/components/domain/TotalsSummary", () => ({ TotalsSummary: () => null }));
vi.mock("../../components/invoice-form/CfdiFieldsCard", () => ({ CfdiFieldsCard: () => null }));
vi.mock("../../components/invoice-form/EditableLineItemsTable", () => ({ EditableLineItemsTable: () => null }));
vi.mock("../../components/invoice-form/InvoiceAvailabilityNotice", () => ({ InvoiceAvailabilityNotice: () => null }));
vi.mock("../../components/invoice-form/InvoiceDetailsCard", () => ({ InvoiceDetailsCard: () => null }));
vi.mock("../../components/invoice-form/InvoiceSourceNotice", () => ({ InvoiceSourceNotice: () => null }));
vi.mock("../../components/invoice-form/SaleAssignmentBlocked", () => ({ SaleAssignmentBlocked: () => null }));
import InvoiceForm from "../InvoiceForm";
beforeEach(() => {
  vi.clearAllMocks(); state.isEdit = false; state.fail = false; state.liveVersion = 4; state.params = new URLSearchParams("extension_id=ext-1&from_quote=quote-1");
  state.save.mockImplementation((_args, callbacks) => { if (!state.fail) callbacks.onSuccess({ id: "inv-1", invoice_number: "BORRADOR-1" }); });
});
afterEach(cleanup);
describe("atomic invoice sources", () => {
  it("sends sources in the save and finalizes without follow-up writes", async () => {
    render(<InvoiceForm />);
    fireEvent.click(screen.getByRole("button", { name: "Crear factura" }));
    await waitFor(() => expect(state.navigate).toHaveBeenCalledWith("/invoices/inv-1"));
    expect(state.save.mock.calls[0][0]).toMatchObject({ bookingIds: ["booking-1"], extensionId: "ext-1", acceptQuoteId: "quote-1", quoteExpectedVersion: 4 });
    expect(state.legacyLink).not.toHaveBeenCalled(); expect(state.legacyQuote).not.toHaveBeenCalled();
  });
  it("submits the prefilled version after a live refetch", async () => {
    const { rerender } = render(<InvoiceForm />); state.liveVersion = 5; rerender(<InvoiceForm />);
    fireEvent.click(screen.getByRole("button", { name: "Crear factura" }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    expect(state.save.mock.calls[0][0].quoteExpectedVersion).toBe(4);
  });
  it("does not finalize a rejected save", async () => {
    state.fail = true; render(<InvoiceForm />);
    fireEvent.click(screen.getByRole("button", { name: "Crear factura" }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    expect(state.success).not.toHaveBeenCalled(); expect(state.navigate).not.toHaveBeenCalled();
    expect(state.legacyLink).not.toHaveBeenCalled(); expect(state.legacyQuote).not.toHaveBeenCalled();
  });
  it("does not add source side effects to editing", async () => {
    state.isEdit = true; render(<InvoiceForm />);
    fireEvent.click(screen.getByRole("button", { name: "Actualizar factura" }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    expect(state.save.mock.calls[0][0]).toMatchObject({ invoiceId: "inv-1", expectedVersion: 3, extensionId: null, acceptQuoteId: null, quoteExpectedVersion: null });
    expect(state.legacyLink).not.toHaveBeenCalled(); expect(state.legacyQuote).not.toHaveBeenCalled();
  });
});

it("starts a clean form when extension identity changes, retaining edits on same source", () => {
  const { rerender } = render(<InvoiceForm />);
  const notes = screen.getByPlaceholderText("Notas adicionales…");
  fireEvent.change(notes, { target: { value: "Edited extension A" } });
  rerender(<InvoiceForm />);
  expect(screen.getByPlaceholderText("Notas adicionales…")).toHaveValue("Edited extension A");
  state.params = new URLSearchParams("extension_id=ext-2");
  rerender(<InvoiceForm />);
  expect(screen.getByPlaceholderText("Notas adicionales…")).toHaveValue("");
});

it("clears extension draft when leaving extension mode and returning", () => {
  const { rerender } = render(<InvoiceForm />);
  fireEvent.change(screen.getByPlaceholderText("Notas adicionales…"), { target: { value: "Extension draft" } });
  state.params = new URLSearchParams();
  rerender(<InvoiceForm />);
  expect(screen.getByPlaceholderText("Notas adicionales…")).toHaveValue("");
  fireEvent.change(screen.getByPlaceholderText("Notas adicionales…"), { target: { value: "Manual draft" } });
  state.params = new URLSearchParams("extension_id=ext-1");
  rerender(<InvoiceForm />);
  expect(screen.getByPlaceholderText("Notas adicionales…")).toHaveValue("");
});

it("does not reset an existing invoice snapshot when only extension query changes", () => {
  state.isEdit = true;
  const { rerender } = render(<InvoiceForm />);
  fireEvent.change(screen.getByPlaceholderText("Notas adicionales…"), { target: { value: "Existing invoice edit" } });
  state.params = new URLSearchParams("extension_id=ext-2");
  rerender(<InvoiceForm />);
  expect(screen.getByPlaceholderText("Notas adicionales…")).toHaveValue("Existing invoice edit");
});
