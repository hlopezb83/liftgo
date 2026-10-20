import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Form } from "@/components/ui/form";
import { zodResolver } from "@/lib/forms/zodResolver";
import { toYMD } from "@/lib/date/toYMD";
import { buildEmptyInvoiceValues, invoiceFormSchema, type InvoiceFormValues } from "../../../lib/invoiceFormSchema";
import { InvoiceDetailsCard } from "../InvoiceDetailsCard";

vi.mock("@/features/customers", () => ({ CustomerSelector: () => null }));
vi.mock("../../../hooks/invoices/useNextInvoiceNumber", () => ({ useNextInvoiceNumber: () => ({ data: "QA-1", isLoading: false }) }));
vi.mock("../MultiBookingSelector", () => ({ MultiBookingSelector: () => null }));

function Harness({ submit }: { submit: (values: InvoiceFormValues) => void }) {
  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: { ...buildEmptyInvoiceValues(), customerId: "qa-customer", customerName: "QA", issueDate: new Date(2026, 9, 1), lineItems: [{ description: "QA servicio", quantity: 1, unit_price: 100, total: 100 }] },
  });
  return <Form {...form}><form aria-label="Factura QA" onSubmit={form.handleSubmit(submit)}>
    <InvoiceDetailsCard isEdit form={form} customers={[]} availableBookings={[]} handleCustomerSelect={vi.fn()} handleBookingsChange={vi.fn()} />
    <button type="submit">Guardar QA</button>
    <output data-testid="submit-count">{form.formState.submitCount}</output>
  </form></Form>;
}

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-20T18:00:00Z")); });
afterEach(() => vi.useRealTimers());

describe("UX03: captura inválida de Fecha de Factura bloquea guardar", () => {
  it.each(["31/02/2026", "", "16/10"])("%j no se sustituye por hoy ni permite guardar", async (text) => {
    const submit = vi.fn();
    render(<Harness submit={submit} />);
    const input = screen.getByRole("textbox", { name: "Fecha de Factura" });
    expect(input).toHaveValue("01/10/2026");
    fireEvent.change(input, { target: { value: text } });
    // Enter puede enviar sin blur: la captura parcial ya debe estar invalidada.
    fireEvent.submit(screen.getByRole("form", { name: "Factura QA" }));
    await waitFor(() => expect(screen.getByTestId("submit-count")).toHaveTextContent("1"));
    expect(submit).not.toHaveBeenCalled();
    expect(input).toHaveValue(text);
    expect(input).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(input, { target: { value: "15/10/2026" } });
    fireEvent.submit(screen.getByRole("form", { name: "Factura QA" }));
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(toYMD(submit.mock.calls[0][0].issueDate)).toBe("2026-10-15");
  });
  it("control: una fecha válida distinta sí conserva exactamente el día capturado", async () => {
    const submit = vi.fn();
    render(<Harness submit={submit} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Fecha de Factura" }), { target: { value: "15/10/2026" } });
    fireEvent.submit(screen.getByRole("form", { name: "Factura QA" }));
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(toYMD(submit.mock.calls[0][0].issueDate)).toBe("2026-10-15");
  });
});
