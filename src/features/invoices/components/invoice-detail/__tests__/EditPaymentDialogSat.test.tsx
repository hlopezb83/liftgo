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

const original = {
  id: "synthetic-payment", invoice_id: "synthetic-invoice", amount: 116,
  currency: "MXN", exchange_rate: 1, payment_date: "2026-09-01",
  payment_method: "transfer", payment_form_sat: "03", rep_cfdi_status: "none",
  reference_number: null, notes: null,
} as Payment;

function setup(overrides: Partial<Payment> = {}) {
  const payment = { ...original, ...overrides };
  const view = render(<EditPaymentDialog open onOpenChange={vi.fn()} payment={payment}
    balance={0} invoiceCurrency="MXN" invoiceExchangeRate={1} />);
  return { ...view, payment };
}

async function selectOption(label: RegExp, option: string | RegExp) {
  const select = screen.getByRole("combobox", { name: label });
  fireEvent.keyDown(select, { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: option }));
  return select;
}

async function save() {
  fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
  await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(1));
  expect(mocks.validation).not.toHaveBeenCalled();
  return mocks.mutate.mock.calls[0][0] as Partial<Payment>;
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("EditPaymentDialog reviewed SAT form", () => {
  it("changes transfer/03 to cash/01 and exposes the suggested SAT form for review", async () => {
    setup();
    await selectOption(/todo de Pago/, "Efectivo");
    expect(screen.getByRole("combobox", { name: "Forma de pago SAT" })).toHaveTextContent("01 - Efectivo");
    expect(await save()).toMatchObject({
      id: original.id, invoice_id: original.invoice_id,
      payment_method: "cash", payment_form_sat: "01",
    });
  });

  it.each([
    ["Efectivo", "cash", "01"],
    ["Cheque", "check", "02"],
    ["Tarjeta", "card", "04"],
  ])("suggests the shared default for %s only after changing method", async (label, method, code) => {
    setup();
    await selectOption(/todo de Pago/, label);
    expect(await save()).toMatchObject({ payment_method: method, payment_form_sat: code });
  });

  it.each(["28", "29"])("preserves a stored card SAT%s override when editing only notes", async (code) => {
    const { payment } = setup({ payment_method: "card", payment_form_sat: code });
    fireEvent.change(screen.getByRole("textbox", { name: "Notas" }), { target: { value: "Reviewed receipt" } });
    expect({ ...payment, ...await save() }).toMatchObject({ payment_method: "card", payment_form_sat: code, notes: "Reviewed receipt" });
  });

  it.each(["28", "29"])("allows an explicit SAT%s override after switching to card", async (code) => {
    setup();
    await selectOption(/todo de Pago/, "Tarjeta");
    expect(screen.getByRole("combobox", { name: "Forma de pago SAT" })).toHaveTextContent(/^04 -/);
    await selectOption(/Forma de pago SAT/, new RegExp(`^${code} -`));
    expect(await save()).toMatchObject({ payment_method: "card", payment_form_sat: code });
  });

  it("keeps a card override when the same method is selected again", async () => {
    const { payment } = setup({ payment_method: "card", payment_form_sat: "28" });
    await selectOption(/todo de Pago/, "Tarjeta");
    expect({ ...payment, ...await save() }).toMatchObject({ payment_method: "card", payment_form_sat: "28" });
  });

  it("restores the stored SAT form when another payment opens in the mounted dialog", async () => {
    const { rerender } = setup();
    await selectOption(/todo de Pago/, "Efectivo");
    const payment = { ...original, id: "synthetic-payment-2", payment_method: "card", payment_form_sat: "29" };
    rerender(<EditPaymentDialog open onOpenChange={vi.fn()}
      payment={payment}
      balance={0} invoiceCurrency="MXN" invoiceExchangeRate={1} />);
    expect(screen.getByRole("combobox", { name: "Forma de pago SAT" })).toHaveTextContent(/^29 -/);
    expect({ ...payment, ...await save() }).toMatchObject({ id: "synthetic-payment-2", payment_method: "card", payment_form_sat: "29" });
  });

  it("does not invent a missing legacy SAT form when editing only notes", async () => {
    setup({ payment_form_sat: null });
    expect(screen.getByRole("combobox", { name: "Forma de pago SAT" })).not.toHaveTextContent(/^\d{2} -/);
    fireEvent.change(screen.getByRole("textbox", { name: "Notas" }), { target: { value: "Legacy receipt note" } });
    expect(await save()).not.toHaveProperty("payment_form_sat");
  });

  it.each(["28", "29", null])("locks stamped fiscal fields and permits notes with stored SAT%s", async (code) => {
    setup({ payment_method: "card", payment_form_sat: code, rep_cfdi_status: "stamped" });
    expect(screen.getByRole("combobox", { name: /todo de Pago/ })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Forma de pago SAT" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Monto" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Notas" }), { target: { value: "Notes after stamping" } });
    const patch = await save();
    expect(patch).toMatchObject({
      amount: original.amount, payment_date: original.payment_date,
      payment_method: "card", notes: "Notes after stamping",
    });
    // The DB locks this fiscal column. Omit it even when stored data is null;
    // notes must not synthesize or recalculate a SAT code for a stamped REP.
    expect(patch).not.toHaveProperty("payment_form_sat");
  });
});
