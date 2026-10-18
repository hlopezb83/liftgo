import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Payment } from "../../../hooks/usePayments";
import { EditPaymentDialog } from "../EditPaymentDialog";

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), validation: vi.fn() }));
vi.mock("../../../hooks/usePayments", () => ({
  useUpdatePayment: () => ({ mutate: mocks.mutate, isPending: false }),
}));
vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: vi.fn(), notifySuccess: vi.fn(), notifyValidation: mocks.validation,
}));
vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => vi.fn() }));

const payment = {
  id: "synthetic-payment", invoice_id: "synthetic-invoice", amount: 175,
  currency: "MXN", exchange_rate: null, payment_date: "2026-09-01",
  payment_method: "transfer", rep_cfdi_status: "none",
} as Payment;

function setup(overrides: Partial<Payment> = {}, rate: number | null = 17.5) {
  render(<EditPaymentDialog open onOpenChange={vi.fn()} payment={{ ...payment, ...overrides }}
    balance={90} invoiceCurrency="USD" invoiceExchangeRate={rate} />);
}

function submitAmount(amount: string) {
  const input = screen.getByRole("textbox", { name: /Monto/ });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: amount } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("EditPaymentDialog currency wiring", () => {
  it("N8: submits synthetic MXN 350 for USD 90 balance and original MXN 175", async () => {
    setup();
    submitAmount("350");
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({
      id: payment.id, amount: 350,
    }), expect.any(Object)));
    expect(mocks.validation).not.toHaveBeenCalled();
  });

  it("N8: blocks excess with maximum and currency in the validation message", async () => {
    setup();
    submitAmount("1751");
    await waitFor(() => expect(mocks.validation).toHaveBeenCalledWith({
      message: expect.stringMatching(/1,750\.00.*MXN/),
    }));
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("does not submit when FX needed for validation is missing", async () => {
    setup({}, null);
    submitAmount("350");
    await waitFor(() => expect(mocks.validation).toHaveBeenCalledWith({
      message: expect.stringMatching(/tipo de cambio/i),
    }));
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("keeps stamped REP amount disabled and submits original fiscal fields", async () => {
    setup({ rep_cfdi_status: "stamped" });
    expect(screen.getByRole("textbox", { name: /Monto/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({
      amount: 175, payment_date: "2026-09-01",
    }), expect.any(Object)));
    expect(mocks.validation).not.toHaveBeenCalled();
  });
});
