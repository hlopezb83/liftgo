import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";

const m = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), notifyError: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: m.rpc, from: m.from } }));
vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: m.notifyError, notifySuccess: vi.fn(), notifyInfo: vi.fn(),
  notifyWarning: vi.fn(), notifyValidation: vi.fn(), notifyAsync: vi.fn(),
}));
import { useAddMaintenancePart } from "../usePartInventoryMutations";

const id = (n: number) => `14600000-0000-a000-7000-${String(n).padStart(12, "0")}`;
const input = { maintenance_log_id: id(1), part_id: id(2), quantity_used: 2 };
const receipt = { id: id(3), organization_id: id(4), ...input, quantity_used: 5, cost_at_time: 100 };
function setup() {
  const { Wrapper, queryClient } = createQueryWrapper();
  // An additive write must never inherit a future shared retry policy.
  queryClient.setDefaultOptions({ mutations: { retry: 3, retryDelay: 0 } });
  return { ...renderHook(() => useAddMaintenancePart(), { wrapper: Wrapper }), queryClient };
}
beforeEach(() => {
  vi.clearAllMocks();
  m.rpc.mockResolvedValue({ data: receipt, error: null });
});

describe("useAddMaintenancePart atomic consumption", () => {
  it("sends only IDs and additional quantity; accepts cumulative quantity and captured cost", async () => {
    const { result, queryClient } = setup();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    let saved: unknown;
    await act(async () => { saved = await result.current.mutateAsync({ ...input, cost_at_time: 999, currentLogCost: 10_000 }); });
    expect(saved).toEqual(receipt);
    expect(m.rpc).toHaveBeenCalledExactlyOnceWith("add_maintenance_part_quantity", {
      p_maintenance_log_id: id(1), p_part_id: id(2), p_quantity: 2,
    });
    expect(m.from).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["maintenance_parts"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["maintenance_logs"] });
  });
  it("preserves a legitimate captured zero", async () => {
    m.rpc.mockResolvedValue({ data: { ...receipt, cost_at_time: 0 }, error: null });
    const { result } = setup();
    await act(async () => { expect((await result.current.mutateAsync(input)).cost_at_time).toBe(0); });
    expect(m.rpc).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["23514", "La orden está archivada. Restáurala antes de modificar refacciones o mano de obra."],
    ["23514", "Existencias insuficientes para agregar esta cantidad."],
    ["42501", "No tienes permiso para registrar refacciones en mantenimiento."],
  ])("keeps useful server error %s without retrying", async (code, message) => {
    m.rpc.mockResolvedValue({ data: null, error: { code, message } });
    const { result, queryClient } = setup();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await act(async () => { await expect(result.current.mutateAsync(input)).rejects.toMatchObject({ code, message }); });
    expect(m.rpc).toHaveBeenCalledTimes(1);
    expect(m.notifyError).toHaveBeenCalledWith(expect.objectContaining({ description: message, severity: "warning" }));
    expect(invalidate).not.toHaveBeenCalled();
  });
  it.each(["transport", "receipt"])("does not resend an uncertain %s result despite global retries", async (kind) => {
    if (kind === "transport") m.rpc.mockRejectedValue(new TypeError("Failed to fetch"));
    else m.rpc.mockResolvedValue({ data: { ...receipt, part_id: id(99) }, error: null });
    const { result, queryClient } = setup();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await act(async () => { await expect(result.current.mutateAsync(input)).rejects.toBeDefined(); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(m.rpc).toHaveBeenCalledTimes(1);
    expect(m.notifyError).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringMatching(/recarga las refacciones utilizadas/i) }));
    expect(invalidate).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, NaN, Infinity])("rejects invalid additional quantity %s before dispatch", async (quantity_used) => {
    const { result } = setup();
    await act(async () => { await expect(result.current.mutateAsync({ ...input, quantity_used })).rejects.toMatchObject({ code: "23514" }); });
    expect(m.rpc).not.toHaveBeenCalled();
  });
});
