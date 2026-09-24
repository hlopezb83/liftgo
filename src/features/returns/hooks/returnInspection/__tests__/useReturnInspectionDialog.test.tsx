import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Booking } from "@/features/bookings";
import { useReturnInspectionDialog } from "../useReturnInspectionDialog";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { email: "auditor@liftgo.com", user_metadata: { full_name: "Auditor" } } }),
}));
vi.mock("@/features/users", () => ({ useUserRole: () => ({ data: "auditor" }) }));
vi.mock("@/lib/router-compat", () => ({
  useSearchParams: () => [new URLSearchParams("booking_id=bk-1&early=1"), vi.fn()],
}));
vi.mock("../../useReturnInspections", () => ({
  useCreateReturnInspection: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe("useReturnInspectionDialog · acceso por URL", () => {
  it("no abre la inspección prellenada a un rol de lectura", async () => {
    const booking = { id: "bk-1", forklift_id: "fk-1", status: "confirmed" } as Booking;
    const bookings = [booking];
    const { result, rerender } = renderHook(
      ({ canWrite }) => useReturnInspectionDialog(bookings, bookings, canWrite),
      { initialProps: { canWrite: false } },
    );

    expect(result.current.dialogOpen).toBe(false);
    act(() => result.current.openNew());
    expect(result.current.dialogOpen).toBe(false);

    rerender({ canWrite: true });
    await waitFor(() => expect(result.current.dialogOpen).toBe(true));
  });
});
