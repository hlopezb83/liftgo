import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { usePortalInvoiceMock, usePortalInvoicePaymentsMock } = vi.hoisted(() => ({
  usePortalInvoiceMock: vi.fn(),
  usePortalInvoicePaymentsMock: vi.fn(),
}));

vi.mock("@/features/customers", () => ({
  usePortalInvoice: usePortalInvoiceMock,
  usePortalInvoicePayments: usePortalInvoicePaymentsMock,
}));

import { usePortalInvoiceDetailData } from "./usePortalInvoiceDetailData";

describe("usePortalInvoiceDetailData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("carga la factura solicitada por ID y no depende de una lista truncada", () => {
    const refetchInvoice = vi.fn();
    const refetchPayments = vi.fn();
    usePortalInvoiceMock.mockReturnValue({
      data: {
        id: "invoice-750",
        total: "1500.00",
        paid_amount: "400.00",
        balance: "1100.00",
        moneda: "MXN",
        status: "sent",
        cfdi_uuid: null,
        line_items: [{ description: "Renta", qty: 1, total: 1500 }],
      },
      isLoading: false,
      isError: false,
      refetch: refetchInvoice,
    });
    usePortalInvoicePaymentsMock.mockReturnValue({
      data: [{
        id: "payment-1",
        payment_date: "2026-09-02",
        payment_method: "transfer",
        reference_number: "REF-1",
        amount: "400.00",
      }],
      isLoading: false,
      isError: false,
      refetch: refetchPayments,
    });

    const { result } = renderHook(() => usePortalInvoiceDetailData("invoice-750"));

    expect(usePortalInvoiceMock).toHaveBeenCalledWith("invoice-750");
    expect(usePortalInvoicePaymentsMock).toHaveBeenCalledWith("invoice-750");
    expect(result.current.invoice?.id).toBe("invoice-750");
    expect(result.current.totalPaid).toBe(400);
    expect(result.current.balance).toBe(1100);
    expect(result.current.lineItems).toHaveLength(1);

    act(() => result.current.refetchAll());
    expect(refetchInvoice).toHaveBeenCalledTimes(1);
    expect(refetchPayments).toHaveBeenCalledTimes(1);
  });

  it("compone loading y error de factura y pagos", () => {
    usePortalInvoiceMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });
    usePortalInvoicePaymentsMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => usePortalInvoiceDetailData("invoice-error"));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isError).toBe(true);
  });
});

