import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useBookingFormLogic } from "../useBookingFormLogic";

const mocks = vi.hoisted(() => ({
  state: {
    forkliftId: "forklift-1",
    forklifts: [{ id: "forklift-1", name: "MTY-FD50-01" }],
  },
  submit: { postBooking: null as { forkliftId: string } | null },
}));

vi.mock("../useBookingFormState", () => ({ useBookingFormState: () => mocks.state }));
vi.mock("../useBookingFormSubmit", () => ({ useBookingFormSubmit: () => mocks.submit }));

describe("useBookingFormLogic", () => {
  it("conserva el nombre del equipo seleccionado antes de crear la reserva", () => {
    const { result } = renderHook(() => useBookingFormLogic());
    expect(result.current.selectedForklift?.name).toBe("MTY-FD50-01");
  });
});

