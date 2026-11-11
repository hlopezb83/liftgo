import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  isEdit: false, fail: false, liveVersion: 4,
  params: new URLSearchParams("extension_id=ext-1&from_quote=quote-1"),
  save: vi.fn(), navigate: vi.fn(), success: vi.fn(), legacyQuote: vi.fn(),
}));
vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => state.navigate }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifySuccess: state.success }));
vi.mock("../../hooks/useDamagePrefill", () => ({ useDamagePrefill: () => ({ block: null, isLoading: false, retry: vi.fn() }) }));
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
import { ConfirmProvider } from "@/components/feedback/ConfirmProvider";
import { TestRouter } from "@/test/router";
import { useNavigate, useLocation } from "@/lib/router-compat";
function Navigation({ from, to }: { from: string; to: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  return <><span data-testid="location">{location.search}</span>
    <button onClick={() => navigate(`/invoices/new?${from}&tab=notes`)}>Change tab</button>
    <button onClick={() => navigate(`/invoices/new?${to}`)}>Source B</button>
    <InvoiceForm />
  </>;
}
afterEach(cleanup);
it.each([
  ["extension_id=ext-1", "extension_id=ext-2"],
  ["from_quote=quote-1", "from_quote=quote-2"],
  ["damage_id=damage-1", "damage_id=damage-2"],
])("keeps unrelated query edits and confirms source change from %s to %s", async (from, to) => {
  render(<TestRouter initialEntries={[`/invoices/new?${from}`]}>
    <ConfirmProvider><Navigation from={from} to={to} /></ConfirmProvider>
  </TestRouter>);
  const notes = await screen.findByPlaceholderText("Notas adicionales…");
  fireEvent.change(notes, { target: { value: "Draft A" } });
  fireEvent.click(screen.getByRole("button", { name: "Change tab" }));
  await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("tab=notes"));
  expect(screen.queryByText("¿Descartar cambios?")).not.toBeInTheDocument();
  expect(screen.getByPlaceholderText("Notas adicionales…")).toHaveValue("Draft A");
  fireEvent.click(screen.getByRole("button", { name: "Source B" }));
  await screen.findByText("¿Descartar cambios?");
  fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
  await waitFor(() => expect(screen.queryByText("¿Descartar cambios?")).not.toBeInTheDocument());
  expect(screen.getByTestId("location")).toHaveTextContent(from);
  expect(screen.getByPlaceholderText("Notas adicionales…")).toHaveValue("Draft A");
  fireEvent.click(screen.getByRole("button", { name: "Source B" }));
  await screen.findByText("¿Descartar cambios?");
  fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
  await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(to));
  expect(screen.getByPlaceholderText("Notas adicionales…")).toHaveValue("");
});
