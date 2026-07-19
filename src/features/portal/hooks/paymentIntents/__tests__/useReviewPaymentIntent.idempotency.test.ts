import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock } from "@/test/helpers/supabaseChain";

/**
 * BL-45 regression: `approve_payment_intent` / `reject_payment_intent` deben
 * ser idempotentes. Una segunda llamada al mismo intent (doble clic, dos
 * admins) debe fallar con `intent_not_pending` (P0001) porque el RPC
 * reclama la fila con `WHERE status='pending_review'`. La UI muestra el
 * error y no duplica el pago.
 */

vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  notifyInfo: vi.fn(),
  notifyWarning: vi.fn(),
  notifyValidation: vi.fn(),
  notifyAsync: vi.fn(),
}));

const rpcState: {
  approveCalls: number;
  rejectCalls: number;
  responses: Array<{ data: unknown; error: { code?: string; message: string } | null }>;
} = {
  approveCalls: 0,
  rejectCalls: 0,
  responses: [],
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    rpcResolvers: {
      approve_payment_intent: () => {
        rpcState.approveCalls += 1;
        return rpcState.responses.shift() ?? { data: null, error: null };
      },
      reject_payment_intent: () => {
        rpcState.rejectCalls += 1;
        return rpcState.responses.shift() ?? { data: null, error: null };
      },
    },
  }),
}));

import { useReviewPaymentIntent } from "../useReviewPaymentIntent";

describe("BL-45 · Idempotencia de aprobación/rechazo de payment intent", () => {
  beforeEach(() => {
    rpcState.approveCalls = 0;
    rpcState.rejectCalls = 0;
    rpcState.responses = [];
  });

  it("approve exitoso la primera vez → resuelve", async () => {
    rpcState.responses = [{ data: "payment-1", error: null }];
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useReviewPaymentIntent(), { wrapper: Wrapper });

    result.current.mutate({ intentId: "int-1", action: "approve" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpcState.approveCalls).toBe(1);
  });

  it("segunda llamada a approve del mismo intent → RPC devuelve intent_not_pending", async () => {
    rpcState.responses = [
      { data: null, error: { code: "P0001", message: "intent_not_pending" } },
    ];
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useReviewPaymentIntent(), { wrapper: Wrapper });

    result.current.mutate({ intentId: "int-1", action: "approve" });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(rpcState.approveCalls).toBe(1);
    expect((result.current.error as { message?: string })?.message).toBe(
      "intent_not_pending",
    );
  });

  it("reject sobre intent ya procesado → intent_not_pending", async () => {
    rpcState.responses = [
      { data: null, error: { code: "P0001", message: "intent_not_pending" } },
    ];
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useReviewPaymentIntent(), { wrapper: Wrapper });

    result.current.mutate({ intentId: "int-2", action: "reject", notes: "duplicado" });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(rpcState.rejectCalls).toBe(1);
  });
});
