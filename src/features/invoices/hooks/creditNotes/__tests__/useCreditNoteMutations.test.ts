import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock, type ChainCall } from "@/test/helpers/supabaseChain";

/**
 * useCreateCreditNote — flujo crítico:
 *   1. RPC next_credit_note_number  → asigna folio
 *   2. INSERT en credit_notes
 *   3. Si stamp=true → Edge Function stamp-credit-note
 *
 * Riesgo: si el RPC falla después del insert, la nota queda sin folio.
 * Si el timbrado falla, la nota queda creada pero sin timbrar (estado válido,
 * la UI lo refleja; el toast debe ser de error, NO de éxito).
 */

const toastSuccess = vi.fn();
const notifyErrorMock = vi.fn();

vi.mock("sonner", () => ({
  toast: { success: toastSuccess, info: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: (...args: unknown[]) => notifyErrorMock(...args),
}));

const creditNotesCalls: ChainCall[] = [];
let rpcResp: { data: unknown; error: { message: string } | null } = {
  data: "NC-0001",
  error: null,
};
let insertResp: { data: unknown; error: { message: string } | null } = {
  data: { id: "cn-1", credit_note_number: "NC-0001" },
  error: null,
};
let stampResp: { data: unknown; error: { message: string } | null } = {
  data: { ok: true },
  error: null,
};
const rpcCalls: Array<{ name: string; args: unknown }> = [];
const invokeCalls: Array<{ name: string; body: unknown }> = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: {
      credit_notes: (calls) => {
        creditNotesCalls.push(...calls);
        return insertResp;
      },
    },
    rpcResolvers: {
      next_credit_note_number: (args) => {
        rpcCalls.push({ name: "next_credit_note_number", args });
        return rpcResp;
      },
    },
    functionsResolvers: {
      "stamp-credit-note": (body) => {
        invokeCalls.push({ name: "stamp-credit-note", body });
        return stampResp;
      },
    },
  }),
}));

import { useCreateCreditNote } from "../useCreditNoteMutations";

const baseInput = {
  invoice_id: "inv-1",
  customer_id: "cust-1",
  motive: "01",
  reason_text: "Devolución",
  line_items: [],
  subtotal: 100,
  tax_rate: 16,
  tax_amount: 16,
  total: 116,
  currency: "MXN" as const,
};

describe("useCreateCreditNote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    creditNotesCalls.length = 0;
    rpcCalls.length = 0;
    invokeCalls.length = 0;
    rpcResp = { data: "NC-0001", error: null };
    insertResp = { data: { id: "cn-1", credit_note_number: "NC-0001" }, error: null };
    stampResp = { data: { ok: true }, error: null };
  });

  it("crear sin timbrar → RPC + insert con folio + toast 'creada' (sin invocar stamp)", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateCreditNote(), { wrapper: Wrapper });

    result.current.mutate({ ...baseInput, stamp: false });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rpcCalls).toHaveLength(1);
    const insertCall = creditNotesCalls.find((c) => c.method === "insert");
    expect(insertCall?.args[0]).toMatchObject({
      invoice_id: "inv-1",
      credit_note_number: "NC-0001",
      total: 116,
    });
    expect(invokeCalls).toHaveLength(0);
    expect(toastSuccess).toHaveBeenCalledWith("Nota de crédito creada");
  });

  it("crear con timbrar → invoca stamp-credit-note con id creado + toast 'timbrada'", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateCreditNote(), { wrapper: Wrapper });

    result.current.mutate({ ...baseInput, stamp: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invokeCalls).toEqual([
      { name: "stamp-credit-note", body: { credit_note_id: "cn-1" } },
    ]);
    expect(toastSuccess).toHaveBeenCalledWith("Nota de crédito timbrada");
  });

  it("RPC next_credit_note_number falla → NO se ejecuta insert ni stamp", async () => {
    rpcResp = { data: null, error: { message: "Folio agotado" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateCreditNote(), { wrapper: Wrapper });

    result.current.mutate({ ...baseInput, stamp: true });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(creditNotesCalls.find((c) => c.method === "insert")).toBeUndefined();
    expect(invokeCalls).toHaveLength(0);
    expect(notifyErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Error al crear nota de crédito" }),
    );
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("insert falla → NO se invoca stamp, notifyError", async () => {
    insertResp = { data: null, error: { message: "RLS denied" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateCreditNote(), { wrapper: Wrapper });

    result.current.mutate({ ...baseInput, stamp: true });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(invokeCalls).toHaveLength(0);
    expect(notifyErrorMock).toHaveBeenCalled();
  });

  it("insert OK pero stamp falla → mutación marca error y NO muestra toast success", async () => {
    stampResp = { data: null, error: { message: "Facturapi 500" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateCreditNote(), { wrapper: Wrapper });

    result.current.mutate({ ...baseInput, stamp: true });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(invokeCalls).toHaveLength(1);
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(notifyErrorMock).toHaveBeenCalled();
  });

  it("stamp responde con data.error inline → trata como error", async () => {
    stampResp = { data: { error: "Sello inválido" }, error: null };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateCreditNote(), { wrapper: Wrapper });

    result.current.mutate({ ...baseInput, stamp: true });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toastSuccess).not.toHaveBeenCalled();
    expect(notifyErrorMock).toHaveBeenCalled();
  });
});
