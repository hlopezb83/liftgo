import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import { formatCurrency, formatCurrencyWithCode } from "@/lib/format/formatCurrency";
const mutate = vi.fn();
vi.mock("@/features/invoices/hooks/creditNotes/useCreditNotes", () => ({
  useCreateCreditNote: () => ({ mutate, isPending: false }),
}));
import { CreateCreditNoteDialog } from "@/features/invoices/components/invoice-detail/CreateCreditNoteDialog";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("BF05: actual credit-note modal currency", () => {
  it.each(["USD", "EUR", "MXN"])("renders %s totals and lines in the same currency it saves", (currency) => {
    const invoice = {
      id: "11111111-1111-4111-8111-111111111111", invoice_number: "FAC-QA-05", customer_id: "qa-customer",
      moneda: currency, tipo_cambio: 20, tax_rate: 16, total: 580,
      line_items: [{ description: "QA rental", quantity: 1, unit_price: 500, total: 500 }],
    } as unknown as Tables<"invoices">;
    render(<CreateCreditNoteDialog open onOpenChange={vi.fn()} invoice={invoice} maxCreditable={580} />);
    const dialog = screen.getByRole("dialog");
    const wrong = formatCurrency(580);
    const expected = formatCurrencyWithCode(580, currency).replace(/\s/g, " ");
    expect(screen.getAllByText(expected).length).toBeGreaterThanOrEqual(2);
    expect(dialog).toHaveTextContent(formatCurrencyWithCode(80, currency).replace(/\s/g, " "));
    expect(screen.getAllByText(formatCurrencyWithCode(500, currency).replace(/\s/g, " ")).length).toBeGreaterThanOrEqual(2);
    expect(dialog).toHaveTextContent(`Máximo: ${formatCurrencyWithCode(500, currency).replace(/\s/g, " ")} facturado`);
    if (currency !== "MXN") {
      expect(wrong).not.toEqual(expected);
      expect(dialog).not.toHaveTextContent(wrong);
    }
    fireEvent.change(screen.getByPlaceholderText("Ej: Devolución equipo X el 15-mar"), {target:{value:"QA local"}});
    fireEvent.click(screen.getByRole("button",{name:"Guardar borrador"}));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toMatchObject({currency,total:580});
  });
});
