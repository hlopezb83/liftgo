import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InvoiceForm from "../InvoiceForm";

const fixture = vi.hoisted(() => ({ save: vi.fn(), customerId: "customer-1" }));
vi.mock("@/lib/router-compat", () => ({ useParams: () => ({}), useSearchParams: () => [new URLSearchParams()] }));
vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => vi.fn() }));
vi.mock("@/hooks/useUnsavedChangesGuard", () => ({ useUnsavedChangesGuard: () => undefined }));
vi.mock("@/features/customers", () => ({ CustomerSelector: ({ customerId, onCustomerIdChange }: { customerId: string; onCustomerIdChange: (value: string) => void }) =>
  <input aria-label="Cliente" value={customerId} onChange={(event) => onCustomerIdChange(event.target.value)} /> }));
vi.mock("../../hooks/invoices/useNextInvoiceNumber", () => ({ useNextInvoiceNumber: () => ({ data: "FAC-QA", isLoading: false }) }));
vi.mock("../../components/invoice-form/MultiBookingSelector", () => ({ MultiBookingSelector: () => null }));
vi.mock("../../hooks/useDamagePrefill", () => ({ useDamagePrefill: () => ({ block: null, isLoading: false, retry: vi.fn() }) }));
vi.mock("../../hooks/useInvoiceFormLogic", async () => {
  const { useForm } = await import("react-hook-form");
  const { buildEmptyInvoiceValues, invoiceFormSchema } = await import("../../lib/invoiceFormSchema");
  const { zodResolver } = await import("@/lib/forms/zodResolver");
  return { useInvoiceFormLogic: function useFixtureForm() {
    const form = useForm({ resolver: zodResolver(invoiceFormSchema), shouldFocusError: false,
      defaultValues: { ...buildEmptyInvoiceValues(), customerId: fixture.customerId,
        lineItems: [{ description: "Renta", quantity: 1, unit_price: 100, total: 100 }, { description: "", quantity: 1, unit_price: 100, total: 100 }] } });
    return { form, saveInvoice: { mutate: fixture.save, isPending: false }, isEdit: false, isPending: false,
      saleAssignmentGuard: { shouldBlock: false }, serverSaleAssignmentBlock: null, chargeBlock: null,
      customers: [], availableBookings: [], handleBookingsChange: vi.fn(),
      handleCustomerSelect: (id: string) => form.setValue("customerId", id, { shouldValidate: true }),
      validateSelection: () => null, onSubmit: (values: unknown) => values };
  } };
});

beforeEach(() => { fixture.save.mockClear(); fixture.customerId = "customer-1"; });

describe("InvoiceForm linked validation summary", () => {
  it("enlaza la partida concreta, conserva la captura y no guarda antes de corregir", async () => {
    render(<InvoiceForm />);
    fireEvent.submit(screen.getByRole("button", { name: "Crear factura" }).closest("form")!);
    const summary = await screen.findByRole("region", { name: "Revisa los campos marcados" });
    expect(summary).toHaveFocus();
    const link = within(summary).getByRole("link", { name: "Partida 2 · Descripción: Descripción requerida" });
    expect(document.getElementById(decodeURIComponent(link.getAttribute("href")!.slice(1)))).toBeTruthy();
    fireEvent.click(link);
    const description = screen.getByRole("textbox", { name: "Descripción partida 2" });
    expect(description).toHaveFocus();
    expect(fixture.save).not.toHaveBeenCalled();
    fireEvent.change(description, { target: { value: "Transporte" } });
    await waitFor(() => expect(screen.queryByRole("region", { name: "Revisa los campos marcados" })).not.toBeInTheDocument());
    fireEvent.submit(description.closest("form")!);
    await waitFor(() => expect(fixture.save).toHaveBeenCalledTimes(1));
    expect(fixture.save.mock.calls[0][0].payload.lineItems[0].description).toBe("Renta");
  });

  it("el resumen del cliente compuesto enfoca su control y también muestra los errores de partida", async () => {
    fixture.customerId = "";
    render(<InvoiceForm />);
    fireEvent.submit(screen.getByRole("button", { name: "Crear factura" }).closest("form")!);
    const summary = await screen.findByRole("region", { name: "Revisa los campos marcados" });
    expect(within(summary).getAllByRole("link")).toHaveLength(2);
    fireEvent.click(within(summary).getByRole("link", { name: "Cliente: El cliente es requerido" }));
    expect(screen.getByRole("textbox", { name: "Cliente" })).toHaveFocus();
    expect(fixture.save).not.toHaveBeenCalled();
  });
});
