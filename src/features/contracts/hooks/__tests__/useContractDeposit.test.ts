import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { useSetContractDepositStatus } from "../useContracts";
import { ContractDepositConflictError } from "../../lib/contractDepositRpc";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));
const input = { contractId: "contract-1", expectedUpdatedAt: "2026-11-13T10:00:00.123456+00:00", status: "applied" as const, amount: 0, notes: "Aplicado" };
const receipt = { updated_at: "2026-11-13T10:01:00.654321+00:00", deposit_amount: 10000, deposit_status: "applied", deposit_settled_at: "2026-11-13T10:01:00+00:00", deposit_settled_amount: 0, deposit_notes: "Aplicado" };
beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: receipt, error: null }); });

describe("useSetContractDepositStatus", () => {
  it("envía la revisión exacta, conserva cero y devuelve el recibo confirmado", async () => {
    const { Wrapper, queryClient } = createQueryWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useSetContractDepositStatus(), { wrapper: Wrapper });
    await act(async () => {
      expect(await result.current.mutateAsync(input)).toMatchObject({ updatedAt: receipt.updated_at, depositSettledAmount: 0 });
    });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("set_contract_deposit_status_checked", {
      p_contract_id: input.contractId, p_expected_updated_at: input.expectedUpdatedAt,
      p_status: "applied", p_amount: 0, p_notes: "Aplicado",
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["contracts"] });
  });
  it("propaga conflicto sin reintentar ni recurrir a la RPC antigua", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "40001", message: "stale" } });
    const { Wrapper, queryClient } = createQueryWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useSetContractDepositStatus(), { wrapper: Wrapper });
    await act(async () => { await expect(result.current.mutateAsync(input)).rejects.toBeInstanceOf(ContractDepositConflictError); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(invalidate).not.toHaveBeenCalled();
  });
  it("no llama a la base sin revisión", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useSetContractDepositStatus(), { wrapper: Wrapper });
    await act(async () => { await expect(result.current.mutateAsync({ ...input, expectedUpdatedAt: "" })).rejects.toBeInstanceOf(ContractDepositConflictError); });
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([null, { ...receipt, updated_at: null }, { ...receipt, deposit_settled_amount: Infinity }])("no confirma un recibo incompleto o inválido %#", async (data) => {
    rpc.mockResolvedValue({ data, error: null });
    const { Wrapper, queryClient } = createQueryWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useSetContractDepositStatus(), { wrapper: Wrapper });
    await act(async () => { await expect(result.current.mutateAsync(input)).rejects.toThrow(); });
    expect(invalidate).not.toHaveBeenCalled();
  });
  it("conserva NULL para aplicar el importe parcial vigente y propaga errores de permiso", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "No autorizado" } });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useSetContractDepositStatus(), { wrapper: Wrapper });
    await act(async () => { await expect(result.current.mutateAsync({ ...input, amount: null, notes: null })).rejects.toMatchObject({ code: "42501" }); });
    expect(rpc).toHaveBeenCalledWith("set_contract_deposit_status_checked", expect.objectContaining({ p_amount: null, p_notes: null }));
  });
});
