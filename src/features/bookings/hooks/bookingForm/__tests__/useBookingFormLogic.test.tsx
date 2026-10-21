import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useBookingFormLogic } from "../useBookingFormLogic";

const mocks = vi.hoisted(() => ({
  state: {
    forkliftId: "forklift-1",
    forklifts: [{ id: "forklift-1", name: "MTY-FD50-01" }],
    availabilityLoading: true,
    availabilityError: false,
    availabilityFetching: true,
    revalidateAvailability: vi.fn(),
  },
  submit: { postBooking: null as { forkliftId: string } | null },
}));

vi.mock("../useBookingDraft", () => ({ useBookingDraft: () => ({}) }));
vi.mock("../useBookingFormState", () => ({ useBookingFormState: () => mocks.state }));
vi.mock("../useBookingFormSubmit", () => ({ useBookingFormSubmit: () => mocks.submit }));

describe("useBookingFormLogic", () => {
  it("conserva el nombre del equipo seleccionado antes de crear la reserva", () => {
    const { result } = renderHook(() => useBookingFormLogic());
    expect(result.current.selectedForklift?.name).toBe("MTY-FD50-01");
  });
  it("conecta el estado y reintento de disponibilidad sin sustituir el preflight", () => {
    const { result } = renderHook(() => useBookingFormLogic());
    expect(result.current.availabilityLoading).toBe(true);
    expect(result.current.availabilityError).toBe(false);
    expect(result.current.availabilityFetching).toBe(true);
    expect(result.current.revalidateAvailability).toBe(mocks.state.revalidateAvailability);
  });
});

