import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { ContractViewModel } from "@/types/rental";
import { useContractFormLogic } from "../useContractFormLogic";

const state = vi.hoisted(() => ({ id: "contract-a", data: null as ContractViewModel | null, error: false, update: vi.fn() }));
vi.mock("@/lib/router-compat", () => ({ useParams: () => ({ id: state.id }), useSearchParams: () => [new URLSearchParams()] }));
vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => vi.fn() }));
vi.mock("@/hooks/useUnsavedChangesGuard", () => ({ useUnsavedChangesGuard: () => {} }));
vi.mock("@/features/bookings", () => ({ useBooking: () => ({ data: null }) }));
vi.mock("@/features/customers", () => ({ useCustomers: () => ({ data: [] }), useCustomer: () => ({ data: null }) }));
vi.mock("@/features/fleet", () => ({ useForklifts: () => ({ data: [] }), useForklift: () => ({ data: null }) }));
vi.mock("../contractForm/useContractFormPrefill", () => ({ useContractFormPrefill: () => {} }));
vi.mock("../useContracts", () => ({
  useContract: () => ({ data: state.data, isError: state.error }),
  useCreateContract: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateContract: () => ({ mutate: state.update, isPending: false }),
  findActiveContractForBooking: vi.fn(),
}));
const makeContract = (id = "contract-a") => ({ id, updated_at: "2026-11-14T12:00:00Z", customer_id: "customer-a",
  forklift_id: "fork-a", contract_number: "CTR-QA", payment_frequency: "Mensual", monthly_rate: 1000,
  contract_city: "Monterrey", notes: "Nota original" } as ContractViewModel);
beforeEach(() => { state.id = "contract-a"; state.data = null; state.error = false; vi.clearAllMocks(); });

it("waits for hydration and retains a draft and its original optimistic token after successful and failed refresh", async () => {
  const { result, rerender } = renderHook(() => useContractFormLogic());
  expect(result.current.initialRecordReady).toBe(false);
  state.data = makeContract(); rerender();
  await waitFor(() => expect(result.current.initialRecordReady).toBe(true));
  act(() => result.current.form.setValue("notes", "Captura local", { shouldDirty: true }));
  state.data = { ...makeContract(), notes: "Cambio remoto", updated_at: "2026-11-14T13:00:00Z" }; rerender();
  expect(result.current.form.getValues("notes")).toBe("Captura local");
  state.error = true; rerender();
  expect(result.current.initialRecordReady).toBe(true);
  expect(result.current.form.getValues("notes")).toBe("Captura local");
  await act(async () => { await result.current.handleSubmit(); });
  expect(state.update).toHaveBeenCalledWith(expect.objectContaining({
    id: "contract-a", expectedUpdatedAt: "2026-11-14T12:00:00Z", notes: "Captura local",
  }), expect.any(Object));
});

it("does not carry values or version from another route while its read is pending", async () => {
  state.data = makeContract();
  const { result, rerender } = renderHook(() => useContractFormLogic());
  await waitFor(() => expect(result.current.initialRecordReady).toBe(true));
  act(() => result.current.form.setValue("notes", "Borrador de A", { shouldDirty: true }));
  state.id = "contract-b"; state.data = null; rerender();
  expect(result.current.initialRecordReady).toBe(false);
  await act(async () => { await result.current.handleSubmit(); });
  expect(state.update).not.toHaveBeenCalled();
  state.data = { ...makeContract("contract-b"), notes: "Contrato B", updated_at: "2026-11-14T14:00:00Z" }; rerender();
  await waitFor(() => expect(result.current.initialRecordReady).toBe(true));
  expect(result.current.form.getValues("notes")).toBe("Contrato B");
  await act(async () => { await result.current.handleSubmit(); });
  expect(state.update).toHaveBeenCalledWith(expect.objectContaining({ id: "contract-b", expectedUpdatedAt: "2026-11-14T14:00:00Z" }), expect.any(Object));
});
