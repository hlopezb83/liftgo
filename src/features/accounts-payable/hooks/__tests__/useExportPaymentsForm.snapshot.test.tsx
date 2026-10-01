import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock } from "@/test/helpers/supabaseChain";

const { downloadMock, queryState, snapshotFailure } = vi.hoisted(() => ({
  downloadMock: vi.fn(),
  queryState: { isError: false, isFetching: false },
  snapshotFailure: { once: false },
}));
const bill = {
  id: "bill-1", balance: 116, bill_number: "CXP-0001", supplier_id: "supplier-1",
  supplier_name: "Refacciones", supplier_rfc: null, due_date: "2026-10-28",
  currency: "MXN", exchange_rate: null, description: "Refacciones",
  payment_in_progress_at: null, bank_name: "Banco antes",
  clabe: "012345678901234568", account_number: null, account_holder: "Refacciones",
  has_valid_clabe: true,
};
const snapshot = {
  id: "batch-1", created_at: "2026-10-01T12:00:00Z", cancelled_at: null, payment_count: 0,
  items: [{
    supplier_name: "Refacciones guardadas", supplier_rfc: null, bank_name: "Banco persistido",
    clabe: "098765432109876542", account_number: null, account_holder: "Titular guardado",
    bill_number: "CXP-0001", due_date: "2026-10-28", reference: "LIFTGO-CXP-0001",
    concept: "Concepto guardado", amount: 50, currency: "MXN",
  }],
};
const rpcCalls: string[] = [];
vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({ rpcResolvers: {
    create_supplier_payment_batch: () => {
      rpcCalls.push("create");
      return { data: "batch-1", error: null };
    },
    get_supplier_payment_batch_snapshot: () => {
      rpcCalls.push("snapshot");
      if (snapshotFailure.once) {
        snapshotFailure.once = false;
        return { data: null, error: { message: "Connection lost" } };
      }
      return { data: snapshot, error: null };
    },
  } }),
}));
vi.mock("../useExportablePayables", async () => {
  const actual = await vi.importActual<typeof import("../useExportablePayables")>("../useExportablePayables");
  return { ...actual, useExportablePayables: () => ({
    data: [bill], isLoading: false, refetch: vi.fn(), ...queryState,
  }) };
});
vi.mock("../../lib/buildPaymentsXlsx", () => ({ downloadPaymentsXlsx: downloadMock }));
vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: vi.fn(), notifySuccess: vi.fn(), notifyValidation: vi.fn(),
}));

import { useExportPaymentsForm } from "../useExportPaymentsForm";

beforeEach(() => {
  rpcCalls.length = 0;
  downloadMock.mockReset().mockResolvedValue("pagos.xlsx");
  queryState.isError = false;
  queryState.isFetching = false;
  snapshotFailure.once = false;
});

describe("persisted payment layout workflow", () => {
  it("downloads the persisted bank, beneficiary, reference and amount instead of stale dialog data", async () => {
    const { Wrapper } = createQueryWrapper();
    const close = vi.fn();
    const { result } = renderHook(() => useExportPaymentsForm(true, close), { wrapper: Wrapper });
    act(() => result.current.setAmount("bill-1", 50));
    await act(async () => { await result.current.handleExport(); });
    expect(downloadMock).toHaveBeenCalledWith(snapshot.items, "batch-1");
    expect(rpcCalls).toEqual(["create", "snapshot"]);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("recovers a persisted batch after snapshot transport failure without creating or cancelling it again", async () => {
    snapshotFailure.once = true;
    const { Wrapper } = createQueryWrapper();
    const close = vi.fn();
    const { result } = renderHook(() => useExportPaymentsForm(true, close), { wrapper: Wrapper });
    await act(async () => { await result.current.handleExport(); });
    expect(result.current.createdBatchId).toBe("batch-1");
    expect(result.current.canExport).toBe(false);
    expect(downloadMock).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    await act(async () => { await result.current.retryDownload(); });
    expect(rpcCalls).toEqual(["create", "snapshot", "snapshot"]);
    expect(downloadMock).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("blocks duplicate export calls until both persistence and download finish", async () => {
    let release: (filename: string) => void = () => {};
    downloadMock.mockImplementation(() => new Promise<string>((resolve) => { release = resolve; }));
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useExportPaymentsForm(true, vi.fn()), { wrapper: Wrapper });
    let running: Promise<void> = Promise.resolve();
    act(() => {
      running = result.current.handleExport();
      void result.current.handleExport();
    });
    await waitFor(() => expect(downloadMock).toHaveBeenCalledTimes(1));
    expect(result.current.isSubmitting).toBe(true);
    expect(rpcCalls.filter((call) => call === "create")).toHaveLength(1);
    await act(async () => { release("pagos.xlsx"); await running; });
    expect(result.current.isSubmitting).toBe(false);
  });

  it("does not create a batch from stale data after a query error", async () => {
    queryState.isError = true;
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useExportPaymentsForm(true, vi.fn()), { wrapper: Wrapper });
    expect(result.current.canExport).toBe(false);
    await act(async () => { await result.current.handleExport(); });
    expect(rpcCalls).toEqual([]);
  });
});

