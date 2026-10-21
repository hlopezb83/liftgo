import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyBookingForm } from "../../../lib/bookingDraft";
import { useBookingFormSubmit } from "../useBookingFormSubmit";

const h = vi.hoisted(() => ({
  fetchQuery: vi.fn(), mutateAsync: vi.fn(), mounted: true, complete: vi.fn(),
  canSubmit: vi.fn(), revalidate: vi.fn(), capture: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ fetchQuery: h.fetchQuery }) }));
vi.mock("@/features/customers", () => ({
  useCustomers: () => ({ data: [{ id: "customer", name: "Stale customer" }] }),
  customerQueries: { detail: (id: string) => ({ queryKey: ["customers", "detail", id], staleTime: 60_000 }) },
}));
vi.mock("@/features/maintenance", () => ({ useMaintenancePolicies: () => ({ data: [] }) }));
vi.mock("@/hooks/useIsMounted", () => ({ useIsMounted: () => () => h.mounted }));
vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => vi.fn() }));
vi.mock("../../bookings/useBookings", () => ({ useCreateBooking: () => ({ mutateAsync: h.mutateAsync }) }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifySuccess: vi.fn() }));
const payload = () => ({ ...emptyBookingForm(), forklift_id: "equipment", customer_id: "customer", date_range: { from: new Date(2026, 9, 20), to: new Date(2026, 10, 20) }, recurring_billing: true });
const setup = () => renderHook(() => useBookingFormSubmit({ canSubmit: h.canSubmit, captureCompletion: h.capture, revalidateAvailability: h.revalidate }));
beforeEach(() => {
  vi.clearAllMocks(); h.mounted = true;
  h.canSubmit.mockReturnValue(true);
  h.capture.mockReturnValue(h.complete);
  h.revalidate.mockResolvedValue({ data: [{ id: "equipment", name: "Fresh equipment" }], isError: false });
  h.fetchQuery.mockResolvedValue({ id: "customer", name: "Fresh customer", address: "Fresh address" });
  h.mutateAsync.mockResolvedValue("booking-id");
});

describe("explicit booking creation revalidates restored references", () => {
  it("does nothing on mount and refreshes selected customer and availability before one explicit create", async () => {
    const { result } = setup();
    expect(h.mutateAsync).not.toHaveBeenCalled();
    await act(() => result.current.onSubmit(payload(), "Old name"));
    expect(h.revalidate).toHaveBeenCalledTimes(1);
    expect(h.fetchQuery).toHaveBeenCalledWith({ queryKey: ["customers", "detail", "customer"], staleTime: 0 });
    expect(h.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ customer_name: "Fresh customer", status: "confirmed", start_date: "2026-10-20", end_date: "2026-11-20" }));
    expect(h.complete).toHaveBeenCalledTimes(1);
    expect(result.current.postBooking).toMatchObject({ forkliftName: "Fresh equipment", customerAddress: "Fresh address" });
  });
  it("blocks a deleted/archived customer instead of trusting the cached list", async () => {
    h.fetchQuery.mockResolvedValue(null);
    const { result } = setup(); await act(() => result.current.onSubmit(payload(), "Equipment"));
    expect(result.current.submitError).toContain("cliente ya no está activo");
    expect(h.mutateAsync).not.toHaveBeenCalled(); expect(h.complete).not.toHaveBeenCalled();
  });
  it.each([{ data: [], isError: false }, { data: [{ id: "equipment" }], isError: true }])("blocks unavailable equipment or failed availability: %o", async (response) => {
    h.revalidate.mockResolvedValue(response);
    const { result } = setup(); await act(() => result.current.onSubmit(payload(), "Equipment"));
    expect(result.current.submitError).toBeTruthy(); expect(h.mutateAsync).not.toHaveBeenCalled();
  });
  it("fails closed if customer refresh errors, without dropping the draft", async () => {
    h.fetchQuery.mockRejectedValue(new Error("offline"));
    const { result } = setup(); await act(() => result.current.onSubmit(payload(), "Equipment"));
    expect(result.current.submitError).toContain("captura se conserva"); expect(h.complete).not.toHaveBeenCalled();
  });
  it("checks identity/lease again after read-only preflight", async () => {
    h.canSubmit.mockReturnValueOnce(true).mockReturnValueOnce(false);
    const { result } = setup(); await act(() => result.current.onSubmit(payload(), "Equipment"));
    expect(h.mutateAsync).not.toHaveBeenCalled();
  });
  it("does not mutate if the user leaves during preflight", async () => {
    h.revalidate.mockImplementation(async () => { h.mounted = false; return { data: [{ id: "equipment" }], isError: false }; });
    const { result } = setup(); await act(() => result.current.onSubmit(payload(), "Equipment"));
    expect(h.mutateAsync).not.toHaveBeenCalled();
  });
  it("repeated same-tick submit runs only one preflight and RPC", async () => {
    const { result } = setup();
    await act(async () => { await Promise.all([result.current.onSubmit(payload(), "Equipment"), result.current.onSubmit(payload(), "Equipment")]); });
    expect(h.revalidate).toHaveBeenCalledTimes(1); expect(h.mutateAsync).toHaveBeenCalledTimes(1);
  });
  it("backend conflict preserves the draft, with no post-creation dialog", async () => {
    h.mutateAsync.mockRejectedValue(new Error("overlap"));
    const { result } = setup(); await act(() => result.current.onSubmit(payload(), "Equipment"));
    expect(h.complete).not.toHaveBeenCalled(); expect(result.current.postBooking).toBeNull();
  });
  it("successful creation still clears the draft after the component leaves", async () => {
    h.mutateAsync.mockImplementation(async () => { h.mounted = false; return "booking-id"; });
    const { result } = setup(); await act(() => result.current.onSubmit(payload(), "Equipment"));
    expect(h.complete).toHaveBeenCalledTimes(1); expect(result.current.postBooking).toBeNull();
  });
  it("manual customers remain supported, but a short rental cannot restore recurring billing", async () => {
    const { result } = setup();
    const data = { ...payload(), customer_id: "", customer_name: "Manual", date_range: { from: new Date(2026, 9, 20), to: new Date(2026, 9, 20) } };
    await act(() => result.current.onSubmit(data, "Equipment"));
    expect(h.fetchQuery).not.toHaveBeenCalled();
    expect(h.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ customer_name: "Manual", customer_id: null, recurring_billing: false }));
  });
});
