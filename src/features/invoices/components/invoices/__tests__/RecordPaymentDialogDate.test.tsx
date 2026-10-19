import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecordPaymentDialog } from "../RecordPaymentDialog";
import { useRecordPaymentForm } from "../../../hooks/invoices/useRecordPaymentForm";

const mocks = vi.hoisted(() => ({ create: vi.fn(), stamp: vi.fn(), validation: vi.fn() }));
vi.mock("@/features/invoices/hooks/usePayments", () => ({
  useCreatePayment: () => ({ mutate: mocks.create, isPending: false }),
}));
vi.mock("@/features/invoices/hooks/invoices/cfdi/usePaymentComplement", () => ({
  useStampPaymentComplement: () => ({ mutate: mocks.stamp, isPending: false }),
}));
vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: vi.fn(), notifySuccess: vi.fn(), notifyValidation: mocks.validation,
}));

const props = {
  open: true,
  onOpenChange: vi.fn(),
  invoiceId: "synthetic-invoice-date",
  balance: 100,
  invoiceIssuedAt: "2026-09-01",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T18:00:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup() {
  const view = render(<RecordPaymentDialog {...props} />);
  const date = screen.getByLabelText(/^Fecha/) as HTMLInputElement;
  // A known valid value makes stale submission observable in the payload.
  fireEvent.change(date, { target: { value: "15092026" } });
  return { ...view, date, submit: screen.getByTestId("record-payment-submit") };
}

function submitForm(button: HTMLElement) {
  // Submit directly too: pressing Enter must be guarded even before blur.
  fireEvent.submit(button.closest("form")!);
}

describe("RecordPaymentDialog: current date capture is authoritative", () => {
  it.each([
    ["impossible", "31022026", "31/02/2026 no existe"],
    ["partial before blur", "1509", "Captura una fecha válida para el pago."],
    ["empty", "", "Captura una fecha válida para el pago."],
    ["disabled future", "20102026", "Esta fecha no está permitida"],
  ])("does not submit the previous valid date after %s input", (_name, value, message) => {
    const { date, submit } = setup();
    fireEvent.change(date, { target: { value } });
    submitForm(submit);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.stamp).not.toHaveBeenCalled();
    expect(date).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(submit).toBeDisabled();
    expect(mocks.validation).toHaveBeenCalledWith({ message: "Captura una fecha válida para el pago." });
  });

  it("retains partial text and its explanation after blur without submitting stale state", () => {
    const { date, submit } = setup();
    fireEvent.change(date, { target: { value: "1509" } });
    fireEvent.blur(date);
    expect(date).toHaveValue("15/09");
    expect(screen.getByText("Fecha incompleta (DD/MM/AAAA)")).toBeInTheDocument();
    submitForm(submit);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("submits the corrected date once after invalid capture", () => {
    const { date, submit } = setup();
    fireEvent.change(date, { target: { value: "31022026" } });
    fireEvent.change(date, { target: { value: "16092026" } });
    expect(date).toHaveValue("16/09/2026");
    expect(date).not.toHaveAttribute("aria-invalid", "true");
    expect(submit).toBeEnabled();
    submitForm(submit);
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ payment_date: "2026-09-16", amount: 100 }), expect.any(Object),
    );
    expect(mocks.validation).not.toHaveBeenCalled();
  });

  it("reopening discards invalid capture and restores today's valid date", () => {
    const { date, rerender } = setup();
    fireEvent.change(date, { target: { value: "31022026" } });
    rerender(<RecordPaymentDialog {...props} open={false} />);
    rerender(<RecordPaymentDialog {...props} open />);
    const reopened = screen.getByLabelText(/^Fecha/);
    expect(reopened).toHaveValue("19/10/2026");
    expect(reopened).not.toHaveAttribute("aria-invalid", "true");
    submitForm(screen.getByTestId("record-payment-submit"));
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ payment_date: "2026-10-19" }), expect.any(Object),
    );
  });
});

describe("useRecordPaymentForm: date submit guard", () => {
  it.each([undefined, new Date(Number.NaN)])("rejects missing or invalid Date values without serializing them", async (date) => {
    const { result } = renderHook(() => useRecordPaymentForm({ ...props, ppdStamped: false }));
    // The native date adapter can clear the value; malformed Date is also rejected defensively.
    act(() => result.current.setDate(date as Date));
    await act(async () => { await result.current.handleSubmit(); });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.validation).toHaveBeenCalledWith({ message: "Captura una fecha válida para el pago." });
  });
});
