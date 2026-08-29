import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";

/**
 * Fase 2 de bloqueos explicables: el sobrepago (BL-11) se explica antes del
 * submit y, si el backend rechaza por una carrera, se muestra el mismo bloque
 * en vez de un toast técnico. No cambia el cálculo de saldo.
 */
const createPaymentMutate = vi.fn();
const notifyErrorMock = vi.fn();

vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: (...args: unknown[]) => notifyErrorMock(...args),
  notifySuccess: vi.fn(),
  notifyInfo: vi.fn(),
  notifyWarning: vi.fn(),
  notifyValidation: vi.fn(),
  notifyAsync: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
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
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
    reset: vi.fn(),
  }),
}));

import { useRecordPaymentForm } from "../useRecordPaymentForm";

function renderForm(balance = 1000) {
  const { Wrapper } = createQueryWrapper();
  return renderHook(() =>
    useRecordPaymentForm({
      open: true,
      balance,
      ppdStamped: false,
      invoiceId: "inv-1",
      onOpenChange: vi.fn(),
    }),
    { wrapper: Wrapper },
  );
}

describe("useRecordPaymentForm · bloqueos explicables", () => {
  beforeEach(() => {
    createPaymentMutate.mockReset();
    notifyErrorMock.mockReset();
  });

  it("sin sobrepago no hay bloqueo", () => {
    const { result } = renderForm();
    expect(result.current.exceedsBalance).toBe(false);
    expect(result.current.amountBlock).toBeNull();
  });

  it("monto mayor al saldo produce el bloqueo explicable", () => {
    const { result } = renderForm(1000);
    act(() => result.current.setAmount("1200"));
    expect(result.current.exceedsBalance).toBe(true);
    expect(result.current.amountBlock?.code).toBe("payment_exceeds_balance");
    expect(result.current.amountBlock?.reason).toContain("1000.00");
  });

  it("rechazo del backend por saldo se muestra como bloqueo, no como toast", async () => {
    createPaymentMutate.mockImplementation((_vars, opts) => {
      opts.onError(new Error("El monto excede el saldo pendiente de la factura"));
    });
    const { result } = renderForm(1000);
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(notifyErrorMock).not.toHaveBeenCalled();
    expect(result.current.amountBlock?.code).toBe("payment_exceeds_balance");
  });

  it("errores no catalogados siguen usando el manejo actual", async () => {
    createPaymentMutate.mockImplementation((_vars, opts) => {
      opts.onError(new Error("network timeout"));
    });
    const { result } = renderForm(1000);
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(notifyErrorMock).toHaveBeenCalled();
    expect(result.current.amountBlock).toBeNull();
  });
});
