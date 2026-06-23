import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock } from "@/test/helpers/supabaseChain";

/**
 * Acciones manuales sobre líneas bancarias: confirmar match, desemparejar, ignorar.
 * Riesgo: conciliación incorrecta = doble pago o saldo bancario erróneo.
 */

const { toastSuccess, notifyErrorMock } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  notifyErrorMock: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: vi.fn() } }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: notifyErrorMock,
  notifySuccess: vi.fn(),
  notifyInfo: vi.fn(),
  notifyWarning: vi.fn(),
  notifyValidation: vi.fn(),
  notifyAsync: vi.fn(),
}));

const rpcCalls: Array<{ name: string; args: unknown }> = [];
const updatedPayloads: Array<{ patch: unknown; calls: unknown }> = [];

let rpcResp: { data: unknown; error: { message: string } | null } = { data: null, error: null };
let updateResp: { data: unknown; error: { message: string } | null } = { data: null, error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    rpcResolvers: {
      confirm_bank_match: (args) => {
        rpcCalls.push({ name: "confirm_bank_match", args });
        return rpcResp;
      },
      unmatch_bank_line: (args) => {
        rpcCalls.push({ name: "unmatch_bank_line", args });
        return rpcResp;
      },
    },
    tableResolvers: {
      bank_statement_lines: (calls) => {
        const upd = calls.find((c) => c.method === "update");
        if (upd) {
          updatedPayloads.push({ patch: upd.args[0], calls });
          return updateResp;
        }
        return { data: null, error: null };
      },
    },
  }),
}));

import {
  useConfirmBankMatch,
  useUnmatchBankLine,
  useIgnoreBankLine,
} from "../useBankLineActions";

beforeEach(() => {
  rpcCalls.length = 0;
  updatedPayloads.length = 0;
  toastSuccess.mockReset();
  notifyErrorMock.mockReset();
  rpcResp = { data: null, error: null };
  updateResp = { data: null, error: null };
});

describe("useConfirmBankMatch", () => {
  it("llama RPC confirm_bank_match con payment_id cuando es ingreso", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useConfirmBankMatch(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        lineId: "line-1",
        bankAccountId: "acc-1",
        paymentId: "pay-1",
      });
    });

    expect(rpcCalls).toEqual([
      {
        name: "confirm_bank_match",
        args: { p_line_id: "line-1", p_payment_id: "pay-1", p_supplier_payment_id: undefined },
      },
    ]);
    expect(toastSuccess).toHaveBeenCalledWith("Movimiento conciliado");
  });

  it("llama RPC con supplier_payment_id cuando es egreso a proveedor", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useConfirmBankMatch(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        lineId: "line-2",
        bankAccountId: "acc-1",
        supplierPaymentId: "sp-1",
      });
    });

    expect(rpcCalls[0].args).toMatchObject({
      p_line_id: "line-2",
      p_payment_id: undefined,
      p_supplier_payment_id: "sp-1",
    });
  });

  it("propaga error de RPC sin mostrar toast de éxito", async () => {
    rpcResp = { data: null, error: { message: "constraint violation" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useConfirmBankMatch(), { wrapper: Wrapper });

    await act(async () => {
      await result.current
        .mutateAsync({ lineId: "x", bankAccountId: "acc-1", paymentId: "p" })
        .catch(() => {});
    });

    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});

describe("useUnmatchBankLine", () => {
  it("llama RPC unmatch_bank_line con p_line_id", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useUnmatchBankLine(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ lineId: "line-9", bankAccountId: "acc-1" });
    });

    expect(rpcCalls).toEqual([
      { name: "unmatch_bank_line", args: { p_line_id: "line-9" } },
    ]);
    expect(toastSuccess).toHaveBeenCalledWith("Movimiento desemparejado");
  });
});

describe("useIgnoreBankLine", () => {
  it("actualiza status=ignored y guarda ignored_reason", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useIgnoreBankLine(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        lineId: "line-3",
        bankAccountId: "acc-1",
        reason: "Comisión bancaria — fuera de conciliación",
      });
    });

    expect(updatedPayloads[0].patch).toEqual({
      status: "ignored",
      ignored_reason: "Comisión bancaria — fuera de conciliación",
    });
    expect(toastSuccess).toHaveBeenCalledWith("Movimiento marcado como ignorado");
  });

  it("propaga error de RLS sin toast de éxito", async () => {
    updateResp = { data: null, error: { message: "row level security" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useIgnoreBankLine(), { wrapper: Wrapper });

    await act(async () => {
      await result.current
        .mutateAsync({ lineId: "x", bankAccountId: "acc-1", reason: "x" })
        .catch(() => {});
    });

    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
