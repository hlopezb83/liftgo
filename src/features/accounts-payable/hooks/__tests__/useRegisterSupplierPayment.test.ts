import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock } from "@/test/helpers/supabaseChain";

const { notifyErrorMock } = vi.hoisted(() => ({
  notifyErrorMock: vi.fn(),
}));

vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: notifyErrorMock,
  notifySuccess: vi.fn(),
  notifyInfo: vi.fn(),
  notifyWarning: vi.fn(),
  notifyValidation: vi.fn(),
  notifyAsync: vi.fn(),
}));

let paymentResponse: {
  data: string | null;
  error: { message: string } | null;
} = { data: "payment-1", error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    rpcResolvers: {
      register_supplier_payment: () => paymentResponse,
    },
  }),
}));

import { useRegisterSupplierPayment } from "../useRegisterSupplierPayment";

describe("useRegisterSupplierPayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    paymentResponse = { data: "payment-1", error: null };
  });

  it("explica cuando el saldo cambia antes de guardar y suprime el error genérico", async () => {
    paymentResponse = {
      data: null,
      error: { message: "El monto excede el saldo pendiente (saldo: 400.00)" },
    };
    const onBusinessBlock = vi.fn();
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(
      () => useRegisterSupplierPayment({ onBusinessBlock }),
      { wrapper: Wrapper },
    );

    result.current.mutate({
      bill_id: "bill-1",
      amount: 600,
      payment_date: "2026-09-29",
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(onBusinessBlock).toHaveBeenCalledTimes(1);
    expect(onBusinessBlock.mock.calls[0][0].code).toBe("payment_exceeds_balance");
    expect(notifyErrorMock).not.toHaveBeenCalled();
  });
});
