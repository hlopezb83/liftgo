import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createQueryWrapper } from "@/test/helpers/queryClient";

const createPaymentMutate = vi.fn();
const stampMutate = vi.fn();
const notifyErrorMock = vi.fn();
const notifyValidationMock = vi.fn();

vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: (...args: unknown[]) => notifyErrorMock(...args),
  notifySuccess: vi.fn(),
  notifyInfo: vi.fn(),
  notifyWarning: vi.fn(),
  notifyValidation: (...args: unknown[]) => notifyValidationMock(...args),
  notifyAsync: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// Interfaz completa de los hooks mockeados: si el componente lee isError /
// reset / isSuccess para deshabilitar el botón o resetear el form, los tests
// deben verlo (mocks parciales enmascaran regresiones).
vi.mock("@/features/invoices/hooks/usePayments", () => ({
  useCreatePayment: () => ({
    mutate: createPaymentMutate,
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
    reset: vi.fn(),
  }),
}));
vi.mock("@/features/invoices/hooks/invoices/cfdi/usePaymentComplement", () => ({
  useStampPaymentComplement: () => ({
    mutate: stampMutate,
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
    reset: vi.fn(),
  }),
}));

import { useRecordPaymentForm } from "../useRecordPaymentForm";
import { satCodeForMethod } from "@/features/invoices/lib/paymentMethods";

function renderForm(overrides: Partial<Parameters<typeof useRecordPaymentForm>[0]> = {}) {
  const { Wrapper } = createQueryWrapper();
  return renderHook(
    (props: Parameters<typeof useRecordPaymentForm>[0]) => useRecordPaymentForm(props),
    {
      wrapper: Wrapper,
      initialProps: {
        open: true,
        balance: 1500,
        ppdStamped: false,
        invoiceId: "inv-1",
        onOpenChange: vi.fn(),
        ...overrides,
      },
    },
  );
}

describe("useRecordPaymentForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("amount inicial = balance.toFixed(2)", () => {
    const { result } = renderForm({ balance: 1234.5 });
    expect(result.current.amount).toBe("1234.50");
  });

  it("rerender con open=true y nuevo balance refresca amount", () => {
    const { result, rerender } = renderForm({ balance: 100 });
    expect(result.current.amount).toBe("100.00");
    rerender({ open: true, balance: 250, ppdStamped: false, invoiceId: "inv-1", onOpenChange: vi.fn() });
    expect(result.current.amount).toBe("250.00");
  });

  it("cambiar method sincroniza paymentFormSat vía satCodeForMethod", () => {
    const { result } = renderForm();
    expect(result.current.paymentFormSat).toBe(satCodeForMethod("transfer"));
    act(() => result.current.setMethod("cash"));
    expect(result.current.paymentFormSat).toBe("01");
    act(() => result.current.setMethod("check"));
    expect(result.current.paymentFormSat).toBe("02");
  });

  it("submit con monto 0 → notifyError, no llama createPayment", async () => {
    const { result } = renderForm({ balance: 0 });
    act(() => result.current.setAmount("0"));
    await act(async () => { await result.current.handleSubmit(); });
    expect(notifyValidationMock).toHaveBeenCalledWith({ message: "Monto inválido" });
    expect(createPaymentMutate).not.toHaveBeenCalled();
  });

  it("submit con USD usa el exchangeRate provisto en el payload", async () => {
    const { result } = renderForm();
    act(() => {
      result.current.setCurrency("USD");
      result.current.setExchangeRate("17.5");
    });
    await act(async () => { await result.current.handleSubmit(); });
    expect(createPaymentMutate).toHaveBeenCalledTimes(1);
    const [payload] = createPaymentMutate.mock.calls[0];
    expect(payload.currency).toBe("USD");
    expect(payload.exchange_rate).toBe(17.5);
  });

  it("submit con USD y exchangeRate '0' → notifyError, no llama createPayment", async () => {
    const { result } = renderForm();
    act(() => {
      result.current.setCurrency("USD");
      result.current.setExchangeRate("0");
    });
    await act(async () => { await result.current.handleSubmit(); });
    expect(notifyValidationMock).toHaveBeenCalledWith({ message: "Tipo de cambio inválido" });
    expect(createPaymentMutate).not.toHaveBeenCalled();
  });

  it("submit con USD y exchangeRate vacío → notifyError", async () => {
    const { result } = renderForm();
    act(() => {
      result.current.setCurrency("USD");
      result.current.setExchangeRate("");
    });
    await act(async () => { await result.current.handleSubmit(); });
    expect(notifyValidationMock).toHaveBeenCalledWith({ message: "Tipo de cambio inválido" });
    expect(createPaymentMutate).not.toHaveBeenCalled();
  });


  it("submit válido llama createPayment con payload correcto", async () => {
    const { result } = renderForm({ balance: 500 });
    await act(async () => { await result.current.handleSubmit(); });
    expect(createPaymentMutate).toHaveBeenCalledTimes(1);
    const [payload] = createPaymentMutate.mock.calls[0];
    expect(payload).toMatchObject({
      invoice_id: "inv-1",
      amount: 500,
      payment_method: "transfer",
      payment_form_sat: "03",
      currency: "MXN",
      exchange_rate: 1,
    });
  });
});
