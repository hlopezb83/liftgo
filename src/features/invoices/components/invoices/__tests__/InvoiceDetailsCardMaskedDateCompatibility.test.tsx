import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useForm, useWatch } from "react-hook-form";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Form } from "@/components/ui/form";
import { toYMD } from "@/lib/date/toYMD";
import { zodResolver } from "@/lib/forms/zodResolver";
import { InvoiceDetailsCard } from "../../invoice-form/InvoiceDetailsCard";
import { buildEmptyInvoiceValues, invoiceFormSchema, type InvoiceFormValues } from "../../../lib/invoiceFormSchema";

// Keep the production card, its RHF adapter and both date controls real.
// Unrelated selectors and the next-number data source stay offline.
vi.mock("@/features/customers", () => ({ CustomerSelector: () => <span>Cliente de prueba</span> }));
vi.mock("../../../hooks/invoices/useNextInvoiceNumber", () => ({ useNextInvoiceNumber: () => ({ data: "FAC-TEST", isLoading: false }) }));
vi.mock("../../invoice-form/MultiBookingSelector", () => ({ MultiBookingSelector: () => null }));

function InvoiceFormHarness() {
  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: {
      ...buildEmptyInvoiceValues(),
      customerId: "synthetic-customer",
      customerName: "Cliente de prueba",
      lineItems: [{ description: "Renta", quantity: 1, unit_price: 100, total: 100 }],
      issueDate: new Date(2026, 7, 14),
    },
  });
  const issueDate = useWatch({ control: form.control, name: "issueDate" });
  return <Form {...form}>
    <form onSubmit={form.handleSubmit(() => {})}>
      <InvoiceDetailsCard isEdit form={form} customers={[]} availableBookings={[]}
        handleCustomerSelect={vi.fn()} handleBookingsChange={vi.fn()} />
      <output data-testid="issue-date-value">{toYMD(issueDate) ?? "sin fecha"}</output>
    </form>
  </Form>;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T18:00:00Z"));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("InvoiceDetailsCard compatibility with partial masked date capture", () => {
  it("keeps partial text before blur and completes a historical date without bouncing to today", () => {
    render(<InvoiceFormHarness />);
    const input = screen.getByLabelText("Fecha de Factura") as HTMLInputElement;
    expect(input).toHaveValue("14/08/2026");
    expect(screen.getByTestId("issue-date-value")).toHaveTextContent("2026-08-14");

    fireEvent.change(input, { target: { value: "1509" } });
    // This caller deliberately retains the prior date until blur/completion.
    // Emitting undefined early makes its real adapter replace the date by today.
    expect.soft(input).toHaveValue("15/09");
    expect.soft(screen.getByTestId("issue-date-value")).toHaveTextContent("2026-08-14");

    // Continue from the actual displayed text, as typing into the same control.
    for (const digit of "2026") {
      fireEvent.change(input, { target: { value: input.value + digit } });
    }
    expect.soft(input).toHaveValue("15/09/2026");
    expect.soft(screen.getByTestId("issue-date-value")).toHaveTextContent("2026-09-15");
  });
});
